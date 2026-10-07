import { useMemo, useState } from 'react';
import {
  Alert, Anchor, Badge, Button, Card, Container, Group, SegmentedControl, Stack, Tabs, Text, Tooltip,
} from '@mantine/core';
import { IconAB2, IconPlayerPlay, IconPlayerStop, IconRefresh } from '@tabler/icons-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isActiveSession, Mode, StrategySession, StrategySessionStatus } from '../../types';
import { errorMessage, findKillSwitch, isKilled, setKillSwitch } from '../../utils/kill-switch';
import { registryApi } from '../../utils/api';
import { SESSION_STATUS_COLORS } from '../../utils/session-status';
import {
  isLive, keys, POLL, useEventPositions, useFills, useOrders, usePnlSeries, useRiskPolicies, useSession, useSessionSummary,
  useStrategyName,
} from '../../query/hooks';
import { ReasonConfirmModal } from '../../components/ReasonConfirmModal';
import { LastUpdated } from '../../components/LastUpdated';
import { ContainerLogs } from '../../components/ContainerLogs';
import { SessionRiskPanel } from '../../components/risk/SessionRiskPanel';
import { LimitUsage } from '../../components/risk/LimitUsage';
import { Heartbeat } from '../../components/trading/Heartbeat';
import { Kpi, KpiStrip, ModeBadge, ModeBand } from '../../components/trading/layout';
import { PageHeader } from '../../components/PageHeader';
import { Money, Time } from '../../components/trading/values';
import { PnlChart } from '../../components/trading/PnlChart';
import { PositionsTable } from '../../components/trading/PositionsTable';
import { EventPositions } from '../../components/trading/EventPositions';
import { FillsTable, OrdersTable } from '../../components/trading/LedgerTables';
import { StopSessionModal } from './StopSessionModal';
import DeploySessionModal from './DeploySessionModal';
import { SessionDetailsPanel } from './SessionDetailsPanel';

const RANGES: Record<string, number | null> = { 'Since start': null, '1h': 3_600_000, '6h': 21_600_000, '24h': 86_400_000 };
const TABS = ['positions', 'open', 'fills', 'orders', 'risk', 'logs', 'details'] as const;
type Tab = typeof TABS[number];

// A window ending now, or when an ended session stopped.
function rangeStart(range: string, session: StrategySession | null | undefined): string | undefined {
  const span = RANGES[range];
  if (span === null || !session) return undefined;
  const end = !isActiveSession(session.status) && session.stoppedAt ? Date.parse(session.stoppedAt) : Date.now();
  return new Date(end - span).toISOString();
}

function SessionDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { sessionId = '' } = useParams<{ sessionId: string }>();
  const [params, setParams] = useSearchParams();

  const sessionQuery = useSession(sessionId);
  const session = sessionQuery.data;
  const live = isLive(session);
  const summary = useSessionSummary(sessionId, live);
  const policiesQuery = useRiskPolicies();
  const strategyName = useStrategyName(session?.strategyId);
  const [range, setRange] = useState('Since start');
  const [start, setStart] = useState<string | undefined>(undefined);
  const series = usePnlSeries(session ? { sessionId } : null, start, live);
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? params.get('tab') as Tab : 'positions';
  const scope = { sessionId };
  const positionsView = params.get('view') === 'events' ? 'events' : 'listings';
  const eventPositions = useEventPositions({ sessionId }, tab === 'positions' && positionsView === 'events', live);
  const openOrders = useOrders(scope, { live, enabled: tab === 'open' }, 'OPEN');
  const fills = useFills(scope, { live, enabled: tab === 'fills' });
  const orders = useOrders(scope, { live, enabled: tab === 'orders' }, 'ANY');
  const logs = useQuery({
    queryKey: ['sessionLogs', sessionId],
    queryFn: () => registryApi.getSessionLogs(sessionId),
    enabled: tab === 'logs' && !!session?.instanceId,
    refetchInterval: live ? POLL.status : false,
  });

  const [stopOpen, setStopOpen] = useState(false);
  const [relaunchOpen, setRelaunchOpen] = useState(false);
  const [killAction, setKillAction] = useState<'kill' | 'resume' | null>(null);

  const policies = useMemo(() => policiesQuery.data ?? [], [policiesQuery.data]);
  const policiesLoaded = !!policiesQuery.data;
  // A stopping session can still have its stop retried, but resuming or re-killing it would fight the stop.
  const canKill = live && session?.status !== StrategySessionStatus.STOPPING;
  const sessionKillSwitch = findKillSwitch(policies, { sessionId });
  const known = policiesLoaded ? policies : null;
  const sessionKilled = isKilled(known, { sessionId });
  const strategyKilled = session ? isKilled(known, { strategyId: session.strategyId }) : false;

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: keys.session(sessionId) });
    queryClient.invalidateQueries({ queryKey: keys.policies });
    queryClient.invalidateQueries({ queryKey: keys.sessionSummary(sessionId) });
    queryClient.invalidateQueries({ queryKey: ['pnlSeries'] });
    queryClient.invalidateQueries({ queryKey: ['ledgerFills'] });
    queryClient.invalidateQueries({ queryKey: ['ledgerOrders'] });
  };
  const setTab = (next: string | null) => setParams(current => {
    const updated = new URLSearchParams(current);
    updated.set('tab', next ?? 'positions');
    return updated;
  }, { replace: true });
  const chooseRange = (next: string) => {
    setRange(next);
    setStart(rangeStart(next, session));
  };
  const confirmKillAction = async (reason: string | undefined) => {
    await setKillSwitch(sessionKillSwitch, { sessionId }, killAction === 'kill', reason);
    refreshAll();
  };

  const totals = summary.data?.totals;
  const counts = summary.data?.counts;
  const loadError = sessionQuery.error ?? summary.error ?? policiesQuery.error;
  const relaunchable = session && !isActiveSession(session.status);
  const reviewCount = summary.data?.listings.filter(l => l.needsReview).length ?? 0;

  return (
    <Container size="xl" py="xl">
      <PageHeader
        onBack={() => navigate('/sessions')}
        title={<Text span ff="monospace" fw={700} size="xl">{sessionId}</Text>}
        badges={session && (
          <>
            <Badge color={SESSION_STATUS_COLORS[session.status] ?? 'gray'} variant="light">{session.status}</Badge>
            <ModeBadge mode={session.mode} />
            {live && (
              <LastUpdated
                at={summary.dataUpdatedAt ? new Date(summary.dataUpdatedAt) : null}
                intervalMs={POLL.summary}
                failing={!!loadError}
                compact
              />
            )}
          </>
        )}
        actions={
          <>
            {canKill && sessionKilled === null && <Button variant="default" disabled>Kill status unknown</Button>}
            {canKill && sessionKilled !== null && (
              <Button
                color={sessionKilled ? 'green' : 'red'}
                variant="light"
                leftSection={sessionKilled ? <IconPlayerPlay size={16} /> : <IconPlayerStop size={16} />}
                onClick={() => setKillAction(sessionKilled ? 'resume' : 'kill')}
              >
                {sessionKilled ? 'Resume session' : 'Kill session'}
              </Button>
            )}
            {live && (
              <Button color="red" leftSection={<IconPlayerStop size={16} />} onClick={() => setStopOpen(true)}>Stop</Button>
            )}
            {relaunchable && (
              <Button leftSection={<IconAB2 size={16} />} onClick={() => setRelaunchOpen(true)}>Relaunch</Button>
            )}
          </>
        }
        menu={[{ label: 'Refresh', icon: <IconRefresh size={16} />, onClick: refreshAll }]}
        meta={session ? [
          <Anchor component={Link} to={`/strategies/${session.strategyId}?mode=${session.mode}`} size="sm">
            {strategyName ?? `Strategy ${session.strategyId}`}
          </Anchor>,
          <>started <Time value={session.startedAt} size="sm" /></>,
          session.stoppedAt && <>stopped <Time value={session.stoppedAt} size="sm" /></>,
          live && <Heartbeat session={session} />,
          summary.data?.opening === 'INHERITED' && (
            <Tooltip label="Started holding what earlier sessions of the strategy left" withArrow>
              <span>inherited position</span>
            </Tooltip>
          ),
          summary.data?.opening === 'FLAT' && (
            <Tooltip label="Chose not to inherit (recovery.inherit=false): the discarded position is recorded as a reset" withArrow multiline w={260}>
              <span>started flat</span>
            </Tooltip>
          ),
        ] : []}
      />
      {session && <ModeBand mode={session.mode} />}

      {loadError && (
        <Alert color="red" title="Error" mb="md">
          {errorMessage(loadError, 'Failed to load session')}
          {policiesLoaded ? ' — showing the last state that loaded.' : " — this session's kill switch status is unknown."}
        </Alert>
      )}
      {canKill && (sessionKilled || strategyKilled) && (
        <Alert color="red" title={sessionKilled ? 'Session killed' : 'Strategy killed'} mb="md">
          {sessionKilled
            ? 'This session cannot send orders and its open orders have been cancelled. Other sessions of the strategy are unaffected.'
            : 'The strategy is killed, so every session of it, including this one, is blocked from sending orders.'}
        </Alert>
      )}
      {session?.failureReason && (
        <Alert color="red" title="Failure reason" mb="md">
          <Text size="sm" ff="monospace">{session.failureReason}</Text>
        </Alert>
      )}
      {reviewCount > 0 && (
        <Alert color="orange" mb="md">
          {reviewCount} position{reviewCount > 1 ? 's' : ''} need{reviewCount > 1 ? '' : 's'} review: ledger events were lost.
          {' '}Adjust {reviewCount > 1 ? 'them' : 'it'} from the strategy's positions once the session has stopped.
        </Alert>
      )}

      {session && (
        <>
          <KpiStrip>
            <Kpi
              label="Session PnL"
              hint="What changed while this session ran. Inventory it inherited counts from its value when the session started. Carry is what that inventory made as if held untouched; trading is everything else."
              value={<Money value={totals?.total} arrow />}
              footer={totals && totals.openingUnrealized !== '0' && (
                <>carry <Money value={totals.carry} size="xs" /> · trading <Money value={totals.trading} size="xs" /></>
              )}
            />
            <Kpi label="Realized" value={<Money value={totals?.realized} />} />
            <Kpi label="Unrealized" value={<Money value={totals?.unrealized} />} />
            <Kpi label="Fees" value={<Money value={totals?.fees} pnl={false} />} />
            <Kpi label="Fills" value={counts?.fills ?? '—'} footer={counts && `${counts.orders} orders`} />
            <Kpi
              label="Open orders"
              value={counts?.openOrders ?? '—'}
              footer={counts && counts.refused > 0 && (
                <Tooltip
                  withArrow multiline w={260}
                  label={<Stack gap={0}>{summary.data?.refusals.map(r => (
                    <Text key={`${r.listingId}/${r.reason}`} size="xs">{r.reason.toLowerCase().replace(/_/g, ' ')} (listing {r.listingId}): {r.count}</Text>
                  ))}</Stack>}
                >
                  <Text span size="xs" c="orange">{counts.refused} refused by the OMS</Text>
                </Tooltip>
              )}
            />
          </KpiStrip>

          <Card withBorder mb="md">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>Session PnL</Text>
              <SegmentedControl size="xs" value={range} onChange={chooseRange} data={Object.keys(RANGES)} />
            </Group>
            <PnlChart series={series.data} loading={series.isLoading} views={['total', 'listings', 'position', 'fees']} />
          </Card>

          <Tabs value={tab} onChange={setTab} keepMounted={false}>
            <Tabs.List mb="sm">
              <Tabs.Tab value="positions">Positions</Tabs.Tab>
              <Tabs.Tab value="open">Open orders{counts ? ` (${counts.openOrders})` : ''}</Tabs.Tab>
              <Tabs.Tab value="fills">Fills</Tabs.Tab>
              <Tabs.Tab value="orders">Orders</Tabs.Tab>
              <Tabs.Tab value="risk">Risk</Tabs.Tab>
              {session.instanceId && <Tabs.Tab value="logs">Logs</Tabs.Tab>}
              <Tabs.Tab value="details">Config & compute</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="positions">
              <Group justify="flex-end" mb="xs">
                <SegmentedControl
                  size="xs"
                  value={positionsView}
                  onChange={v => setParams(current => {
                    const updated = new URLSearchParams(current);
                    if (v === 'events') updated.set('view', 'events');
                    else updated.delete('view');
                    return updated;
                  }, { replace: true })}
                  data={[{ value: 'listings', label: 'By listing' }, { value: 'events', label: 'By event' }]}
                />
              </Group>
              {positionsView === 'events' ? (
                <EventPositions
                  data={eventPositions.data}
                  strategyId={session.strategyId}
                  mode={session.mode as Mode}
                  loading={eventPositions.isLoading}
                  basis="session"
                />
              ) : (
                <PositionsTable
                  rows={summary.data?.listings ?? []}
                  loading={summary.isLoading}
                  rowHref={row => `/strategies/${session.strategyId}/listings/${row.listingId}?mode=${session.mode}`}
                />
              )}
            </Tabs.Panel>
            <Tabs.Panel value="open">
              <OrdersTable
                rows={openOrders.data ?? []} loading={openOrders.isLoading} showSession={false}
                hasMore={!!openOrders.hasNextPage} loadingMore={openOrders.isFetchingNextPage} onLoadMore={() => openOrders.fetchNextPage()}
              />
            </Tabs.Panel>
            <Tabs.Panel value="fills">
              <FillsTable
                rows={fills.data ?? []} loading={fills.isLoading} showSession={false}
                hasMore={!!fills.hasNextPage} loadingMore={fills.isFetchingNextPage} onLoadMore={() => fills.fetchNextPage()}
              />
            </Tabs.Panel>
            <Tabs.Panel value="orders">
              <OrdersTable
                rows={orders.data ?? []} loading={orders.isLoading} showSession={false}
                hasMore={!!orders.hasNextPage} loadingMore={orders.isFetchingNextPage} onLoadMore={() => orders.fetchNextPage()}
              />
            </Tabs.Panel>
            <Tabs.Panel value="risk">
              <LimitUsage sessionId={sessionId} live={live} />
              <SessionRiskPanel
                session={session}
                strategyName={strategyName}
                policies={policies}
                policiesLoaded={policiesLoaded}
                canKill={canKill}
                onChanged={refreshAll}
              />
            </Tabs.Panel>
            <Tabs.Panel value="logs">
              <ContainerLogs
                logs={(logs.data?.logs ?? []).map(l => ({ id: l.instanceId, label: l.instanceId, logs: l.logs, consoleUrl: l.consoleUrl }))}
                loading={logs.isFetching}
                initialLoad={logs.isLoading}
                onRefresh={() => logs.refetch()}
              />
            </Tabs.Panel>
            <Tabs.Panel value="details">
              <SessionDetailsPanel session={session} />
            </Tabs.Panel>
          </Tabs>
        </>
      )}

      <DeploySessionModal
        opened={relaunchOpen}
        onClose={() => setRelaunchOpen(false)}
        onCreated={(newSessionId) => { setRelaunchOpen(false); navigate(`/sessions/${newSessionId}`); }}
        initialSession={relaunchOpen ? session ?? null : null}
        preselectedStrategyId={session?.strategyId}
      />
      <StopSessionModal session={stopOpen ? session ?? null : null} onClose={() => setStopOpen(false)} onStopped={refreshAll} />
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
