import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconArrowLeft, IconRefresh, IconX } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BacktestJob, BacktestRun, BacktestStatus, JobStatus } from '../../types/backtests';
import { controllerApi } from '../../utils/api';

const RUN_STATUS_COLORS: Record<BacktestStatus, string> = {
  SUBMITTED: 'blue',
  PENDING: 'gray',
  RUNNING: 'yellow',
  COMPLETED: 'green',
  PARTIALLY_FAILED: 'orange',
  FAILED: 'red',
  CANCELLED: 'gray',
};

const JOB_STATUS_COLORS: Record<JobStatus, string> = {
  PENDING: 'gray',
  RUNNING: 'yellow',
  SUCCEEDED: 'green',
  FAILED: 'red',
};

const CANCELLABLE = new Set<BacktestStatus>(['SUBMITTED', 'PENDING', 'RUNNING']);

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Text size="sm" c="dimmed" w={110} style={{ flexShrink: 0 }}>{label}</Text>
      <Text size="sm">{children}</Text>
    </Group>
  );
}

function BacktestDetail() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<BacktestRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const refresh = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    try {
      const data = await controllerApi.getBacktest(runId);
      setRun(data as BacktestRun);
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCancel = async () => {
    if (!runId) return;
    setCancelling(true);
    try {
      await controllerApi.cancelBacktest(runId);
      setCancelModalOpen(false);
      refresh();
    } finally {
      setCancelling(false);
    }
  };

  const jobs = run?.jobs ?? [];

  const chartData = useMemo(() =>
    jobs
      .filter((j) => j.finalPnl !== undefined)
      .map((j) => ({
        label: Object.values(j.configParams ?? {}).join(', ') || `job ${j.arrayIndex}`,
        pnl: j.finalPnl ?? 0,
        positive: (j.finalPnl ?? 0) >= 0,
      })),
    [jobs],
  );

  const columns = useMemo<MRT_ColumnDef<BacktestJob>[]>(() => [
    {
      accessorKey: 'arrayIndex',
      header: '#',
      size: 60,
      Cell: ({ row }: { row: MRT_Row<BacktestJob> }) => (
        <span style={{ fontFamily: 'monospace' }}>{String(row.original.arrayIndex).padStart(4, '0')}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 110,
      Cell: ({ row }: { row: MRT_Row<BacktestJob> }) => (
        <Badge color={JOB_STATUS_COLORS[row.original.status]} variant="light" size="sm">
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: 'configParams',
      header: 'Parameters',
      accessorFn: (row) => Object.entries(row.configParams ?? {}).map(([k, v]) => `${k}=${v}`).join(', '),
    },
    {
      accessorKey: 'finalPnl',
      header: 'PnL',
      size: 100,
      Cell: ({ row }: { row: MRT_Row<BacktestJob> }) => {
        const v = row.original.finalPnl;
        if (v === undefined) return <Text c="dimmed" size="sm">—</Text>;
        return <Text c={v >= 0 ? 'green' : 'red'} size="sm">{v.toFixed(4)}</Text>;
      },
    },
    {
      accessorKey: 'sharpe',
      header: 'Sharpe',
      size: 90,
      Cell: ({ row }: { row: MRT_Row<BacktestJob> }) => {
        const v = row.original.sharpe;
        return v !== undefined ? <span>{v.toFixed(3)}</span> : <Text c="dimmed" size="sm">—</Text>;
      },
    },
    {
      id: 'report',
      header: 'Report',
      size: 80,
      enableSorting: false,
      Cell: ({ row }: { row: MRT_Row<BacktestJob> }) =>
        row.original.reportUrl
          ? <Anchor href={row.original.reportUrl} target="_blank" size="sm">Open</Anchor>
          : <Text c="dimmed" size="sm">—</Text>,
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: jobs,
    state: { isLoading: loading },
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: jobs.length > 25,
    enableBottomToolbar: jobs.length > 25,
    enableTopToolbar: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { sorting: [{ id: 'finalPnl', desc: true }], density: 'xs' },
  });

  if (!run && !loading) return null;

  return (
    <Container size="xl" py="xl">
      <Group mb="md">
        <Tooltip label="Back to list" position="right" withArrow openDelay={500}>
          <ActionIcon variant="subtle" onClick={() => navigate('/backtests')}>
            <IconArrowLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <Title order={2}>Backtest Detail</Title>
        <Group ml="auto">
          {run && CANCELLABLE.has(run.status) && (
            <Button
              size="xs"
              color="red"
              variant="light"
              leftSection={<IconX size={14} />}
              onClick={() => setCancelModalOpen(true)}
            >
              Cancel
            </Button>
          )}
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={refresh} loading={loading}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {run && (
        <Card withBorder mb="md" p="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            <Stack gap={4}>
              <InfoRow label="Run ID">
                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{run.runId}</span>
              </InfoRow>
              <InfoRow label="Status">
                <Badge color={RUN_STATUS_COLORS[run.status]} variant="light">{run.status}</Badge>
              </InfoRow>
              <InfoRow label="Strategy">{run.strategy}</InfoRow>
              <InfoRow label="Commit">{run.researchCommit ?? 'main'}</InfoRow>
            </Stack>
            <Stack gap={4}>
              <InfoRow label="Jobs">{run.completedCount}/{run.jobCount} completed, {run.failedCount} failed</InfoRow>
              <InfoRow label="Submitted by">{run.submittedBy}</InfoRow>
              <InfoRow label="Submitted">
                {run.submittedAt ? <ReactTimeAgo date={new Date(run.submittedAt)} timeStyle="round" /> : '—'}
              </InfoRow>
              {run.batchJobId && (
                <InfoRow label="Batch Job ID">
                  <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{run.batchJobId}</span>
                </InfoRow>
              )}
            </Stack>
          </SimpleGrid>
        </Card>
      )}

      {chartData.length > 0 && (
        <Card withBorder mb="md" p="md">
          <Text fw={500} mb="sm">PnL by Job</Text>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip
                formatter={(value) => [typeof value === 'number' ? value.toFixed(4) : value, 'PnL']}
                contentStyle={{ background: '#1a1b1e', border: '1px solid #373a40' }}
              />
              <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.positive ? '#2f9e44' : '#c92a2a'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <MantineReactTable table={table} />

      <Modal
        opened={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancel backtest?"
        size="sm"
      >
        <Stack>
          <Text size="sm">This will terminate all running Batch jobs for this run.</Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setCancelModalOpen(false)}>Back</Button>
            <Button color="red" loading={cancelling} onClick={handleCancel}>Cancel Run</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default BacktestDetail;
