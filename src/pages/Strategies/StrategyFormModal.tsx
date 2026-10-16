import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Button,
  Divider,
  Group,
  JsonInput,
  Modal,
  MultiSelect,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Strategy } from '../../types';
import { registryApi } from '../../utils/api';
import { OrchestratorOverridesEditor } from '../../components/OrchestratorOverrides';
import { Overrides } from '../../utils/orchestrator-overrides';
import { useListingSearch } from '../../hooks/useAsyncSearch';
import { useJsonFallback } from '../../hooks/useJsonFallback';
import { ArgRow, LaunchSettings } from '../../utils/launch-settings';
import {
  defaultTemplateLaunch, TemplateForm, templateFormFrom, templateLostFields, templateParamsFrom,
} from '../../utils/strategy-template';
import { StaleConfigAlert } from '../../components/StaleConfigAlert';
import { LaunchSettingsFields } from '../../components/launch/LaunchSettingsFields';
import { StrategyArgsEditor } from '../../components/launch/StrategyArgsEditor';
import { SimulationSettingsEditor } from '../../components/simulation/SimulationSettingsEditor';
import { SessionSimulation, simulationProblem } from '../../utils/simulation';

function defaultForm() {
  return { name: '', description: '', archived: false };
}

// The registry returns a template's top-level keys camelCased; it stores, and the form saves, them in snake_case.
function snakeKeys(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`), v]));
}

interface StrategyFormModalProps {
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
  strategy?: Strategy | null;
}

function StrategyFormModal({ opened, onClose, onSaved, strategy }: StrategyFormModalProps) {
  const [form, setForm] = useState(defaultForm());
  const [launch, setLaunch] = useState<LaunchSettings>(defaultTemplateLaunch());
  const [args, setArgs] = useState<ArgRow[]>([]);
  const [simulation, setSimulation] = useState<SessionSimulation>({});
  const [overrides, setOverrides] = useState<Overrides>({});
  const [listingIds, setListingIds] = useState<string[]>([]);
  const [listingLabels, setListingLabels] = useState<Record<string, string>>({});
  const [listingSearchValue, setListingSearchValue] = useState('');
  const { options: listingSearchOptions, isLoading: listingSearchLoading } = useListingSearch(listingSearchValue);
  const [formError, setFormError] = useState<string | null>(null);
  // A template saved in a format the form can't fully hold opens as JSON instead (see utils/round-trip).
  const stored = useMemo(() => (opened && strategy ? snakeKeys((strategy.parameters ?? {}) as Record<string, unknown>) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opened, strategy?.strategyId]);
  const fallback = useJsonFallback(stored, templateLostFields);

  const applyTemplate = (t: TemplateForm) => {
    setLaunch(t.launch);
    setArgs(t.args);
    setOverrides(t.overrides);
    setSimulation(t.simulation);
    setListingIds(t.listingIds);
  };
  const backToForm = (drop: boolean) => {
    const value = fallback.backToForm(drop);
    if (value) applyTemplate(templateFormFrom(value));
  };

  const listingMergedData = useMemo(() => [
    ...Object.entries(listingLabels)
      .filter(([id]) => !listingSearchOptions.some(o => o.value === id))
      .map(([id, label]) => ({ value: id, label })),
    ...listingSearchOptions,
  ], [listingLabels, listingSearchOptions]);

  const handleListingChange = useCallback((values: string[]) => {
    setListingIds(values);
    const updated = { ...listingLabels };
    for (const v of values) {
      if (!updated[v]) {
        const opt = listingSearchOptions.find(o => o.value === v);
        if (opt) updated[v] = opt.label;
      }
    }
    for (const key of Object.keys(updated)) {
      if (!values.includes(key)) delete updated[key];
    }
    setListingLabels(updated);
  }, [listingLabels, listingSearchOptions]);

  useEffect(() => {
    if (!opened) return;

    if (!strategy) {
      setForm(defaultForm());
      applyTemplate(templateFormFrom({}));
      setListingLabels({});
      setListingSearchValue('');
      setFormError(null);
      return;
    }

    setForm({ name: strategy.name ?? '', description: strategy.description ?? '', archived: strategy.archived });
    applyTemplate(templateFormFrom((strategy.parameters ?? {}) as Record<string, unknown>));
    setListingLabels({});
    setListingSearchValue('');
    setFormError(null);
  }, [opened, strategy?.strategyId]);

  const handleSubmit = async () => {
    setFormError(null);
    try {
      let parameters: Record<string, unknown>;
      if (fallback.asJson) {
        const value = fallback.parse();
        if (value === null) return;
        parameters = value;
      } else {
        const problem = launch.mode === 'paper' ? simulationProblem(simulation) : null;
        if (problem) { setFormError(problem); return; }
        parameters = templateParamsFrom({ launch, args, overrides, simulation, listingIds });
      }

      if (strategy) {
        await registryApi.updateStrategy(strategy.strategyId, {
          name: form.name,
          description: form.description || undefined,
          archived: form.archived,
          parameters,
        });
      } else {
        await registryApi.createStrategy({
          name: form.name,
          description: form.description || undefined,
          parameters,
        });
      }

      onClose();
      onSaved();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : `Failed to ${strategy ? 'update' : 'create'} strategy`);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={strategy ? 'Edit Strategy' : 'Create Strategy'} size="lg">
      <Stack>
        <TextInput label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        <TextInput label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        {strategy && (
          <Switch
            label="Archived"
            description="Hides the strategy from day-to-day lists. Has no effect on trading."
            checked={form.archived}
            onChange={(e) => { const checked = e.currentTarget.checked; setForm((f) => ({ ...f, archived: checked })); }}
          />
        )}

        <Divider />
        <Title order={6} c="dimmed">Default Config</Title>
        {fallback.asJson ? (
          <>
            <StaleConfigAlert what="This strategy's default config" lost={fallback.remaining}
              onBackToForm={() => backToForm(false)} onDropAndUseForm={() => backToForm(true)} />
            <JsonInput label="Parameters" value={fallback.json} onChange={fallback.setJson} autosize minRows={10}
              formatOnBlur validationError="Invalid JSON" error={fallback.error} />
          </>
        ) : (
          <>
            <LaunchSettingsFields
              value={launch}
              onChange={patch => setLaunch(l => ({ ...l, ...patch }))}
              listingCount={listingIds.length}
            />
            <MultiSelect
              label="Listings"
              placeholder="Search listings..."
              data={listingMergedData}
              value={listingIds}
              onChange={handleListingChange}
              searchable
              searchValue={listingSearchValue}
              onSearchChange={setListingSearchValue}
              nothingFoundMessage={listingSearchLoading ? 'Loading...' : 'No listings found'}
            />

            <Divider />
            <StrategyArgsEditor rows={args} onChange={setArgs} />

            {launch.mode === 'paper' && (
              <>
                <Divider />
                <SimulationSettingsEditor value={simulation} onChange={setSimulation} listingIds={listingIds.map(Number)} />
              </>
            )}

            <OrchestratorOverridesEditor value={overrides} onChange={setOverrides} version={launch.orchestratorVersion} />
          </>
        )}

        {formError && <Text c="red" size="sm">{formError}</Text>}
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit}>{strategy ? 'Save' : 'Create'}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default StrategyFormModal;
