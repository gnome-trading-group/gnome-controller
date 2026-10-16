import { useMemo, useState } from 'react';
import {
  Alert, Badge, Button, Code, Container, Group, Modal, SegmentedControl, Stack, Table, Tabs, Text, Timeline, Tooltip,
} from '@mantine/core';
import {
  IconArchive, IconCopy, IconEdit, IconFlask, IconPlayerPause, IconPlayerPlay, IconRefresh,
} from '@tabler/icons-react';
import { MantineReactTable, MRT_ColumnDef, useMantineReactTable } from 'mantine-react-table';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LaunchRequest, RequestAction, RuleRevision } from '../../types/launcher';
import { launcherApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { navigateRowProps } from '../../utils/navigation';
import { actorLabel } from '../../utils/launch-status';
import {
  launcherKeys, LAUNCHER_POLL, useRequests, useRule, useRuleActivity, useRuleAttention, useRuleRevisions, useRuleStats, useRuleTypes,
} from '../../query/launcher';
import { useSessionsTotals } from '../../query/hooks';
import { PageHeader } from '../../components/PageHeader';
import { LastUpdated } from '../../components/LastUpdated';
import { Kpi, KpiStrip, ModeBadge, ModeBand } from '../../components/trading/layout';
import { Money, Time } from '../../components/trading/values';
import { RuleEditorModal } from './RuleEditorModal';
import { DryRunModal } from './TriggerModals';
import { RuleConfigView } from './RuleConfigView';
import {
  Ago, NeedsAttentionBadge, NeedsAttentionCard, RequestsTable, RuleStatusBadge, SessionStatusBadge, ShortId, TriggerLogTable,
} from './shared';
import { triggerSummary } from '../../utils/launch-status';

const TABS = ['activity', 'triggers', 'sessions', 'config', 'revisions'] as const;
const DAY = 86_400_000;
// One empty array, so a table with no data yet keeps the same data between renders.
const NO_ROWS: never[] = [];
type Tab = typeof TABS[number];

function RuleDetail() {
  const { ruleId = '' } = useParams<{ ruleId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? params.get('tab') as Tab : 'activity';
  const [days, setDays] = useState(7);
  const [editor, setEditor] = useState<'edit' | 'duplicate' | null>(null);
  const [dryRunOpen, setDryRunOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const ruleQuery = useRule(ruleId);
  const rule = ruleQuery.data;
  const ruleTypes = useRuleTypes();
  const ruleType = ruleTypes.data?.find(t => t.type === rule?.rule_type);
  const attention = useRuleAttention(rule ? [rule] : [], ruleTypes.data);
  const stats = useRuleStats(ruleId, days);
  const requests = useRequests({ rule_id: ruleId }, tab === 'activity');
  const launched = useRequests({ rule_id: ruleId, status: 'LAUNCHED', limit: 100 }, tab === 'sessions' || tab === 'activity');
  const activity = useRuleActivity(ruleId, tab === 'triggers');
  const revisions = useRuleRevisions(ruleId, tab === 'revisions');
  // What of this rule waits on someone, whichever tab is open: approvals, and launches of the last day that failed.
  const pendingLaunches = useRequests({ rule_id: ruleId, status: 'PENDING_APPROVAL' });
  const pendingShutdowns = useRequests({ rule_id: ruleId, status: 'PENDING_SHUTDOWN_APPROVAL' });
  const failedLaunches = useRequests({ rule_id: ruleId, status: 'FAILED', limit: 20 });
  const pending = useMemo(() => [...(pendingLaunches.data ?? []), ...(pendingShutdowns.data ?? [])]
    .sort((a, b) => b.date_created.localeCompare(a.date_created)), [pendingLaunches.data, pendingShutdowns.data]);
  const failed = useMemo(() => (failedLaunches.data ?? []).filter(r => Date.now() - Date.parse(r.date_created) < DAY),
    [failedLaunches.data]);

  const sessionIds = useMemo(() => (launched.data ?? []).flatMap(r => (r.session_id ? [r.session_id] : [])), [launched.data]);
  const live = (launched.data ?? []).some(r => r.session_status && !['STOPPED', 'FAILED', 'MISSING'].includes(r.session_status));
  // A table's data must keep its identity between renders: a freshly built array each time makes the table re-render
  // without end, and a URL change (switching tabs) is a transition that then never gets to commit.
  const sessionRows = useMemo(() => (launched.data ?? []).filter(r => r.session_id), [launched.data]);
  const totals = useSessionsTotals(sessionIds, live);
  const totalsById = useMemo(() => Object.fromEntries((totals.data ?? []).map(t => [t.sessionId, t])), [totals.data]);
  const pnl = (totals.data ?? []).reduce((sum, t) => sum + Number(t.totals.total ?? 0), 0);

  const refresh = () => queryClient.invalidateQueries({ queryKey: launcherKeys.all });
  const setTab = (next: string | null) => setParams(cur => {
    const u = new URLSearchParams(cur);
    u.set('tab', next ?? 'activity');
    return u;
  }, { replace: true });
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
  const setStatus = async (status: 'active' | 'disabled') => {
    if (!rule) return;
    setActionError(null);
    try { await launcherApi.updateRule(rule.rule_id, rule.revision, { status }); refresh(); }
    catch (e) { setActionError(errorMessage(e, 'Could not update the rule')); }
  };
  const archive = async () => {
    setActionError(null);
    try { await launcherApi.archiveRule(ruleId); setArchiveOpen(false); refresh(); }
    catch (e) { setActionError(errorMessage(e, 'Could not archive the rule')); }
  };

  const sessionColumns = useMemo<MRT_ColumnDef<LaunchRequest>[]>(() => [
    { id: 'session', header: 'Session', size: 100, Cell: ({ row }) => <ShortId id={row.original.session_id!} to={`/sessions/${row.original.session_id}`} /> },
    { id: 'status', header: 'Status', size: 110, Cell: ({ row }) => <SessionStatusBadge status={row.original.session_status} /> },
    { id: 'trigger', header: 'Trigger', size: 260, Cell: ({ row }) => <Text size="xs" ff="monospace" c="dimmed" truncate maw={300}>{triggerSummary(row.original.data)}</Text> },
    { id: 'started', header: 'Started', size: 160, Cell: ({ row }) => <Time value={row.original.session_started_at ?? row.original.date_created} size="sm" /> },
    { id: 'stopped', header: 'Ended', size: 160, Cell: ({ row }) => <Time value={row.original.session_stopped_at} size="sm" /> },
    {
      id: 'fills', header: 'Fills', size: 70,
      mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
      Cell: ({ row }) => totalsById[row.original.session_id!]?.fills ?? '—',
    },
    {
      id: 'pnl', header: 'PnL', size: 100,
      mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
      Cell: ({ row }) => <Money value={totalsById[row.original.session_id!]?.totals.total} size="sm" />,
    },
  ], [totalsById]);
  const sessionTable = useMantineReactTable({
    columns: sessionColumns,
    data: sessionRows,
    state: { isLoading: launched.isLoading },
    enableColumnFilters: false, enableColumnActions: false, enableSorting: false, enableTopToolbar: false,
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 20 } },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }) => navigateRowProps(navigate, `/launcher/requests/${row.original.request_id}`),
    renderEmptyRowsFallback: () => <Text c="dimmed" size="sm" p="md">This rule hasn't launched a session yet.</Text>,
  });

  const s = stats.data;
  const passed = s ? Object.entries(s.outcomes).filter(([o]) => o !== 'REQUESTED').reduce((n, [, c]) => n + (c ?? 0), 0) : undefined;
  const mode = rule?.parameters.mode ? String(rule.parameters.mode) : undefined;

  return (
    <Container size="xl" py="xl">
      <PageHeader
        onBack={() => navigate('/launcher')}
        title={rule?.name ?? 'Launch rule'}
        badges={rule && (
          <>
            <RuleStatusBadge status={rule.status} />
            <NeedsAttentionBadge reasons={attention[rule.rule_id]} />
            <Badge variant="outline" color="gray">{ruleType?.display_name ?? rule.rule_type}</Badge>
            {mode && <ModeBadge mode={mode} />}
            <LastUpdated at={ruleQuery.dataUpdatedAt ? new Date(ruleQuery.dataUpdatedAt) : null} intervalMs={LAUNCHER_POLL.lists}
              failing={!!ruleQuery.error} compact />
          </>
        )}
        actions={rule && rule.status !== 'archived' && (
          <>
            {rule.status === 'active'
              ? <Button variant="light" color="gray" leftSection={<IconPlayerPause size={16} />} onClick={() => setStatus('disabled')}>Disable</Button>
              : <Button variant="light" color="green" leftSection={<IconPlayerPlay size={16} />} onClick={() => setStatus('active')}>Enable</Button>}
            <Button leftSection={<IconEdit size={16} />} onClick={() => setEditor('edit')}>Edit</Button>
          </>
        )}
        menu={[
          { label: 'Dry run', icon: <IconFlask size={16} />, onClick: () => setDryRunOpen(true), disabled: !rule },
          { label: 'Duplicate', icon: <IconCopy size={16} />, onClick: () => setEditor('duplicate'), disabled: !rule },
          { label: 'Archive', icon: <IconArchive size={16} />, onClick: () => setArchiveOpen(true), color: 'red', disabled: !rule || rule.status === 'archived' },
          { label: 'Refresh', icon: <IconRefresh size={16} />, onClick: refresh },
        ]}
        meta={rule ? [
          `revision ${rule.revision}, saved by ${actorLabel(rule.modified_by)}`,
          <>edited <Time value={rule.date_modified} size="sm" precision="minute" /></>,
          rule.description && <Text size="sm" c="dimmed" truncate maw={480}>{rule.description}</Text>,
        ] : []}
      />
      {mode && <ModeBand mode={mode} />}

      {ruleQuery.error && <Alert color="red" title="Error" mb="md">{errorMessage(ruleQuery.error, 'Failed to load the rule')}</Alert>}
      {actionError && <Alert color="red" mb="md" withCloseButton onClose={() => setActionError(null)}>{actionError}</Alert>}
      {rule?.status === 'archived' && (
        <Alert color="gray" mb="md">Archived: it launches nothing, but still stops the sessions it launched when their shutdown triggers arrive.</Alert>
      )}
      {rule?.status === 'disabled' && (
        <Alert color="yellow" mb="md">Disabled: it launches nothing, but still stops the sessions it launched.</Alert>
      )}
      <NeedsAttentionCard pending={pending} failed={failed} onAct={act} showRule={false} />

      <Group justify="flex-end" mb={6}>
        <SegmentedControl size="xs" value={String(days)} onChange={v => setDays(Number(v))}
          data={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }]} />
      </Group>
      <KpiStrip>
        <Kpi label="Running" hint="Sessions this rule launched that haven't ended"
          value={s ? `${s.running_sessions.length}${rule?.max_concurrent_sessions ? ` / ${rule.max_concurrent_sessions}` : ''}` : '—'} />
        <Kpi label="Launched" value={s?.launches.LAUNCHED ?? '—'} />
        <Kpi label="Failed" value={s?.launches.FAILED ?? '—'} />
        <Kpi label="Passed on" hint="Triggers it didn't act on: repeats, rate limits, no match, blocked" value={passed ?? '—'} />
        <Kpi label="Last launch" value={<Ago value={s?.last_launch_at} />} />
        <Kpi label="Session PnL" hint={`Across the last ${sessionIds.length} sessions it launched`}
          value={sessionIds.length ? <Money value={String(pnl)} arrow /> : '—'} />
      </KpiStrip>

      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List mb="sm">
          <Tabs.Tab value="activity">Launches &amp; shutdowns</Tabs.Tab>
          <Tabs.Tab value="triggers">Trigger log</Tabs.Tab>
          <Tabs.Tab value="sessions">Sessions</Tabs.Tab>
          <Tabs.Tab value="config">Configuration</Tabs.Tab>
          <Tabs.Tab value="revisions">Revisions</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="activity">
          <RequestsTable showRule={false} rows={requests.data ?? NO_ROWS} loading={requests.isLoading} hasMore={!!requests.hasNextPage}
            loadingMore={requests.isFetchingNextPage} onLoadMore={() => requests.fetchNextPage()}
            empty="This rule hasn't launched or stopped anything yet." />
        </Tabs.Panel>
        <Tabs.Panel value="triggers">
          <TriggerLogTable showRule={false} rows={activity.data ?? NO_ROWS} loading={activity.isLoading} hasMore={!!activity.hasNextPage}
            loadingMore={activity.isFetchingNextPage} onLoadMore={() => activity.fetchNextPage()}
            empty="No triggers reached this rule in the last 30 days." />
        </Tabs.Panel>
        <Tabs.Panel value="sessions">
          <MantineReactTable table={sessionTable} />
        </Tabs.Panel>
        <Tabs.Panel value="config">
          {rule && <RuleConfigView rule={rule} ruleType={ruleType} />}
        </Tabs.Panel>
        <Tabs.Panel value="revisions">
          <Revisions revisions={revisions.data ?? []} loading={revisions.isLoading} />
        </Tabs.Panel>
      </Tabs>

      <RuleEditorModal opened={editor !== null} onClose={() => setEditor(null)} ruleTypes={ruleTypes.data ?? []}
        rule={rule} duplicate={editor === 'duplicate'}
        onSaved={saved => {
          const wasDuplicate = editor === 'duplicate';
          setEditor(null);
          refresh();
          if (wasDuplicate) navigate(`/launcher/rules/${saved.rule_id}`);
        }} />
      {rule && <DryRunModal opened={dryRunOpen} onClose={() => setDryRunOpen(false)} rule={rule} ruleType={ruleType} />}
      <Modal opened={archiveOpen} onClose={() => setArchiveOpen(false)} title="Archive rule" size="sm">
        <Stack>
          <Text size="sm">
            Archive <b>{rule?.name}</b>? It stops launching for good, keeps its history, and still stops the sessions it
            launched when their shutdown triggers arrive.
          </Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>Cancel</Button>
            <Button color="red" onClick={archive}>Archive</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

// Each saved version, newest first, with what changed from the one before it.
function Revisions({ revisions, loading }: { revisions: RuleRevision[]; loading: boolean }) {
  if (loading) return <Text size="sm" c="dimmed">Loading…</Text>;
  if (!revisions.length) return <Text size="sm" c="dimmed">No revisions recorded.</Text>;
  return (
    <Timeline bulletSize={18} lineWidth={2} active={0}>
      {revisions.map((rev, i) => {
        const previous = revisions[i + 1]?.rule;
        return (
          <Timeline.Item key={rev.revision} title={<Group gap="xs"><Text fw={600} size="sm">Revision {rev.revision}</Text>
            <Text size="xs" c="dimmed">{actorLabel(rev.actor)} · <Time value={rev.at} size="xs" precision="minute" /></Text></Group>}>
            {previous ? (
              <Table withRowBorders fz="xs" mt={4} maw={900}>
                <Table.Tbody>
                  {rev.changed.map(field => (
                    <Diff key={field} field={field} before={previous[field as keyof typeof previous]} after={rev.rule[field as keyof typeof rev.rule]} />
                  ))}
                </Table.Tbody>
              </Table>
            ) : <Text size="xs" c="dimmed">Created.</Text>}
          </Timeline.Item>
        );
      })}
    </Timeline>
  );
}

// One changed field; for parameters, only the keys that differ.
function Diff({ field, before, after }: { field: string; before: unknown; after: unknown }) {
  if (field === 'parameters' && before && after && typeof before === 'object' && typeof after === 'object') {
    const b = before as Record<string, unknown>, a = after as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(k => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
    return <>{keys.map(k => <Diff key={k} field={`parameters.${k}`} before={b[k]} after={a[k]} />)}</>;
  }
  const show = (v: unknown) => (v === undefined ? <Text span c="dimmed">unset</Text> : <Code>{JSON.stringify(v)}</Code>);
  return (
    <Table.Tr>
      <Table.Td ff="monospace" w={220}>{field}</Table.Td>
      <Table.Td><Tooltip label="before" withArrow><span>{show(before)}</span></Tooltip></Table.Td>
      <Table.Td>→</Table.Td>
      <Table.Td>{show(after)}</Table.Td>
    </Table.Tr>
  );
}

export default RuleDetail;

