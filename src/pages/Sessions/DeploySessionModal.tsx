import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Strategy, ConfigValue, StrategySession } from '../../types';
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

interface ParamRow {
  key: string;
  value: string | number | boolean;
  type: 'string' | 'number' | 'boolean' | 'json';
}

interface DeploySessionModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: (sessionId: string) => void;
  preselectedStrategyId?: number;
  initialSession?: StrategySession | null;
}

const MODE_OPTIONS = [
  { value: 'paper', label: 'Paper' },
  { value: 'live', label: 'Live' },
];


const STRATEGY_TYPE_OPTIONS = [
  { value: 'java', label: 'Java' },
  { value: 'python', label: 'Python' },
];

function flattenToSessionConfig(
  strategyId: string,
  mode: string,
  strategyType: string | null,
  strategyClass: string,
  listings: ListingProfileRow[],
  selectedLiveListingIds: string[],
  researchCommit: string,
  region: string,
  params: ParamRow[],
  profiles: ProfilesState,
): Record<string, ConfigValue> {
  const listingsArr: number[] = mode === 'paper'
    ? listings.map(l => parseInt(l.listingId.trim(), 10)).filter(n => !isNaN(n))
    : selectedLiveListingIds.map(Number);

  const config: Record<string, ConfigValue> = {
    'strategy.id': strategyId,
    mode,
    listings: listingsArr,
  };
  if (strategyType) {
    config['strategy.type'] = strategyType;
    if (strategyClass.trim()) config['strategy.class'] = strategyClass.trim();
  }
  if (researchCommit.trim()) config['research_commit'] = researchCommit.trim();
  if (region.trim()) config['region'] = region.trim();
  for (const { key, value, type } of params) {
    if (key.trim()) {
      config[`strategy.args.${key.trim()}`] = type === 'json' ? JSON.parse(value as string) : value;
    }
  }
  if (mode === 'paper') {
    const simCfg = simulationProfilesToConfig(profiles, listings);
    for (const [k, v] of Object.entries(simCfg)) {
      config[k] = v;
    }
  }
  return config;
}

function defaultProfiles(): ProfilesState {
  return { default: defaultSimulationState() };
}

function defaultListings(): ListingProfileRow[] {
  return [{ listingId: '', profile: 'default' }];
}

function DeploySessionModal({ opened, onClose, onCreated, preselectedStrategyId, initialSession }: DeploySessionModalProps) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [strategyId, setStrategyId] = useState<string | null>(
    preselectedStrategyId !== undefined ? String(preselectedStrategyId) : null
  );
  const [mode, setMode] = useState<string>('paper');
  const [profiles, setProfiles] = useState<ProfilesState>(defaultProfiles());
  const [listings, setListings] = useState<ListingProfileRow[]>(defaultListings());
  const [selectedLiveListingIds, setSelectedLiveListingIds] = useState<string[]>([]);
  const [selectedLiveListingItems, setSelectedLiveListingItems] = useState<Record<string, string>>({});
  const [liveListingSearchValue, setLiveListingSearchValue] = useState('');
  const { options: liveListingSearchOptions, isLoading: liveListingSearchLoading } = useListingSearch(liveListingSearchValue);
  const [researchCommit, setResearchCommit] = useState('');
  const [region, setRegion] = useState('');
  const [strategyType, setStrategyType] = useState<string | null>(null);
  const [strategyClass, setStrategyClass] = useState('');
  const [params, setParams] = useState<ParamRow[]>([]);
  const [cpu, setCpu] = useState(4096);
  const [memory, setMemory] = useState(8192);
  const [sizingUserOverridden, setSizingUserOverridden] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveListingMergedData = useMemo(() => [
    ...Object.entries(selectedLiveListingItems)
      .filter(([id]) => !liveListingSearchOptions.some(o => o.value === id))
      .map(([id, label]) => ({ value: id, label })),
    ...liveListingSearchOptions,
  ], [selectedLiveListingItems, liveListingSearchOptions]);

  const handleLiveListingChange = useCallback((values: string[]) => {
    setSelectedLiveListingIds(values);
    const updated = { ...selectedLiveListingItems };
    for (const v of values) {
      if (!updated[v]) {
        const opt = liveListingSearchOptions.find(o => o.value === v);
        if (opt) updated[v] = opt.label;
      }
    }
    for (const key of Object.keys(updated)) {
      if (!values.includes(key)) delete updated[key];
    }
    setSelectedLiveListingItems(updated);
  }, [selectedLiveListingItems, liveListingSearchOptions]);

  useEffect(() => {
    registryApi.listStrategies().then(setStrategies).catch(() => {});
  }, []);

  useEffect(() => {
    if (preselectedStrategyId !== undefined) {
      setStrategyId(String(preselectedStrategyId));
    }
  }, [preselectedStrategyId]);

  const loadStrategyDefaults = useCallback((strategy: Strategy) => {
    const p = strategy.parameters as Record<string, unknown> | undefined;
    if (!p) return;
    if (p.mode) setMode(String(p.mode));
    if (p.strategyType) setStrategyType(String(p.strategyType));
    if (p.strategyClass) setStrategyClass(String(p.strategyClass));
    if (p.region) setRegion(String(p.region));
    if (p.researchCommit) setResearchCommit(String(p.researchCommit));
    if (p.args && typeof p.args === 'object') {
      const entries = Object.entries(p.args as Record<string, unknown>);
      setParams(entries.map(([k, v]) => {
        if (typeof v === 'number') return { key: k, value: v, type: 'number' as const };
        if (typeof v === 'boolean') return { key: k, value: v, type: 'boolean' as const };
        if (typeof v === 'object' && v !== null) return { key: k, value: JSON.stringify(v, null, 2), type: 'json' as const };
        return { key: k, value: String(v), type: 'string' as const };
      }));
    }
    if (p.simulation && typeof p.simulation === 'object') {
      const { profiles: loadedProfiles, listings: loadedListings } = simulationProfilesFromConfig(
        p.simulation as Record<string, string>
      );
      if (Object.keys(loadedProfiles).length > 0) {
        setProfiles(loadedProfiles);
        setListings(loadedListings.length > 0 ? loadedListings : defaultListings());
      }
    }
    if (p.listings && Array.isArray(p.listings) && String(p.mode) === 'live') {
      setSelectedLiveListingIds((p.listings as number[]).map(String));
    }
    if (p.cpu) { setCpu(Number(p.cpu)); setSizingUserOverridden(true); }
    if (p.memory) { setMemory(Number(p.memory)); }
  }, []);

  const loadFromSession = useCallback((session: StrategySession) => {
    const config = session.config;
    setStrategyId(String(session.strategyId));
    setMode(session.mode);
    if (config['strategy.type']) setStrategyType(String(config['strategy.type']));
    else setStrategyType(null);
    if (config['strategy.class']) setStrategyClass(String(config['strategy.class']));
    else setStrategyClass('');
    setResearchCommit(config['research_commit'] ? String(config['research_commit']) : '');
    setRegion(config['region'] ? String(config['region']) : '');

    const parsedParams: ParamRow[] = [];
    for (const [key, value] of Object.entries(config)) {
      if (!key.startsWith('strategy.args.')) continue;
      const argKey = key.substring('strategy.args.'.length);
      if (typeof value === 'number') parsedParams.push({ key: argKey, value, type: 'number' });
      else if (typeof value === 'boolean') parsedParams.push({ key: argKey, value, type: 'boolean' });
      else if (typeof value === 'object' && value !== null) parsedParams.push({ key: argKey, value: JSON.stringify(value, null, 2), type: 'json' });
      else parsedParams.push({ key: argKey, value: String(value), type: 'string' });
    }
    setParams(parsedParams);

    if (session.mode === 'live') {
      const rawListings = config['listings'];
      if (Array.isArray(rawListings)) {
        setSelectedLiveListingIds((rawListings as number[]).map(String));
      }
      setProfiles(defaultProfiles());
      setListings(defaultListings());
    } else {
      const simConfig: Record<string, ConfigValue> = {};
      for (const [k, v] of Object.entries(config)) {
        if (k.startsWith('simulation.')) simConfig[k] = v;
      }
      const { profiles: loadedProfiles, listings: loadedListings } = simulationProfilesFromConfig(simConfig);
      setProfiles(Object.keys(loadedProfiles).length > 0 ? loadedProfiles : defaultProfiles());
      setListings(loadedListings.length > 0 ? loadedListings : defaultListings());
      setSelectedLiveListingIds([]);
    }
  }, []);

  const handleStrategyChange = useCallback((value: string | null) => {
    setStrategyId(value);
    if (!value) {
      setParams([]);
      return;
    }
    const strategy = strategies.find(s => String(s.strategyId) === value);
    if (strategy) loadStrategyDefaults(strategy);
    else setParams([]);
  }, [strategies, loadStrategyDefaults]);

  useEffect(() => {
    if (initialSession) return;
    if (preselectedStrategyId !== undefined) {
      const strategy = strategies.find(s => s.strategyId === preselectedStrategyId);
      if (strategy) loadStrategyDefaults(strategy);
    }
  }, [strategies, preselectedStrategyId, loadStrategyDefaults, initialSession]);

  useEffect(() => {
    if (!opened || !initialSession) return;
    loadFromSession(initialSession);
  }, [opened, initialSession]);

  useEffect(() => {
    if (sizingUserOverridden) return;
    const count = mode === 'paper'
      ? listings.filter(l => l.listingId.trim()).length
      : selectedLiveListingIds.length;
    if (count > 0) {
      const suggested = suggestStrategySizing(count);
      setCpu(suggested.cpu);
      setMemory(suggested.memory);
    }
  }, [listings, selectedLiveListingIds, mode, sizingUserOverridden]);

  const resetForm = () => {
    setStrategyId(preselectedStrategyId !== undefined ? String(preselectedStrategyId) : null);
    setMode('paper');
    setProfiles(defaultProfiles());
    setListings(defaultListings());
    setSelectedLiveListingIds([]);
    setSelectedLiveListingItems({});
    setLiveListingSearchValue('');
    setResearchCommit('');
    setRegion('');
    setStrategyType(null);
    setStrategyClass('');
    setParams([]);
    setCpu(4096);
    setMemory(8192);
    setSizingUserOverridden(false);
    setError(null);
  };

  const handleClose = () => { resetForm(); onClose(); };

  const handleSubmit = async () => {
    setError(null);
    if (!strategyId) { setError('Strategy is required'); return; }

    if (mode === 'paper') {
      if (listings.length === 0) { setError('At least one listing is required'); return; }
      if (listings.some(l => !l.listingId.trim())) { setError('All listing IDs must be filled in'); return; }
      if (listings.some(l => !l.profile)) { setError('All listings must have a profile assigned'); return; }
      if (Object.keys(profiles).length === 0) { setError('At least one profile must be defined'); return; }
    } else {
      if (selectedLiveListingIds.length === 0) { setError('Listings are required'); return; }
    }

    const config = flattenToSessionConfig(
      strategyId, mode, strategyType, strategyClass,
      listings, selectedLiveListingIds, researchCommit, region, params, profiles,
    );

    setSubmitting(true);
    try {
      const newSessionId = crypto.randomUUID();
      await registryApi.createSession({
        sessionId: newSessionId,
        strategyId: parseInt(strategyId),
        mode,
        config,
        researchCommit: researchCommit.trim() || undefined,
        region: region.trim() || undefined,
        cpu,
        memory,
      });
      handleClose();
      onCreated(newSessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to deploy session');
    } finally {
      setSubmitting(false);
    }
  };

  const strategyOptions = strategies.map(s => ({ value: String(s.strategyId), label: s.name }));

  return (
    <Modal opened={opened} onClose={handleClose} title={initialSession ? 'Relaunch Session' : 'Deploy Strategy Session'} size="xl">
      <Stack gap="sm">
        <Title order={6} c="dimmed">Core</Title>
        <Select
          label="Strategy"
          data={strategyOptions}
          value={strategyId}
          onChange={handleStrategyChange}
          required
          disabled={preselectedStrategyId !== undefined || !!initialSession}
          searchable
        />
        <Select label="Mode" data={MODE_OPTIONS} value={mode} onChange={v => setMode(v ?? 'paper')} required />
        <TextInput label="Research Commit" placeholder="git SHA or branch (optional)" value={researchCommit} onChange={e => setResearchCommit(e.currentTarget.value)} />
        <TextInput label="Region Override" placeholder="e.g. us-east-1 (optional)" value={region} onChange={e => setRegion(e.currentTarget.value)} />
        <Group grow>
          <Select
            label="CPU"
            data={STRATEGY_CPU_OPTIONS.map(String)}
            value={String(cpu)}
            onChange={(v) => {
              const newCpu = Number(v ?? '4096');
              setCpu(newCpu);
              setMemory(VALID_MEMORY_OPTIONS[newCpu][0]);
              setSizingUserOverridden(true);
            }}
          />
          <Select
            label="Memory (MiB)"
            data={(VALID_MEMORY_OPTIONS[cpu] ?? []).map(String)}
            value={String(memory)}
            onChange={(v) => {
              setMemory(Number(v ?? '4096'));
              setSizingUserOverridden(true);
            }}
          />
        </Group>

        <Divider />
        <Title order={6} c="dimmed">Strategy Class</Title>
        <Select label="Strategy Type" data={STRATEGY_TYPE_OPTIONS} value={strategyType} onChange={setStrategyType} clearable placeholder="Auto-detect" />
        <TextInput label="Strategy Class" placeholder="com.example.MyStrategy or module:ClassName" value={strategyClass} onChange={e => setStrategyClass(e.currentTarget.value)} />

        <Divider />
        <Group justify="space-between">
          <Title order={6} c="dimmed">Strategy Parameters</Title>
          <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => setParams(p => [...p, { key: '', value: '', type: 'string' as const }])}>
            <IconPlus size={14} />
          </ActionIcon>
        </Group>
        {params.map((row, i) => (
          <Group key={i} gap="xs" align="flex-start">
            <TextInput placeholder="key" value={row.key} onChange={e => setParams(p => p.map((r, j) => j === i ? { ...r, key: e.currentTarget.value } : r))} style={{ flex: 1 }} />
            <Select
              data={[{ value: 'string', label: 'String' }, { value: 'number', label: 'Number' }, { value: 'boolean', label: 'Boolean' }, { value: 'json', label: 'JSON' }]}
              value={row.type}
              onChange={(v) => setParams(p => p.map((r, j) => j === i ? { ...r, type: (v ?? 'string') as ParamRow['type'], value: v === 'boolean' ? false : v === 'number' ? 0 : '' } : r))}
              w={100}
            />
            {row.type === 'number' && (
              <NumberInput value={row.value as number} onChange={(v) => setParams(p => p.map((r, j) => j === i ? { ...r, value: v === '' ? 0 : Number(v) } : r))} style={{ flex: 1 }} />
            )}
            {row.type === 'boolean' && (
              <Switch checked={row.value as boolean} onChange={(e) => { const checked = e.currentTarget.checked; setParams(p => p.map((r, j) => j === i ? { ...r, value: checked } : r)); }} mt={6} />
            )}
            {row.type === 'json' && (
              <JsonInput value={row.value as string} onChange={(v) => setParams(p => p.map((r, j) => j === i ? { ...r, value: v } : r))} validationError="Invalid JSON" formatOnBlur autosize minRows={1} style={{ flex: 1 }} />
            )}
            {row.type === 'string' && (
              <TextInput placeholder="value" value={row.value as string} onChange={e => setParams(p => p.map((r, j) => j === i ? { ...r, value: e.currentTarget.value } : r))} style={{ flex: 1 }} />
            )}
            <ActionIcon variant="subtle" color="red" mt={6} onClick={() => setParams(p => p.filter((_, j) => j !== i))}>
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        ))}

        {mode === 'live' && (
          <>
            <Divider />
            <MultiSelect
              label="Listings"
              placeholder="Search listings..."
              data={liveListingMergedData}
              value={selectedLiveListingIds}
              onChange={handleLiveListingChange}
              searchable
              searchValue={liveListingSearchValue}
              onSearchChange={setLiveListingSearchValue}
              nothingFoundMessage={liveListingSearchLoading ? 'Loading...' : 'No listings found'}
              required
            />
          </>
        )}

        {mode === 'paper' && (
          <>
            <Divider />
            <ProfilesEditor
              profiles={profiles}
              listings={listings}
              onProfilesChange={setProfiles}
              onListingsChange={setListings}
            />
          </>
        )}

        {error && <Text c="red" size="sm">{error}</Text>}
        <Group justify="flex-end">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button color="green" loading={submitting} onClick={handleSubmit}>{initialSession ? 'Relaunch' : 'Deploy'}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default DeploySessionModal;
