import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Accordion,
  ActionIcon,
  Badge,
  Button,
  Card,
  Code,
  Container,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconArrowLeft, IconRefresh } from '@tabler/icons-react';
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
import { ResearchIteration, ResearchNote, ResearchSession, SessionStatus } from '../../types/research';
import { controllerApi } from '../../utils/api';

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: 'blue',
  completed: 'green',
  stalled: 'red',
  paused: 'yellow',
};

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card withBorder p="sm" radius="md">
      <Text size="xs" c="dimmed" mb={4}>{label}</Text>
      <Text fw={600} size="lg">{value ?? '—'}</Text>
    </Card>
  );
}

function ResearchDetail() {
  const navigate = useNavigate();
  const { sessionName } = useParams<{ sessionName: string }>();
  const [session, setSession] = useState<ResearchSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionName) return;
    setLoading(true);
    try {
      const result = await controllerApi.getResearchSession(sessionName);
      setSession(result);
    } finally {
      setLoading(false);
    }
  }, [sessionName]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleAddNote = async () => {
    if (!sessionName || !newNote.trim()) return;
    setSubmittingNote(true);
    try {
      await controllerApi.addResearchNote(sessionName, newNote.trim());
      setNewNote('');
      await refresh();
    } finally {
      setSubmittingNote(false);
    }
  };

  const iterations = session?.iterations ?? [];

  const chartData = iterations.map((iter) => ({
    iteration: iter.iteration,
    pnl: iter.metrics?.finalPnl ?? null,
  }));

  const metricKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const iter of iterations) {
      Object.keys(iter.metrics ?? {}).forEach((k) => keys.add(k));
    }
    const priority = ['finalPnl', 'sharpe', 'sortino', 'fillCount'];
    const sorted = priority.filter((k) => keys.has(k));
    keys.forEach((k) => { if (!sorted.includes(k)) sorted.push(k); });
    return sorted.slice(0, 8);
  }, [iterations]);

  const columns = useMemo<MRT_ColumnDef<ResearchIteration>[]>(() => [
    {
      accessorKey: 'iteration',
      header: '#',
      size: 55,
    },
    {
      accessorKey: 'title',
      header: 'Title',
      size: 250,
    },
    {
      accessorKey: 'type',
      header: 'Type',
      size: 80,
      Cell: ({ row }: { row: MRT_Row<ResearchIteration> }) => (
        <Badge size="xs" variant="light" color={row.original.type === 'sweep' ? 'violet' : 'blue'}>
          {row.original.type}
        </Badge>
      ),
    },
    ...metricKeys.map((key) => ({
      id: key,
      header: key.replace(/([A-Z])/g, ' $1').trim(),
      size: 100,
      Cell: ({ row }: { row: MRT_Row<ResearchIteration> }) => {
        const v = row.original.metrics?.[key];
        if (v == null) return <span style={{ color: 'var(--mantine-color-dimmed)' }}>—</span>;
        const isPositive = v >= 0;
        return (
          <span style={{ color: (key === 'finalPnl' || key === 'sharpe') ? (isPositive ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-red-6)') : 'inherit' }}>
            {typeof v === 'number' ? v.toFixed(4) : v}
          </span>
        );
      },
    })),
    {
      accessorKey: 'owner',
      header: 'By',
      size: 110,
    },
    {
      accessorKey: 'timestamp',
      header: 'Time',
      size: 120,
      Cell: ({ row }: { row: MRT_Row<ResearchIteration> }) =>
        row.original.timestamp
          ? <ReactTimeAgo date={new Date(row.original.timestamp)} timeStyle="round" />
          : '—',
    },
  ], [metricKeys]);

  const table = useMantineReactTable({
    columns,
    data: iterations,
    state: { isLoading: loading },
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { sorting: [{ id: 'iteration', desc: false }], density: 'xs' },
    renderDetailPanel: ({ row }: { row: MRT_Row<ResearchIteration> }) => (
      <Stack p="md" gap="xs" style={{ maxWidth: 900 }}>
        {row.original.description && (
          <>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">Description</Text>
            <Text component="pre" size="sm" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
              {row.original.description}
            </Text>
          </>
        )}
        {Object.keys(row.original.metadata ?? {}).length > 0 && (
          <>
            <Divider my={4} />
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">Metadata</Text>
            <Code block style={{ fontSize: '0.72rem' }}>
              {JSON.stringify(row.original.metadata, null, 2)}
            </Code>
          </>
        )}
        {Object.keys(row.original.environment ?? {}).length > 0 && (
          <>
            <Divider my={4} />
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">Environment</Text>
            <Group gap={8}>
              {Object.entries(row.original.environment).map(([k, v]) => (
                <Text key={k} size="xs" c="dimmed">
                  <Text component="span" size="xs" fw={600}>{k}: </Text>{v}
                </Text>
              ))}
            </Group>
          </>
        )}
      </Stack>
    ),
  });

  if (!session && !loading) return null;

  return (
    <Container size="xl" py="xl">
      <Group mb="md">
        <ActionIcon variant="subtle" onClick={() => navigate('/research')}>
          <IconArrowLeft size={18} />
        </ActionIcon>
        <Title order={2} style={{ flex: 1 }}>{sessionName}</Title>
        <Tooltip label="Refresh" withArrow openDelay={500}>
          <ActionIcon size="lg" variant="filled" color="green" onClick={refresh} loading={loading}>
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* Header card */}
      {session && (
        <Card withBorder mb="md" p="md">
          <Group justify="space-between" mb="xs">
            <Group gap={8}>
              <Badge color={STATUS_COLORS[session.status]} variant="light" size="lg">
                {session.status}
              </Badge>
              {session.tags?.map((tag) => (
                <Badge key={tag} size="sm" variant="outline" color="gray">{tag}</Badge>
              ))}
            </Group>
            <Text size="sm" c="dimmed">
              {session.owner} · <ReactTimeAgo date={new Date(session.updatedAt)} timeStyle="round" />
            </Text>
          </Group>
          {session.description && (
            <Text size="sm" c="dimmed" mb="xs">{session.description}</Text>
          )}
          {session.branch && (
            <Code style={{ fontSize: '0.75rem' }}>{session.branch}</Code>
          )}
        </Card>
      )}

      {/* Quick stats */}
      {session && (
        <SimpleGrid cols={{ base: 2, sm: 3 }} mb="md">
          <StatCard label="Best PnL" value={
            session.bestPnl != null
              ? <span style={{ color: session.bestPnl >= 0 ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-red-6)' }}>{session.bestPnl.toFixed(4)}</span>
              : '—'
          } />
          <StatCard label="Best Sharpe" value={
            session.bestSharpe != null
              ? <span style={{ color: session.bestSharpe >= 0 ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-red-6)' }}>{session.bestSharpe.toFixed(4)}</span>
              : '—'
          } />
          <StatCard label="Iterations" value={session.iterationCount ?? 0} />
        </SimpleGrid>
      )}

      {/* PnL chart */}
      {chartData.length > 0 && (
        <Card withBorder mb="md" p="md">
          <Text size="sm" fw={600} mb="sm">PnL by Iteration</Text>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-dark-4)" />
              <XAxis dataKey="iteration" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip
                contentStyle={{ backgroundColor: 'var(--mantine-color-dark-7)', border: 'none', fontSize: 12 }}
                formatter={(v) => [Number(v)?.toFixed(4), 'PnL']}
              />
              <Bar dataKey="pnl">
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={(entry.pnl ?? 0) >= 0 ? '#2f9e44' : '#e03131'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Iterations table */}
      <Title order={4} mb="xs">Iterations</Title>
      <MantineReactTable table={table} />

      {/* Notes section */}
      <Title order={4} mt="xl" mb="xs">Notes</Title>
      <Card withBorder p="md">
        <Stack gap="md">
          {(session?.notes ?? []).length === 0 && (
            <Text size="sm" c="dimmed">No notes yet.</Text>
          )}
          {(session?.notes ?? []).map((note: ResearchNote) => (
            <div key={note.sk}>
              <Group justify="space-between" mb={4}>
                <Text size="xs" fw={600}>{note.author}</Text>
                <Text size="xs" c="dimmed">
                  <ReactTimeAgo date={new Date(note.timestamp)} timeStyle="round" />
                </Text>
              </Group>
              <Text component="pre" size="sm" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
                {note.content}
              </Text>
              <Divider mt="sm" />
            </div>
          ))}

          <Textarea
            placeholder="Add a note... (markdown supported)"
            value={newNote}
            onChange={(e) => setNewNote(e.currentTarget.value)}
            autosize
            minRows={2}
            maxRows={8}
          />
          <Group justify="flex-end">
            <Button
              size="sm"
              variant="light"
              onClick={handleAddNote}
              loading={submittingNote}
              disabled={!newNote.trim()}
            >
              Add Note
            </Button>
          </Group>
        </Stack>
      </Card>

      {/* Spec accordion */}
      {session?.specYaml && (
        <>
          <Title order={4} mt="xl" mb="xs">Spec</Title>
          <Accordion variant="contained">
            <Accordion.Item value="spec">
              <Accordion.Control>spec.yaml</Accordion.Control>
              <Accordion.Panel>
                <Code block style={{ fontSize: '0.75rem', whiteSpace: 'pre' }}>
                  {session.specYaml}
                </Code>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </>
      )}
    </Container>
  );
}

export default ResearchDetail;
