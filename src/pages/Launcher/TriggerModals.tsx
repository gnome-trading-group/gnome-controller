import { useEffect, useState } from 'react';
import {
  Badge, Button, Group, JsonInput, Modal, ScrollArea, SegmentedControl, Select, Stack, Switch, Table, Text,
} from '@mantine/core';
import { DryRunResult, LaunchRule, RuleType } from '../../types/launcher';
import { launcherApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { SchemaFormFields } from '../../components/SchemaFormFields';
import { OutcomeBadge } from './shared';
import { DirectLaunchFields } from './DirectLaunchFields';
import { directLaunchData, DirectLaunchForm, emptyDirectLaunch } from '../../utils/direct-launch';
import { useStrategies } from '../../query/hooks';

// A trigger's data, entered through its rule type's data_schema or as raw JSON.
function TriggerDataForm({ ruleType, data, onChange, asJson, onAsJson, json, onJson }: {
  ruleType: RuleType | undefined;
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  asJson: boolean;
  onAsJson: (on: boolean) => void;
  json: string;
  onJson: (json: string) => void;
}) {
  return (
    <Stack gap="xs">
      <Group justify="flex-end">
        <Switch size="xs" label="Edit as JSON" checked={asJson} onChange={e => onAsJson(e.currentTarget.checked)} />
      </Group>
      {asJson ? (
        <JsonInput value={json} onChange={onJson} autosize minRows={6} formatOnBlur validationError="Invalid JSON" />
      ) : (
        <SchemaFormFields
          properties={ruleType?.data_schema.properties ?? {}}
          required={ruleType?.data_schema.required ?? []}
          values={data}
          onChange={(key, value) => {
            const next = { ...data };
            if (value === undefined) delete next[key]; else next[key] = value;
            onChange(next);
          }}
        />
      )}
    </Stack>
  );
}

function useTriggerData(opened: boolean) {
  const [data, setData] = useState<Record<string, unknown>>({});
  const [asJson, setAsJson] = useState(false);
  const [json, setJson] = useState('{}');
  useEffect(() => { if (opened) { setData({}); setAsJson(false); setJson('{}'); } }, [opened]);
  const toggle = (on: boolean) => {
    if (on) setJson(JSON.stringify(data, null, 2));
    else { try { setData(JSON.parse(json)); } catch { return; } }
    setAsJson(on);
  };
  const value = () => (asJson ? JSON.parse(json) as Record<string, unknown> : data);
  return { data, setData, asJson, toggle, json, setJson, value };
}

export function SendTriggerModal({ opened, onClose, ruleTypes, onSent }: {
  opened: boolean;
  onClose: () => void;
  ruleTypes: RuleType[];
  // Called with the queued trigger's id; the modal closes, as there is nothing more for it to show.
  onSent: (triggerId: string) => void;
}) {
  const [ruleTypeName, setRuleTypeName] = useState<string | null>(null);
  const [action, setAction] = useState<'launch' | 'shutdown'>('launch');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useTriggerData(opened);
  const [direct, setDirect] = useState<DirectLaunchForm>(emptyDirectLaunch());
  const strategies = useStrategies();
  useEffect(() => {
    if (!opened) return;
    setError(null); setDirect(emptyDirectLaunch()); setRuleTypeName(ruleTypes[0]?.type ?? null);
  }, [opened, ruleTypes]);
  const ruleType = ruleTypes.find(t => t.type === ruleTypeName);
  // A direct launch's trigger is a whole session, so it gets the deploy form rather than its raw schema.
  const isDirect = ruleTypeName === 'direct_launch' && action === 'launch';
  const directStrategyName = strategies.data?.find(s => String(s.strategyId) === direct.strategyId)?.name ?? '';

  const send = async () => {
    if (!ruleTypeName) return;
    setSending(true); setError(null);
    try {
      const data = isDirect ? directLaunchData(direct, directStrategyName) : form.value();
      const { trigger_id } = await launcherApi.sendTrigger({ rule_type: ruleTypeName, action, data });
      onSent(trigger_id);
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'Could not send the trigger'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Send a Trigger" size="xl" scrollAreaComponent={ScrollArea.Autosize}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Queued like any other trigger: every rule of the type decides what to do with it, and its outcome appears in the
          trigger log within seconds. Use a rule's dry run to see the outcome without acting on it.
        </Text>
        <Group grow>
          <Select label="Rule type" data={ruleTypes.map(t => ({ value: t.type, label: t.display_name }))}
            value={ruleTypeName} onChange={v => { setRuleTypeName(v); form.setData({}); }} />
          <div>
            <Text size="sm" fw={500} mb={4}>Action</Text>
            <SegmentedControl fullWidth value={action} onChange={v => setAction(v as 'launch' | 'shutdown')}
              data={[{ value: 'launch', label: 'Launch' }, { value: 'shutdown', label: 'Shutdown' }]} />
          </div>
        </Group>
        {isDirect ? (
          <DirectLaunchFields value={direct} onChange={setDirect} />
        ) : (
          <TriggerDataForm ruleType={ruleType} data={form.data} onChange={form.setData} asJson={form.asJson}
            onAsJson={form.toggle} json={form.json} onJson={form.setJson} />
        )}
        {error && <Text c="red" size="sm">{error}</Text>}
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button loading={sending} onClick={send} disabled={!ruleTypeName}>Send</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function DryRunModal({ opened, onClose, rule, ruleType }: {
  opened: boolean;
  onClose: () => void;
  rule: LaunchRule;
  ruleType: RuleType | undefined;
}) {
  const [action, setAction] = useState<'launch' | 'shutdown'>('launch');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DryRunResult | null>(null);
  const form = useTriggerData(opened);
  useEffect(() => { if (opened) { setError(null); setResult(null); } }, [opened]);

  const run = async () => {
    setRunning(true); setError(null);
    try {
      setResult(await launcherApi.dryRun(rule.rule_id, form.value(), action));
    } catch (e) {
      setError(errorMessage(e, 'Dry run failed'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700}>Dry run: {rule.name}</Text>} size="xl" scrollAreaComponent={ScrollArea.Autosize}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          What this rule would do with a trigger right now, against the live registry. Nothing is recorded and nothing launches.
        </Text>
        <SegmentedControl value={action} onChange={v => setAction(v as 'launch' | 'shutdown')}
          data={[{ value: 'launch', label: 'Launch trigger' }, { value: 'shutdown', label: 'Shutdown trigger' }]} />
        <TriggerDataForm ruleType={ruleType} data={form.data} onChange={form.setData} asJson={form.asJson}
          onAsJson={form.toggle} json={form.json} onJson={form.setJson} />
        <Group justify="flex-end"><Button loading={running} onClick={run}>Run</Button></Group>
        {error && <Text c="red" size="sm">{error}</Text>}
        {result && (
          <Stack gap="xs">
            <Group gap="xs">
              <OutcomeBadge outcome={result.outcome} />
              {result.reason && <Text size="sm">{result.reason}</Text>}
            </Group>
            {result.duplicate && <Badge color="gray" variant="light">A trigger like this was already acted on inside the dedup window</Badge>}
            {result.rate_limit && <Badge color="orange" variant="light">Rate limited: {result.rate_limit}</Badge>}
            {result.blocked_by && <Badge color="yellow" variant="light">Blocked: session {result.blocked_by} holds these listings</Badge>}
            {result.target_session_ids && (
              <Text size="sm">Would stop: {result.target_session_ids.length ? result.target_session_ids.join(', ') : 'nothing'}</Text>
            )}
            {result.session_config && (
              <>
                <Text size="sm" fw={600}>The session it would start</Text>
                <Table striped withTableBorder fz="xs">
                  <Table.Tbody>
                    {Object.entries(result.session_config).map(([k, v]) => (
                      <Table.Tr key={k}><Table.Td ff="monospace">{k}</Table.Td><Table.Td ff="monospace">{JSON.stringify(v)}</Table.Td></Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </>
            )}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
