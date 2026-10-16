import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Divider, Group, JsonInput, List, Modal, NumberInput, ScrollArea, Select, SimpleGrid, Stack, Switch, Text,
  TextInput, Title,
} from '@mantine/core';
import { IconAlertTriangle, IconChecks } from '@tabler/icons-react';
import { EditableRule, LaunchRule, RuleType } from '../../types/launcher';
import { JsonSchemaProperty } from '../../types/jsonSchema';
import { ApiError, launcherApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { strategyClassError } from '../../utils/strategy-class';
import { Overrides } from '../../utils/orchestrator-overrides';
import { ArgRow, defaultLaunchSettings, LaunchSettings, launchSettingsFrom } from '../../utils/launch-settings';
import { editable, lostInRule, RuleParamsForm, ruleFormFrom, ruleParametersFrom, SHARED_KEYS } from '../../utils/rule-form';
import { LostField } from '../../utils/round-trip';
import { StaleConfigAlert } from '../../components/StaleConfigAlert';
import { fillFromTemplate, templateFormFrom } from '../../utils/strategy-template';
import { schemaDefaults } from '../../utils/schema';
import { useStrategies } from '../../query/hooks';
import { SchemaFormFields } from '../../components/SchemaFormFields';
import { LaunchSettingsFields } from '../../components/launch/LaunchSettingsFields';
import { StrategyArgsEditor } from '../../components/launch/StrategyArgsEditor';
import { OrchestratorOverridesEditor } from '../../components/OrchestratorOverrides';
import { SimulationSettingsEditor } from '../../components/simulation/SimulationSettingsEditor';
import { SessionSimulation, simulationProblem } from '../../utils/simulation';
// What a rule's sessions are sized for before they exist: a match or an event usually has a couple of listings.
const TYPICAL_LISTINGS = 2;

const EMPTY_RULE: EditableRule = {
  name: '', description: null, rule_type: '', status: 'active', launch_path: 'approval', shutdown_path: 'auto',
  schedule_enabled: false, max_concurrent_sessions: null, cooldown_minutes: 0, dedup_window_minutes: 60, parameters: {},
};

interface Props {
  opened: boolean;
  onClose: () => void;
  onSaved: (rule: LaunchRule) => void;
  ruleTypes: RuleType[];
  // The rule being edited; or, with `duplicate`, the rule a new one starts as a copy of.
  rule?: LaunchRule | null;
  duplicate?: boolean;
}

export function RuleEditorModal({ opened, onClose, onSaved, ruleTypes, rule, duplicate = false }: Props) {
  const editing = !!rule && !duplicate;
  const strategies = useStrategies();
  // The rule's own fields and its type's parameters; the shared launch settings live in the state below.
  const [form, setForm] = useState<EditableRule>(EMPTY_RULE);
  const [strategyId, setStrategyId] = useState<number | null>(null);
  const [launch, setLaunch] = useState<LaunchSettings>(defaultLaunchSettings());
  const [args, setArgs] = useState<ArgRow[]>([]);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [simulation, setSimulation] = useState<SessionSimulation>({});
  const [asJson, setAsJson] = useState(false);
  const [json, setJson] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [liveConfirm, setLiveConfirm] = useState('');
  // What the stored rule holds that the form can't (see utils/round-trip); while any remains, it's edited as JSON.
  const [stale, setStale] = useState<LostField[]>([]);

  const load = (next: EditableRule) => {
    const f = ruleFormFrom(next.parameters);
    setForm({ ...next, parameters: f.typeParameters });
    setStrategyId(f.strategyId);
    setLaunch(f.launch);
    setArgs(f.args);
    setOverrides(f.overrides);
    setSimulation(f.simulation);
  };

  useEffect(() => {
    if (!opened) return;
    setProblems([]); setError(null); setChecked(false); setAsJson(false); setLiveConfirm('');
    setStale([]);
    if (rule) {
      const next = duplicate ? { ...editable(rule), name: `${rule.name} (copy)`, status: 'disabled' as const } : editable(rule);
      load(next);
      // A rule saved before a format change opens as JSON, showing what the form would lose and what the current
      // launcher would refuse, so neither surfaces only on save.
      const lost = lostInRule(next, ruleTypes);
      if (lost.length) { setStale(lost); setJson(JSON.stringify(next, null, 2)); setAsJson(true); }
      launcherApi.validateRule(next).then(({ problems: found }) => {
        if (!found.length) return;
        setProblems(found);
        setJson(j => j || JSON.stringify(next, null, 2));
        setAsJson(true);
      }).catch(() => {});
    } else {
      const type = ruleTypes[0];
      load({ ...EMPTY_RULE, rule_type: type?.type ?? '', parameters: schemaDefaults(type?.parameter_schema) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, rule, duplicate]);

  const changed = () => setChecked(false);
  const ruleType = ruleTypes.find(t => t.type === form.rule_type);
  const params = form.parameters;
  const setParam = (key: string, value: unknown) => {
    changed();
    setForm(f => {
      const parameters = { ...f.parameters };
      if (value === undefined || value === '' || value === null) delete parameters[key];
      else parameters[key] = value;
      return { ...f, parameters };
    });
  };
  const set = <K extends keyof EditableRule>(key: K, value: EditableRule[K]) => { changed(); setForm(f => ({ ...f, [key]: value })); };

  const typeProperties = useMemo(() => Object.fromEntries(
    Object.entries(ruleType?.parameter_schema.properties ?? {}).filter(([k]) => !SHARED_KEYS.has(k)),
  ) as Record<string, JsonSchemaProperty>, [ruleType]);
  // A rule type whose triggers carry the whole launch (direct launch) has no shared settings of its own.
  const takesLaunchSettings = !!ruleType?.parameter_schema.properties?.strategy_id;

  // The rule as it would be saved: the shared settings and its simulation folded back into its parameters.
  const assemble = (): EditableRule => {
    if (asJson) return JSON.parse(json) as EditableRule;
    const problem = takesLaunchSettings && launch.mode === 'paper' ? simulationProblem(simulation) : null;
    if (problem) throw new Error(problem);
    const paramsForm: RuleParamsForm = { typeParameters: form.parameters, strategyId, launch, args, overrides, simulation };
    return { ...form, description: form.description || null, parameters: ruleParametersFrom(paramsForm, takesLaunchSettings) };
  };

  // Back to the form only once it can hold the whole rule, unless the user chooses to drop what it can't.
  const toggleJson = (on: boolean, dropWhatDoesNotFit = false) => {
    setError(null);
    if (on) {
      try { setJson(JSON.stringify(assemble(), null, 2)); setAsJson(true); } catch (e) { setError(errorMessage(e, 'Fix the form first')); }
      return;
    }
    let next: EditableRule;
    try { next = { ...EMPTY_RULE, ...JSON.parse(json) }; } catch (e) { setError(`Not valid JSON: ${errorMessage(e, '')}`); return; }
    const lost = lostInRule(next, ruleTypes);
    setStale(lost);
    if (lost.length && !dropWhatDoesNotFit) return;
    load(next);
    setStale([]);
    setAsJson(false);
  };

  const check = async () => {
    setError(null);
    try {
      const { problems: found } = await launcherApi.validateRule(assemble());
      setProblems(found);
      setChecked(found.length === 0);
    } catch (e) {
      setError(errorMessage(e, 'Could not check the rule'));
    }
  };

  const goingLive = !asJson && takesLaunchSettings && launch.mode === 'live'
    && (rule?.parameters.mode !== 'live' || duplicate || !rule);
  const save = async () => {
    setError(null); setProblems([]);
    const classError = takesLaunchSettings && !asJson ? strategyClassError(launch.strategyType, launch.strategyClass.trim()) : null;
    if (classError) { setError(classError); return; }
    let body: EditableRule;
    try { body = assemble(); } catch (e) { setError(errorMessage(e, 'Fix the form first')); return; }
    setSaving(true);
    try {
      let saved: LaunchRule;
      if (editing) {
        // A rule keeps the type it was created with: the launcher refuses rule_type in an edit, so it isn't sent.
        const { rule_type: ruleTypeName, ...changes } = body;
        if (ruleTypeName !== rule!.rule_type) {
          setError(`A rule's type can't change (it is ${rule!.rule_type}); create a new rule instead`);
          return;
        }
        saved = await launcherApi.updateRule(rule!.rule_id, rule!.revision, changes);
      } else {
        saved = await launcherApi.createRule(body);
      }
      onSaved(saved);
    } catch (e) {
      if (e instanceof ApiError && e.problems.length) setProblems(e.problems);
      else setError(errorMessage(e, 'Could not save the rule'));
    } finally {
      setSaving(false);
    }
  };

  // Archived strategies aren't offered, except the one the rule already uses.
  const strategyOptions = (strategies.data ?? []).filter(s => !s.archived || s.strategyId === strategyId)
    .map(s => ({ value: String(s.strategyId), label: s.name }));
  // Choosing a strategy starts the rule from the strategy's own launch defaults, the way a deploy does.
  const chooseStrategy = (value: string | null) => {
    changed();
    setStrategyId(value ? Number(value) : null);
    const template = (strategies.data?.find(s => String(s.strategyId) === value)?.parameters ?? {}) as Record<string, unknown>;
    setLaunch(l => ({ ...l, ...launchSettingsFrom(template) }));
    const filled = fillFromTemplate({ args, overrides, simulation }, templateFormFrom(template));
    setArgs(filled.args);
    setOverrides(filled.overrides);
    setSimulation(filled.simulation);
  };

  return (
    <Modal opened={opened} onClose={onClose} size="xl" scrollAreaComponent={ScrollArea.Autosize}
      title={editing ? `Edit ${rule!.name}` : duplicate ? 'Duplicate Rule' : 'Create Launch Rule'}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {editing ? `Revision ${rule!.revision}, last saved by ${rule!.modified_by.replace(/^ui:/, '')}` : 'The launcher checks a rule before saving it.'}
          </Text>
          <Switch size="xs" label="Edit as JSON" checked={asJson} onChange={e => toggleJson(e.currentTarget.checked)} />
        </Group>

        {asJson ? (
          <>
            <StaleConfigAlert what="This rule" lost={stale}
              onBackToForm={() => toggleJson(false)} onDropAndUseForm={() => toggleJson(false, true)} />
            <JsonInput value={json} onChange={v => { setJson(v); changed(); }} autosize minRows={20} formatOnBlur validationError="Invalid JSON" />
          </>
        ) : (
          <>
            <Title order={6} c="dimmed">Rule</Title>
            <Group grow>
              <TextInput label="Name" required value={form.name} onChange={e => set('name', e.currentTarget.value)} />
              <Select label="Rule Type" required disabled={editing} value={form.rule_type}
                data={ruleTypes.map(t => ({ value: t.type, label: t.display_name }))}
                onChange={v => {
                  const t = ruleTypes.find(x => x.type === v);
                  changed();
                  setForm(f => ({ ...f, rule_type: v ?? '', parameters: ruleFormFrom(schemaDefaults(t?.parameter_schema)).typeParameters }));
                }} />
            </Group>
            <TextInput label="Description" value={form.description ?? ''} onChange={e => set('description', e.currentTarget.value)} />
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Select label="Launches" data={[{ value: 'auto', label: 'Automatic' }, { value: 'approval', label: 'Need approval' }]}
                value={form.launch_path} onChange={v => set('launch_path', (v ?? 'approval') as EditableRule['launch_path'])} />
              <Select label="Shutdowns" data={[{ value: 'auto', label: 'Automatic' }, { value: 'approval', label: 'Need approval' }]}
                value={form.shutdown_path} onChange={v => set('shutdown_path', (v ?? 'auto') as EditableRule['shutdown_path'])} />
              <Switch mt={28} label="Let the rule type schedule launches" checked={form.schedule_enabled}
                onChange={e => set('schedule_enabled', e.currentTarget.checked)} />
              <NumberInput label="Max Concurrent Sessions" placeholder="No cap" description="Across the strategy" min={1}
                allowDecimal={false} value={form.max_concurrent_sessions ?? ''}
                onChange={v => set('max_concurrent_sessions', v === '' ? null : Number(v))} />
              <NumberInput label="Cooldown (minutes)" description="Between launches" min={0} allowDecimal={false}
                value={form.cooldown_minutes} onChange={v => set('cooldown_minutes', Number(v) || 0)} />
              <NumberInput label="Dedup Window (minutes)" description="Repeats of a trigger inside it are ignored" min={0}
                allowDecimal={false} value={form.dedup_window_minutes} onChange={v => set('dedup_window_minutes', Number(v) || 0)} />
            </SimpleGrid>

            {takesLaunchSettings && (
              <>
                <Divider />
                <Title order={6} c="dimmed">Session</Title>
                <Select label="Strategy" required searchable data={strategyOptions}
                  placeholder={strategies.isLoading ? 'Loading…' : 'Choose a strategy; its defaults fill in the rest'}
                  value={strategyId != null ? String(strategyId) : null} onChange={chooseStrategy} />
                <LaunchSettingsFields value={launch} required showRegion={false} listingCount={TYPICAL_LISTINGS}
                  onChange={patch => { changed(); setLaunch(l => ({ ...l, ...patch })); }} />
                <Text size="xs" c="dimmed">Each session runs in the region of the venue its listings trade on.</Text>

                <Divider />
                <StrategyArgsEditor rows={args} onChange={rows => { changed(); setArgs(rows); }} />
                <Text size="xs" c="dimmed">The rule type adds its own per trigger (e.g. the match and listings) on top of these.</Text>
              </>
            )}

            {Object.keys(typeProperties).length > 0 && (
              <>
                <Divider />
                <Title order={6} c="dimmed">{ruleType?.display_name ?? 'Rule type'}</Title>
                <SchemaFormFields properties={typeProperties} required={ruleType?.parameter_schema.required ?? []}
                  values={params} onChange={setParam} />
              </>
            )}

            {takesLaunchSettings && launch.mode === 'paper' && (
              <>
                <Divider />
                <SimulationSettingsEditor value={simulation} onChange={v => { changed(); setSimulation(v); }} />
              </>
            )}

            {takesLaunchSettings && (
              <OrchestratorOverridesEditor value={overrides} onChange={o => { changed(); setOverrides(o); }}
                version={launch.orchestratorVersion} />
            )}
          </>
        )}

        {goingLive && (
          <Alert color="red" icon={<IconAlertTriangle size={18} />} title="LIVE rule — its sessions trade real money">
            <Text size="sm" mb="xs">Type the rule's name to confirm.</Text>
            <TextInput value={liveConfirm} onChange={e => setLiveConfirm(e.currentTarget.value)} placeholder={form.name} />
          </Alert>
        )}
        {problems.length > 0 && (
          <Alert color="red" title="The launcher would refuse this rule">
            <List size="sm">{problems.map(p => <List.Item key={p}>{p}</List.Item>)}</List>
          </Alert>
        )}
        {checked && <Alert color="green" icon={<IconChecks size={18} />}>The launcher accepts this rule.</Alert>}
        {error && <Text c="red" size="sm">{error}</Text>}

        <Group justify="space-between" mt="sm">
          <Button variant="default" leftSection={<IconChecks size={16} />} onClick={check}>Check</Button>
          <Group>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button loading={saving} onClick={save} color={goingLive ? 'red' : undefined}
              disabled={goingLive && liveConfirm !== form.name}>
              {editing ? 'Save' : 'Create'}{goingLive ? ' LIVE' : ''}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
