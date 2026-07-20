import { useState, useEffect, useCallback } from 'react';
import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Container,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconArrowLeft, IconPlayerStop, IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { StrategySession, StrategySessionStatus } from '../../types';
import { registryApi } from '../../utils/api';

const STATUS_COLORS: Record<string, string> = {
  [StrategySessionStatus.SUBMITTED]: 'blue',
  [StrategySessionStatus.RUNNING]: 'green',
  [StrategySessionStatus.STOPPED]: 'gray',
  [StrategySessionStatus.FAILED]: 'red',
};

const MODE_COLORS: Record<string, string> = {
  paper: 'violet',
  live: 'red',
};

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card withBorder p="sm" radius="md">
      <Text size="xs" c="dimmed" mb={4}>{label}</Text>
      <Text fw={600} size="lg">{value ?? '—'}</Text>
    </Card>
  );
}

function groupConfig(config: Record<string, string>) {
  const params = Object.entries(config).filter(([k]) => k.startsWith('strategy.args.'));
  const strategy = Object.entries(config).filter(([k]) => k.startsWith('strategy.') && !k.startsWith('strategy.args.'));
  const simulation = Object.entries(config).filter(([k]) => k.startsWith('simulation.'));
  const paramKeys = new Set([...params, ...strategy, ...simulation].map(([k]) => k));
  const core = Object.entries(config).filter(([k]) => !paramKeys.has(k));

  return { core, strategy, params, simulation };
}

function ConfigTable({ entries }: { entries: [string, string][] }) {
  if (entries.length === 0) return <Text size="sm" c="dimmed">None</Text>;
  return (
    <Table striped withColumnBorders fz="xs">
      <Table.Tbody>
        {entries.map(([k, v]) => (
          <Table.Tr key={k}>
            <Table.Td style={{ fontFamily: 'monospace', width: '45%' }}>{k}</Table.Td>
            <Table.Td style={{ fontFamily: 'monospace' }}>{v}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function SessionDetail() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<StrategySession | null>(null);
  const [strategyName, setStrategyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [stopping, setStopping] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const sessions = await registryApi.listSessions({ sessionId });
      const s = sessions[0] ?? null;
      setSession(s);
      if (s) {
        registryApi.listStrategies().then(list => {
          const match = list.find((st: { strategyId: number; name: string }) => st.strategyId === s.strategyId);
          if (match) setStrategyName(match.name);
        }).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleStop = async () => {
    if (!session) return;
    setStopping(true);
    try {
      await registryApi.stopSession(session.sessionId);
      setStopOpen(false);
      refresh();
    } catch (e) {
      console.error('Failed to stop session:', e);
    } finally {
      setStopping(false);
    }
  };

  const isStoppable = session?.status === StrategySessionStatus.SUBMITTED || session?.status === StrategySessionStatus.RUNNING;
  const grouped = session ? groupConfig(session.config) : null;

  return (
    <Container size="xl" py="xl">
      <Group mb="md">
        <ActionIcon variant="subtle" onClick={() => navigate('/sessions')}>
          <IconArrowLeft size={18} />
        </ActionIcon>
        <Text fw={600} size="lg" style={{ fontFamily: 'monospace', flex: 1 }}>
          {sessionId}
        </Text>
        {session && (
          <Badge color={STATUS_COLORS[session.status] ?? 'gray'} variant="light" size="lg">
            {session.status}
          </Badge>
        )}
        <Tooltip label="Refresh" withArrow openDelay={500}>
          <ActionIcon size="lg" variant="filled" color="green" onClick={refresh} loading={loading}>
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
        {isStoppable && (
          <Tooltip label="Stop Session" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="red" onClick={() => setStopOpen(true)}>
              <IconPlayerStop size={20} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      {session && (
        <>
          <SimpleGrid cols={{ base: 2, sm: 3 }} mb="md">
            <StatCard label="Strategy" value={
              strategyName
                ? <Text component={Link} to={`/strategies/${session.strategyId}`} c="blue" fw={600} size="lg" style={{ textDecoration: 'none' }}>{strategyName}</Text>
                : String(session.strategyId)
            } />
            <StatCard label="Mode" value={
              <Badge color={MODE_COLORS[session.mode] ?? 'gray'} variant="light" size="lg">{session.mode}</Badge>
            } />
            <StatCard label="Status" value={
              <Badge color={STATUS_COLORS[session.status] ?? 'gray'} variant="light" size="lg">{session.status}</Badge>
            } />
            <StatCard label="Started" value={
              session.startedAt
                ? <ReactTimeAgo date={new Date(session.startedAt)} timeStyle="round" />
                : 'Not started'
            } />
            <StatCard label="Stopped" value={
              session.stoppedAt
                ? <ReactTimeAgo date={new Date(session.stoppedAt)} timeStyle="round" />
                : 'Active'
            } />
            <StatCard label="Research Commit" value={
              session.researchCommit
                ? <Code style={{ fontSize: '0.8rem' }}>{session.researchCommit}</Code>
                : '—'
            } />
          </SimpleGrid>

          {session.failureReason && (
            <Alert color="red" title="Failure Reason" mb="md">
              <Text size="sm" style={{ fontFamily: 'monospace' }}>{session.failureReason}</Text>
            </Alert>
          )}

          <Title order={4} mb="xs">Session Config</Title>
          <Accordion variant="contained" mb="md">
            {grouped && [
              { key: 'core', label: 'Core', entries: grouped.core },
              { key: 'strategy', label: 'Strategy', entries: grouped.strategy },
              { key: 'params', label: 'Parameters', entries: grouped.params },
              { key: 'simulation', label: 'Simulation', entries: grouped.simulation },
            ].filter(s => s.entries.length > 0).map(section => (
              <Accordion.Item key={section.key} value={section.key}>
                <Accordion.Control>
                  <Group gap="xs">
                    <Text size="sm" fw={600}>{section.label}</Text>
                    <Badge size="xs" variant="outline" color="gray">{section.entries.length}</Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <ConfigTable entries={section.entries} />
                </Accordion.Panel>
              </Accordion.Item>
            ))}
            <Accordion.Item value="raw">
              <Accordion.Control><Text size="sm" fw={600}>Raw JSON</Text></Accordion.Control>
              <Accordion.Panel>
                <Code block style={{ fontSize: '0.72rem' }}>
                  {JSON.stringify(session.config, null, 2)}
                </Code>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>

          {(session.taskArn || session.taskDefinitionArn) && (
            <>
              <Title order={4} mb="xs">ECS Info</Title>
              <Card withBorder p="sm" mb="md">
                <Stack gap="xs">
                  {session.taskArn && (
                    <Group gap="xs">
                      <Text size="xs" c="dimmed" w={140}>Task ARN</Text>
                      <Code style={{ fontSize: '0.72rem', flex: 1 }}>{session.taskArn}</Code>
                    </Group>
                  )}
                  {session.taskDefinitionArn && (
                    <Group gap="xs">
                      <Text size="xs" c="dimmed" w={140}>Task Definition</Text>
                      <Code style={{ fontSize: '0.72rem', flex: 1 }}>{session.taskDefinitionArn}</Code>
                    </Group>
                  )}
                </Stack>
              </Card>
            </>
          )}
        </>
      )}

      <Modal opened={stopOpen} onClose={() => setStopOpen(false)} title="Stop Session" size="sm">
        <Stack>
          <Text>Stop session <Text span fw={500} style={{ fontFamily: 'monospace' }}>{sessionId?.slice(0, 8)}…</Text>?</Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setStopOpen(false)}>Cancel</Button>
            <Button color="red" loading={stopping} onClick={handleStop}>Stop</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default SessionDetail;
