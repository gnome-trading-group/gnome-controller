import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ActionIcon, Anchor, Badge, Button, ButtonProps, Card, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconRotateClockwise, IconX } from '@tabler/icons-react';
import { MantineReactTable, MRT_ColumnDef, useMantineReactTable } from 'mantine-react-table';
import { Link, useNavigate } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { LaunchRequest, RequestAction, RequestStatus, RuleStatus, TriggerEvaluation, TriggerOutcome } from '../../types/launcher';
import { StrategySessionStatus } from '../../types';
import {
  OUTCOME_COLORS, OUTCOME_LABELS, REQUEST_STATUS_COLORS, REQUEST_STATUS_LABELS, RULE_STATUS_COLORS, triggerSummary,
} from '../../utils/launch-status';
import { SESSION_STATUS_COLORS } from '../../utils/session-status';
import { navigateRowProps } from '../../utils/navigation';

export function RequestStatusBadge({ status, size = 'sm' }: { status: RequestStatus; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  return <Badge color={REQUEST_STATUS_COLORS[status] ?? 'gray'} variant="light" size={size}>{REQUEST_STATUS_LABELS[status] ?? status}</Badge>;
}

export function OutcomeBadge({ outcome }: { outcome: TriggerOutcome }) {
  return <Badge color={OUTCOME_COLORS[outcome] ?? 'gray'} variant="light" size="sm">{OUTCOME_LABELS[outcome] ?? outcome}</Badge>;
}

export function RuleStatusBadge({ status }: { status: RuleStatus }) {
  return <Badge color={RULE_STATUS_COLORS[status]} variant="light">{status}</Badge>;
}

// A rule the current launcher would refuse, or that predates the editor's format; the tooltip says why.
export function NeedsAttentionBadge({ reasons }: { reasons: string[] | undefined }) {
  if (!reasons?.length) return null;
  return (
    <Tooltip label={<Stack gap={2}>{reasons.map(r => <Text key={r} size="xs">{r}</Text>)}</Stack>} multiline w={360} withArrow>
      <Badge color="yellow" variant="light" size="sm">Needs attention</Badge>
    </Tooltip>
  );
}

export function ActionBadge({ action }: { action: 'launch' | 'shutdown' }) {
  return <Badge color={action === 'launch' ? 'blue' : 'orange'} variant="outline" size="xs">{action}</Badge>;
}

export function SessionStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return (
    <Badge color={SESSION_STATUS_COLORS[status as StrategySessionStatus] ?? 'gray'} variant="dot" size="sm">
      {status.toLowerCase()}
    </Badge>
  );
}

export function ShortId({ id, to }: { id: string; to?: string }) {
  const text = <Text span ff="monospace" size="sm">{id.slice(0, 8)}</Text>;
  return (
    <Tooltip label={id} openDelay={300} withArrow>
      {to ? <Anchor component={Link} to={to} onClick={e => e.stopPropagation()}>{text}</Anchor> : text}
    </Tooltip>
  );
}

export function Ago({ value }: { value: string | null | undefined }) {
  if (!value) return <Text span c="dimmed">—</Text>;
  return (
    <Tooltip label={new Date(value).toLocaleString()} openDelay={300} withArrow>
      <Text span size="sm"><ReactTimeAgo date={new Date(value)} timeStyle="round" /></Text>
    </Tooltip>
  );
}

function LoadMore({ hasMore, loading, onLoadMore }: { hasMore: boolean; loading: boolean; onLoadMore: () => void }) {
  if (!hasMore) return null;
  return (
    <Group justify="center" mt="sm">
      <Button variant="subtle" size="xs" loading={loading} onClick={onLoadMore}>Load older</Button>
    </Group>
  );
}

interface PagedProps<T> {
  rows: T[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  empty: string;
}

// Launch and shutdown requests, newest first; a row opens the request.
export function RequestsTable({ showRule = true, ...props }: PagedProps<LaunchRequest> & { showRule?: boolean }) {
  const navigate = useNavigate();
  const columns = useMemo<MRT_ColumnDef<LaunchRequest>[]>(() => [
    { id: 'when', header: 'When', size: 110, Cell: ({ row }) => <Ago value={row.original.date_created} /> },
    {
      id: 'status', header: 'Status', size: 170,
      Cell: ({ row }) => (
        <Group gap={6} wrap="nowrap">
          <ActionBadge action={row.original.action} />
          <RequestStatusBadge status={row.original.status} />
        </Group>
      ),
    },
    ...(showRule ? [{
      id: 'rule', header: 'Rule', size: 170,
      Cell: ({ row }: { row: { original: LaunchRequest } }) => (
        <Anchor component={Link} to={`/launcher/rules/${row.original.matched_rule_id}`} size="sm" onClick={e => e.stopPropagation()}>
          {row.original.matched_rule_name}
        </Anchor>
      ),
    } as MRT_ColumnDef<LaunchRequest>] : []),
    {
      id: 'trigger', header: 'Trigger', size: 280,
      Cell: ({ row }) => <Text size="xs" ff="monospace" c="dimmed" truncate maw={320}>{triggerSummary(row.original.data)}</Text>,
    },
    {
      id: 'session', header: 'Session', size: 170,
      Cell: ({ row }) => {
        const r = row.original;
        if (r.action === 'shutdown') return <Text size="sm" c="dimmed">{(r.target_session_ids ?? []).length} session(s)</Text>;
        if (!r.session_id) return <Text span c="dimmed">—</Text>;
        return (
          <Group gap={6} wrap="nowrap">
            <ShortId id={r.session_id} to={`/sessions/${r.session_id}`} />
            <SessionStatusBadge status={r.session_status} />
          </Group>
        );
      },
    },
    {
      id: 'detail', header: '', size: 200,
      Cell: ({ row }) => row.original.launch_error
        ? <Text size="xs" c="red" truncate maw={240}>{row.original.launch_error}</Text>
        : row.original.scheduled_time && row.original.status === 'SCHEDULED'
          ? <Text size="xs" c="dimmed">at {new Date(row.original.scheduled_time).toLocaleString()}</Text>
          : null,
    },
  ], [showRule]);
  const table = useMantineReactTable({
    columns,
    data: props.rows,
    state: { isLoading: props.loading },
    enableColumnFilters: false, enableColumnActions: false, enableSorting: false, enableTopToolbar: false,
    enablePagination: false, enableBottomToolbar: false,
    initialState: { density: 'xs' },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }) => navigateRowProps(navigate, `/launcher/requests/${row.original.request_id}`),
    renderEmptyRowsFallback: () => <Text c="dimmed" size="sm" p="md">{props.empty}</Text>,
  });
  return (
    <Stack gap={0}>
      <MantineReactTable table={table} />
      <LoadMore hasMore={props.hasMore} loading={props.loadingMore} onLoadMore={props.onLoadMore} />
    </Stack>
  );
}

// The trigger log: what each rule made of each trigger, and why. A row that led to a request opens it.
export function TriggerLogTable({ showRule = true, ...props }: PagedProps<TriggerEvaluation> & { showRule?: boolean }) {
  const navigate = useNavigate();
  const columns = useMemo<MRT_ColumnDef<TriggerEvaluation>[]>(() => [
    { id: 'when', header: 'Received', size: 110, Cell: ({ row }) => <Ago value={row.original.received_at} /> },
    {
      id: 'outcome', header: 'Outcome', size: 170,
      Cell: ({ row }) => (
        <Group gap={6} wrap="nowrap">
          <ActionBadge action={row.original.action} />
          <OutcomeBadge outcome={row.original.outcome} />
        </Group>
      ),
    },
    ...(showRule ? [{
      id: 'rule', header: 'Rule', size: 160,
      Cell: ({ row }: { row: { original: TriggerEvaluation } }) => row.original.rule_id === '-'
        ? <Text size="sm" c="dimmed">{row.original.rule_type}</Text>
        : (
          <Anchor component={Link} to={`/launcher/rules/${row.original.rule_id}`} size="sm" onClick={e => e.stopPropagation()}>
            {row.original.rule_name}
          </Anchor>
        ),
    } as MRT_ColumnDef<TriggerEvaluation>] : []),
    {
      id: 'trigger', header: 'Trigger', size: 260,
      Cell: ({ row }) => <Text size="xs" ff="monospace" c="dimmed" truncate maw={300}>{triggerSummary(row.original.data)}</Text>,
    },
    { id: 'reason', header: 'Why', size: 320, Cell: ({ row }) => <Text size="sm">{row.original.reason ?? ''}</Text> },
  ], [showRule]);
  const table = useMantineReactTable({
    columns,
    data: props.rows,
    state: { isLoading: props.loading },
    enableColumnFilters: false, enableColumnActions: false, enableSorting: false, enableTopToolbar: false,
    enablePagination: false, enableBottomToolbar: false,
    initialState: { density: 'xs' },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }) => row.original.request_id
      ? navigateRowProps(navigate, `/launcher/requests/${row.original.request_id}`) : {},
    renderEmptyRowsFallback: () => <Text c="dimmed" size="sm" p="md">{props.empty}</Text>,
  });
  return (
    <Stack gap={0}>
      <MantineReactTable table={table} />
      <LoadMore hasMore={props.hasMore} loading={props.loadingMore} onLoadMore={props.onLoadMore} />
    </Stack>
  );
}

function AttentionRow({ request, label, color, detail, showRule, children }: {
  request: LaunchRequest; label: string; color: string; detail?: string; showRule: boolean; children: ReactNode;
}) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm">
      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
        <Badge color={color} variant="light" size="sm">{label}</Badge>
        {showRule && (
          <Anchor component={Link} to={`/launcher/rules/${request.matched_rule_id}`} size="sm">{request.matched_rule_name}</Anchor>
        )}
        <ShortId id={request.request_id} to={`/launcher/requests/${request.request_id}`} />
        <Text size="xs" ff="monospace" c="dimmed" truncate maw={280}>{detail ?? triggerSummary(request.data)}</Text>
        <Ago value={request.date_created} />
      </Group>
      <Group gap={6} wrap="nowrap">{children}</Group>
    </Group>
  );
}

// Requests waiting on someone: launches and shutdowns to approve or reject, and launches that failed, to retry.
export function NeedsAttentionCard({ pending, failed, onAct, showRule = true }: {
  pending: LaunchRequest[];
  failed: LaunchRequest[];
  onAct: (request: LaunchRequest, action: RequestAction) => void | Promise<unknown>;
  showRule?: boolean;
}) {
  if (pending.length === 0 && failed.length === 0) return null;
  return (
    <Card withBorder mb="md">
      <Text fw={600} mb="xs">Needs attention</Text>
      <Stack gap={6}>
        {pending.map(r => (
          <AttentionRow key={r.request_id} request={r} label={REQUEST_STATUS_LABELS[r.status]} color="yellow" showRule={showRule}>
            <ConfirmButton size="xs" color="green" label="Approve" icon={<IconCheck size={14} />} onConfirm={() => onAct(r, 'approve')} />
            <ConfirmButton size="xs" variant="light" color="gray" label="Reject" icon={<IconX size={14} />}
              onConfirm={() => onAct(r, 'reject')} />
          </AttentionRow>
        ))}
        {failed.map(r => (
          <AttentionRow key={r.request_id} request={r} label="Launch failed" color="red" detail={r.launch_error ?? undefined}
            showRule={showRule}>
            <ConfirmButton size="xs" variant="light" label="Retry" icon={<IconRotateClockwise size={14} />}
              onConfirm={() => onAct(r, 'retry')} />
          </AttentionRow>
        ))}
      </Stack>
    </Card>
  );
}

/**
 * A button that asks before acting: the first click turns it into "<label>?" with a confirm and a cancel, and it goes
 * back on its own after a few seconds. For actions that launch, stop or decide something. While the action it
 * confirmed is running (its promise, if it returns one) the confirm spins, so it never flashes back to the plain button
 * before the result shows.
 */
export function ConfirmButton({ label, icon, onConfirm, loading, size = 'sm', ...button }: {
  label: string;
  icon: ReactNode;
  onConfirm: () => void | Promise<unknown>;
  loading?: boolean;
  size?: 'xs' | 'sm';
} & Pick<ButtonProps, 'color' | 'variant'>) {
  const [armed, setArmed] = useState(false);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!armed || running) return;
    const reset = setTimeout(() => setArmed(false), 5_000);
    return () => clearTimeout(reset);
  }, [armed, running]);
  const confirm = async () => {
    setRunning(true);
    try {
      await onConfirm();
    } finally {
      setRunning(false);
      setArmed(false);
    }
  };

  if (!armed) {
    return <Button size={size} leftSection={icon} loading={loading} onClick={() => setArmed(true)} {...button}>{label}</Button>;
  }
  const iconSize = size === 'xs' ? 14 : 16;
  return (
    <Group gap={4} wrap="nowrap">
      <Text size={size} fw={500}>{label}?</Text>
      <Tooltip label={`Yes, ${label.toLowerCase()}`} withArrow>
        <ActionIcon size={size === 'xs' ? 'md' : 'lg'} variant="filled" color={button.color} loading={running || loading}
          onClick={confirm} aria-label={`Confirm ${label.toLowerCase()}`}>
          <IconCheck size={iconSize} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Never mind" withArrow>
        <ActionIcon size={size === 'xs' ? 'md' : 'lg'} variant="light" color="gray" disabled={running}
          onClick={() => setArmed(false)} aria-label="Cancel">
          <IconX size={iconSize} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
