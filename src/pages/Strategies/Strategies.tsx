import { useMemo, useState } from 'react';
import {
  ActionIcon, Alert, Anchor, Badge, Button, Chip, Container, Group, Modal, Progress, Stack, Text, Title, Tooltip,
} from '@mantine/core';
import {
  IconArchive, IconArchiveOff, IconEdit, IconPlayerPlay, IconPlayerStop, IconPlus, IconRocket, IconTrash,
} from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { isActiveSession, RiskPolicy, Strategy, StrategySessionStatus } from '../../types';
import { registryApi } from '../../utils/api';
import { navigateRowProps } from '../../utils/navigation';
import { errorMessage, findKillSwitch, isKilled, setKillSwitch } from '../../utils/kill-switch';
import { strategyActivity } from '../../utils/strategy-activity';
import { dailyStats } from '../../utils/performance';
import { closestLimit, usageColor } from '../../utils/risk-usage';
import { useDayZone } from '../../context/PreferencesContext';
import { useModeParam } from '../../hooks/useModeParam';
import {
  keys, POLL, useActiveSessions, useAttention, useDailyByStrategy, useFirmSummary, useRecentSessions, useRiskPolicies,
  useRiskUsages, useStrategies, useWeekSparklines,
} from '../../query/hooks';
import { LastUpdated } from '../../components/LastUpdated';
import { ModeBand, ModeSwitch } from '../../components/trading/layout';
import { Money } from '../../components/trading/values';
import { Sparkline } from '../../components/trading/Sparkline';
import { ReasonConfirmModal } from '../../components/ReasonConfirmModal';
import DeploySessionModal from '../Sessions/DeploySessionModal';
import StrategyFormModal from './StrategyFormModal';

type Filter = 'running' | 'idle' | 'killed' | 'archived';
const DAYS = 30;

interface Row {
  strategy: Strategy;
  activity: { label: string; color: string };
  state: Filter;
  running: number;
  today: bigint | null;
  lifetime: bigint | null;
  week: string[] | undefined;
  winRate: number | null;
  maxDrawdown: bigint | null;
  openPositions: number;
  usage: { usage: number; label: string } | null;
  attention: { count: number; worst: string; titles: string[] };
  lastRun: string | null;
}

// Every strategy with how it's doing in the chosen mode, filterable by state and sortable on any column; the place
// to deploy, kill, edit and archive them. The overview shows only what needs attention; this lists them all.
function Strategies() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDayZone();
  const [mode, setMode] = useModeParam(undefined);
  const [filters, setFilters] = useState<string[]>(['running', 'idle', 'killed']);
  const strategies = useStrategies();
  const active = useActiveSessions();
  const recent = useRecentSessions();
  const policies = useRiskPolicies();
  const firm = useFirmSummary(mode, tz, POLL.summary);
  const sparklines = useWeekSparklines(mode);
  const daily = useDailyByStrategy(mode, tz, DAYS);
  const attention = useAttention(mode);
  const running = useMemo(
    () => (active.data ?? []).filter(s => s.mode === mode && s.status === StrategySessionStatus.RUNNING),
    [active.data, mode],
  );
  const usages = useRiskUsages(running.map(s => s.sessionId));

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Strategy | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Strategy | null>(null);
  const [deployFor, setDeployFor] = useState<number | null>(null);
  const [killTarget, setKillTarget] = useState<{ strategy: Strategy; kill: boolean } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshAll = () => {
    for (const key of [keys.strategies, keys.policies, keys.activeSessions, ['recentSessions'], ['pnlSummary']]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const rows = useMemo<Row[]>(() => {
    const pnl = new Map((firm.data?.strategies ?? []).map(s => [s.strategyId, s]));
    const weeks = new Map((sparklines.data?.strategies ?? []).map(s => [s.strategyId, s.total]));
    const days = new Map((daily.data?.strategies ?? []).map(s => [s.strategyId, dailyStats(s.days)]));
    const knownPolicies: RiskPolicy[] | null = policies.data ?? null;
    return (strategies.data ?? []).map(strategy => {
      const id = strategy.strategyId;
      const own = running.filter(s => s.strategyId === id);
      const killed = isKilled(knownPolicies, { strategyId: id }) === true;
      const state: Filter = strategy.archived ? 'archived' : killed ? 'killed' : own.length > 0 ? 'running' : 'idle';
      const usage = own
        .map(s => closestLimit(usages[running.indexOf(s)]?.data?.policies))
        .reduce<Row['usage']>((best, u) => (u !== null && (best === null || u.usage > best.usage) ? u : best), null);
      const items = (attention.data?.items ?? []).filter(i => i.strategyId === id);
      const stats = days.get(id);
      const lastRun = (recent.data ?? []).find(s => s.strategyId === id && s.mode === mode);
      const summary = pnl.get(id);
      return {
        strategy,
        activity: strategyActivity(id, active.data ?? [], knownPolicies),
        state,
        running: own.length,
        today: summary ? BigInt(summary.today) : null,
        lifetime: summary ? BigInt(summary.lifetime) : null,
        week: weeks.get(id),
        winRate: stats?.winRate ?? null,
        maxDrawdown: stats?.maxDrawdown?.amount ?? (stats ? 0n : null),
        openPositions: summary?.openPositions ?? 0,
        usage,
        attention: {
          count: items.length,
          worst: items.some(i => i.severity === 'critical') ? 'red' : items.some(i => i.severity === 'warning') ? 'orange' : 'blue',
          titles: items.map(i => i.title),
        },
        lastRun: lastRun ? (isActiveSession(lastRun.status) ? 'now' : lastRun.stoppedAt ?? lastRun.startedAt) : null,
      };
    });
  }, [strategies.data, running, usages, policies.data, firm.data, sparklines.data, daily.data, attention.data, recent.data, active.data, mode]);

  const shown = useMemo(() => rows.filter(r => filters.includes(r.state)), [rows, filters]);
  const count = (f: Filter) => rows.filter(r => r.state === f).length;

  const columns = useMemo<MRT_ColumnDef<Row>[]>(() => {
    const right = { mantineTableHeadCellProps: { align: 'right' as const }, mantineTableBodyCellProps: { align: 'right' as const } };
    const big = (v: bigint | null) => (v === null ? Number.NEGATIVE_INFINITY : Number(v));
    return [
      {
        id: 'name', header: 'Strategy', size: 190, accessorFn: r => r.strategy.name,
        Cell: ({ row }) => (
          <Group gap={6} wrap="nowrap">
            <Anchor component={Link} to={`/strategies/${row.original.strategy.strategyId}?mode=${mode}`} size="sm" fw={600}
              onClick={e => e.stopPropagation()}>
              {row.original.strategy.name}
            </Anchor>
            {row.original.attention.count > 0 && (
              <Tooltip label={row.original.attention.titles.join(' · ')} multiline w={280} withArrow>
                <Badge size="xs" circle color={row.original.attention.worst}>{row.original.attention.count}</Badge>
              </Tooltip>
            )}
          </Group>
        ),
      },
      {
        id: 'status', header: 'Status', size: 120, accessorFn: r => r.activity.label,
        Cell: ({ row }) => <Badge color={row.original.activity.color} variant="light" size="sm">{row.original.activity.label}</Badge>,
      },
      { id: 'today', header: 'Today', size: 100, ...right, accessorFn: r => big(r.today), Cell: ({ row }) => <Money value={row.original.today} size="sm" /> },
      { id: 'lifetime', header: 'Lifetime', size: 110, ...right, accessorFn: r => big(r.lifetime), Cell: ({ row }) => <Money value={row.original.lifetime} size="sm" /> },
      { id: 'week', header: '7 days', size: 130, enableSorting: false, Cell: ({ row }) => <Sparkline values={row.original.week} width={110} label="7 days" /> },
      {
        id: 'winRate', header: `Win days (${DAYS}d)`, size: 110, ...right, accessorFn: r => r.winRate ?? -1,
        Cell: ({ row }) => (row.original.winRate === null ? <Text span c="dimmed">—</Text> : `${Math.round(row.original.winRate * 100)}%`),
      },
      {
        id: 'drawdown', header: `Max DD (${DAYS}d)`, size: 110, ...right, accessorFn: r => big(r.maxDrawdown),
        Cell: ({ row }) => <Money value={row.original.maxDrawdown} size="sm" />,
      },
      { id: 'open', header: 'Open', size: 70, ...right, accessorFn: r => r.openPositions, Cell: ({ row }) => row.original.openPositions || '—' },
      {
        id: 'limits', header: 'Limits', size: 110, accessorFn: r => r.usage?.usage ?? -1,
        Cell: ({ row }) => {
          const usage = row.original.usage;
          if (!usage) return <Text span c="dimmed">—</Text>;
          return (
            <Tooltip label={`Closest limit across running sessions: ${usage.label}`} withArrow>
              <Group gap={6} wrap="nowrap">
                <Progress value={Math.min(100, usage.usage * 100)} color={usageColor(usage.usage)} size="sm" w={50} />
                <Text span size="xs">{Math.round(usage.usage * 100)}%</Text>
              </Group>
            </Tooltip>
          );
        },
      },
      {
        id: 'lastRun', header: 'Last run', size: 110, accessorFn: r => (r.lastRun === 'now' ? '9999' : r.lastRun ?? ''),
        Cell: ({ row }) => row.original.lastRun === 'now'
          ? <Text span size="sm" c="green">now</Text>
          : row.original.lastRun ? <ReactTimeAgo date={new Date(row.original.lastRun)} timeStyle="round" /> : <Text span c="dimmed">never</Text>,
      },
    ];
  }, [mode]);

  const table = useMantineReactTable({
    columns,
    data: shown,
    state: { isLoading: strategies.isLoading },
    enableRowActions: true,
    positionActionsColumn: 'last',
    enableColumnFilters: false,
    enableColumnActions: false,
    enableTopToolbar: false,
    enablePagination: false,
    enableBottomToolbar: false,
    initialState: { density: 'xs', sorting: [{ id: 'lifetime', desc: true }] },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    // Also asked for the placeholder row shown when the filters leave nothing, whose data is an empty object.
    mantineTableBodyRowProps: ({ row }) => (row.original.strategy
      ? navigateRowProps(navigate, `/strategies/${row.original.strategy.strategyId}?mode=${mode}`)
      : {}),
    renderRowActions: ({ row }) => {
      const { strategy, state, running: runningCount } = row.original;
      const stop = (e: React.MouseEvent) => e.stopPropagation();
      return (
        <Group gap={2} justify="center" wrap="nowrap" onClick={stop}>
          <Tooltip label="Deploy a session" withArrow openDelay={400}>
            <ActionIcon variant="subtle" color="blue" disabled={strategy.archived} onClick={() => setDeployFor(strategy.strategyId)}>
              <IconRocket size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={state === 'killed' ? 'Resume strategy' : 'Kill strategy'} withArrow openDelay={400}>
            <ActionIcon variant="subtle" color={state === 'killed' ? 'green' : 'red'} disabled={strategy.archived}
              onClick={() => setKillTarget({ strategy, kill: state !== 'killed' })}>
              {state === 'killed' ? <IconPlayerPlay size={16} /> : <IconPlayerStop size={16} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Edit" withArrow openDelay={400}>
            <ActionIcon variant="subtle" color="gray" onClick={() => { setEditTarget(strategy); setFormOpen(true); }}>
              <IconEdit size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={strategy.archived ? 'Unarchive' : runningCount > 0 ? 'Stop its sessions before archiving' : 'Archive'} withArrow openDelay={400}>
            <ActionIcon variant="subtle" color="gray" disabled={!strategy.archived && runningCount > 0}
              onClick={async () => {
                setActionError(null);
                try {
                  await registryApi.updateStrategy(strategy.strategyId, { archived: !strategy.archived });
                  refreshAll();
                } catch (e) {
                  setActionError(errorMessage(e, 'Failed to change the strategy'));
                }
              }}>
              {strategy.archived ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete" withArrow openDelay={400}>
            <ActionIcon variant="subtle" color="red" onClick={() => setDeleteTarget(strategy)}>
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      );
    },
    renderEmptyRowsFallback: () => <Text c="dimmed" size="sm" p="md">No strategies match these filters.</Text>,
  });

  const deleteStrategy = async () => {
    if (!deleteTarget) return;
    setActionError(null);
    try {
      await registryApi.deleteStrategy(deleteTarget.strategyId);
      setDeleteTarget(null);
      refreshAll();
    } catch (e) {
      setActionError(errorMessage(e, 'Failed to delete strategy'));
    }
  };

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="xs" wrap="wrap">
        <Group gap="sm">
          <Title order={2}>Strategies</Title>
          <LastUpdated at={firm.dataUpdatedAt ? new Date(firm.dataUpdatedAt) : null} intervalMs={POLL.summary} failing={!!firm.error} compact />
        </Group>
        <Group gap="xs">
          <ModeSwitch mode={mode} onChange={setMode} />
          <Button leftSection={<IconPlus size={16} />} onClick={() => { setEditTarget(null); setFormOpen(true); }}>New strategy</Button>
        </Group>
      </Group>
      <ModeBand mode={mode} />

      <Chip.Group multiple value={filters} onChange={setFilters}>
        <Group gap="xs" mb="sm">
          {(['running', 'idle', 'killed', 'archived'] as Filter[]).map(f => (
            <Chip key={f} value={f} size="xs" variant="light">{f.charAt(0).toUpperCase() + f.slice(1)} ({count(f)})</Chip>
          ))}
        </Group>
      </Chip.Group>

      {(strategies.error || actionError) && (
        <Alert color="red" mb="md" withCloseButton={!!actionError} onClose={() => setActionError(null)}>
          {actionError ?? errorMessage(strategies.error, 'Failed to load strategies')}
        </Alert>
      )}
      <MantineReactTable table={table} />

      <StrategyFormModal opened={formOpen} onClose={() => setFormOpen(false)} onSaved={refreshAll} strategy={editTarget} />
      <DeploySessionModal
        opened={deployFor !== null}
        onClose={() => setDeployFor(null)}
        onCreated={(sessionId) => { setDeployFor(null); navigate(`/sessions/${sessionId}`); }}
        preselectedStrategyId={deployFor ?? undefined}
      />
      <ReasonConfirmModal
        opened={!!killTarget}
        onClose={() => setKillTarget(null)}
        title={killTarget?.kill ? 'Kill Strategy' : 'Resume Strategy'}
        message={killTarget?.kill
          ? `This will immediately cancel all open orders for strategy ${killTarget?.strategy.name} and block all of its sessions from sending orders, until resumed. Are you sure?`
          : `This will let strategy ${killTarget?.strategy.name}'s running sessions send orders again. Are you sure?`}
        confirmLabel={killTarget?.kill ? 'Kill strategy' : 'Resume strategy'}
        confirmColor={killTarget?.kill ? 'red' : 'green'}
        onConfirm={async (reason) => {
          if (!killTarget) return;
          const target = { strategyId: killTarget.strategy.strategyId };
          await setKillSwitch(findKillSwitch(policies.data ?? [], target), target, killTarget.kill, reason);
          refreshAll();
        }}
      />
      <Modal opened={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete strategy" size="sm">
        <Stack>
          <Text>Delete strategy <Text span fw={600}>{deleteTarget?.name}</Text>?</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button color="red" onClick={deleteStrategy}>Delete</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default Strategies;
