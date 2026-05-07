import { useState, useEffect, useCallback, useMemo } from 'react';
import { ActionIcon, Badge, Container, Group, Select, Title, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { BacktestRun, BacktestStatus } from '../../types/backtests';
import { controllerApi } from '../../utils/api';

const STATUS_COLORS: Record<BacktestStatus, string> = {
  SUBMITTED: 'blue',
  PENDING: 'gray',
  RUNNING: 'yellow',
  COMPLETED: 'green',
  PARTIALLY_FAILED: 'orange',
  FAILED: 'red',
  CANCELLED: 'gray',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PARTIALLY_FAILED', label: 'Partially Failed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function BacktestList() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await controllerApi.listBacktests({
        status: statusFilter || undefined,
        limit: 50,
      });
      setRuns(result.runs as BacktestRun[]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const columns = useMemo<MRT_ColumnDef<BacktestRun>[]>(() => [
    {
      accessorKey: 'runId',
      header: 'Run ID',
      size: 140,
      Cell: ({ row }: { row: MRT_Row<BacktestRun> }) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
          {row.original.runId.slice(-12)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 150,
      Cell: ({ row }: { row: MRT_Row<BacktestRun> }) => (
        <Badge color={STATUS_COLORS[row.original.status]} variant="light">
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'strategy',
      header: 'Strategy',
      Cell: ({ row }: { row: MRT_Row<BacktestRun> }) => {
        const name = row.original.strategy ?? '';
        const short = name.includes(':') ? name.split(':').pop() : name.split('.').pop();
        return <span title={name}>{short}</span>;
      },
    },
    {
      accessorKey: 'jobCount',
      header: 'Jobs',
      size: 90,
      Cell: ({ row }: { row: MRT_Row<BacktestRun> }) =>
        `${row.original.completedCount}/${row.original.jobCount}`,
    },
    {
      accessorKey: 'failedCount',
      header: 'Failed',
      size: 75,
      Cell: ({ row }: { row: MRT_Row<BacktestRun> }) => {
        const n = row.original.failedCount;
        return n > 0 ? <Badge color="red" variant="light">{n}</Badge> : <span>0</span>;
      },
    },
    {
      accessorKey: 'submittedBy',
      header: 'Submitted By',
      size: 130,
    },
    {
      accessorKey: 'submittedAt',
      header: 'Submitted',
      size: 130,
      Cell: ({ row }: { row: MRT_Row<BacktestRun> }) =>
        row.original.submittedAt
          ? <ReactTimeAgo date={new Date(row.original.submittedAt)} timeStyle="round" />
          : '-',
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: runs,
    state: { isLoading: loading },
    enableColumnFilters: true,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { sorting: [{ id: 'submittedAt', desc: true }], density: 'xs' },
    mantineTableBodyRowProps: ({ row }: { row: MRT_Row<BacktestRun> }) => ({
      onClick: () => navigate(`/backtests/${row.original.runId}`),
      style: { cursor: 'pointer' },
    }),
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Backtests</Title>
        <Group>
          <Select
            size="sm"
            placeholder="All statuses"
            data={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v ?? '')}
            clearable={false}
            w={170}
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

export default BacktestList;
