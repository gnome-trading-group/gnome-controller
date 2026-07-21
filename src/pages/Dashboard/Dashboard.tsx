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
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconAntenna,
  IconChartLine,
  IconCurrencyDollar,
  IconPlayerPlay,
  IconRefresh,
} from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
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
import { PnlSnapshot, RiskPolicy, Strategy, StrategySession, StrategySessionStatus, StrategyStatus } from '../../types';
import { BacktestRun } from '../../types/backtests';
import { ResearchSession } from '../../types/research';
import { controllerApi, marketDataApi, registryApi } from '../../utils/api';

interface Collector {
  listingId: number;
  status: string;
  failureReason: string | null;
}

const SESSION_STATUS_COLORS: Record<string, string> = {
  [StrategySessionStatus.SUBMITTED]: 'blue',
  [StrategySessionStatus.RUNNING]: 'green',
  [StrategySessionStatus.STOPPED]: 'gray',
  [StrategySessionStatus.FAILED]: 'red',
};

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
  const [pnlSnapshots, setPnlSnapshots] = useState<PnlSnapshot[]>([]);
  const [riskPolicies, setRiskPolicies] = useState<RiskPolicy[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [backtests, setBacktests] = useState<BacktestRun[]>([]);
  const [research, setResearch] = useState<ResearchSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const results = await Promise.allSettled([
      registryApi.listStrategies(),
      registryApi.listSessions(),
      registryApi.listPnlLatest(),
      registryApi.listRiskPolicies(),
      marketDataApi.listCollectors(),
      controllerApi.listBacktests({ limit: 10 }),
      controllerApi.listResearchSessions({ limit: 10 }),
    ]);
    if (results[0].status === 'fulfilled') setStrategies(results[0].value);
    if (results[1].status === 'fulfilled') setSessions(results[1].value);
    if (results[2].status === 'fulfilled') setPnlSnapshots(results[2].value);
    if (results[3].status === 'fulfilled') setRiskPolicies(results[3].value);
    if (results[4].status === 'fulfilled') setCollectors((results[4].value as { collectors: Collector[] }).collectors);
    if (results[5].status === 'fulfilled') setBacktests((results[5].value as { runs: BacktestRun[] }).runs);
    if (results[6].status === 'fulfilled') setResearch((results[6].value as { sessions: ResearchSession[] }).sessions);
    setLastRefreshed(new Date());
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

  const tradingHalted = useMemo(() =>
    riskPolicies.find(p => p.policyType === 'KILL_SWITCH' && p.scope === 0)?.enabled ?? false,
    [riskPolicies],
  );

  const activeStrategies = useMemo(() => strategies.filter(s => s.status === StrategyStatus.ACTIVE).length, [strategies]);

  const activeSessions = useMemo(() =>
    sessions.filter(s => s.status === StrategySessionStatus.RUNNING || s.status === StrategySessionStatus.SUBMITTED),
    [sessions],
  );

  const totalRealizedPnl = useMemo(() => pnlSnapshots.reduce((sum, s) => sum + s.realizedPnl, 0), [pnlSnapshots]);

  const activeCollectorCount = useMemo(() => collectors.filter(c => c.status === 'ACTIVE').length, [collectors]);
  const failedCollectorCount = useMemo(() => collectors.filter(c => c.status === 'FAILED').length, [collectors]);

  const pnlByStrategy = useMemo(() => {
    const grouped: Record<number, number> = {};
    pnlSnapshots.forEach(s => { grouped[s.strategyId] = (grouped[s.strategyId] ?? 0) + s.realizedPnl; });
    return Object.entries(grouped).map(([id, pnl]) => ({
      strategyId: Number(id),
      strategyName: strategyMap[Number(id)] ?? `Strategy ${id}`,
      realizedPnl: pnl,
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
    mantineTableBodyRowProps: ({ row }: { row: MRT_Row<StrategySession> }) => ({
      onClick: () => navigate(`/sessions/${row.original.sessionId}`),
      style: { cursor: 'pointer' },
    }),
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
    mantineTableBodyRowProps: ({ row }: { row: MRT_Row<BacktestRun> }) => ({
      onClick: () => navigate(`/backtests/${row.original.runId}`),
      style: { cursor: 'pointer' },
    }),
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
    mantineTableBodyRowProps: ({ row }: { row: MRT_Row<ResearchSession> }) => ({
      onClick: () => navigate(`/research/${row.original.sessionName}`),
      style: { cursor: 'pointer' },
    }),
  });

  const pnlColor = totalRealizedPnl >= 0 ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-red-6)';

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Dashboard</Title>
        <Group>
          <Text size="sm" c="dimmed">
            Refreshed <ReactTimeAgo date={lastRefreshed} timeStyle="round" />
          </Text>
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={() => refresh()} loading={loading}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {tradingHalted && (
        <Alert
          mb="lg"
          color="red"
          title="Trading Halted"
          icon={<IconAlertTriangle size={20} />}
          onClick={() => navigate('/risk/policies')}
          style={{ cursor: 'pointer' }}
        >
          Kill switch is ACTIVE — all order flow is blocked. Click to manage risk policies.
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="lg">
        <Paper withBorder p="md" radius="md" style={{ cursor: 'pointer' }} onClick={() => navigate('/strategies')}>
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Active Strategies</Text>
              <Text size="xl" fw={700}>{activeStrategies}</Text>
              <Text size="xs" c="dimmed">{strategies.length} total</Text>
            </div>
            <IconChartLine size={32} stroke={1.5} color="var(--mantine-color-green-6)" />
          </Group>
        </Paper>

        <Paper withBorder p="md" radius="md" style={{ cursor: 'pointer' }} onClick={() => navigate('/sessions')}>
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Running Sessions</Text>
              <Text size="xl" fw={700}>{activeSessions.length}</Text>
              <Text size="xs" c="dimmed">{sessions.length} total</Text>
            </div>
            <IconPlayerPlay size={32} stroke={1.5} color="var(--mantine-color-blue-6)" />
          </Group>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Group justify="space-between">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Realized PnL</Text>
              <Text size="xl" fw={700} c={totalRealizedPnl >= 0 ? 'green' : 'red'}>
                {totalRealizedPnl >= 0 ? '+' : ''}{totalRealizedPnl.toFixed(2)}
              </Text>
              <Text size="xs" c="dimmed">{pnlSnapshots.length} positions</Text>
            </div>
            <IconCurrencyDollar size={32} stroke={1.5} color={pnlColor} />
          </Group>
        </Paper>

        <Paper withBorder p="md" radius="md" style={{ cursor: 'pointer' }} onClick={() => navigate('/market-data/collectors')}>
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
            onClick={() => navigate('/sessions')}
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
              onClick={() => navigate('/strategies')}
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
                formatter={(value: number) => [value.toFixed(2), 'Realized PnL']}
              />
              <Bar dataKey="realizedPnl">
                {pnlByStrategy.map((entry, i) => (
                  <Cell key={i} fill={entry.realizedPnl >= 0 ? '#2f9e44' : '#e03131'} />
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
              onClick={() => navigate('/backtests')}
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
              onClick={() => navigate('/research')}
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
