import { useState, useEffect, useCallback, useMemo } from 'react';
import { ActionIcon, Badge, Container, Group, Select, Title, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { navigateRowProps } from '../../../utils/navigation';
import { ResearchJob } from '../../../types/research-jobs';
import { controllerApi } from '../../../utils/api';
import { RUN_STATUS_COLORS } from './status';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PARTIALLY_FAILED', label: 'Partially Failed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function ResearchJobList() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<ResearchJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await controllerApi.listResearchJobs({ status: statusFilter || undefined, limit: 100 });
      setRuns(result.runs);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const columns = useMemo<MRT_ColumnDef<ResearchJob>[]>(() => [
    {
      accessorKey: 'runId',
      header: 'Run ID',
      size: 140,
      Cell: ({ row }: { row: MRT_Row<ResearchJob> }) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{row.original.runId}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 150,
      Cell: ({ row }: { row: MRT_Row<ResearchJob> }) => (
        <Badge color={RUN_STATUS_COLORS[row.original.status]} variant="light">{row.original.status}</Badge>
      ),
    },
    {
      accessorKey: 'module',
      header: 'Module',
      Cell: ({ row }: { row: MRT_Row<ResearchJob> }) => {
        const name = row.original.module;
        return <span title={name}>{name.replace(/^gnomepy_research\./, '')}</span>;
      },
    },
    {
      accessorKey: 'researchCommit',
      header: 'Commit',
      size: 150,
      Cell: ({ row }: { row: MRT_Row<ResearchJob> }) => (
        <span title={row.original.researchCommit}>
          {row.original.researchRef ? `${row.original.researchRef} ` : ''}
          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{row.original.researchCommit.slice(0, 7)}</span>
        </span>
      ),
    },
    {
      accessorKey: 'taskCount',
      header: 'Tasks',
      size: 90,
      Cell: ({ row }: { row: MRT_Row<ResearchJob> }) => `${row.original.succeededCount}/${row.original.taskCount}`,
    },
    {
      accessorKey: 'failedCount',
      header: 'Failed',
      size: 75,
      Cell: ({ row }: { row: MRT_Row<ResearchJob> }) => {
        const n = row.original.failedCount;
        return n > 0 ? <Badge color="red" variant="light">{n}</Badge> : <span>0</span>;
      },
    },
    { accessorKey: 'submittedBy', header: 'Submitted By', size: 130 },
    {
      accessorKey: 'submittedAt',
      header: 'Submitted',
      size: 130,
      Cell: ({ row }: { row: MRT_Row<ResearchJob> }) =>
        row.original.submittedAt ? <ReactTimeAgo date={new Date(row.original.submittedAt)} timeStyle="round" /> : '-',
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
    mantineTableBodyRowProps: ({ row }: { row: MRT_Row<ResearchJob> }) => (
      navigateRowProps(navigate, `/research/jobs/${row.original.runId}`)
    ),
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Research Jobs</Title>
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

export default ResearchJobList;
