import { useMemo, useState } from 'react';
import { Alert, Anchor, Badge, Box, Card, Container, Grid, Group, SegmentedControl, Text, Title, Tooltip } from '@mantine/core';
import { IconAlertOctagon } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { Link, useNavigate } from 'react-router-dom';
import { StrategySession, StrategySessionStatus } from '../../types';
import { useDayZone } from '../../context/PreferencesContext';
import {
  POLL, useActiveSessions, useAttention, useFirmSummary, usePnlSeries, useRiskPolicies, useStrategies,
  useWeekSparklines,
} from '../../query/hooks';
import { useModeParam } from '../../hooks/useModeParam';
import { strategyActivity } from '../../utils/strategy-activity';
import { navigateRowProps } from '../../utils/navigation';
import { LastUpdated } from '../../components/LastUpdated';
import { Kpi, KpiStrip, ModeBand, ModeSwitch } from '../../components/trading/layout';
import { Money } from '../../components/trading/values';
import { PnlChart } from '../../components/trading/PnlChart';
import { Sparkline } from '../../components/trading/Sparkline';
import { AttentionList } from '../../components/trading/AttentionList';
import { PlatformSection } from './PlatformSection';

const RANGES: Record<string, number | null> = { '1d': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000, All: null };
// Matches the session page's heartbeat colours.
const AMBER_AFTER_MS = 15_000;
const RED_AFTER_MS = 60_000;

function rangeStart(range: string): string | undefined {
  const span = RANGES[range];
  return span === null ? undefined : new Date(Date.now() - span).toISOString();
}

function size(value: string | undefined): bigint {
  const v = BigInt(value ?? '0');
  return v < 0n ? -v : v;
}

function compareBig(a: bigint, b: bigint): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

interface StrategyRow {
  strategyId: number;
  name: string;
  activity: { label: string; color: string };
  running: number;
  today: string | undefined;
  lifetime: string | undefined;
  openPositions: number;
  week: string[] | undefined;
  heardAt: string | null;
}

function HeardCell({ at }: { at: string | null }) {
  if (!at) return <Text span size="sm" c="dimmed">—</Text>;
  const age = Date.now() - Date.parse(at);
  const color = age > RED_AFTER_MS ? 'red' : age > AMBER_AFTER_MS ? 'orange' : 'green';
  return (
    <Group gap={6} wrap="nowrap">
      <Box w={8} h={8} style={{ borderRadius: '50%', background: `var(--mantine-color-${color}-6)` }} />
      <Text span size="sm" c="dimmed"><ReactTimeAgo date={new Date(at)} timeStyle="round" /></Text>
    </Group>
  );
}

// The trading overview: is anything wrong, and are we making money? Then the rest of the platform below.
function Dashboard() {
  const navigate = useNavigate();
  const tz = useDayZone();
  const [mode, setMode] = useModeParam(undefined);
  const strategies = useStrategies();
  const sessions = useActiveSessions();
  const policies = useRiskPolicies();
  const firm = useFirmSummary(mode, tz, POLL.summary);
  const attention = useAttention(mode);
  const sparklines = useWeekSparklines(mode);
  const [range, setRange] = useState('7d');
  const [start, setStart] = useState(() => rangeStart('7d'));
  const series = usePnlSeries({ mode }, start, true);

  const modeSessions = useMemo(
    () => (sessions.data ?? []).filter(s => s.mode === mode),
    [sessions.data, mode],
  );
  const running = modeSessions.filter(s => s.status === StrategySessionStatus.RUNNING);
  const globalHalt = attention.data?.items.find(i => i.kind === 'GLOBAL_HALT');
  const totals = firm.data?.totals;
  const openPositions = firm.data?.strategies.reduce((sum, s) => sum + s.openPositions, 0);

  const rows = useMemo<StrategyRow[]>(() => {
    const byId = new Map((firm.data?.strategies ?? []).map(s => [s.strategyId, s]));
    const weeks = new Map((sparklines.data?.strategies ?? []).map(s => [s.strategyId, s.total]));
    return (strategies.data ?? [])
      .filter(s => !s.archived || byId.has(s.strategyId))
      .map(s => {
        const own: StrategySession[] = modeSessions.filter(x => x.strategyId === s.strategyId);
        const heard = own.map(x => x.lastHeartbeatAt).filter((t): t is string => !!t).sort().pop() ?? null;
        const pnl = byId.get(s.strategyId);
        return {
          strategyId: s.strategyId,
          name: s.name,
          activity: strategyActivity(s.strategyId, sessions.data ?? [], policies.data ?? null),
          running: own.filter(x => x.status === StrategySessionStatus.RUNNING).length,
          today: pnl?.today,
          lifetime: pnl?.lifetime,
          openPositions: pnl?.openPositions ?? 0,
          week: weeks.get(s.strategyId),
          heardAt: heard,
        };
      })
      // Running first, then whatever has made or lost the most.
      .sort((a, b) => b.running - a.running || compareBig(size(b.lifetime), size(a.lifetime)) || a.name.localeCompare(b.name));
  }, [strategies.data, firm.data, sparklines.data, modeSessions, sessions.data, policies.data]);

  const columns = useMemo<MRT_ColumnDef<StrategyRow>[]>(() => {
    const right = { mantineTableHeadCellProps: { align: 'right' as const }, mantineTableBodyCellProps: { align: 'right' as const } };
    return [
      {
        id: 'name', header: 'Strategy', size: 180,
        Cell: ({ row }) => (
          <Anchor component={Link} to={`/strategies/${row.original.strategyId}?mode=${mode}`} size="sm" fw={600}
            onClick={e => e.stopPropagation()}>
            {row.original.name}
          </Anchor>
        ),
      },
      {
        id: 'status', header: 'Status', size: 110,
        Cell: ({ row }) => <Badge color={row.original.activity.color} variant="light" size="sm">{row.original.activity.label}</Badge>,
      },
      { id: 'today', header: 'Today', size: 100, ...right, Cell: ({ row }) => <Money value={row.original.today} size="sm" /> },
      { id: 'lifetime', header: 'Lifetime', size: 110, ...right, Cell: ({ row }) => <Money value={row.original.lifetime} size="sm" /> },
      { id: 'week', header: 'Last 7 days', size: 140, Cell: ({ row }) => <Sparkline values={row.original.week} label="7 days" /> },
      { id: 'open', header: 'Open positions', size: 110, ...right, Cell: ({ row }) => row.original.openPositions || '—' },
      { id: 'heard', header: 'Last heartbeat', size: 130, Cell: ({ row }) => <HeardCell at={row.original.heardAt} /> },
    ];
  }, [mode]);

  const table = useMantineReactTable({
    columns,
    data: rows,
    state: { isLoading: strategies.isLoading },
    enableTopToolbar: false,
    enableColumnActions: false,
    enableColumnFilters: false,
    enableSorting: false,
    enablePagination: false,
    enableBottomToolbar: false,
    initialState: { density: 'xs' },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }) => navigateRowProps(navigate, `/strategies/${row.original.strategyId}?mode=${mode}`),
    renderEmptyRowsFallback: () => <Text c="dimmed" size="sm" p="md">No strategies yet.</Text>,
  });

  const loadError = firm.error ?? attention.error;
  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="xs">
        <Group gap="sm">
          <Title order={2}>Overview</Title>
          <LastUpdated at={firm.dataUpdatedAt ? new Date(firm.dataUpdatedAt) : null} intervalMs={POLL.summary} failing={!!loadError} compact />
        </Group>
        <ModeSwitch mode={mode} onChange={setMode} />
      </Group>
      <ModeBand mode={mode} />

      {globalHalt && (
        <Alert mb="md" color="red" icon={<IconAlertOctagon size={20} />} title="All trading is halted">
          The global kill switch is on: every strategy's orders are blocked.{' '}
          <Anchor component={Link} to="/risk/policies" size="sm">Risk policies</Anchor>
        </Alert>
      )}

      <KpiStrip>
        <Kpi
          label="Today"
          hint={firm.data ? `Since ${new Date(firm.data.scope.dayStart).toLocaleString()} (${firm.data.scope.timeZone})` : undefined}
          value={<Money value={totals?.today} arrow />}
        />
        <Kpi label="Lifetime PnL" value={<Money value={totals?.lifetime} arrow />} />
        <Kpi label="Unrealized" value={<Money value={totals?.unrealized} />} />
        <Kpi label="Fees" value={<Money value={totals?.fees} pnl={false} />} />
        <Kpi label="Open positions" value={openPositions ?? '—'} />
        <Kpi
          label="Running sessions"
          value={running.length}
          footer={`${new Set(running.map(s => s.strategyId)).size} strategies`}
        />
      </KpiStrip>

      <Grid mb="md" align="stretch">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Card withBorder h="100%">
            <Group justify="space-between" mb="xs">
              <Tooltip label="Every strategy's lifetime PnL in this mode, added up" withArrow>
                <Text fw={600}>Firm PnL</Text>
              </Tooltip>
              <SegmentedControl size="xs" value={range} onChange={next => { setRange(next); setStart(rangeStart(next)); }}
                data={Object.keys(RANGES)} />
            </Group>
            <PnlChart series={series.data} loading={series.isLoading} height={240} />
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <AttentionList items={attention.data?.items} mode={mode} loading={attention.isLoading} />
        </Grid.Col>
      </Grid>

      <Card withBorder p="md">
        <Text fw={600} mb="sm">Strategies</Text>
        <MantineReactTable table={table} />
      </Card>

      <PlatformSection />
    </Container>
  );
}

export default Dashboard;
