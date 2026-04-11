import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Title,
  Button,
  Group,
  Badge,
  Notification,
  Center,
  Loader,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { IconPlus, IconRefresh } from '@tabler/icons-react';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { controllerApi } from '../../utils/api';
import type { BacktestJob, BacktestStatus } from '../../types/backtests';

const STATUS_COLORS: Record<BacktestStatus, string> = {
  SUBMITTED: 'gray',
  PENDING: 'gray',
  RUNNABLE: 'blue',
  STARTING: 'blue',
  RUNNING: 'blue',
  SUCCEEDED: 'green',
  FAILED: 'red',
};

function formatDate(iso: string | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

function BacktestList() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<BacktestJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await controllerApi.listBacktests();
      setJobs(response.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load backtests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 10s if any jobs are in progress.
  useEffect(() => {
    const hasActiveJobs = jobs.some((j) =>
      ['SUBMITTED', 'PENDING', 'RUNNABLE', 'STARTING', 'RUNNING'].includes(j.status),
    );
    if (!hasActiveJobs) return;
    const interval = setInterval(loadData, 10_000);
    return () => clearInterval(interval);
  }, [jobs, loadData]);

  const columns = useMemo<MRT_ColumnDef<BacktestJob>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        Cell: ({ row }) => row.original.name || row.original.presetName || '-',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        Cell: ({ cell }) => {
          const status = cell.getValue<BacktestStatus>();
          return (
            <Badge color={STATUS_COLORS[status] ?? 'gray'} variant="light">
              {status}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'researchCommit',
        header: 'Commit',
        Cell: ({ cell }) => {
          const val = cell.getValue<string>();
          return val?.length > 8 ? val.slice(0, 8) : val;
        },
      },
      {
        accessorKey: 'submittedBy',
        header: 'Submitted By',
      },
      {
        accessorKey: 'submittedAt',
        header: 'Submitted',
        Cell: ({ cell }) => formatDate(cell.getValue<string>()),
      },
      {
        accessorKey: 'completedAt',
        header: 'Completed',
        Cell: ({ cell }) => formatDate(cell.getValue<string>()),
      },
    ],
    [],
  );

  const table = useMantineReactTable({
    columns,
    data: jobs,
    enablePagination: true,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
    mantineTableBodyRowProps: ({ row }) => ({
      onClick: () => navigate(`/backtests/${row.original.jobId}`),
      style: { cursor: 'pointer' },
    }),
  });

  if (loading && jobs.length === 0) {
    return (
      <Center h="50vh">
        <Loader />
      </Center>
    );
  }

  return (
    <Container size="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Backtests</Title>
        <Group>
          <Tooltip label="Refresh">
            <ActionIcon variant="subtle" onClick={loadData} loading={loading}>
              <IconRefresh size={18} />
            </ActionIcon>
          </Tooltip>
          <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/backtests/new')}>
            New Backtest
          </Button>
        </Group>
      </Group>

      {error && (
        <Notification color="red" onClose={() => setError(null)} mb="md">
          {error}
        </Notification>
      )}

      <MantineReactTable table={table} />
    </Container>
  );
}

export default BacktestList;
