import { useMemo, useState } from 'react';
import {
  ActionIcon, Alert, Anchor, Badge, Button, Card, Container, Group, SegmentedControl, Stack, Tabs, Text, Tooltip,
} from '@mantine/core';
import {
  IconAB2, IconAlertTriangle, IconEdit, IconHistory, IconPlayerPlay, IconPlayerStop, IconPlus, IconRefresh,
} from '@tabler/icons-react';
import { MantineReactTable, MRT_ColumnDef, MRT_Row, useMantineReactTable } from 'mantine-react-table';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { isActiveSession, Mode, RiskPolicy, StrategyListingPnl, StrategySession, StrategySessionStatus } from '../../types';
import { strategyActivity } from '../../utils/strategy-activity';
import { navigateRowProps } from '../../utils/navigation';
import { errorMessage, findKillSwitch, isKilled, listingKills, setKillSwitch } from '../../utils/kill-switch';
import { policiesForStrategy, withoutEndedSessions } from '../../utils/policy-target';
import { SESSION_STATUS_COLORS } from '../../utils/session-status';
import { useLatestPolicyHistory } from '../../hooks/useLatestPolicyHistory';
import { useDayZone } from '../../context/PreferencesContext';
import {
  keys, POLL, useEventPositions, useFills, useOrders, usePnlSeries, useRiskPolicies, useSessionsTotals, useStrategies, useStrategySessions,
  useStrategySummary,
} from '../../query/hooks';
import DeploySessionModal from '../Sessions/DeploySessionModal';
import StrategyFormModal from './StrategyFormModal';
import { StopSessionModal } from '../Sessions/StopSessionModal';
import { ReasonConfirmModal } from '../../components/ReasonConfirmModal';
import { RiskPolicyHistoryModal } from '../../components/RiskPolicyHistoryModal';
import { KillSwitchLatestEntry } from '../../components/KillSwitchLatestEntry';
import { LastUpdated } from '../../components/LastUpdated';
import { StrategyRiskPanel } from '../../components/risk/StrategyRiskPanel';
import { StrategyLimitUsage } from '../../components/risk/LimitUsage';
import { Kpi, KpiStrip, ModeBand, ModeSwitch } from '../../components/trading/layout';
import { PageHeader } from '../../components/PageHeader';
import { useModeParam } from '../../hooks/useModeParam';
import { Money, Time } from '../../components/trading/values';
import { PnlChart } from '../../components/trading/PnlChart';
import { PerformancePanel } from '../../components/trading/PerformancePanel';
import { EventPositions } from '../../components/trading/EventPositions';
import { PositionsTable } from '../../components/trading/PositionsTable';
import { FillsTable, OrdersTable } from '../../components/trading/LedgerTables';
import { AdjustPositionModal } from '../../components/trading/AdjustPositionModal';

const RANGES: Record<string, number | null> = { '1d': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000, All: null };
const TABS = ['positions', 'performance', 'sessions', 'fills', 'orders', 'risk'] as const;
type Tab = typeof TABS[number];

function rangeStart(range: string): string | undefined {
  const span = RANGES[range];
  return span === null ? undefined : new Date(Date.now() - span).toISOString();
}

function StrategyDetail() {
  const { strategyId } = useParams<{ strategyId: string }>();
  const id = parseInt(strategyId ?? '0');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tz = useDayZone();

  const strategies = useStrategies();
  const strategy = strategies.data?.find(s => s.strategyId === id) ?? null;
  const sessionsQuery = useStrategySessions(id);
  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);
  const policiesQuery = useRiskPolicies();
  const modesWithData = sessionsQuery.data ? [...new Set(sessions.map(s => s.mode as Mode))] : undefined;
  const [mode, setMode] = useModeParam(modesWithData);
  const summary = useStrategySummary(id, mode, tz);
  const [range, setRange] = useState('7d');
  const [start, setStart] = useState(() => rangeStart('7d'));
  const series = usePnlSeries({ strategyId: id, mode }, start, true);
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? params.get('tab') as Tab : 'positions';
  const scope = { strategyId: id, mode };
  const positionsView = params.get('view') === 'events' ? 'events' : 'listings';
  const eventPositions = useEventPositions({ strategyId: id, mode }, tab === 'positions' && positionsView === 'events', true);
  const fills = useFills(scope, { live: true, enabled: tab === 'fills' });
  const orders = useOrders(scope, { live: true, enabled: tab === 'orders' }, 'ANY');

  const [deployOpen, setDeployOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [stopTarget, setStopTarget] = useState<StrategySession | null>(null);
  const [relaunchSession, setRelaunchSession] = useState<StrategySession | null>(null);
  const [killAction, setKillAction] = useState<'kill' | 'resume' | null>(null);
  const [killHistory, setKillHistory] = useState<RiskPolicy | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<StrategyListingPnl | null>(null);

  const policiesLoaded = !!policiesQuery.data;
  const policies = useMemo(
    () => withoutEndedSessions(policiesForStrategy(policiesQuery.data ?? [], id), sessions),
    [policiesQuery.data, id, sessions],
  );
  const killTarget = useMemo(() => ({ strategyId: id }), [id]);
  const killSwitch = findKillSwitch(policies, killTarget);
  const strategyKilled = isKilled(policiesLoaded ? policies : null, killTarget);
  const latestKillEntry = useLatestPolicyHistory(killSwitch);
  const activity = strategyActivity(id, sessions, policiesLoaded ? policies : null);
  const listingHalts = listingKills(policies).length;

  const modeSessions = useMemo(
    () => sessions.filter(s => s.mode === mode).sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? '')),
    [sessions, mode],
  );
  const recentIds = useMemo(() => modeSessions.slice(0, 100).map(s => s.sessionId), [modeSessions]);
  const sessionTotals = useSessionsTotals(tab === 'sessions' ? recentIds : [], modeSessions.some(s => isActiveSession(s.status)));
  const totalsById = useMemo(
    () => Object.fromEntries((sessionTotals.data ?? []).map(t => [t.sessionId, t])),
    [sessionTotals.data],
  );

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: keys.policies });
    queryClient.invalidateQueries({ queryKey: keys.strategySessions(id) });
    queryClient.invalidateQueries({ queryKey: ['pnlSummary'] });
    queryClient.invalidateQueries({ queryKey: ['pnlSeries'] });
  };
  const setTab = (next: string | null) => setParams(current => {
    const updated = new URLSearchParams(current);
    updated.set('tab', next ?? 'positions');
    return updated;
  }, { replace: true });
  const chooseRange = (next: string) => {
    setRange(next);
    setStart(rangeStart(next));
  };
  const confirmKillAction = async (reason: string | undefined) => {
    await setKillSwitch(killSwitch, killTarget, killAction === 'kill', reason);
    refreshAll();
  };

  const totals = summary.data?.totals;
  const loadError = summary.error ?? policiesQuery.error ?? sessionsQuery.error;
  const reviewCount = summary.data?.listings.filter(l => l.needsReview).length ?? 0;

  const sessionColumns = useMemo<MRT_ColumnDef<StrategySession>[]>(() => [
    {
      accessorKey: 'sessionId', header: 'Session', size: 100,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => (
        <Tooltip label={row.original.sessionId} openDelay={300} withArrow>
          <Text span ff="monospace" size="sm">{row.original.sessionId.slice(0, 8)}</Text>
        </Tooltip>
      ),
    },
    {
      accessorKey: 'status', header: 'Status', size: 100,
      Cell: ({ row }) => <Badge color={SESSION_STATUS_COLORS[row.original.status] ?? 'gray'} variant="light" size="sm">{row.original.status}</Badge>,
    },
    { id: 'started', header: 'Started', size: 170, Cell: ({ row }) => <Time value={row.original.startedAt} size="sm" /> },
    { id: 'stopped', header: 'Stopped', size: 170, Cell: ({ row }) => <Time value={row.original.stoppedAt} size="sm" /> },
    {
      id: 'opening', header: 'Started with', size: 110,
      Cell: ({ row }) => {
        const opening = totalsById[row.original.sessionId]?.opening;
        if (!opening) return <Text span c="dimmed">—</Text>;
        return opening === 'INHERITED' ? <Badge size="xs" variant="light">inherited</Badge>
          : opening === 'FLAT' ? <Badge size="xs" variant="outline" color="gray">started flat</Badge>
            : <Text span size="sm" c="dimmed">nothing</Text>;
      },
    },
    {
      id: 'fills', header: 'Fills', size: 70,
      mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
      Cell: ({ row }) => totalsById[row.original.sessionId]?.fills ?? '—',
    },
    {
      id: 'pnl', header: 'Session PnL', size: 110,
      mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
      Cell: ({ row }) => <Money value={totalsById[row.original.sessionId]?.totals.total} size="sm" />,
    },
  ], [totalsById]);

  const sessionTable = useMantineReactTable({
    columns: sessionColumns,
    data: modeSessions,
    state: { isLoading: sessionsQuery.isLoading },
    enableRowActions: true,
    enableColumnFilters: false,
    enableColumnActions: false,
    enableSorting: false,
    enableTopToolbar: false,
    positionActionsColumn: 'last',
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 15 } },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }) => navigateRowProps(navigate, `/sessions/${row.original.sessionId}`),
    renderRowActions: ({ row }) => (
      <Group gap={4} justify="center" wrap="nowrap">
        <Tooltip label="Relaunch" withArrow openDelay={500}>
          <ActionIcon variant="subtle" color="green" disabled={isActiveSession(row.original.status)}
            onClick={e => { e.stopPropagation(); setRelaunchSession(row.original); }}>
            <IconAB2 size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Stop" withArrow openDelay={500}>
          <ActionIcon variant="subtle" color="red" disabled={!isActiveSession(row.original.status)}
            onClick={e => { e.stopPropagation(); setStopTarget(row.original); }}>
            <IconPlayerStop size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
    ),
    renderEmptyRowsFallback: () => <Text c="dimmed" size="sm" p="md">No {mode} sessions yet.</Text>,
  });

  return (
    <Container size="xl" py="xl">
      <PageHeader
        onBack={() => navigate('/strategies')}
        title={strategy ? strategy.name : `Strategy ${id}`}
        badges={
          <>
            {strategy && <Badge color={activity.color} variant="light">{activity.label}</Badge>}
            {strategy?.archived && <Badge color="gray" variant="outline">Archived</Badge>}
            <LastUpdated
              at={summary.dataUpdatedAt ? new Date(summary.dataUpdatedAt) : null}
              intervalMs={POLL.summary}
              failing={!!loadError}
              compact
            />
          </>
        }
        actions={
          <>
            <ModeSwitch mode={mode} onChange={setMode} />
            {strategyKilled === null ? (
              <Button variant="default" disabled>Kill status unknown</Button>
            ) : (
              <Button
                color={strategyKilled ? 'green' : 'red'}
                variant="light"
                leftSection={strategyKilled ? <IconPlayerPlay size={16} /> : <IconPlayerStop size={16} />}
                onClick={() => setKillAction(strategyKilled ? 'resume' : 'kill')}
              >
                {strategyKilled ? 'Resume strategy' : 'Kill strategy'}
              </Button>
            )}
            <Button leftSection={<IconPlus size={16} />} onClick={() => setDeployOpen(true)}>Deploy</Button>
          </>
        }
        menu={[
          { label: 'Edit strategy', icon: <IconEdit size={16} />, onClick: () => setEditOpen(true) },
          { label: 'Refresh', icon: <IconRefresh size={16} />, onClick: refreshAll },
        ]}
        meta={[
          `${modeSessions.filter(s => isActiveSession(s.status)).length} running of ${modeSessions.length} ${mode} sessions`,
          strategy?.description && (
            <Tooltip label={strategy.description} multiline w={360} withArrow openDelay={400}>
              <Text size="sm" c="dimmed" truncate maw={420}>{strategy.description}</Text>
            </Tooltip>
          ),
        ]}
      />
      <ModeBand mode={mode} />

      {loadError && (
        <Alert mb="md" color="red" title="Error">
          {errorMessage(loadError, 'Failed to load strategy')}
          {policiesLoaded ? ' — showing the last state that loaded.' : " — this strategy's kill switch status is unknown."}
        </Alert>
      )}

      {strategyKilled && (
        <Alert mb="md" color="red" title="Strategy killed" icon={<IconAlertTriangle size={20} />}>
          <Group justify="space-between" align="center">
            <Stack gap={4}>
              <Text size="sm">
                All of this strategy's open orders were cancelled and its sessions cannot send orders until it is resumed.
              </Text>
              <KillSwitchLatestEntry entry={latestKillEntry} enabled />
            </Stack>
            {killSwitch && (
              <Button variant="outline" size="sm" leftSection={<IconHistory size={16} />} onClick={() => setKillHistory(killSwitch)}>
                History
              </Button>
            )}
          </Group>
        </Alert>
      )}

      {(reviewCount > 0 || listingHalts > 0) && (
        <Alert mb="md" color="orange" icon={<IconAlertTriangle size={20} />}>
          {reviewCount > 0 && (
            <Text size="sm">
              {reviewCount} position{reviewCount > 1 ? 's' : ''} need{reviewCount > 1 ? '' : 's'} review: events were lost, so
              {' '}automatic recovery refuses {reviewCount > 1 ? 'them' : 'it'} until it's adjusted.{' '}
              <Anchor size="sm" onClick={() => setTab('positions')}>Positions</Anchor>
            </Text>
          )}
          {listingHalts > 0 && (
            <Text size="sm">
              {listingHalts} listing{listingHalts > 1 ? 's are' : ' is'} halted for this strategy.{' '}
              <Anchor size="sm" onClick={() => setTab('risk')}>Risk</Anchor>
            </Text>
          )}
        </Alert>
      )}

      <KpiStrip>
        <Kpi
          label="Lifetime PnL"
          hint="Every session's realized PnL and fees, plus the unrealized PnL of what the strategy holds now, valued at the mid (else the last trade)."
          value={<Money value={totals?.lifetime} arrow />}
          footer={totals && totals.betweenSessions !== '0' && (
            <Tooltip label="Price moves on inventory held while no session ran, reset write-offs and adjustments" multiline w={260} withArrow>
              <span>between sessions <Money value={totals.betweenSessions} size="xs" /></span>
            </Tooltip>
          )}
        />
        <Kpi
          label="Today"
          hint={summary.data ? `Since ${new Date(summary.data.scope.dayStart).toLocaleString()} (${summary.data.scope.timeZone})` : undefined}
          value={<Money value={totals?.today} arrow />}
        />
        <Kpi label="Realized" value={<Money value={totals?.realized} />} />
        <Kpi label="Unrealized" value={<Money value={totals?.unrealized} />} />
        <Kpi label="Fees" value={<Money value={totals?.fees} pnl={false} />} />
        <Kpi label="Open positions" value={summary.data?.openPositions ?? '—'} />
      </KpiStrip>

      <Card withBorder mb="md">
        <Group justify="space-between" mb="xs">
          <Text fw={600}>PnL ({mode}, lifetime)</Text>
          <SegmentedControl size="xs" value={range} onChange={chooseRange} data={Object.keys(RANGES)} />
        </Group>
        <PnlChart series={series.data} loading={series.isLoading} />
      </Card>

      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List mb="sm">
          <Tabs.Tab value="positions">Positions</Tabs.Tab>
          <Tabs.Tab value="performance">Performance</Tabs.Tab>
          <Tabs.Tab value="sessions">Sessions ({modeSessions.length})</Tabs.Tab>
          <Tabs.Tab value="fills">Fills</Tabs.Tab>
          <Tabs.Tab value="orders">Orders</Tabs.Tab>
          <Tabs.Tab value="risk">Risk</Tabs.Tab>
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
            <EventPositions data={eventPositions.data} strategyId={id} mode={mode} loading={eventPositions.isLoading} basis="lifetime" />
          ) : (
          <PositionsTable
            rows={summary.data?.listings ?? []}
            loading={summary.isLoading}
            onAdjust={setAdjustTarget}
            rowHref={row => `/strategies/${id}/listings/${row.listingId}?mode=${mode}`}
          />
          )}
        </Tabs.Panel>
        <Tabs.Panel value="performance">
          <PerformancePanel strategyId={id} mode={mode} />
        </Tabs.Panel>
        <Tabs.Panel value="sessions">
          <MantineReactTable table={sessionTable} />
        </Tabs.Panel>
        <Tabs.Panel value="fills">
          <FillsTable
            rows={fills.data ?? []} loading={fills.isLoading} showSession
            hasMore={!!fills.hasNextPage} loadingMore={fills.isFetchingNextPage} onLoadMore={() => fills.fetchNextPage()}
          />
        </Tabs.Panel>
        <Tabs.Panel value="orders">
          <OrdersTable
            rows={orders.data ?? []} loading={orders.isLoading} showSession
            hasMore={!!orders.hasNextPage} loadingMore={orders.isFetchingNextPage} onLoadMore={() => orders.fetchNextPage()}
          />
        </Tabs.Panel>
        <Tabs.Panel value="risk">
          <StrategyLimitUsage sessions={modeSessions.filter(s => s.status === StrategySessionStatus.RUNNING)} />
          <StrategyRiskPanel
            strategyId={id}
            strategyName={strategy?.name}
            policies={policies}
            policiesLoaded={policiesLoaded}
            sessions={sessions}
            loading={policiesQuery.isLoading}
            onChanged={refreshAll}
          />
        </Tabs.Panel>
      </Tabs>

      <DeploySessionModal
        opened={deployOpen || !!relaunchSession}
        onClose={() => { setDeployOpen(false); setRelaunchSession(null); }}
        onCreated={(newSessionId) => {
          const wasRelaunch = !!relaunchSession;
          setDeployOpen(false);
          setRelaunchSession(null);
          if (wasRelaunch) navigate(`/sessions/${newSessionId}`);
          else refreshAll();
        }}
        preselectedStrategyId={id}
        initialSession={relaunchSession}
      />
      <StrategyFormModal
        opened={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => { setEditOpen(false); queryClient.invalidateQueries({ queryKey: keys.strategies }); }}
        strategy={strategy}
      />
      <StopSessionModal session={stopTarget} onClose={() => setStopTarget(null)} onStopped={refreshAll} />
      <AdjustPositionModal
        strategyId={id}
        mode={mode}
        position={adjustTarget}
        onClose={() => setAdjustTarget(null)}
        onAdjusted={refreshAll}
      />
      <RiskPolicyHistoryModal policy={killHistory} onClose={() => setKillHistory(null)} />
      <ReasonConfirmModal
        opened={killAction === 'kill'}
        onClose={() => setKillAction(null)}
        title="Kill Strategy"
        message={`This will immediately cancel all open orders for strategy ${strategy?.name ?? id} and block all of its sessions from sending orders. The strategy stays killed until resumed. Are you sure?`}
        confirmLabel="Kill strategy"
        onConfirm={confirmKillAction}
      />
      <ReasonConfirmModal
        opened={killAction === 'resume'}
        onClose={() => setKillAction(null)}
        title="Resume Strategy"
        message={`This will turn off the kill switch for strategy ${strategy?.name ?? id} and allow its running sessions to send orders again. Are you sure?`}
        confirmLabel="Resume strategy"
        confirmColor="green"
        onConfirm={confirmKillAction}
      />
    </Container>
  );
}

export default StrategyDetail;
