import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Code,
  Divider,
  Group,
  JsonInput,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { keys } from '../../query/hooks';
import { Strategy, ConfigValue, RiskPolicy, StrategySession, StrategySessionStatus } from '../../types';
import { registryApi } from '../../utils/api';
import { strategyClassError } from '../../utils/strategy-class';
import { OrchestratorOverridesEditor } from '../../components/OrchestratorOverrides';
import { Overrides } from '../../utils/orchestrator-overrides';
import { relaunchLostFields, SessionForm, sessionConfigFrom, sessionFormFrom } from '../../utils/session-config';
import { fillFromTemplate, templateFormFrom, templateLostFields } from '../../utils/strategy-template';
import { LostField } from '../../utils/round-trip';
import { useJsonFallback } from '../../hooks/useJsonFallback';
import { StaleConfigAlert } from '../../components/StaleConfigAlert';
import { useListingSearch } from '../../hooks/useAsyncSearch';
import { useGlobalState } from '../../context/GlobalStateContext';
import { useLatestPolicyHistory } from '../../hooks/useLatestPolicyHistory';
import { findKillSwitch, formatActor } from '../../utils/kill-switch';
import { ArgRow, defaultLaunchSettings, LaunchSettings, launchSettingsFrom } from '../../utils/launch-settings';
import { LaunchSettingsFields } from '../../components/launch/LaunchSettingsFields';
import { StrategyArgsEditor } from '../../components/launch/StrategyArgsEditor';
import { SimulationSettingsEditor } from '../../components/simulation/SimulationSettingsEditor';
import { SessionSimulation, simulationProblem } from '../../utils/simulation';

interface DeploySessionModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: (sessionId: string) => void;
  preselectedStrategyId?: number;
  initialSession?: StrategySession | null;
}

function DeploySessionModal({ opened, onClose, onCreated, preselectedStrategyId, initialSession }: DeploySessionModalProps) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [strategyId, setStrategyId] = useState<string | null>(
    preselectedStrategyId !== undefined ? String(preselectedStrategyId) : null
  );
  const [launch, setLaunch] = useState<LaunchSettings>(defaultLaunchSettings());
  const patchLaunch = useCallback((patch: Partial<LaunchSettings>) => setLaunch(l => ({ ...l, ...patch })), []);
  const { mode } = launch;
  const [inherit, setInherit] = useState(true);
  const [simulation, setSimulation] = useState<SessionSimulation>({});
  // A relaunch may reuse the parameters the original session read, so it simulates exactly as that one did.
  const [originalAsOf, setOriginalAsOf] = useState<string | null>(null);
  const [reuseAsOf, setReuseAsOf] = useState(false);
  const [listingIds, setListingIds] = useState<string[]>([]);
  const [listingLabels, setListingLabels] = useState<Record<string, string>>({});
  const [listingSearchValue, setListingSearchValue] = useState('');
  const { options: listingSearchOptions, isLoading: listingSearchLoading } = useListingSearch(listingSearchValue);
  const [args, setArgs] = useState<ArgRow[]>([]);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveConfirmText, setLiveConfirmText] = useState('');
  // One id per deploy attempt, reused on retry: if a launch timed out after the registry recorded it, the retry hits
  // the duplicate id instead of starting a second session.
  const sessionIdRef = useRef<string | null>(null);
  const [strategyKillSwitch, setStrategyKillSwitch] = useState<RiskPolicy | undefined>(undefined);
  const [resumeOnLaunch, setResumeOnLaunch] = useState(false);
  const [killCheckFailed, setKillCheckFailed] = useState(false);
  // Exchange code -> account label, for exchanges where the operator chose the account rather than the registry.
  const [accountPins, setAccountPins] = useState<Record<string, string>>({});
  const { exchanges } = useGlobalState();
  // What the chosen strategy's saved defaults hold that the form can't (see utils/round-trip).
  const [templateLost, setTemplateLost] = useState<LostField[]>([]);
  // A session saved in a format the form can't fully hold relaunches from its config as JSON instead.
  const relaunch = useJsonFallback<Record<string, ConfigValue>>(
    opened && initialSession ? initialSession.config : null,
    config => relaunchLostFields({ ...initialSession!, config }),
  );

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
    registryApi.listStrategies().then(setStrategies).catch(() => {});
  }, []);

  useEffect(() => {
    if (preselectedStrategyId !== undefined) {
      setStrategyId(String(preselectedStrategyId));
    }
  }, [preselectedStrategyId]);

  const loadStrategyDefaults = useCallback((strategy: Strategy) => {
    const p = strategy.parameters as Record<string, unknown> | undefined;
    setTemplateLost(p ? templateLostFields(p) : []);
    if (!p) return;
    setLaunch(l => ({ ...l, ...launchSettingsFrom(p) }));
    // The strategy's args, overrides and simulation go underneath what was already entered (see fillFromTemplate).
    const template = templateFormFrom(p);
    const none = { args: [], overrides: {}, simulation: {} };
    setArgs(a => fillFromTemplate({ ...none, args: a }, template).args);
    setOverrides(o => fillFromTemplate({ ...none, overrides: o }, template).overrides);
    setSimulation(sim => fillFromTemplate({ ...none, simulation: sim }, template).simulation);
    if (p.listings && Array.isArray(p.listings)) {
      setListingIds((p.listings as number[]).map(String));
    }
  }, []);

  const applySessionForm = useCallback((form: SessionForm) => {
    setStrategyId(form.strategyId);
    setInherit(form.inherit);
    setLaunch(form.launch);
    setArgs(form.args);
    setOverrides(form.overrides);
    setAccountPins(form.accountPins);
    setListingIds(form.listingIds);
    setSimulation(form.simulation);
    setOriginalAsOf(form.originalAsOf);
    setReuseAsOf(false);
  }, []);
  const loadFromSession = useCallback((session: StrategySession) => applySessionForm(sessionFormFrom(session)),
    [applySessionForm]);
  const relaunchBackToForm = (drop: boolean) => {
    const config = relaunch.backToForm(drop);
    if (config && initialSession) applySessionForm(sessionFormFrom({ ...initialSession, config }));
  };

  const handleStrategyChange = useCallback((value: string | null) => {
    setStrategyId(value);
    if (!value) {
      setArgs([]);
      return;
    }
    const strategy = strategies.find(s => String(s.strategyId) === value);
    if (strategy) loadStrategyDefaults(strategy);
    else setArgs([]);
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

  const resetForm = () => {
    sessionIdRef.current = null;
    setLiveConfirmText('');
    setStrategyId(preselectedStrategyId !== undefined ? String(preselectedStrategyId) : null);
    setLaunch(defaultLaunchSettings());
    setInherit(true);
    setSimulation({});
    setOriginalAsOf(null);
    setReuseAsOf(false);
    setListingIds([]);
    setListingLabels({});
    setListingSearchValue('');
    setArgs([]);
    setOverrides({});
    setError(null);
    setResumeOnLaunch(false);
    setAccountPins({});
    setTemplateLost([]);
  };

  const handleClose = () => { resetForm(); onClose(); };

  const selectedStrategyName = strategies.find(s => String(s.strategyId) === strategyId)?.name ?? strategyId ?? '';
  const isLive = mode === 'live';

  // The exchanges the chosen live listings trade on, each of which may have its account pinned.
  const liveListings = useQuery({
    queryKey: ['listingsByIds', listingIds],
    queryFn: () => registryApi.listListingsByIds(listingIds.map(Number)),
    enabled: opened && isLive && listingIds.length > 0,
    staleTime: 300_000,
  });
  const venueAccounts = useQuery({
    queryKey: keys.venueAccounts,
    queryFn: () => registryApi.listVenueAccounts(),
    enabled: opened && isLive,
  });
  const pinnableExchanges = useMemo(() => {
    const ids = new Set((liveListings.data ?? []).map(l => l.exchangeId));
    return exchanges.filter(e => ids.has(e.exchangeId));
  }, [liveListings.data, exchanges]);
  const pinsInPlay = useMemo(() => Object.fromEntries(Object.entries(accountPins)
    .filter(([code]) => pinnableExchanges.some(e => e.exchangeCode === code))), [accountPins, pinnableExchanges]);

  const handleSubmit = async () => {
    setError(null);
    if (!strategyId) { setError('Strategy is required'); return; }
    if (relaunch.asJson) {
      const config = relaunch.parse();
      if (config === null) return;
      if (config.mode === 'live' && liveConfirmText.trim() !== selectedStrategyName) {
        setError(`Type the strategy name "${selectedStrategyName}" to confirm a live deploy`);
        return;
      }
      // An older orchestrator or gnomepy may not read today's config, so a JSON relaunch takes the latest of each and
      // the instance type the registry picks for the latency profile.
      await launchSession(String(config.mode), config, {
        researchCommit: config.research_commit ? String(config.research_commit) : undefined,
        region: config.region ? String(config.region) : undefined,
      });
      return;
    }
    const { strategyType, strategyClass, researchCommit, region, availabilityZone, instanceType, orchestratorVersion, gnomepyVersion } = launch;
    if (!strategyType) { setError('Strategy type is required'); return; }
    if (!strategyClass.trim()) { setError('Strategy class is required'); return; }
    const classError = strategyClassError(strategyType, strategyClass.trim());
    if (classError) { setError(classError); return; }

    if (listingIds.length === 0) { setError('Listings are required'); return; }
    if (mode === 'paper') {
      const problem = simulationProblem(simulation);
      if (problem) { setError(problem); return; }
    }

    if (mode === 'live' && liveConfirmText.trim() !== selectedStrategyName) {
      setError(`Type the strategy name "${selectedStrategyName}" to confirm a live deploy`);
      return;
    }

    let config: Record<string, ConfigValue>;
    try {
      config = sessionConfigFrom(
        { strategyId, inherit, launch, args, overrides, accountPins: pinsInPlay, listingIds, simulation, originalAsOf },
        reuseAsOf ? originalAsOf : null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid session config');
      return;
    }
    const isPython = strategyType === 'python';
    await launchSession(mode, config, {
      researchCommit: isPython ? researchCommit.trim() || undefined : undefined,
      region: region.trim() || undefined,
      availabilityZone: availabilityZone.trim() || undefined,
      instanceType,
      orchestratorVersion: orchestratorVersion.trim() || undefined,
      gnomepyVersion: isPython ? gnomepyVersion.trim() || undefined : undefined,
    });
  };

  const launchSession = async (launchMode: string, config: Record<string, ConfigValue>, fields: {
    researchCommit?: string; region?: string; availabilityZone?: string; instanceType?: string;
    orchestratorVersion?: string; gnomepyVersion?: string;
  }) => {
    setSubmitting(true);
    const newSessionId = sessionIdRef.current ?? crypto.randomUUID();
    sessionIdRef.current = newSessionId;
    try {
      try {
        await registryApi.createSession({
          sessionId: newSessionId,
          strategyId: parseInt(strategyId!),
          mode: launchMode,
          config,
          ...fields,
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
        {!initialSession && (
          <StaleConfigAlert what="This strategy's default config" lost={templateLost}>
            <Text size="sm" mt="xs">
              Those fields weren't filled in here. Fix the defaults on the{' '}
              <Anchor component={Link} to={`/strategies/${strategyId}`} size="sm">strategy</Anchor>, or set them below.
            </Text>
          </StaleConfigAlert>
        )}
        {relaunch.asJson && initialSession ? (
          <>
            <StaleConfigAlert what="This session" lost={relaunch.remaining}
              onBackToForm={() => relaunchBackToForm(false)} onDropAndUseForm={() => relaunchBackToForm(true)}>
              <Text size="sm" mt="xs">
                Relaunching from this JSON takes the latest orchestrator and gnomepy
                {initialSession.orchestratorVersion ? ` (the original ran orchestrator ${initialSession.orchestratorVersion})` : ''}:
                an older version may not read today's config. Remove <Code>simulation.as_of</Code> to simulate with the
                parameters recorded now rather than when the original launched.
              </Text>
            </StaleConfigAlert>
            <JsonInput label="Session config" value={relaunch.json} onChange={relaunch.setJson} autosize minRows={12}
              formatOnBlur validationError="Invalid JSON" error={relaunch.error} />
          </>
        ) : (
          <>
            <Switch
              label="Inherit the position earlier sessions left"
              checked={inherit}
              onChange={e => setInherit(e.currentTarget.checked)}
              description={inherit
                ? 'Starts holding what earlier sessions of this strategy left on these listings, at their cost.'
                : mode === 'live'
                  ? 'Starts flat. Refused while the strategy still holds anything on these listings: flatten it, or adjust it to 0, first.'
                  : 'Starts flat; the discarded position is recorded as a reset, so it is never silently forgotten.'}
            />
            <LaunchSettingsFields
              value={launch}
              onChange={patch => { patchLaunch(patch); if (patch.mode !== undefined) setLiveConfirmText(''); }}
              listingCount={listingIds.length}
              required
            />

            <Divider />
            <StrategyArgsEditor rows={args} onChange={setArgs} title="Strategy Parameters" />

            <Divider />
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
              required
            />
            {mode === 'live' && (
              <>
                {pinnableExchanges.map(exchange => {
                  const active = (venueAccounts.data ?? []).filter(a => a.exchangeId === exchange.exchangeId && a.status === 'ACTIVE');
                  const pinned = accountPins[exchange.exchangeCode];
                  // A relaunch may carry a pin to an account that has since been drained; show it so it can be cleared.
                  const options = active.map(a => ({ value: a.label, label: a.label }));
                  if (pinned && !options.some(o => o.value === pinned)) options.push({ value: pinned, label: `${pinned} (not active)` });
                  return (
                    <Select
                      key={exchange.exchangeId}
                      label={`Account on ${exchange.exchangeName}`}
                      description="Leave empty to let the registry choose: the account the strategy already holds positions on, else the one with the most free capital"
                      placeholder={venueAccounts.isLoading ? 'Loading…' : active.length === 0 ? 'No active account' : 'Automatic'}
                      data={options}
                      value={pinned ?? null}
                      onChange={v => setAccountPins(p => {
                        const updated = { ...p };
                        if (v) updated[exchange.exchangeCode] = v;
                        else delete updated[exchange.exchangeCode];
                        return updated;
                      })}
                      error={pinned && !active.some(a => a.label === pinned) ? 'Only an ACTIVE account can be bound' : undefined}
                      clearable
                    />
                  );
                })}
              </>
            )}

            {mode === 'paper' && (
              <>
                <Divider />
                <SimulationSettingsEditor value={simulation} onChange={setSimulation} listingIds={listingIds.map(Number)} />
                {originalAsOf && (
                  <Switch
                    label="Simulate as the original session did"
                    description={`Reads the simulation parameters and fees recorded by ${new Date(originalAsOf).toLocaleString()}, when it launched, instead of the latest`}
                    checked={reuseAsOf}
                    onChange={e => setReuseAsOf(e.currentTarget.checked)}
                  />
                )}
              </>
            )}

            <OrchestratorOverridesEditor value={overrides} onChange={setOverrides} version={launch.orchestratorVersion} />
          </>
        )}

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
