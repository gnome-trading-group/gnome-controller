import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon, Alert, Anchor, Badge, Button, Chip, Container, Group, Notification, Select, Stack, Switch, Tabs, Text, Title,
  Tooltip,
} from '@mantine/core';
import { IconBolt, IconCheck, IconPlus, IconRefresh } from '@tabler/icons-react';
import { MantineReactTable, MRT_ColumnDef, useMantineReactTable } from 'mantine-react-table';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { LaunchRequest, LaunchRule, RequestAction, RequestStatus, RuleStats } from '../../types/launcher';
import { launcherApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { navigateRowProps } from '../../utils/navigation';
import { REQUEST_STATUS_LABELS } from '../../utils/launch-status';
import { launcherKeys, LAUNCHER_POLL, useRequests, useRuleAttention, useRuleTypes, useRules, useTriggers } from '../../query/launcher';
import { LastUpdated } from '../../components/LastUpdated';
import { Kpi, KpiStrip, ModeBadge } from '../../components/trading/layout';
import { RuleEditorModal } from './RuleEditorModal';
import { SendTriggerModal } from './TriggerModals';
import { Ago, NeedsAttentionBadge, NeedsAttentionCard, RequestsTable, RuleStatusBadge, ShortId, TriggerLogTable } from './shared';

const DAY = 86_400_000;
const STATS_DAYS = 7;

function Launcher() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'triggers' ? 'triggers' : 'requests';
  const [showArchived, setShowArchived] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [triggerType, setTriggerType] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [queued, setQueued] = useState<string | null>(null);

  const ruleTypes = useRuleTypes();
  const rules = useRules();
  const attention = useRuleAttention(rules.data ?? [], ruleTypes.data);
  const recent = useRequests({ limit: 200 });
  const requests = useRequests({ status: statusFilter ?? undefined, action: (actionFilter ?? undefined) as 'launch' | 'shutdown' | undefined },
    tab === 'requests');
  const triggers = useTriggers(triggerType ?? undefined, tab === 'triggers');
  const visibleRules = useMemo(
    () => (rules.data ?? []).filter(r => showArchived || r.status !== 'archived').sort((a, b) => a.name.localeCompare(b.name)),
    [rules.data, showArchived],
  );
  const stats = useQueries({
    queries: visibleRules.map(r => ({
      queryKey: launcherKeys.stats(r.rule_id, STATS_DAYS),
      queryFn: () => launcherApi.ruleStats(r.rule_id, STATS_DAYS),
      refetchInterval: LAUNCHER_POLL.stats,
    })),
  });
  const statsById = useMemo(
    () => Object.fromEntries(visibleRules.map((r, i) => [r.rule_id, stats[i]?.data])) as Record<string, RuleStats | undefined>,
    [visibleRules, stats],
  );
  const typeName = useMemo(
    () => Object.fromEntries((ruleTypes.data ?? []).map(t => [t.type, t.display_name])),
    [ruleTypes.data],
  );

  const recentRows = useMemo(() => recent.data ?? [], [recent.data]);
  const dayAgo = Date.now() - DAY;
  const lastDay = recentRows.filter(r => Date.parse(r.date_created) >= dayAgo && r.action === 'launch');
  const pending = recentRows.filter(r => r.status === 'PENDING_APPROVAL' || r.status === 'PENDING_SHUTDOWN_APPROVAL');
  const failed = lastDay.filter(r => r.status === 'FAILED');
  const running = Object.values(statsById).reduce((n, s) => n + (s?.running_sessions.length ?? 0), 0);

  const refresh = () => queryClient.invalidateQueries({ queryKey: launcherKeys.all });

  // A trigger is handled within seconds of being queued: say so, and re-read the lists while its outcome lands.
  useEffect(() => {
    if (!queued) return;
    const timers = [3_000, 8_000].map(ms => setTimeout(() => queryClient.invalidateQueries({ queryKey: launcherKeys.all }), ms));
    const hide = setTimeout(() => setQueued(null), 8_000);
    return () => { timers.forEach(clearTimeout); clearTimeout(hide); };
  }, [queued, queryClient]);
  const act = async (request: LaunchRequest, action: RequestAction) => {
    setActionError(null);
    try {
      const result = await launcherApi.actOnRequest(request.request_id, action);
      await refresh();
      if (action === 'retry') navigate(`/launcher/requests/${result.request_id}`);
    } catch (e) {
      setActionError(errorMessage(e, `Could not ${action} the request`));
    }
  };
  const toggleRule = async (rule: LaunchRule) => {
    setActionError(null);
    try {
      await launcherApi.updateRule(rule.rule_id, rule.revision, { status: rule.status === 'active' ? 'disabled' : 'active' });
      refresh();
    } catch (e) {
      setActionError(errorMessage(e, `Could not update ${rule.name}`));
    }
  };

  const ruleColumns = useMemo<MRT_ColumnDef<LaunchRule>[]>(() => [
    {
      id: 'on', header: 'On', size: 60,
      Cell: ({ row }) => row.original.status === 'archived' ? <RuleStatusBadge status="archived" /> : (
        <Switch checked={row.original.status === 'active'} onClick={e => e.stopPropagation()} onChange={() => toggleRule(row.original)} />
      ),
    },
    {
      id: 'name', header: 'Rule', size: 220,
      Cell: ({ row }) => (
        <Stack gap={0}>
          <Group gap={6} wrap="nowrap">
            <Anchor component={Link} to={`/launcher/rules/${row.original.rule_id}`} fw={500} onClick={e => e.stopPropagation()}>
              {row.original.name}
            </Anchor>
            <NeedsAttentionBadge reasons={attention[row.original.rule_id]} />
          </Group>
          <Text size="xs" c="dimmed">{typeName[row.original.rule_type] ?? row.original.rule_type}</Text>
        </Stack>
      ),
    },
    {
      id: 'mode', header: 'Mode', size: 80,
      Cell: ({ row }) => row.original.parameters.mode ? <ModeBadge mode={String(row.original.parameters.mode)} size="sm" /> : null,
    },
    {
      id: 'path', header: 'Launches', size: 110,
      Cell: ({ row }) => (
        <Badge variant="outline" color={row.original.launch_path === 'auto' ? 'green' : 'orange'} size="sm">
          {row.original.launch_path === 'auto' ? 'automatic' : 'approval'}
        </Badge>
      ),
    },
    {
      id: 'running', header: 'Running', size: 90,
      mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
      Cell: ({ row }) => {
        const s = statsById[row.original.rule_id];
        const cap = row.original.max_concurrent_sessions;
        return s ? `${s.running_sessions.length}${cap ? ` / ${cap}` : ''}` : '—';
      },
    },
    {
      id: 'week', header: `Last ${STATS_DAYS}d`, size: 230,
      Cell: ({ row }) => {
        const s = statsById[row.original.rule_id];
        if (!s) return <Text span c="dimmed">—</Text>;
        const skipped = Object.entries(s.outcomes).filter(([o]) => o !== 'REQUESTED').reduce((n, [, c]) => n + (c ?? 0), 0);
        return (
          <Group gap={6} wrap="nowrap">
            <Badge color="green" variant="light" size="sm">{s.launches.LAUNCHED ?? 0} launched</Badge>
            {(s.launches.FAILED ?? 0) > 0 && <Badge color="red" variant="light" size="sm">{s.launches.FAILED} failed</Badge>}
            <Tooltip label="Triggers the rule passed on: repeats, rate limits, no match, blocked" withArrow>
              <Badge color="gray" variant="light" size="sm">{skipped} passed</Badge>
            </Tooltip>
          </Group>
        );
      },
    },
    { id: 'last', header: 'Last launch', size: 110, Cell: ({ row }) => <Ago value={statsById[row.original.rule_id]?.last_launch_at} /> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [statsById, typeName, attention]);

  const ruleTable = useMantineReactTable({
    columns: ruleColumns,
    data: visibleRules,
    state: { isLoading: rules.isLoading },
    enableColumnFilters: false, enableColumnActions: false, enableSorting: false, enableTopToolbar: false,
    enablePagination: false, enableBottomToolbar: false,
    initialState: { density: 'xs' },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }) => navigateRowProps(navigate, `/launcher/rules/${row.original.rule_id}`),
    renderEmptyRowsFallback: () => (
      <Text c="dimmed" size="sm" p="md">No launch rules yet. A rule decides which triggers start a session, and how.</Text>
    ),
  });

  const setTab = (next: string | null) => setParams(cur => {
    const u = new URLSearchParams(cur);
    u.set('tab', next ?? 'requests');
    return u;
  }, { replace: true });
  const loadError = rules.error ?? recent.error;

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Group gap="sm">
          <Title order={2}>Launcher</Title>
          <LastUpdated at={rules.dataUpdatedAt ? new Date(rules.dataUpdatedAt) : null} intervalMs={LAUNCHER_POLL.lists}
            failing={!!loadError} compact />
        </Group>
        <Group>
          <Tooltip label="Refresh" withArrow openDelay={400}>
            <ActionIcon variant="default" size="lg" onClick={refresh}><IconRefresh size={18} /></ActionIcon>
          </Tooltip>
          <Button variant="default" leftSection={<IconBolt size={16} />} onClick={() => setTriggerOpen(true)}>Send trigger</Button>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditorOpen(true)}>New rule</Button>
        </Group>
      </Group>

      {loadError && <Alert color="red" title="Error" mb="md">{errorMessage(loadError, 'Failed to load the launcher')}</Alert>}
      {actionError && (
        <Alert color="red" mb="md" withCloseButton onClose={() => setActionError(null)}>{actionError}</Alert>
      )}

      <KpiStrip>
        <Kpi label="Active rules" value={(rules.data ?? []).filter(r => r.status === 'active').length} />
        <Kpi label="Launched, 24h" value={lastDay.filter(r => r.status === 'LAUNCHED').length} />
        <Kpi label="Failed, 24h" value={failed.length} />
        <Kpi label="Awaiting approval" value={pending.length} />
        <Kpi label="Sessions running" hint="Sessions the launcher started that haven't ended" value={running} />
        <Kpi label="Triggers, 24h" hint="Distinct triggers any rule saw" value={new Set(
          (triggers.data ?? []).filter(t => Date.parse(t.received_at) >= dayAgo).map(t => t.trigger_id)).size || '—'} />
      </KpiStrip>

      <NeedsAttentionCard pending={pending} failed={failed} onAct={act} />

      <Group justify="space-between" mb="xs">
        <Text fw={600}>Rules</Text>
        <Chip size="xs" variant="light" checked={showArchived} onChange={setShowArchived}>Show archived</Chip>
      </Group>
      <MantineReactTable table={ruleTable} />

      <Tabs value={tab} onChange={setTab} keepMounted={false} mt="xl">
        <Tabs.List mb="sm">
          <Tabs.Tab value="requests">Launches &amp; shutdowns</Tabs.Tab>
          <Tabs.Tab value="triggers">Trigger log</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="requests">
          <Group mb="xs" gap="xs">
            <Select size="xs" placeholder="Any status" clearable w={200} value={statusFilter} onChange={setStatusFilter}
              data={(Object.keys(REQUEST_STATUS_LABELS) as RequestStatus[]).map(s => ({ value: s, label: REQUEST_STATUS_LABELS[s] }))} />
            <Select size="xs" placeholder="Launches and shutdowns" clearable w={200} value={actionFilter} onChange={setActionFilter}
              data={[{ value: 'launch', label: 'Launches' }, { value: 'shutdown', label: 'Shutdowns' }]} />
          </Group>
          <RequestsTable rows={requests.data ?? []} loading={requests.isLoading} hasMore={!!requests.hasNextPage}
            loadingMore={requests.isFetchingNextPage} onLoadMore={() => requests.fetchNextPage()}
            empty="Nothing launched or stopped yet." />
        </Tabs.Panel>
        <Tabs.Panel value="triggers">
          <Group mb="xs">
            <Select size="xs" placeholder="Every rule type" clearable w={200} value={triggerType} onChange={setTriggerType}
              data={(ruleTypes.data ?? []).map(t => ({ value: t.type, label: t.display_name }))} />
          </Group>
          <TriggerLogTable rows={triggers.data ?? []} loading={triggers.isLoading} hasMore={!!triggers.hasNextPage}
            loadingMore={triggers.isFetchingNextPage} onLoadMore={() => triggers.fetchNextPage()}
            empty="No triggers in the last 30 days." />
        </Tabs.Panel>
      </Tabs>

      <RuleEditorModal opened={editorOpen} onClose={() => setEditorOpen(false)} ruleTypes={ruleTypes.data ?? []}
        onSaved={rule => { setEditorOpen(false); refresh(); navigate(`/launcher/rules/${rule.rule_id}`); }} />
      <SendTriggerModal opened={triggerOpen} onClose={() => setTriggerOpen(false)} ruleTypes={ruleTypes.data ?? []}
        onSent={id => { setQueued(id); refresh(); }} />
      {queued && (
        <Notification color="green" icon={<IconCheck size={18} />} title="Trigger queued" onClose={() => setQueued(null)}
          style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1000, maxWidth: 380 }}>
          <ShortId id={queued} /> is with the launcher; its outcome shows in the trigger log within seconds.
        </Notification>
      )}
    </Container>
  );
}

export default Launcher;
