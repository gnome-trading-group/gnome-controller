import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  JsonInput,
  Modal,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { Strategy, StrategyStatus, ConfigValue } from '../../types';
import { registryApi } from '../../utils/api';
import { useListingSearch } from '../../hooks/useAsyncSearch';
import { STRATEGY_CPU_OPTIONS, VALID_MEMORY_OPTIONS, suggestStrategySizing } from '../../utils/sizing';
import {
  defaultSimulationState,
  ListingProfileRow,
  ProfilesEditor,
  ProfilesState,
  simulationProfilesFromConfig,
  simulationProfilesToConfig,
} from '../../components/SimulationConfigForm';

const STATUS_LABELS: Record<number, string> = {
  [StrategyStatus.INACTIVE]: 'Inactive',
  [StrategyStatus.ACTIVE]: 'Active',
  [StrategyStatus.PAUSED]: 'Paused',
};

function defaultForm() {
  return {
    name: '',
    description: '',
    status: StrategyStatus.INACTIVE,
    mode: 'paper',
    strategyType: 'java',
    strategyClass: '',
    region: '',
    researchCommit: '',
    cpu: 4096,
    memory: 8192,
    args: [] as { key: string; value: string | number | boolean; type: 'string' | 'number' | 'boolean' | 'json' }[],
  };
}

function defaultProfiles(): ProfilesState {
  return { default: defaultSimulationState() };
}

function defaultListings(): ListingProfileRow[] {
  return [{ listingId: '', profile: 'default' }];
}

interface StrategyFormModalProps {
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
  strategy?: Strategy | null;
}

function StrategyFormModal({ opened, onClose, onSaved, strategy }: StrategyFormModalProps) {
  const [form, setForm] = useState(defaultForm());
  const [profiles, setProfiles] = useState<ProfilesState>(defaultProfiles());
  const [listings, setListings] = useState<ListingProfileRow[]>(defaultListings());
  const [liveListingIds, setLiveListingIds] = useState<string[]>([]);
  const [liveListingItems, setLiveListingItems] = useState<Record<string, string>>({});
  const [liveListingSearchValue, setLiveListingSearchValue] = useState('');
  const { options: liveListingSearchOptions, isLoading: liveListingSearchLoading } = useListingSearch(liveListingSearchValue);
  const [sizingUserOverridden, setSizingUserOverridden] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const liveListingMergedData = useMemo(() => [
    ...Object.entries(liveListingItems)
      .filter(([id]) => !liveListingSearchOptions.some(o => o.value === id))
      .map(([id, label]) => ({ value: id, label })),
    ...liveListingSearchOptions,
  ], [liveListingItems, liveListingSearchOptions]);

  const handleLiveListingChange = useCallback((values: string[]) => {
    setLiveListingIds(values);
    const updated = { ...liveListingItems };
    for (const v of values) {
      if (!updated[v]) {
        const opt = liveListingSearchOptions.find(o => o.value === v);
        if (opt) updated[v] = opt.label;
      }
    }
    for (const key of Object.keys(updated)) {
      if (!values.includes(key)) delete updated[key];
    }
    setLiveListingItems(updated);
  }, [liveListingItems, liveListingSearchOptions]);

  useEffect(() => {
    if (sizingUserOverridden) return;
    const count = form.mode === 'paper'
      ? listings.filter(l => l.listingId.trim()).length
      : liveListingIds.length;
    if (count > 0) {
      const suggested = suggestStrategySizing(count);
      setForm(f => ({ ...f, cpu: suggested.cpu, memory: suggested.memory }));
    }
  }, [listings, liveListingIds, form.mode, sizingUserOverridden]);

  useEffect(() => {
    if (!opened) return;

    if (!strategy) {
      setForm(defaultForm());
      setProfiles(defaultProfiles());
      setListings(defaultListings());
      setLiveListingIds([]);
      setLiveListingItems({});
      setLiveListingSearchValue('');
      setSizingUserOverridden(false);
      setFormError(null);
      return;
    }

    const p = strategy.parameters as Record<string, unknown> | undefined ?? {};
    const args = p.args && typeof p.args === 'object'
      ? Object.entries(p.args as Record<string, unknown>).map(([key, value]) => {
          if (typeof value === 'number') return { key, value, type: 'number' as const };
          if (typeof value === 'boolean') return { key, value, type: 'boolean' as const };
          if (typeof value === 'object' && value !== null) return { key, value: JSON.stringify(value, null, 2), type: 'json' as const };
          return { key, value: String(value), type: 'string' as const };
        })
      : [];

    const loadedCpu = p.cpu ? Number(p.cpu) : 4096;
    const loadedMemory = p.memory ? Number(p.memory) : 8192;
    setSizingUserOverridden(!!p.cpu);
    setForm({
      name: strategy.name ?? '',
      description: strategy.description ?? '',
      status: strategy.status,
      mode: p.mode ? String(p.mode) : 'paper',
      strategyType: p.strategyType ? String(p.strategyType) : 'java',
      strategyClass: p.strategyClass ? String(p.strategyClass) : '',
      region: p.region ? String(p.region) : '',
      researchCommit: p.researchCommit ? String(p.researchCommit) : '',
      cpu: loadedCpu,
      memory: loadedMemory,
      args,
    });
    if (Array.isArray(p.listings)) {
      setLiveListingIds((p.listings as number[]).map(String));
    } else {
      setLiveListingIds([]);
    }
    setLiveListingItems({});
    setLiveListingSearchValue('');

    if (p.simulation && typeof p.simulation === 'object') {
      const { profiles: loadedProfiles, listings: loadedListings } = simulationProfilesFromConfig(
        p.simulation as Record<string, string>
      );
      setProfiles(Object.keys(loadedProfiles).length > 0 ? loadedProfiles : defaultProfiles());
      setListings(loadedListings.length > 0 ? loadedListings : defaultListings());
    } else {
      setProfiles(defaultProfiles());
      setListings(defaultListings());
    }
    setFormError(null);
  }, [opened, strategy?.strategyId]);

  const handleSubmit = async () => {
    setFormError(null);
    try {
      const args: Record<string, ConfigValue> = {};
      for (const { key, value, type } of form.args) {
        if (key.trim()) {
          args[key.trim()] = type === 'json' ? JSON.parse(value as string) : value;
        }
      }
      const parameters: Record<string, unknown> = {
        mode: form.mode,
        strategy_type: form.strategyType,
        strategy_class: form.strategyClass,
      };
      if (form.mode === 'live') parameters.listings = liveListingIds.map(Number);
      if (form.region.trim()) parameters.region = form.region.trim();
      if (form.researchCommit.trim()) parameters.research_commit = form.researchCommit.trim();
      if (Object.keys(args).length > 0) parameters.args = args;
      if (form.mode === 'paper') parameters.simulation = simulationProfilesToConfig(profiles, listings);
      parameters.cpu = form.cpu;
      parameters.memory = form.memory;

      if (strategy) {
        await registryApi.updateStrategy(strategy.strategyId, {
          name: form.name,
          description: form.description || undefined,
          status: form.status,
          parameters,
        });
      } else {
        await registryApi.createStrategy({
          name: form.name,
          description: form.description || undefined,
          status: form.status,
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
        <Select label="Status" value={form.status.toString()} data={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} onChange={(v) => setForm((f) => ({ ...f, status: parseInt(v ?? '0') }))} />

        <Divider />
        <Title order={6} c="dimmed">Default Config</Title>
        <Group grow>
          <Select label="Mode" value={form.mode} data={[{ value: 'paper', label: 'Paper' }, { value: 'live', label: 'Live' }]} onChange={(v) => setForm((f) => ({ ...f, mode: v ?? 'paper' }))} />
          <Select label="Strategy Type" value={form.strategyType} data={[{ value: 'java', label: 'Java' }, { value: 'python', label: 'Python' }]} onChange={(v) => setForm((f) => ({ ...f, strategyType: v ?? 'java' }))} />
        </Group>
        <TextInput label="Strategy Class" placeholder="com.example.MyStrategy or module:ClassName" value={form.strategyClass} onChange={(e) => setForm((f) => ({ ...f, strategyClass: e.target.value }))} />
        {form.mode === 'live' && (
          <MultiSelect
            label="Listings"
            placeholder="Search listings..."
            data={liveListingMergedData}
            value={liveListingIds}
            onChange={handleLiveListingChange}
            searchable
            searchValue={liveListingSearchValue}
            onSearchChange={setLiveListingSearchValue}
            nothingFoundMessage={liveListingSearchLoading ? 'Loading...' : 'No listings found'}
          />
        )}
        <Group grow>
          <TextInput label="Region (optional)" placeholder="us-east-1" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
          <TextInput label="Research Commit (optional)" placeholder="main" value={form.researchCommit} onChange={(e) => setForm((f) => ({ ...f, researchCommit: e.target.value }))} />
        </Group>
        <Group grow>
          <Select
            label="CPU"
            data={STRATEGY_CPU_OPTIONS.map(String)}
            value={String(form.cpu)}
            onChange={(v) => {
              const newCpu = Number(v ?? '4096');
              setForm((f) => ({ ...f, cpu: newCpu, memory: VALID_MEMORY_OPTIONS[newCpu][0] }));
              setSizingUserOverridden(true);
            }}
          />
          <Select
            label="Memory (MiB)"
            data={(VALID_MEMORY_OPTIONS[form.cpu] ?? []).map(String)}
            value={String(form.memory)}
            onChange={(v) => { setForm((f) => ({ ...f, memory: Number(v ?? '8192') })); setSizingUserOverridden(true); }}
          />
        </Group>

        <Divider />
        <Group justify="space-between">
          <Title order={6} c="dimmed">Strategy Args</Title>
          <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => setForm((f) => ({ ...f, args: [...f.args, { key: '', value: '', type: 'string' as const }] }))}>
            <IconPlus size={14} />
          </ActionIcon>
        </Group>
        {form.args.map((row, i) => (
          <Group key={i} gap="xs" align="flex-start">
            <TextInput placeholder="key" value={row.key} onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, args: f.args.map((r, j) => j === i ? { ...r, key: v } : r) })); }} style={{ flex: 1 }} />
            <Select
              data={[{ value: 'string', label: 'String' }, { value: 'number', label: 'Number' }, { value: 'boolean', label: 'Boolean' }, { value: 'json', label: 'JSON' }]}
              value={row.type}
              onChange={(v) => setForm((f) => ({ ...f, args: f.args.map((r, j) => j === i ? { ...r, type: (v ?? 'string') as typeof row.type, value: v === 'boolean' ? false : v === 'number' ? 0 : '' } : r) }))}
              w={100}
            />
            {row.type === 'number' && (
              <NumberInput value={row.value as number} onChange={(v) => setForm((f) => ({ ...f, args: f.args.map((r, j) => j === i ? { ...r, value: v === '' ? 0 : Number(v) } : r) }))} style={{ flex: 1 }} />
            )}
            {row.type === 'boolean' && (
              <Switch checked={row.value as boolean} onChange={(e) => { const checked = e.currentTarget.checked; setForm((f) => ({ ...f, args: f.args.map((r, j) => j === i ? { ...r, value: checked } : r) })); }} mt={6} />
            )}
            {row.type === 'json' && (
              <JsonInput value={row.value as string} onChange={(v) => setForm((f) => ({ ...f, args: f.args.map((r, j) => j === i ? { ...r, value: v } : r) }))} validationError="Invalid JSON" formatOnBlur autosize minRows={1} style={{ flex: 1 }} />
            )}
            {row.type === 'string' && (
              <TextInput placeholder="value" value={row.value as string} onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, args: f.args.map((r, j) => j === i ? { ...r, value: v } : r) })); }} style={{ flex: 1 }} />
            )}
            <ActionIcon variant="subtle" color="red" mt={6} onClick={() => setForm((f) => ({ ...f, args: f.args.filter((_, j) => j !== i) }))}>
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        ))}

        {form.mode === 'paper' && (
          <ProfilesEditor
            profiles={profiles}
            listings={listings}
            onProfilesChange={setProfiles}
            onListingsChange={setListings}
          />
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
