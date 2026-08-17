import { useState, useEffect, useMemo } from 'react';
import {
  ActionIcon, Badge, Button, Code, Container, Drawer, Group, ScrollArea,
  Select, Stack, Text, Title, Tooltip,
} from '@mantine/core';
import { IconExternalLink, IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { LaunchRequest } from '../../types/launcher';
import { launcherApi } from '../../utils/api';

const STATUS_COLORS: Record<string, string> = {
  PENDING_APPROVAL: 'yellow',
  APPROVED: 'cyan',
  REJECTED: 'red',
  LAUNCHING: 'blue',
  LAUNCHED: 'green',
  FAILED: 'red',
};

const LAUNCH_PATH_COLORS: Record<string, string> = {
  auto: 'green',
  approval: 'orange',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'LAUNCHING', label: 'Launching' },
  { value: 'LAUNCHED', label: 'Launched' },
  { value: 'FAILED', label: 'Failed' },
];

function DetailDrawer({ request, onClose }: { request: LaunchRequest | null; onClose: () => void }) {
  const navigate = useNavigate();
  if (!request) return null;

  const cfg = request.resolved_config;

  return (
    <Drawer
      opened={!!request}
      onClose={onClose}
      title="Launch Request Detail"
      position="right"
      size="lg"
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Badge color={STATUS_COLORS[request.status]} size="lg" variant="light">
            {request.status}
          </Badge>
          <Badge color={LAUNCH_PATH_COLORS[request.launch_path]} variant="outline">
            {request.launch_path}
          </Badge>
        </Group>

        <Stack gap={4}>
          <Text size="xs" c="dimmed">Request ID</Text>
          <Code>{request.request_id}</Code>
        </Stack>

        <Stack gap={4}>
          <Text size="xs" c="dimmed">Rule</Text>
          <Text fw={500}>{request.matched_rule_name}</Text>
          <Text size="xs" c="dimmed">{request.rule_type}</Text>
        </Stack>

        <Stack gap={4}>
          <Text size="xs" c="dimmed">Created</Text>
          <Text size="sm">{new Date(request.date_created).toLocaleString()}</Text>
        </Stack>

        {cfg && (
          <Stack gap={4}>
            <Text size="xs" c="dimmed" fw={600}>Resolved Config</Text>
            <Stack gap={2}>
              <Group gap="xs">
                <Text size="xs" c="dimmed">Strategy:</Text>
                <Text size="xs">{cfg.strategy_class} (ID {cfg.strategy_id})</Text>
              </Group>
              <Group gap="xs">
                <Text size="xs" c="dimmed">Mode:</Text>
                <Badge color={cfg.mode === 'live' ? 'red' : 'violet'} size="xs" variant="light">{cfg.mode}</Badge>
              </Group>
              <Group gap="xs">
                <Text size="xs" c="dimmed">Listings:</Text>
                <Text size="xs" ff="monospace">{cfg.listings}</Text>
              </Group>
              {cfg.research_commit && (
                <Group gap="xs">
                  <Text size="xs" c="dimmed">Commit:</Text>
                  <Code>{cfg.research_commit.slice(0, 8)}</Code>
                </Group>
              )}
              {Object.keys(cfg.strategy_args ?? {}).length > 0 && (
                <Stack gap={2}>
                  <Text size="xs" c="dimmed">Strategy Args:</Text>
                  <Code block>{JSON.stringify(cfg.strategy_args, null, 2)}</Code>
                </Stack>
              )}
            </Stack>
          </Stack>
        )}

        {request.session_id && (
          <Stack gap={4}>
            <Text size="xs" c="dimmed">Session</Text>
            <Group gap="xs">
              <Code>{request.session_id.slice(0, 8)}…</Code>
              <Button
                size="xs"
                variant="subtle"
                rightSection={<IconExternalLink size={12} />}
                onClick={() => navigate(`/sessions/${request.session_id}`)}
              >
                View session
              </Button>
            </Group>
          </Stack>
        )}

        {(request.approved_by || request.rejected_by) && (
          <Stack gap={4}>
            <Text size="xs" c="dimmed">{request.approved_by ? 'Approved by' : 'Rejected by'}</Text>
            <Code>{request.approved_by ?? request.rejected_by}</Code>
          </Stack>
        )}

        {request.launch_error && (
          <Stack gap={4}>
            <Text size="xs" c="dimmed" c="red">Launch Error</Text>
            <Code block c="red">{request.launch_error}</Code>
          </Stack>
        )}

        <Stack gap={4}>
          <Text size="xs" c="dimmed" fw={600}>Trigger Data</Text>
          <Code block style={{ maxHeight: 200, overflow: 'auto' }}>
            {JSON.stringify(request.data, null, 2)}
          </Code>
        </Stack>
      </Stack>
    </Drawer>
  );
}

function LaunchHistory() {
  const [data, setData] = useState<LaunchRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<LaunchRequest | null>(null);

  const load = () => {
    setIsLoading(true);
    launcherApi.listRequests({ limit: 200 })
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => (statusFilter ? data.filter(r => r.status === statusFilter) : data),
    [data, statusFilter],
  );

  const columns = useMemo<MRT_ColumnDef<LaunchRequest>[]>(() => [
    {
      accessorKey: 'date_created',
      header: 'Created',
      size: 130,
      Cell: ({ row }: { row: MRT_Row<LaunchRequest> }) => (
        <ReactTimeAgo date={new Date(row.original.date_created)} timeStyle="round" />
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 130,
      Cell: ({ row }: { row: MRT_Row<LaunchRequest> }) => (
        <Badge color={STATUS_COLORS[row.original.status]} variant="light" size="sm">
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'matched_rule_name',
      header: 'Rule',
      size: 180,
    },
    {
      accessorKey: 'rule_type',
      header: 'Rule Type',
      size: 140,
      Cell: ({ row }: { row: MRT_Row<LaunchRequest> }) => (
        <Code>{row.original.rule_type}</Code>
      ),
    },
    {
      accessorKey: 'launch_path',
      header: 'Path',
      size: 90,
      Cell: ({ row }: { row: MRT_Row<LaunchRequest> }) => (
        <Badge color={LAUNCH_PATH_COLORS[row.original.launch_path]} variant="outline" size="sm">
          {row.original.launch_path}
        </Badge>
      ),
    },
    {
      accessorKey: 'resolved_config',
      header: 'Mode',
      size: 80,
      Cell: ({ row }: { row: MRT_Row<LaunchRequest> }) => {
        const mode = row.original.resolved_config?.mode;
        return mode ? (
          <Badge color={mode === 'live' ? 'red' : 'violet'} variant="light" size="sm">{mode}</Badge>
        ) : <>—</>;
      },
    },
    {
      accessorKey: 'session_id',
      header: 'Session',
      size: 110,
      Cell: ({ row }: { row: MRT_Row<LaunchRequest> }) =>
        row.original.session_id
          ? <Code style={{ fontSize: '0.8rem' }}>{row.original.session_id.slice(0, 8)}…</Code>
          : <Text c="dimmed" size="xs">—</Text>,
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: filtered,
    initialState: { density: 'xs', sorting: [{ id: 'date_created', desc: true }] },
    enableColumnFilters: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }: { row: MRT_Row<LaunchRequest> }) => ({
      onClick: () => setSelected(row.original),
      style: { cursor: 'pointer' },
    }),
    state: { isLoading },
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Launch History</Title>
        <Group>
          <Select
            size="sm"
            data={STATUS_OPTIONS}
            value={statusFilter}
            onChange={v => setStatusFilter(v ?? '')}
            clearable={false}
            w={170}
          />
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={load} loading={isLoading}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <MantineReactTable table={table} />

      <DetailDrawer request={selected} onClose={() => setSelected(null)} />
    </Container>
  );
}

export default LaunchHistory;
