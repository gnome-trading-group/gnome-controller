import { useState, useEffect, useCallback, useMemo } from 'react';
import { ActionIcon, Badge, Container, Group, Select, Title, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { navigateRowProps } from '../../utils/navigation';
import { ResearchSession, SessionStatus } from '../../types/research';
import { controllerApi } from '../../utils/api';

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: 'blue',
  completed: 'green',
  stalled: 'red',
  paused: 'yellow',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'stalled', label: 'Stalled' },
  { value: 'paused', label: 'Paused' },
];

function ResearchList() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await controllerApi.listResearchSessions({
        status: statusFilter || undefined,
        limit: 50,
      });
      setSessions(result.sessions as ResearchSession[]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const columns = useMemo<MRT_ColumnDef<ResearchSession>[]>(() => [
    {
      accessorKey: 'sessionName',
      header: 'Session',
      size: 180,
      Cell: ({ row }: { row: MRT_Row<ResearchSession> }) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {row.original.sessionName}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 120,
      Cell: ({ row }: { row: MRT_Row<ResearchSession> }) => (
        <Badge color={STATUS_COLORS[row.original.status]} variant="light">
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'tags',
      header: 'Tags',
      size: 160,
      Cell: ({ row }: { row: MRT_Row<ResearchSession> }) => (
        <Group gap={4}>
          {(row.original.tags ?? []).map((tag) => (
            <Badge key={tag} size="xs" variant="outline" color="gray">{tag}</Badge>
          ))}
        </Group>
      ),
    },
    {
      accessorKey: 'iterationCount',
      header: 'Iters',
      size: 70,
    },
    {
      accessorKey: 'bestPnl',
      header: 'Best PnL',
      size: 110,
      Cell: ({ row }: { row: MRT_Row<ResearchSession> }) => {
        const v = row.original.bestPnl;
        if (v == null) return <span style={{ color: 'var(--mantine-color-dimmed)' }}>—</span>;
        return (
          <span style={{ color: v >= 0 ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-red-6)' }}>
            {v.toFixed(4)}
          </span>
        );
      },
    },
    {
      accessorKey: 'bestSharpe',
      header: 'Best Sharpe',
      size: 110,
      Cell: ({ row }: { row: MRT_Row<ResearchSession> }) => {
        const v = row.original.bestSharpe;
        if (v == null) return <span style={{ color: 'var(--mantine-color-dimmed)' }}>—</span>;
        return (
          <span style={{ color: v >= 0 ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-red-6)' }}>
            {v.toFixed(4)}
          </span>
        );
      },
    },
    {
      accessorKey: 'owner',
      header: 'Owner',
      size: 130,
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

  const table = useMantineReactTable({
    columns,
    data: sessions,
    state: { isLoading: loading },
    enableColumnFilters: true,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { sorting: [{ id: 'updatedAt', desc: true }], density: 'xs' },
    mantineTableBodyRowProps: ({ row }: { row: MRT_Row<ResearchSession> }) => (
      navigateRowProps(navigate, `/research/${row.original.sessionName}`)
    ),
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Research Sessions</Title>
        <Group>
          <Select
            size="sm"
            placeholder="All statuses"
            data={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v ?? '')}
            clearable={false}
            w={160}
          />
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={refresh} loading={loading}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <MantineReactTable table={table} />
    </Container>
  );
}

export default ResearchList;
