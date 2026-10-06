import { useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import {
  Accordion,
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  Container,
  Group,
  SegmentedControl,
  SimpleGrid,
  Space,
  Stack,
  Switch,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconAB2, IconArrowLeft, IconPencil, IconPlayerPlay, IconPlayerStop, IconPlus, IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { PnlSnapshot, RiskPolicy, StrategySession, StrategySessionStatus, ConfigValue, isActiveSession } from '../../types';
import { errorMessage, findKillSwitch, isKilled, KILL_SWITCH_TYPE, listingKills, setKillSwitch } from '../../utils/kill-switch';
import {
  configuredListings,
  describeTarget,
  isUnrelatedListingPolicy,
  policiesForSession,
  policyLevel,
} from '../../utils/policy-target';
import { formatRiskParameters } from '../../utils/risk-parameters';
import { useListingLabels } from '../../hooks/useAsyncSearch';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { KillOnListingModal } from '../../components/KillOnListingModal';
import { AddRiskPolicyModal } from '../../components/AddRiskPolicyModal';
import { EditRiskPolicyModal } from '../../components/EditRiskPolicyModal';
import { ListingKillList } from '../../components/ListingKillList';
import { ReasonConfirmModal } from '../../components/ReasonConfirmModal';
import { registryApi } from '../../utils/api';
import { StopSessionModal } from './StopSessionModal';
import { ContainerLogs, LogStream } from '../../components/ContainerLogs';
import { PnlSnapshotTable } from '../../components/PnlSnapshotTable';
import { SessionPnlCharts } from '../../components/SessionPnlCharts';
import DeploySessionModal from './DeploySessionModal';
import { SESSION_STATUS_COLORS } from '../../utils/session-status';
import { LastUpdated } from '../../components/LastUpdated';

const POLL_INTERVAL_MS = 5000;

const MODE_COLORS: Record<string, string> = {
  paper: 'violet',
  live: 'red',
};

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card withBorder p="sm" radius="md">
      <Text size="xs" c="dimmed" mb={4}>{label}</Text>
      <Text fw={600} size="lg">{value ?? '—'}</Text>
    </Card>
  );
}

function groupConfig(config: Record<string, ConfigValue>) {
  const params = Object.entries(config).filter(([k]) => k.startsWith('strategy.args.'));
  const strategy = Object.entries(config).filter(([k]) => k.startsWith('strategy.') && !k.startsWith('strategy.args.'));
  const simulation = Object.entries(config).filter(([k]) => k.startsWith('simulation.'));
  const paramKeys = new Set([...params, ...strategy, ...simulation].map(([k]) => k));
  const core = Object.entries(config).filter(([k]) => !paramKeys.has(k));

  return { core, strategy, params, simulation };
}

function renderConfigValue(v: ConfigValue): ReactNode {
  if (typeof v === 'object' && v !== null) {
    return <Code style={{ fontSize: '0.72rem' }}>{JSON.stringify(v)}</Code>;
  }
  if (typeof v === 'boolean') return String(v);
  return String(v);
}

function ConfigTable({ entries }: { entries: [string, ConfigValue][] }) {
  if (entries.length === 0) return <Text size="sm" c="dimmed">None</Text>;
  return (
    <Table striped withColumnBorders fz="xs">
      <Table.Tbody>
        {entries.map(([k, v]) => (
          <Table.Tr key={k}>
            <Table.Td style={{ fontFamily: 'monospace', width: '45%' }}>{k}</Table.Td>
            <Table.Td style={{ fontFamily: 'monospace' }}>{renderConfigValue(v)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

const isTerminal = (s: StrategySession | null) =>
  s?.status === StrategySessionStatus.STOPPED || s?.status === StrategySessionStatus.FAILED;

function SessionDetail() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<StrategySession | null>(null);
  const [strategyName, setStrategyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [stopOpen, setStopOpen] = useState(false);
  const [policies, setPolicies] = useState<RiskPolicy[]>([]);
  const [policiesLoaded, setPoliciesLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [killAction, setKillAction] = useState<'kill' | 'resume' | null>(null);
  const [killOnListingOpen, setKillOnListingOpen] = useState(false);
  const [addPolicyOpen, setAddPolicyOpen] = useState(false);
  const [editPolicyTarget, setEditPolicyTarget] = useState<RiskPolicy | null>(null);
  const [showAllListingPolicies, setShowAllListingPolicies] = useState(false);
  const [relaunchOpen, setRelaunchOpen] = useState(false);
  const relaunchSessionRef = useRef<StrategySession | null>(null);
  const [pnlRows, setPnlRows] = useState<PnlSnapshot[]>([]);
  const [sessionLogs, setSessionLogs] = useState<LogStream[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [initialLogsLoad, setInitialLogsLoad] = useState(true);
  const [historySnapshots, setHistorySnapshots] = useState<PnlSnapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [chartRange, setChartRange] = useState('24h');

  const beginRefresh = useLatestRequest();
  const beginLogs = useLatestRequest();
  const beginHistory = useLatestRequest();

  const refresh = useCallback(async (showLoading = true) => {
    if (!sessionId) return;
    const isCurrent = beginRefresh();
    if (showLoading) setLoading(true);
    try {
      const [sessions, pnl, allPolicies] = await Promise.all([
        registryApi.listSessions({ sessionId }),
        registryApi.listPnlLatest(undefined, undefined, sessionId),
        registryApi.listRiskPolicies(),
      ]);
      if (!isCurrent()) return;
      const s = sessions[0] ?? null;
      setSession(s);
      setPnlRows(pnl);
      setPolicies(allPolicies);
      setPoliciesLoaded(true);
      setLoadError(null);
      setLastUpdated(new Date());
      if (s) {
        registryApi.listStrategies().then(list => {
          const match = list.find((st: { strategyId: number; name: string }) => st.strategyId === s.strategyId);
          if (match && isCurrent()) setStrategyName(match.name);
        }).catch(() => {});
      }
    } catch (e) {
      if (!isCurrent()) return;
      setLoadError(errorMessage(e, 'Failed to load session'));
    } finally {
      // Not gated on showLoading: a superseded load skips this, so the newest must clear a spinner it didn't start.
      if (isCurrent()) {
        setLoading(false);
        setInitialLoad(false);
      }
    }
  }, [sessionId, beginRefresh]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (isTerminal(session)) return;
    const interval = setInterval(() => refresh(false), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh, session?.status]);

  const loadLogs = useCallback(async (showLoading = true) => {
    if (!sessionId || !session?.instanceId) return;
    const isCurrent = beginLogs();
    try {
      if (showLoading) setLogsLoading(true);
      const response = await registryApi.getSessionLogs(sessionId);
      if (!isCurrent()) return;
      setSessionLogs(response.logs.map(l => ({ id: l.instanceId, label: l.instanceId, logs: l.logs, consoleUrl: l.consoleUrl })));
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      if (isCurrent()) {
        setLogsLoading(false);
        setInitialLogsLoad(false);
      }
    }
  }, [sessionId, session?.instanceId, beginLogs]);

  useEffect(() => {
    if (!session?.instanceId) return;
    loadLogs();
    if (isTerminal(session)) return;
    const interval = setInterval(() => loadLogs(false), 5000);
    return () => clearInterval(interval);
  }, [session?.instanceId, loadLogs, session?.status]);

  const loadHistory = useCallback(async () => {
    if (!sessionId) return;
    const isTerminalSession = session?.status === StrategySessionStatus.STOPPED || session?.status === StrategySessionStatus.FAILED;
    const anchor = isTerminalSession && session?.stoppedAt
      ? new Date(session.stoppedAt).getTime()
      : Date.now();
    const durations: Record<string, number> = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000 };
    const duration = durations[chartRange];
    const startTime = duration ? new Date(anchor - duration).toISOString() : undefined;
    const isCurrent = beginHistory();
    setHistoryLoading(true);
    try {
      const result = await registryApi.listPnlSnapshots(sessionId, startTime);
      if (!isCurrent()) return;
      setHistorySnapshots(result);
    } catch (err) {
      console.error('Failed to load PnL history:', err);
    } finally {
      if (isCurrent()) setHistoryLoading(false);
    }
  }, [sessionId, session?.status, session?.stoppedAt, chartRange, beginHistory]);

  useEffect(() => {
    if (!session) return;
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (isTerminal(session)) return;
    const interval = setInterval(loadHistory, 30000);
    return () => clearInterval(interval);
  }, [loadHistory, session?.status]);

  const isStoppable = session ? isActiveSession(session.status) : false;
  // Only this session: other sessions of the strategy keep trading.
  const sessionKillSwitch = sessionId ? findKillSwitch(policies, { sessionId }) : undefined;
  const knownPolicies = policiesLoaded ? policies : null;
  const sessionKilled = sessionId ? isKilled(knownPolicies, { sessionId }) : false;
  const strategyKilled = session ? isKilled(knownPolicies, { strategyId: session.strategyId }) : false;

  const applicablePolicies = session && sessionId ? policiesForSession(policies, sessionId, session.strategyId) : [];
  const tradedListings = configuredListings(session ? [session] : []);
  const hiddenListingPolicies = applicablePolicies.filter((p) => isUnrelatedListingPolicy(p, tradedListings)).length;
  const sessionPolicies = showAllListingPolicies
    ? applicablePolicies
    : applicablePolicies.filter((p) => !isUnrelatedListingPolicy(p, tradedListings));
  const listingLabels = useListingLabels(
    sessionPolicies.flatMap((p) => (p.listingId != null ? [p.listingId] : [])),
  );
  const describePolicy = (p: RiskPolicy) =>
    describeTarget(p, () => strategyName ?? undefined, (listingId) => listingLabels[listingId]);

  const confirmKillAction = async (reason: string | undefined) => {
    if (!sessionId) return;
    await setKillSwitch(sessionKillSwitch, { sessionId }, killAction === 'kill', reason);
    refresh(false);
  };
  const isRelaunchable = session?.status === StrategySessionStatus.STOPPED || session?.status === StrategySessionStatus.FAILED;

  const grouped = session ? groupConfig(session.config) : null;

  return (
    <Container size="xl" py="xl">
      <Group mb="md">
        <ActionIcon variant="subtle" onClick={() => navigate('/sessions')}>
          <IconArrowLeft size={18} />
        </ActionIcon>
        <Text fw={600} size="lg" style={{ fontFamily: 'monospace', flex: 1 }}>
          {sessionId}
        </Text>
        {session && (
          <Badge color={SESSION_STATUS_COLORS[session.status] ?? 'gray'} variant="light" size="lg">
            {session.status}
          </Badge>
        )}
        {!isTerminal(session) && (
          <LastUpdated at={lastUpdated} intervalMs={POLL_INTERVAL_MS} failing={loadError !== null} />
        )}
        <Tooltip label="Refresh" withArrow openDelay={500}>
          <ActionIcon size="lg" variant="filled" color="green" onClick={() => refresh()} loading={loading}>
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
        {isRelaunchable && (
          <Tooltip label="Relaunch Session" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={() => { relaunchSessionRef.current = session; setRelaunchOpen(true); }}>
              <IconAB2 size={20} />
            </ActionIcon>
          </Tooltip>
        )}
        {isStoppable && sessionKilled === null && (
          <Button variant="default" disabled>Kill status unknown</Button>
        )}
        {isStoppable && sessionKilled !== null && (
          <Button
            color={sessionKilled ? 'green' : 'red'}
            variant="light"
            leftSection={sessionKilled ? <IconPlayerPlay size={16} /> : <IconPlayerStop size={16} />}
            onClick={() => setKillAction(sessionKilled ? 'resume' : 'kill')}
          >
            {sessionKilled ? 'Resume session' : 'Kill session'}
          </Button>
        )}
        {isStoppable && (
          <Tooltip label="Stop Session" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="red" onClick={() => setStopOpen(true)}>
              <IconPlayerStop size={20} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      {loadError && (
        <Alert color="red" title="Error" mb="md">
          {loadError}
          {policiesLoaded ? ' — showing the last state that loaded.' : " — this session's kill switch status is unknown."}
        </Alert>
      )}

      {isStoppable && (sessionKilled || strategyKilled) && (
        <Alert color="red" title={sessionKilled ? 'Session killed' : 'Strategy killed'} mb="md">
          {sessionKilled
            ? 'This session cannot send orders and its open orders have been cancelled. Other sessions of the strategy are unaffected.'
            : 'The strategy is killed, so every session of it, including this one, is blocked from sending orders.'}
        </Alert>
      )}

      {session && (
        <>
          <SimpleGrid cols={{ base: 2, sm: 3 }} mb="md">
            <StatCard label="Strategy" value={
              strategyName
                ? <Anchor component={Link} to={`/strategies/${session.strategyId}`} fw={600} size="lg">{strategyName}</Anchor>
                : String(session.strategyId)
            } />
            <StatCard label="Mode" value={
              <Badge color={MODE_COLORS[session.mode] ?? 'gray'} variant="light" size="lg">{session.mode}</Badge>
            } />
            <StatCard label="Status" value={
              <Badge color={SESSION_STATUS_COLORS[session.status] ?? 'gray'} variant="light" size="lg">{session.status}</Badge>
            } />
            <StatCard label="Started" value={
              session.startedAt
                ? <ReactTimeAgo date={new Date(session.startedAt)} timeStyle="round" />
                : 'Not started'
            } />
            <StatCard label="Stopped" value={
              session.stoppedAt
                ? <ReactTimeAgo date={new Date(session.stoppedAt)} timeStyle="round" />
                : 'Active'
            } />
            <StatCard label="Research Commit" value={
              session.researchCommit
                ? <Code style={{ fontSize: '0.8rem' }}>{session.researchCommit}</Code>
                : '—'
            } />
          </SimpleGrid>

          <Card withBorder mb="md">
            <Group justify="space-between" mb="md">
              <Title order={4}>PnL History</Title>
              <SegmentedControl
                size="xs"
                value={chartRange}
                onChange={setChartRange}
                data={['1h', '6h', '24h', '7d', 'All']}
              />
            </Group>
            <SessionPnlCharts snapshots={historySnapshots} loading={historyLoading} />
          </Card>

          <PnlSnapshotTable title="PnL Snapshot (latest per listing)" data={pnlRows} isLoading={initialLoad} />

          <Space h="xl" />

          <Group justify="space-between" mb="xs">
            <Title order={4}>Risk Policies</Title>
            <Group gap="xs">
              <Switch
                size="xs"
                label={`Show all listing policies${hiddenListingPolicies ? ` (${hiddenListingPolicies} hidden)` : ''}`}
                checked={showAllListingPolicies}
                onChange={(e) => setShowAllListingPolicies(e.currentTarget.checked)}
              />
              {isStoppable && (
                <Group gap="xs">
                  <Button size="xs" variant="light" color="red" disabled={!policiesLoaded} onClick={() => setKillOnListingOpen(true)}>
                    Kill on listing
                  </Button>
                  <Tooltip label="Add a policy for this session" withArrow openDelay={500}>
                    <ActionIcon size="lg" variant="filled" color="blue" onClick={() => setAddPolicyOpen(true)}>
                      <IconPlus size={20} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              )}
            </Group>
          </Group>
          <Card withBorder p="sm" mb="md">
            <ListingKillList
              kills={listingKills(sessionPolicies)}
              describe={describePolicy}
              level={policyLevel}
              onResumed={() => refresh(false)}
            />
            {sessionPolicies.length === 0 ? (
              <Text size="sm" c="dimmed">No risk policies apply to this session.</Text>
            ) : (
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Level</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Applies to</Table.Th>
                    <Table.Th>Limits</Table.Th>
                    <Table.Th>Enabled</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {sessionPolicies.map((p) => {
                    const level = policyLevel(p);
                    return (
                      <Table.Tr key={p.policyId}>
                        <Table.Td><Badge color={level.color} variant="outline">{level.label}</Badge></Table.Td>
                        <Table.Td>{p.policyType}</Table.Td>
                        <Table.Td>{describePolicy(p)}</Table.Td>
                        <Table.Td>{formatRiskParameters(p.parameters)}</Table.Td>
                        <Table.Td>
                          <Badge color={p.enabled ? 'green' : 'gray'} variant="light">{p.enabled ? 'On' : 'Off'}</Badge>
                        </Table.Td>
                        <Table.Td>
                          {/* Only this session's own policies; strategy-wide and global ones are edited where they apply. */}
                          {p.sessionId === sessionId && p.policyType !== KILL_SWITCH_TYPE && (
                            <Tooltip label="Edit limits" withArrow openDelay={500}>
                              <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setEditPolicyTarget(p)}>
                                <IconPencil size={14} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            )}
          </Card>

          {session.failureReason && (
            <Alert color="red" title="Failure Reason" mb="md">
              <Text size="sm" style={{ fontFamily: 'monospace' }}>{session.failureReason}</Text>
            </Alert>
          )}

          <Title order={4} mb="xs">Session Config</Title>
          <Accordion variant="contained" mb="md">
            {grouped && [
              { key: 'core', label: 'Core', entries: grouped.core },
              { key: 'strategy', label: 'Strategy', entries: grouped.strategy },
              { key: 'params', label: 'Parameters', entries: grouped.params },
              { key: 'simulation', label: 'Simulation', entries: grouped.simulation },
            ].filter(s => s.entries.length > 0).map(section => (
              <Accordion.Item key={section.key} value={section.key}>
                <Accordion.Control>
                  <Group gap="xs">
                    <Text size="sm" fw={600}>{section.label}</Text>
                    <Badge size="xs" variant="outline" color="gray">{section.entries.length}</Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <ConfigTable entries={section.entries} />
                </Accordion.Panel>
              </Accordion.Item>
            ))}
            <Accordion.Item value="raw">
              <Accordion.Control><Text size="sm" fw={600}>Raw JSON</Text></Accordion.Control>
              <Accordion.Panel>
                <Code block style={{ fontSize: '0.72rem' }}>
                  {JSON.stringify(session.config, null, 2)}
                </Code>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>

          {session.instanceId && (
            <>
              <Title order={4} mb="xs">Compute</Title>
              <Card withBorder p="sm" mb="md">
                <Stack gap="xs">
                  <Group gap="xs">
                    <Text size="xs" c="dimmed" w={140}>Instance</Text>
                    <Anchor
                      size="xs"
                      href={`https://${session.launchRegion}.console.aws.amazon.com/ec2/home?region=${session.launchRegion}#InstanceDetails:instanceId=${session.instanceId}`}
                      target="_blank"
                    >
                      <Code style={{ fontSize: '0.72rem' }}>{session.instanceId}</Code>
                    </Anchor>
                  </Group>
                  <Group gap="xs">
                    <Text size="xs" c="dimmed" w={140}>Type</Text>
                    <Code style={{ fontSize: '0.72rem' }}>{session.instanceType ?? '—'}</Code>
                  </Group>
                  <Group gap="xs">
                    <Text size="xs" c="dimmed" w={140}>Region / AZ</Text>
                    <Code style={{ fontSize: '0.72rem' }}>{session.launchRegion ?? '—'} / {session.availabilityZone ?? '—'}</Code>
                  </Group>
                  <Group gap="xs">
                    <Text size="xs" c="dimmed" w={140}>Orchestrator</Text>
                    <Code style={{ fontSize: '0.72rem' }}>{session.orchestratorVersion ?? '—'}</Code>
                  </Group>
                  <Group gap="xs">
                    <Text size="xs" c="dimmed" w={140}>Gnomepy</Text>
                    <Code style={{ fontSize: '0.72rem' }}>{session.gnomepyVersion ?? '—'}</Code>
                  </Group>
                </Stack>
              </Card>
            </>
          )}

          {session.instanceId && (
            <ContainerLogs
              logs={sessionLogs}
              loading={logsLoading}
              initialLoad={initialLogsLoad}
              onRefresh={loadLogs}
            />
          )}
        </>
      )}

      <DeploySessionModal
        opened={relaunchOpen}
        onClose={() => setRelaunchOpen(false)}
        onCreated={(newSessionId) => { setRelaunchOpen(false); navigate(`/sessions/${newSessionId}`); }}
        initialSession={relaunchOpen ? relaunchSessionRef.current : null}
        preselectedStrategyId={session?.strategyId}
      />

      <StopSessionModal session={stopOpen ? session : null} onClose={() => setStopOpen(false)} onStopped={() => refresh()} />

      <EditRiskPolicyModal
        policy={editPolicyTarget}
        targetDescription={editPolicyTarget ? describePolicy(editPolicyTarget) : undefined}
        onClose={() => setEditPolicyTarget(null)}
        onSaved={() => refresh(false)}
      />

      {sessionId && (
        <AddRiskPolicyModal
          opened={addPolicyOpen}
          onClose={() => setAddPolicyOpen(false)}
          target={{ sessionId }}
          targetLabel="this session"
          onCreated={() => refresh(false)}
        />
      )}

      {sessionId && (
        <KillOnListingModal
          opened={killOnListingOpen}
          onClose={() => setKillOnListingOpen(false)}
          target={{ sessionId }}
          targetLabel={`session ${sessionId}`}
          policies={policies}
          onKilled={() => refresh(false)}
        />
      )}

      <ReasonConfirmModal
        opened={killAction === 'kill'}
        onClose={() => setKillAction(null)}
        title="Kill Session"
        message={`This will immediately cancel all open orders for session ${sessionId} and block it from sending orders, without stopping its instance. Other sessions of the strategy keep trading. Are you sure?`}
        confirmLabel="Kill session"
        onConfirm={confirmKillAction}
      />

      <ReasonConfirmModal
        opened={killAction === 'resume'}
        onClose={() => setKillAction(null)}
        title="Resume Session"
        message={`This will turn off the kill switch for session ${sessionId} and allow it to send orders again. Are you sure?`}
        confirmLabel="Resume session"
        confirmColor="green"
        onConfirm={confirmKillAction}
      />
    </Container>
  );
}

export default SessionDetail;
