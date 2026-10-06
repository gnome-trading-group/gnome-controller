import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
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
import { IconAlertTriangle, IconPlus, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { Strategy, ConfigValue, RiskPolicy, StrategySession, StrategySessionStatus } from '../../types';
import { registryApi } from '../../utils/api';
import { OrchestratorOverridesEditor } from '../../components/OrchestratorOverrides';
import { Overrides, toOverrides } from '../../utils/orchestrator-overrides';
import { useListingSearch } from '../../hooks/useAsyncSearch';
import { useLatestPolicyHistory } from '../../hooks/useLatestPolicyHistory';
import { findKillSwitch, formatActor } from '../../utils/kill-switch';
import {
  LATENCY_PROFILE_OPTIONS,
  LatencyProfile,
  instanceTypeOptions,
  isInstanceTypeValidFor,
  suggestInstanceType,
  defaultLatencyProfile,
} from '../../utils/sizing';
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
  latencyProfile: LatencyProfile,
  params: ParamRow[],
  profiles: ProfilesState,
  simSeed: number | string,
  overrides: Overrides,
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
  config['latency.profile'] = latencyProfile;
  for (const [property, value] of Object.entries(overrides)) {
    config[`overrides.${property}`] = value;
  }
  for (const { key, value, type } of params) {
    if (key.trim()) {
      let parsed: ConfigValue = value;
      if (type === 'json') {
        try {
          parsed = JSON.parse(value as string);
        } catch {
          throw new Error(`Parameter "${key.trim()}" is not valid JSON`);
        }
      }
      config[`strategy.args.${key.trim()}`] = parsed;
    }
  }
  if (mode === 'paper') {
    const simCfg = simulationProfilesToConfig(profiles, listings, simSeed);
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
  const [simSeed, setSimSeed] = useState<number | string>('');
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
  const [overrides, setOverrides] = useState<Overrides>({});
  const [latencyProfile, setLatencyProfile] = useState<LatencyProfile>(defaultLatencyProfile('paper'));
  // Until someone picks a profile, it follows the mode, the way the instance type follows the listing count.
  const [profileUserChosen, setProfileUserChosen] = useState(false);
  const [instanceType, setInstanceType] = useState(suggestInstanceType(defaultLatencyProfile('paper'), 'paper', 1));
  const [availabilityZone, setAvailabilityZone] = useState('');
  const [orchestratorVersion, setOrchestratorVersion] = useState('');
  const [gnomepyVersion, setGnomepyVersion] = useState('');
  const [sizingUserOverridden, setSizingUserOverridden] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveConfirmText, setLiveConfirmText] = useState('');
  // One id per deploy attempt, reused on retry: if a launch timed out after the registry recorded it, the retry hits
  // the duplicate id instead of starting a second session.
  const sessionIdRef = useRef<string | null>(null);
  const [strategyKillSwitch, setStrategyKillSwitch] = useState<RiskPolicy | undefined>(undefined);
  const [resumeOnLaunch, setResumeOnLaunch] = useState(false);
  const [killCheckFailed, setKillCheckFailed] = useState(false);

  const strategyKilled = strategyKillSwitch?.enabled ?? false;
  const latestKillSwitchEntry = useLatestPolicyHistory(strategyKilled ? strategyKillSwitch : undefined);

  useEffect(() => {
    setResumeOnLaunch(false);
    setKillCheckFailed(false);
    if (!opened || !strategyId) {
      setStrategyKillSwitch(undefined);
      return;
    }
    let cancelled = false;
    const target = { strategyId: parseInt(strategyId) };
    registryApi.listRiskPolicies()
      .then((policies) => { if (!cancelled) setStrategyKillSwitch(findKillSwitch(policies, target)); })
      .catch(() => { if (!cancelled) setKillCheckFailed(true); });
    return () => { cancelled = true; };
  }, [opened, strategyId]);

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
      const { profiles: loadedProfiles, listings: loadedListings, seed } = simulationProfilesFromConfig(
        p.simulation as Record<string, string>
      );
      if (Object.keys(loadedProfiles).length > 0) {
        setProfiles(loadedProfiles);
        setListings(loadedListings.length > 0 ? loadedListings : defaultListings());
      }
      setSimSeed(seed);
    }
    if (p.listings && Array.isArray(p.listings) && String(p.mode) === 'live') {
      setSelectedLiveListingIds((p.listings as number[]).map(String));
    }
    if (p.latencyProfile) {
      setLatencyProfile(String(p.latencyProfile) as LatencyProfile);
      setProfileUserChosen(true);
    }
    if (p.instanceType) { setInstanceType(String(p.instanceType)); setSizingUserOverridden(true); }
    if (p.availabilityZone) setAvailabilityZone(String(p.availabilityZone));
    if (p.orchestratorVersion) setOrchestratorVersion(String(p.orchestratorVersion));
    if (p.gnomepyVersion) setGnomepyVersion(String(p.gnomepyVersion));
    setOverrides(toOverrides(p.overrides));
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
    if (config['latency.profile']) {
      setLatencyProfile(config['latency.profile'] === 'standard' ? 'standard' : 'low_latency');
      setProfileUserChosen(true);
    }
    if (session.instanceType) {
      setInstanceType(session.instanceType);
      setSizingUserOverridden(true);
    }
    // Relaunching reruns the exact versions the previous session ran; clear a field to take the latest.
    setOrchestratorVersion(session.orchestratorVersion ?? '');
    setGnomepyVersion(session.gnomepyVersion ?? '');

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
    setOverrides(Object.fromEntries(
      Object.entries(config)
        .filter(([k]) => k.startsWith('overrides.'))
        .map(([k, v]) => [k.slice('overrides.'.length), String(v)]),
    ));

    if (session.mode === 'live') {
      const rawListings = config['listings'];
      if (Array.isArray(rawListings)) {
        setSelectedLiveListingIds((rawListings as number[]).map(String));
      }
      setProfiles(defaultProfiles());
      setListings(defaultListings());
      setSimSeed('');
    } else {
      const simConfig: Record<string, ConfigValue> = {};
      for (const [k, v] of Object.entries(config)) {
        if (k.startsWith('simulation.')) simConfig[k] = v;
      }
      const { profiles: loadedProfiles, listings: loadedListings, seed } = simulationProfilesFromConfig(simConfig);
      setSimSeed(seed);
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
    if (!profileUserChosen) setLatencyProfile(defaultLatencyProfile(mode));
  }, [mode, profileUserChosen]);

  useEffect(() => {
    const count = mode === 'paper'
      ? listings.filter(l => l.listingId.trim()).length
      : selectedLiveListingIds.length;
    if (!sizingUserOverridden || !isInstanceTypeValidFor(latencyProfile, instanceType)) {
      setInstanceType(suggestInstanceType(latencyProfile, mode, count));
    }
  }, [listings, selectedLiveListingIds, mode, latencyProfile, instanceType, sizingUserOverridden]);

  const resetForm = () => {
    sessionIdRef.current = null;
    setLiveConfirmText('');
    setStrategyId(preselectedStrategyId !== undefined ? String(preselectedStrategyId) : null);
    setMode('paper');
    setProfiles(defaultProfiles());
    setSimSeed('');
    setListings(defaultListings());
    setSelectedLiveListingIds([]);
    setSelectedLiveListingItems({});
    setLiveListingSearchValue('');
    setResearchCommit('');
    setRegion('');
    setStrategyType(null);
    setStrategyClass('');
    setParams([]);
    setOverrides({});
    setLatencyProfile(defaultLatencyProfile('paper'));
    setProfileUserChosen(false);
    setInstanceType(suggestInstanceType(defaultLatencyProfile('paper'), 'paper', 1));
    setAvailabilityZone('');
    setOrchestratorVersion('');
    setGnomepyVersion('');
    setSizingUserOverridden(false);
    setError(null);
    setResumeOnLaunch(false);
  };

  const handleClose = () => { resetForm(); onClose(); };

  const selectedStrategyName = strategies.find(s => String(s.strategyId) === strategyId)?.name ?? strategyId ?? '';
  const isLive = mode === 'live';

  const handleSubmit = async () => {
    setError(null);
    if (!strategyId) { setError('Strategy is required'); return; }
    if (!strategyType) { setError('Strategy type is required'); return; }
    if (!strategyClass.trim()) { setError('Strategy class is required'); return; }

    if (mode === 'paper') {
      if (listings.length === 0) { setError('At least one listing is required'); return; }
      if (listings.some(l => !l.listingId.trim())) { setError('All listing IDs must be filled in'); return; }
      if (listings.some(l => !l.profile)) { setError('All listings must have a profile assigned'); return; }
      if (Object.keys(profiles).length === 0) { setError('At least one profile must be defined'); return; }
    } else {
      if (selectedLiveListingIds.length === 0) { setError('Listings are required'); return; }
    }

    if (mode === 'live' && liveConfirmText.trim() !== selectedStrategyName) {
      setError(`Type the strategy name "${selectedStrategyName}" to confirm a live deploy`);
      return;
    }

    let config: Record<string, ConfigValue>;
    try {
      config = flattenToSessionConfig(
        strategyId, mode, strategyType, strategyClass,
        listings, selectedLiveListingIds, researchCommit, region, latencyProfile, params, profiles, simSeed, overrides,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid session config');
      return;
    }
    const isPython = strategyType === 'python';

    setSubmitting(true);
    const newSessionId = sessionIdRef.current ?? crypto.randomUUID();
    sessionIdRef.current = newSessionId;
    try {
      try {
        await registryApi.createSession({
          sessionId: newSessionId,
          strategyId: parseInt(strategyId),
          mode,
          config,
          researchCommit: isPython ? researchCommit.trim() || undefined : undefined,
          region: region.trim() || undefined,
          availabilityZone: availabilityZone.trim() || undefined,
          instanceType,
          orchestratorVersion: orchestratorVersion.trim() || undefined,
          gnomepyVersion: isPython ? gnomepyVersion.trim() || undefined : undefined,
        });
      } catch (launchError) {
        // The request can fail after the registry recorded the session (e.g. a gateway timeout), so check before
        // reporting a failure the user would retry.
        const existing = await registryApi.listSessions({ sessionId: newSessionId }).then(rows => rows[0]).catch(() => undefined);
        if (!existing) throw launchError;
        if (existing.status === StrategySessionStatus.FAILED) {
          sessionIdRef.current = null;
          throw launchError;
        }
      }
      // Resume only once the launch succeeded: resuming first and then failing to launch would leave every other
      // running session of the strategy trading again for nothing. If the resume fails the new session simply stays
      // blocked, and its page shows the strategy as killed.
      if (strategyKillSwitch?.enabled && resumeOnLaunch) {
        await registryApi.updateRiskPolicy(strategyKillSwitch.policyId, { enabled: false, reason: 'resumed on launch' })
          .catch((e) => console.error('Session launched but resuming the strategy failed:', e));
      }
      handleClose();
      onCreated(newSessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to deploy session');
    } finally {
      setSubmitting(false);
    }
  };

  // Archived strategies aren't offered, except one already chosen (e.g. relaunching its session).
  const strategyOptions = strategies
    .filter(s => !s.archived || String(s.strategyId) === strategyId)
    .map(s => ({ value: String(s.strategyId), label: s.name }));

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
        <Select label="Mode" data={MODE_OPTIONS} value={mode} onChange={v => { setMode(v ?? 'paper'); setLiveConfirmText(''); }} required />
        <Group grow>
          <TextInput label="Region Override" placeholder="e.g. us-east-1 (optional)" value={region} onChange={e => setRegion(e.currentTarget.value)} />
          <TextInput label="Availability Zone" placeholder="Auto, or e.g. us-east-1a" value={availabilityZone} onChange={e => setAvailabilityZone(e.currentTarget.value)} />
        </Group>
        <Group grow>
          <Select
            label="Latency Profile"
            data={LATENCY_PROFILE_OPTIONS}
            value={latencyProfile}
            onChange={(v) => {
              if (!v) return;
              setLatencyProfile(v as LatencyProfile);
              setProfileUserChosen(true);
            }}
          />
          <Select
            label="Instance Type"
            data={instanceTypeOptions(latencyProfile)}
            value={instanceType}
            onChange={(v) => {
              if (!v) return;
              setInstanceType(v);
              setSizingUserOverridden(true);
            }}
          />
        </Group>

        <Divider />
        <Title order={6} c="dimmed">Strategy Class</Title>
        <Select label="Strategy Type" data={STRATEGY_TYPE_OPTIONS} value={strategyType} onChange={setStrategyType} placeholder="Select a type" required />
        <TextInput label="Strategy Class" placeholder="com.example.MyStrategy or module:ClassName" value={strategyClass} onChange={e => setStrategyClass(e.currentTarget.value)} required />
        {/* Python strategies run inside the orchestrator JVM too, so they take its version as well. */}
        <Group grow>
          <TextInput label="Orchestrator Version" placeholder="Latest" value={orchestratorVersion} onChange={e => setOrchestratorVersion(e.currentTarget.value)} />
          {strategyType === 'python' && (
            <>
              <TextInput label="Gnomepy Version" placeholder="Latest" value={gnomepyVersion} onChange={e => setGnomepyVersion(e.currentTarget.value)} />
              <TextInput label="Research Commit" placeholder="git SHA or branch (default main)" value={researchCommit} onChange={e => setResearchCommit(e.currentTarget.value)} />
            </>
          )}
        </Group>

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
              seed={simSeed}
              onProfilesChange={setProfiles}
              onListingsChange={setListings}
              onSeedChange={setSimSeed}
            />
          </>
        )}

        <OrchestratorOverridesEditor value={overrides} onChange={setOverrides} version={orchestratorVersion} />

        {strategyKilled && strategyKillSwitch && (
          <Alert color="orange" title="Strategy is killed" icon={<IconAlertTriangle size={20} />}>
            <Stack gap="xs">
              <Text size="sm">
                Strategy {strategyId} is killed (since{' '}
                <ReactTimeAgo date={new Date(latestKillSwitchEntry?.changedAt ?? strategyKillSwitch.dateModified)} timeStyle="round" />
                {latestKillSwitchEntry && <>, by {formatActor(latestKillSwitchEntry.actor)}</>}
                {latestKillSwitchEntry?.reason ? `: ${latestKillSwitchEntry.reason}` : ''}).
                {' '}A session launched now will not be able to send orders.
              </Text>
              <Checkbox
                label="Resume the strategy after launching"
                description="Unblocks every running session of this strategy, not just the new one"
                checked={resumeOnLaunch}
                onChange={(e) => setResumeOnLaunch(e.currentTarget.checked)}
              />
            </Stack>
          </Alert>
        )}

        {killCheckFailed && (
          <Alert color="gray" title="Couldn't check the kill switch" icon={<IconAlertTriangle size={20} />}>
            <Text size="sm">
              Risk policies didn't load, so it's unknown whether strategy {strategyId} is killed. If it is, the new
              session won't be able to send orders.
            </Text>
          </Alert>
        )}

        {isLive && (
          // Mode can arrive from the strategy's saved defaults or the session being relaunched, so a live deploy
          // must be spelled out here rather than rely on the user having noticed the Mode field.
          <Alert color="red" title="LIVE session — trades real money" icon={<IconAlertTriangle size={20} />}>
            <Stack gap="xs">
              <Text size="sm">
                This session will send real orders to the exchange. Type the strategy name to confirm.
              </Text>
              <TextInput
                placeholder={selectedStrategyName}
                value={liveConfirmText}
                onChange={e => setLiveConfirmText(e.currentTarget.value)}
                disabled={submitting}
              />
            </Stack>
          </Alert>
        )}

        {error && <Text c="red" size="sm">{error}</Text>}
        <Group justify="flex-end">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            color={isLive ? 'red' : 'green'}
            loading={submitting}
            disabled={isLive && liveConfirmText.trim() !== selectedStrategyName}
            onClick={handleSubmit}
          >
            {initialSession ? 'Relaunch' : 'Deploy'}{isLive ? ' LIVE' : ''}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default DeploySessionModal;
