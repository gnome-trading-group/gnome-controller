import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Title,
  Badge,
  Group,
  Button,
  Card,
  Text,
  SimpleGrid,
  Notification,
  Center,
  Loader,
  Alert,
} from '@mantine/core';
import { IconArrowLeft, IconAlertCircle } from '@tabler/icons-react';
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

const ACTIVE_STATUSES = new Set(['SUBMITTED', 'PENDING', 'RUNNABLE', 'STARTING', 'RUNNING']);

function formatDate(iso: string | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

function BacktestDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<BacktestJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!jobId) return;
    try {
      setError(null);
      const data = await controllerApi.getBacktest(jobId);
      setJob(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load backtest');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh while job is active.
  useEffect(() => {
    if (!job || !ACTIVE_STATUSES.has(job.status)) return;
    const interval = setInterval(loadData, 5_000);
    return () => clearInterval(interval);
  }, [job, loadData]);

  if (loading) {
    return (
      <Center h="50vh">
        <Loader />
      </Center>
    );
  }

  if (error || !job) {
    return (
      <Container size="md">
        <Notification color="red">{error || 'Backtest not found'}</Notification>
      </Container>
    );
  }

  return (
    <Container size="xl">
      <Group mb="md">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => navigate('/backtests')}
        >
          Back
        </Button>
      </Group>

      <Group justify="space-between" mb="lg">
        <Title order={2}>{job.presetName || 'Backtest'}</Title>
        <Badge color={STATUS_COLORS[job.status] ?? 'gray'} variant="light" size="lg">
          {job.status}
        </Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="lg">
        <Card withBorder>
          <Text size="xs" c="dimmed" tt="uppercase">
            Job ID
          </Text>
          <Text size="sm" fw={600} ff="monospace">
            {job.jobId}
          </Text>
        </Card>
        <Card withBorder>
          <Text size="xs" c="dimmed" tt="uppercase">
            Research Commit
          </Text>
          <Text size="sm" fw={600} ff="monospace">
            {job.researchCommit}
          </Text>
        </Card>
        <Card withBorder>
          <Text size="xs" c="dimmed" tt="uppercase">
            Submitted
          </Text>
          <Text size="sm" fw={600}>
            {formatDate(job.submittedAt)}
          </Text>
        </Card>
        <Card withBorder>
          <Text size="xs" c="dimmed" tt="uppercase">
            Completed
          </Text>
          <Text size="sm" fw={600}>
            {formatDate(job.completedAt)}
          </Text>
        </Card>
      </SimpleGrid>

      {job.status === 'FAILED' && job.error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" mb="lg" title="Error">
          {job.error}
        </Alert>
      )}

      {ACTIVE_STATUSES.has(job.status) && (
        <Card withBorder mb="lg" p="xl">
          <Center>
            <Group>
              <Loader size="sm" />
              <Text>Backtest is {job.status.toLowerCase()}...</Text>
            </Group>
          </Center>
        </Card>
      )}

      {job.status === 'SUCCEEDED' && job.reportUrl && (
        <Card withBorder p={0} style={{ overflow: 'hidden' }}>
          <iframe
            src={job.reportUrl}
            sandbox="allow-scripts"
            title="Backtest Report"
            style={{
              width: '100%',
              height: 'calc(100vh - 300px)',
              minHeight: 600,
              border: 'none',
            }}
          />
        </Card>
      )}

      {job.status === 'SUCCEEDED' && !job.reportUrl && (
        <Alert color="yellow" title="No Report">
          Backtest completed but no report.html was found in the results.
        </Alert>
      )}
    </Container>
  );
}

export default BacktestDetail;
