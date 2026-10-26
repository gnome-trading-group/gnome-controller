import { useEffect, useMemo, useState } from 'react';
import {
  Anchor, Badge, Button, Chip, CloseButton, Container, Group, SegmentedControl, Select, Stack, Switch, Text, Title, Tooltip,
} from '@mantine/core';
import { IconBook, IconUserCheck } from '@tabler/icons-react';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row, type MRT_RowSelectionState } from 'mantine-react-table';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import {
  Alert, alertContext, AlertFilters, AlertSeverity, AlertStatus, canAcknowledge, SEVERITIES, SEVERITY_COLORS, SEVERITY_LABEL, triageOrder,
} from '../../types';
import { useAcknowledgeAlerts, useAlertFacets, useAlerts, useStrategies } from '../../query/hooks';
import { useUrlTableState } from '../../hooks/useUrlTableState';
import { AcknowledgeAction } from '../../components/system/AlertItem';
import { ReasonConfirmModal } from '../../components/ReasonConfirmModal';
import { formatActor } from '../../utils/kill-switch';

// Everything open fits in one read, so the open view sorts and groups in the browser; history pages from the server.
const OPEN_LIMIT = 500;
const OPEN: AlertStatus[] = ['PENDING', 'FIRING'];
// Info is for the record; it's a click away rather than in the way.
const DEFAULT_SEVERITIES: AlertSeverity[] = ['CRITICAL', 'ERROR', 'WARNING'];

function SeverityBadge({ severity, resolved }: { severity: AlertSeverity; resolved?: boolean }) {
  return (
    <Badge size="sm" variant="light" color={resolved ? 'gray' : SEVERITY_COLORS[severity]}>{SEVERITY_LABEL[severity]}</Badge>
  );
}

function StateCell({ alert }: { alert: Alert }) {
  if (alert.status === 'RESOLVED') {
    return (
      <Text size="xs" c="dimmed">
        Resolved {alert.resolvedAt && <ReactTimeAgo date={new Date(alert.resolvedAt)} timeStyle="round" />}
      </Text>
    );
  }
  if (alert.acknowledgedBy) {
    return (
      <Tooltip multiline maw={300} withArrow label={<>
        {formatActor(alert.acknowledgedBy)}
        {alert.acknowledgedAt && <> · <ReactTimeAgo date={new Date(alert.acknowledgedAt)} timeStyle="round" /></>}
        {alert.acknowledgedReason && <>: {alert.acknowledgedReason}</>}
      </>}>
        <Badge size="sm" variant="light" color="green" leftSection={<IconUserCheck size={11} />}>Acknowledged</Badge>
      </Tooltip>
    );
  }
  return <Badge size="sm" variant="outline" color={alert.status === 'PENDING' ? 'gray' : 'red'}>{alert.status === 'PENDING' ? 'Pending' : 'Open'}</Badge>;
}

function list<T extends string>(value: string): T[] {
  return value ? value.split(',').filter(Boolean) as T[] : [];
}

// Every alert, worst and untaken first while open, newest first in history. Filters live in the URL, so a view can be
// linked. Acknowledging stops an alert's page and marks it taken in Slack; an ongoing problem stays open until it
// clears, so it can't page again in the meantime.
function Alerts() {
  const { pagination, setPagination, getParam, setParam } = useUrlTableState({ defaultPageSize: 50 });
  const view = getParam('view') === 'all' ? 'all' : 'open';
  const severityParam = getParam('severity');
  const severities = useMemo(() => severityParam ? list<AlertSeverity>(severityParam) : DEFAULT_SEVERITIES, [severityParam]);
  const typeParam = getParam('type');
  const types = useMemo(() => list<string>(typeParam), [typeParam]);
  const strategyId = Number(getParam('strategy')) || undefined;
  const sessionId = getParam('session') || undefined;
  const grouped = view === 'open' && getParam('group') === 'type';

  const scope: AlertFilters = {
    status: view === 'open' ? OPEN : undefined,
    severity: severities.length < SEVERITIES.length ? severities : undefined,
    type: types.length > 0 ? types : undefined,
    strategyId,
    sessionId,
  };
  const facets = useAlertFacets(scope);
  const alerts = useAlerts(view === 'open'
    ? { ...scope, limit: OPEN_LIMIT }
    : { ...scope, limit: pagination.pageSize, offset: pagination.pageIndex * pagination.pageSize });
  const strategies = useStrategies();
  const rows = useMemo(() => view === 'open' ? triageOrder(alerts.data ?? []) : alerts.data ?? [], [view, alerts.data]);
  const total = severities.reduce((sum, s) => sum + (facets.data?.severity[s] ?? 0), 0);

  const [rowSelection, setRowSelection] = useState<MRT_RowSelectionState>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const acknowledge = useAcknowledgeAlerts();
  const selected = rows.filter(a => rowSelection[a.alertId] && canAcknowledge(a));
  useEffect(() => setRowSelection({}), [view, severityParam, typeParam, strategyId, sessionId]);

  const setSeverities = (next: string[]) => {
    const value = next.length > 0 ? next : SEVERITIES;
    const isDefault = value.length === DEFAULT_SEVERITIES.length && DEFAULT_SEVERITIES.every(s => value.includes(s));
    setParam('severity', isDefault ? '' : SEVERITIES.filter(s => value.includes(s)).join(','));
  };
  const typeCounts = Object.entries(facets.data?.type ?? {}).sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  for (const t of types) if (!typeCounts.some(([name]) => name === t)) typeCounts.push([t, 0]);

  const columns = useMemo<MRT_ColumnDef<Alert>[]>(() => [
    {
      id: 'severity',
      header: 'Severity',
      size: 100,
      accessorFn: a => SEVERITIES.indexOf(a.severity),
      aggregationFn: 'min',
      Cell: ({ row }: { row: MRT_Row<Alert> }) => (
        <SeverityBadge severity={row.original.severity} resolved={row.original.status === 'RESOLVED'} />
      ),
      AggregatedCell: ({ cell }) => <SeverityBadge severity={SEVERITIES[cell.getValue<number>()]} />,
    },
    {
      accessorKey: 'type',
      header: 'Type',
      size: 170,
      Cell: ({ row }: { row: MRT_Row<Alert> }) => <Text size="xs" ff="monospace">{row.original.type}</Text>,
    },
    {
      accessorKey: 'title',
      header: 'Alert',
      size: 380,
      Cell: ({ row }: { row: MRT_Row<Alert> }) => {
        const a = row.original;
        return (
          <Stack gap={0} style={{ minWidth: 0 }}>
            {a.sessionId ? (
              <Anchor component={Link} to={`/sessions/${a.sessionId}`} size="sm" fw={500} lineClamp={1}>{a.title}</Anchor>
            ) : <Text size="sm" fw={500} lineClamp={1}>{a.title}</Text>}
            {a.body && <Text size="xs" c="dimmed" lineClamp={1} title={a.body}>{a.body}</Text>}
          </Stack>
        );
      },
    },
    {
      id: 'context',
      header: 'Context',
      size: 200,
      // The table's loading skeleton rows are blank placeholders with no labels.
      accessorFn: a => a.labels ? [...alertContext(a), a.mode].filter(Boolean).join(' · ') : '',
      Cell: ({ cell }) => <Text size="xs" lineClamp={2}>{cell.getValue<string>() || '—'}</Text>,
    },
    {
      accessorKey: 'firstSeen',
      header: 'First seen',
      size: 110,
      aggregationFn: 'max',
      Cell: ({ cell }) => (
        <Tooltip label={new Date(cell.getValue<string>()).toLocaleString()} withArrow openDelay={300}>
          <Text size="xs"><ReactTimeAgo date={new Date(cell.getValue<string>())} timeStyle="round" /></Text>
        </Tooltip>
      ),
      AggregatedCell: ({ cell }) => (
        <Text size="xs" c="dimmed">latest <ReactTimeAgo date={new Date(cell.getValue<string>())} timeStyle="round" /></Text>
      ),
    },
    {
      accessorKey: 'fireCount',
      header: 'Seen',
      size: 70,
      Cell: ({ cell }) => <Text size="xs">{cell.getValue<number>() > 1 ? `×${cell.getValue<number>()}` : ''}</Text>,
    },
    {
      id: 'state',
      header: 'State',
      size: 120,
      accessorFn: a => a.status === 'RESOLVED' ? 2 : a.acknowledgedBy ? 1 : 0,
      Cell: ({ row }: { row: MRT_Row<Alert> }) => <StateCell alert={row.original} />,
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: rows,
    getRowId: a => String(a.alertId),
    state: {
      isLoading: alerts.isLoading,
      rowSelection,
      grouping: grouped ? ['type'] : [],
      ...(view === 'all' ? { pagination } : {}),
    },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: (row: MRT_Row<Alert>) => row.getIsGrouped()
      ? row.getLeafRows().some(r => canAcknowledge(r.original))
      : canAcknowledge(row.original),
    enableGrouping: view === 'open',
    enableColumnDragging: false,
    groupedColumnMode: 'remove',
    enableSorting: view === 'open',
    enableColumnFilters: false,
    enableGlobalFilter: view === 'open',
    enableColumnActions: false,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableHiding: false,
    manualPagination: view === 'all',
    rowCount: view === 'all' ? total : undefined,
    onPaginationChange: view === 'all' ? setPagination : undefined,
    enableRowActions: true,
    positionActionsColumn: 'last',
    renderRowActions: ({ row }: { row: MRT_Row<Alert> }) => row.getIsGrouped() ? null : (
      <Group gap={2} wrap="nowrap">
        {row.original.runbookUrl && (
          <Tooltip label="Runbook" withArrow openDelay={300}>
            <Anchor href={row.original.runbookUrl} target="_blank" aria-label="Runbook" style={{ display: 'flex' }} p={3}>
              <IconBook size={14} />
            </Anchor>
          </Tooltip>
        )}
        {canAcknowledge(row.original) && <AcknowledgeAction alerts={[row.original]} />}
      </Group>
    ),
    renderTopToolbarCustomActions: () => (
      <Group gap="sm">
        <Button size="xs" leftSection={<IconUserCheck size={14} />} disabled={selected.length === 0}
          onClick={() => setBulkOpen(true)}>
          Acknowledge {selected.length > 0 ? selected.length : ''} selected
        </Button>
        {view === 'open' && (
          <Switch size="xs" label="Group by type" checked={grouped}
            onChange={e => setParam('group', e.currentTarget.checked ? 'type' : '')} />
        )}
      </Group>
    ),
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 50 }, showGlobalFilter: true },
    mantineTableProps: { striped: true, highlightOnHover: true },
    mantineTableBodyRowProps: ({ row }: { row: MRT_Row<Alert> }) => ({
      style: !row.getIsGrouped() && !canAcknowledge(row.original) ? { opacity: 0.6 } : undefined,
    }),
    mantineSearchTextInputProps: { placeholder: 'Search alerts' },
  });

  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="md">Alerts</Title>
      <Stack gap="sm" mb="md">
        <Group align="center" gap="md">
          <SegmentedControl value={view} onChange={v => setParam('view', v === 'all' ? 'all' : '')}
            data={[{ label: 'Open', value: 'open' }, { label: 'History', value: 'all' }]} />
          <Chip.Group multiple value={severities} onChange={setSeverities}>
            <Group gap={6}>
              {SEVERITIES.map(s => (
                <Chip key={s} value={s} size="xs" color={SEVERITY_COLORS[s]} variant="light">
                  {SEVERITY_LABEL[s]} {facets.data?.severity[s] ?? 0}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
          <Select placeholder="Any strategy" size="xs" w={200} searchable clearable
            data={(strategies.data ?? []).map(s => ({ value: String(s.strategyId), label: s.name }))}
            value={strategyId ? String(strategyId) : null} onChange={v => setParam('strategy', v ?? '')} />
          {sessionId && (
            <Badge variant="light" color="gray" size="lg" rightSection={
              <CloseButton size="xs" onClick={() => setParam('session', '')} aria-label="Clear session" />
            }>
              Session {sessionId}
            </Badge>
          )}
        </Group>
        {typeCounts.length > 0 && (
          <Chip.Group multiple value={types} onChange={v => setParam('type', v.join(','))}>
            <Group gap={6}>
              {typeCounts.map(([t, n]) => (
                <Chip key={t} value={t} size="xs" variant="outline">{t} {n}</Chip>
              ))}
              {types.length > 0 && (
                <Button variant="subtle" size="compact-xs" color="gray" onClick={() => setParam('type', '')}>Any type</Button>
              )}
            </Group>
          </Chip.Group>
        )}
      </Stack>
      {alerts.error ? (
        <Text c="red" size="sm">Couldn't load alerts: {alerts.error instanceof Error ? alerts.error.message : String(alerts.error)}</Text>
      ) : <MantineReactTable table={table} />}
      <ReasonConfirmModal
        opened={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title={`Acknowledge ${selected.length} alert${selected.length === 1 ? '' : 's'}`}
        message="Ongoing problems stay open, quietly, until they clear; reported events close. Slack and incident.io are told within a minute."
        confirmLabel="Acknowledge"
        confirmColor="green"
        reasonDescription="Shown on each alert and in Slack"
        onConfirm={async reason => {
          await acknowledge(selected.map(a => a.alertId), reason);
          setRowSelection({});
        }}
      />
    </Container>
  );
}

export default Alerts;
