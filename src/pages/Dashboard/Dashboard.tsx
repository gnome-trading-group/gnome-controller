import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Card,
  Container,
  Group,
  Paper,
  SimpleGrid,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconHelpCircle,
  IconAntenna,
  IconChartLine,
  IconCurrencyDollar,
  IconPlayerPlay,
  IconRefresh,
} from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { navigateRowProps, handleNavigateClick } from '../../utils/navigation';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PnlSnapshot, RiskPolicy, Strategy, StrategySession, isActiveSession, ACTIVE_SESSION_STATUSES } from '../../types';
import { isActiveSessionStatus } from '../../utils/policy-target';
import { BacktestRun } from '../../types/backtests';
import { ResearchSession } from '../../types/research';
import { controllerApi, marketDataApi, registryApi } from '../../utils/api';
import { unscalePrice } from '../../utils/security-master';
import { SESSION_STATUS_COLORS } from '../../utils/session-status';
import { GLOBAL_TARGET, isKilled } from '../../utils/kill-switch';
import { ActiveKillSwitches } from '../../components/ActiveKillSwitches';
import { withoutEndedSessions } from '../../utils/policy-target';
import { LastUpdated } from '../../components/LastUpdated';

interface Collector {
  listingId: number;
  status: string;
  failureReason: string | null;
}

const MODE_COLORS: Record<string, string> = {
  paper: 'violet',
  live: 'red',
};

const BACKTEST_STATUS_COLORS: Record<string, string> = {
  SUBMITTED: 'blue',
  PENDING: 'blue',
  RUNNING: 'green',
  COMPLETED: 'teal',
  PARTIALLY_FAILED: 'orange',
  FAILED: 'red',
  CANCELLED: 'gray',
};

const RESEARCH_STATUS_COLORS: Record<string, string> = {
  running: 'green',
  completed: 'teal',
  stalled: 'orange',
  paused: 'yellow',
};

function Dashboard() {
  const navigate = useNavigate();

  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [sessions, setSessions] = useState<StrategySession[]>([]);
  const [sessionTotal, setSessionTotal] = useState<number | null>(null);
  const [pnlSnapshots, setPnlSnapshots] = useState<PnlSnapshot[]>([]);
  const [riskPolicies, setRiskPolicies] = useState<RiskPolicy[] | null>(null);
  const [riskPoliciesFailed, setRiskPoliciesFailed] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [failedCount, setFailedCount] = useState(0);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [backtests, setBacktests] = useState<BacktestRun[]>([]);
  const [research, setResearch] = useState<ResearchSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const results = await Promise.allSettled([
      registryApi.listStrategies(),
      // Only active sessions are listed here; every session ever, every 30s, grows without bound.
      registryApi.listSessions({ status: ACTIVE_SESSION_STATUSES.join(',') }),
      registryApi.listPnlLatest(),
      registryApi.listRiskPolicies(),
      marketDataApi.listCollectors(),
      controllerApi.listBacktests({ limit: 10 }),
      controllerApi.listResearchSessions({ limit: 10 }),
      registryApi.countSessions(),
    ]);
    if (results[0].status === 'fulfilled') setStrategies(results[0].value);
    if (results[1].status === 'fulfilled') setSessions(results[1].value);
    setSessionsLoaded(results[1].status === 'fulfilled');
    if (results[2].status === 'fulfilled') setPnlSnapshots(results[2].value);
    if (results[3].status === 'fulfilled') setRiskPolicies(results[3].value);
    setRiskPoliciesFailed(results[3].status === 'rejected');
    const failed = results.filter(r => r.status === 'rejected').length;
    setFailedCount(failed);
    if (failed === 0) setLastUpdated(new Date());
    if (results[4].status === 'fulfilled') setCollectors((results[4].value as { collectors: Collector[] }).collectors);
    if (results[5].status === 'fulfilled') setBacktests((results[5].value as { runs: BacktestRun[] }).runs);
    if (results[6].status === 'fulfilled') setResearch((results[6].value as { sessions: ResearchSession[] }).sessions);
    if (results[7].status === 'fulfilled') setSessionTotal(results[7].value as number);
    if (showLoading) setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const interval = setInterval(() => refresh(false), 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  const strategyMap = useMemo(() => {
    const map: Record<number, string> = {};
    strategies.forEach(s => { map[s.strategyId] = s.name; });
    return map;
  }, [strategies]);

  const tradingHalted = useMemo(() => isKilled(riskPolicies, GLOBAL_TARGET), [riskPolicies]);
  // Stopping a session leaves its kill switch on for good, so only kills on still-active sessions are worth showing.
  // Without the session list, show everything rather than risk hiding a live kill.
  const livePolicies = useMemo(
    () => (riskPolicies && sessionsLoaded ? withoutEndedSessions(riskPolicies, sessions) : riskPolicies),
    [riskPolicies, sessions, sessionsLoaded],
  );

  const runningStrategies = useMemo(
    () => new Set(sessions.filter(s => isActiveSessionStatus(s.status)).map(s => s.strategyId)).size,
    [sessions],
  );
  const unarchivedStrategies = useMemo(() => strategies.filter(s => !s.archived).length, [strategies]);

  const activeSessions = useMemo(() =>
    sessions.filter(s => isActiveSession(s.status)),
    [sessions],
  );

  const totalRealizedPnl = useMemo(() => unscalePrice(pnlSnapshots.reduce((sum, s) => sum + Number(s.realizedPnl), 0)), [pnlSnapshots]);
  const totalUnrealizedPnl = useMemo(() => unscalePrice(pnlSnapshots.reduce((sum, s) => sum + Number(s.unrealizedPnl), 0)), [pnlSnapshots]);
  const totalPnl = useMemo(() => unscalePrice(pnlSnapshots.reduce((sum, s) => sum + Number(s.totalPnl), 0)), [pnlSnapshots]);

  const activeCollectorCount = useMemo(() => collectors.filter(c => c.status === 'ACTIVE').length, [collectors]);
  const failedCollectorCount = useMemo(() => collectors.filter(c => c.status === 'FAILED').length, [collectors]);

  const pnlByStrategy = useMemo(() => {
    const grouped: Record<number, number> = {};
    pnlSnapshots.forEach(s => { grouped[s.strategyId] = (grouped[s.strategyId] ?? 0) + Number(s.totalPnl); });
    return Object.entries(grouped).map(([id, pnl]) => ({
      strategyId: Number(id),
      strategyName: strategyMap[Number(id)] ?? `Strategy ${id}`,
      totalPnl: unscalePrice(pnl),
    }));
  }, [pnlSnapshots, strategyMap]);

  const recentBacktests = useMemo(() => backtests.slice(0, 5), [backtests]);
  const recentResearch = useMemo(() => research.slice(0, 5), [research]);

  const activeSessionColumns = useMemo<MRT_ColumnDef<StrategySession>[]>(() => [
    {
      accessorKey: 'sessionId',
      header: 'Session ID',
      size: 120,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => (
        <Tooltip label={row.original.sessionId} position="right" withArrow openDelay={300}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
            {row.original.sessionId.slice(0, 8)}…
          </span>
        </Tooltip>
      ),
    },
    {
      accessorKey: 'strategyId',
      header: 'Strategy',
      size: 160,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) =>
        strategyMap[row.original.strategyId] ?? String(row.original.strategyId),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 110,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => (
        <Badge color={SESSION_STATUS_COLORS[row.original.status] ?? 'gray'} variant="light" size="sm">
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'mode',
      header: 'Mode',
      size: 90,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => (
        <Badge color={MODE_COLORS[row.original.mode] ?? 'gray'} variant="light" size="sm">
          {row.original.mode}
        </Badge>
      ),
    },
    {
      accessorKey: 'startedAt',
      header: 'Started',
      size: 130,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) =>
        row.original.startedAt
          ? <ReactTimeAgo date={new Date(row.original.startedAt)} timeStyle="round" />
          : '—',
    },
  ], [strategyMap]);

  const backtestColumns = useMemo<MRT_ColumnDef<BacktestRun>[]>(() => [
    {
      accessorKey: 'strategy',
      header: 'Strategy',
      size: 160,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 130,
      Cell: ({ row }: { row: MRT_Row<BacktestRun> }) => (
        <Badge color={BACKTEST_STATUS_COLORS[row.original.status] ?? 'gray'} variant="light" size="sm">
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: 'progress',
      header: 'Progress',
      size: 90,
      Cell: ({ row }: { row: MRT_Row<BacktestRun> }) =>
        `${row.original.completedCount}/${row.original.jobCount}`,
    },
    {
      accessorKey: 'submittedAt',
      header: 'Submitted',
      size: 130,
      Cell: ({ row }: { row: MRT_Row<BacktestRun> }) =>
        row.original.submittedAt
          ? <ReactTimeAgo date={new Date(row.original.submittedAt)} timeStyle="round" />
          : '—',
    },
  ], []);

  const researchColumns = useMemo<MRT_ColumnDef<ResearchSession>[]>(() => [
    {
      accessorKey: 'sessionName',
      header: 'Session',
      size: 160,
      Cell: ({ row }: { row: MRT_Row<ResearchSession> }) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{row.original.sessionName}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 110,
      Cell: ({ row }: { row: MRT_Row<ResearchSession> }) => (
        <Badge color={RESEARCH_STATUS_COLORS[row.original.status] ?? 'gray'} variant="light" size="sm">
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'iterationCount',
      header: 'Iters',
      size: 70,
    },
    {
      accessorKey: 'bestSharpe',
      header: 'Best Sharpe',
      size: 110,
      Cell: ({ row }: { row: MRT_Row<ResearchSession> }) =>
        row.original.bestSharpe != null ? row.original.bestSharpe.toFixed(3) : '—',
    },
    {
      accessorKey: 'updatedAt',
      header: 'Updated',
      size: 130,
      Cell: ({ row }: { row: MRT_Row<ResearchSession> }) =>
        row.original.updatedAt
          ? <ReactTimeAgo date={new Date(row.original.updatedAt)} timeStyle="round" />
          : '—',
    },
  ], []);

  const activeSessionTable = useMantineReactTable({
    columns: activeSessionColumns,
    data: activeSessions,
    state: { isLoading: loading },
    enablePagination: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    enableColumnFilters: false,
    enableSorting: false,
    enableRowActions: false,
    initialState: { density: 'xs' },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }: { row: MRT_Row<StrategySession> }) => (
      navigateRowProps(navigate, `/sessions/${row.original.sessionId}`)
    ),
  });

  const backtestTable = useMantineReactTable({
    columns: backtestColumns,
    data: recentBacktests,
    state: { isLoading: loading },
    enablePagination: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    enableColumnFilters: false,
    enableSorting: false,
    enableRowActions: false,
    initialState: { density: 'xs' },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }: { row: MRT_Row<BacktestRun> }) => (
      navigateRowProps(navigate, `/backtests/${row.original.runId}`)
    ),
  });

  const researchTable = useMantineReactTable({
    columns: researchColumns,
    data: recentResearch,
    state: { isLoading: loading },
    enablePagination: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    enableColumnFilters: false,
    enableSorting: false,
    enableRowActions: false,
    initialState: { density: 'xs' },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }: { row: MRT_Row<ResearchSession> }) => (
      navigateRowProps(navigate, `/research/${row.original.sessionName}`)
    ),
  });

  const pnlColor = totalPnl >= 0 ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-red-6)';

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Dashboard</Title>
        <Group>
          <LastUpdated at={lastUpdated} intervalMs={30000} failing={failedCount > 0} />
          {failedCount > 0 && (
            <Text size="sm" c="red">{failedCount} {failedCount === 1 ? 'source' : 'sources'} failed to load</Text>
          )}
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={() => refresh()} loading={loading}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {riskPoliciesFailed && (
        <Alert
          mb="lg"
          color="gray"
          title={tradingHalted === null ? 'Kill switch status unknown' : 'Kill switch status may be stale'}
          icon={<IconHelpCircle size={20} />}
          onClick={(e) => handleNavigateClick(e, navigate, '/risk/policies')}
          style={{ cursor: 'pointer' }}
        >
          Risk policies couldn't be loaded, so this page can't confirm whether trading is halted. Click to open risk policies.
        </Alert>
      )}

      {tradingHalted && (
        <Alert
          mb="lg"
          color="red"
          title="Trading Halted"
          icon={<IconAlertTriangle size={20} />}
          onClick={(e) => handleNavigateClick(e, navigate, '/risk/policies')}
          style={{ cursor: 'pointer' }}
        >
          Kill switch is ACTIVE — all order flow is blocked. Click to manage risk policies.
        </Alert>
      )}

      <ActiveKillSwitches policies={livePolicies} strategyName={(id) => strategyMap[id]} />

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="lg">
        <Paper withBorder p="md" radius="md" style={{ cursor: 'pointer' }} onClick={(e) => handleNavigateClick(e, navigate, '/strategies')}>
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Running Strategies</Text>
              <Text size="xl" fw={700}>{runningStrategies}</Text>
              <Text size="xs" c="dimmed">{unarchivedStrategies} total</Text>
            </div>
            <IconChartLine size={32} stroke={1.5} color="var(--mantine-color-green-6)" />
          </Group>
        </Paper>

        <Paper withBorder p="md" radius="md" style={{ cursor: 'pointer' }} onClick={(e) => handleNavigateClick(e, navigate, '/sessions')}>
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Running Sessions</Text>
              <Text size="xl" fw={700}>{activeSessions.length}</Text>
              <Text size="xs" c="dimmed">{sessionTotal ?? '–'} total</Text>
            </div>
            <IconPlayerPlay size={32} stroke={1.5} color="var(--mantine-color-blue-6)" />
          </Group>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total PnL</Text>
              <Text size="xl" fw={700} c={totalPnl >= 0 ? 'green' : 'red'}>
                {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
              </Text>
              <Text size="xs" c="dimmed">
                R: {totalRealizedPnl >= 0 ? '+' : ''}{totalRealizedPnl.toFixed(2)} · U: {totalUnrealizedPnl >= 0 ? '+' : ''}{totalUnrealizedPnl.toFixed(2)}
              </Text>
            </div>
            <IconCurrencyDollar size={32} stroke={1.5} color={pnlColor} />
          </Group>
        </Paper>

        <Paper withBorder p="md" radius="md" style={{ cursor: 'pointer' }} onClick={(e) => handleNavigateClick(e, navigate, '/market-data/collectors')}>
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Collectors</Text>
              <Text size="xl" fw={700}>{activeCollectorCount} active</Text>
              {failedCollectorCount > 0
                ? <Text size="xs" c="red">{failedCollectorCount} failed</Text>
                : <Text size="xs" c="dimmed">{collectors.length} total</Text>
              }
            </div>
            <IconAntenna size={32} stroke={1.5} color={failedCollectorCount > 0 ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-violet-6)'} />
          </Group>
        </Paper>
      </SimpleGrid>

      <Card withBorder mb="lg" p="md">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Active Sessions</Title>
          <Text
            size="sm"
            c="dimmed"
            style={{ cursor: 'pointer' }}
            onClick={(e) => handleNavigateClick(e, navigate, '/sessions')}
          >
            View all →
          </Text>
        </Group>
        {activeSessions.length === 0 && !loading
          ? <Text c="dimmed" size="sm">No active sessions</Text>
          : <MantineReactTable table={activeSessionTable} />
        }
      </Card>

      {pnlByStrategy.length > 0 && (
        <Card withBorder mb="lg" p="md">
          <Group justify="space-between" mb="sm">
            <Title order={4}>PnL by Strategy</Title>
            <Text
              size="sm"
              c="dimmed"
              style={{ cursor: 'pointer' }}
              onClick={(e) => handleNavigateClick(e, navigate, '/strategies')}
            >
              View all →
            </Text>
          </Group>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={pnlByStrategy} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-dark-4)" />
              <XAxis dataKey="strategyName" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip
                contentStyle={{ background: 'var(--mantine-color-dark-7)', border: '1px solid var(--mantine-color-dark-4)' }}
                formatter={(value) => [typeof value === 'number' ? value.toFixed(2) : value, 'Total PnL']}
              />
              <Bar dataKey="totalPnl">
                {pnlByStrategy.map((entry, i) => (
                  <Cell key={i} fill={entry.totalPnl >= 0 ? '#2f9e44' : '#e03131'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <SimpleGrid cols={{ base: 1, lg: 2 }} mb="lg">
        <Card withBorder p="md">
          <Group justify="space-between" mb="sm">
            <Title order={4}>Recent Backtests</Title>
            <Text
              size="sm"
              c="dimmed"
              style={{ cursor: 'pointer' }}
              onClick={(e) => handleNavigateClick(e, navigate, '/backtests')}
            >
              View all →
            </Text>
          </Group>
          {recentBacktests.length === 0 && !loading
            ? <Text c="dimmed" size="sm">No recent backtests</Text>
            : <MantineReactTable table={backtestTable} />
          }
        </Card>

        <Card withBorder p="md">
          <Group justify="space-between" mb="sm">
            <Title order={4}>Recent Research</Title>
            <Text
              size="sm"
              c="dimmed"
              style={{ cursor: 'pointer' }}
              onClick={(e) => handleNavigateClick(e, navigate, '/research')}
            >
              View all →
            </Text>
          </Group>
          {recentResearch.length === 0 && !loading
            ? <Text c="dimmed" size="sm">No recent research sessions</Text>
            : <MantineReactTable table={researchTable} />
          }
        </Card>
      </SimpleGrid>
    </Container>
  );
}

export default Dashboard;
