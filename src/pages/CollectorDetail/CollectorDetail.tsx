import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useGlobalState } from '../../context/GlobalStateContext';
import {
  Container,
  Title,
  Card,
  Text,
  Badge,
  Group,
  Stack,
  Tabs,
  ScrollArea,
  ActionIcon,
  Tooltip,
  Grid,
  Notification,
  Code,
  Divider,
  Center,
  Loader,
  Modal,
  Button,
} from '@mantine/core';
import { IconRefresh, IconExternalLink, IconPlayerStop, IconAB2 } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { collectorsApi } from '../../utils/api';

interface Collector {
  listingId: number;
  status: string;
  lastStatusChange: number;
  failureReason?: string;
  serviceArn: string;
  deploymentVersion: string;
  taskArns: string[];
}

interface TaskDetail {
  taskArn: string;
  lastStatus: string;
  healthStatus: string;
  createdAt: number;
  startedAt?: number;
  stoppedAt?: number;
  cpu: string;
  memory: string;
}

interface LogsResponse {
  taskArn: string;
  logs: LogEvent[];
  consoleUrl: string;
}

interface LogEvent {
  timestamp: number;
  message: string;
  logStreamName: string;
}

function CollectorDetail() {
  const { listingId } = useParams<{ listingId: string }>();
  const { listings, exchanges, securities } = useGlobalState();
  
  const [collector, setCollector] = useState<Collector | null>(null);
  const [taskDetails, setTaskDetails] = useState<TaskDetail[]>([]);
  const [logs, setLogs] = useState<LogsResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [initialLogsLoad, setInitialLogsLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTaskArn, setSelectedTaskArn] = useState<string>('');
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const [redeployModalOpen, setRedeployModalOpen] = useState(false);

  const listing = listings.find(l => l.listingId === Number(listingId));
  const exchange = exchanges.find(e => e.exchangeId === listing?.exchangeId);
  const security = securities.find(s => s.securityId === listing?.securityId);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'green';
      case 'INACTIVE': return 'gray';
      case 'PENDING': return 'blue';
      case 'FAILED': return 'red';
      default: return 'gray';
    }
  };

  const getTaskStatusColor = (status: string) => {
    switch (status) {
      case 'RUNNING': return 'green';
      case 'PENDING': return 'blue';
      case 'STOPPED': return 'red';
      default: return 'gray';
    }
  };

  const loadCollector = async (showLoading = true) => {
    if (!listingId) return;
    
    try {
      if (showLoading) {
        setLoading(true);
      }
      setError(null);
      const response = await collectorsApi.get(Number(listingId));
      setCollector(response.collector);
      setTaskDetails(response.taskDetails || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collector');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
      setInitialLoad(false);
    }
  };

  const loadLogs = async (showLoading = true) => {
    if (!listingId) return;
    
    try {
      if (showLoading) {
        setLogsLoading(true);
      }
      const response = await collectorsApi.getLogs(Number(listingId));
      setLogs(response.logs);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      if (showLoading) {
        setLogsLoading(false);
      }
      setInitialLogsLoad(false);
    }
  };

  const handleStopCollector = async () => {
    if (!listingId) return;
    
    try {
      setError(null);
      await collectorsApi.delete(Number(listingId));
      await loadCollector();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to stop collector');
      }
    } finally {
      setStopModalOpen(false);
    }
  };

  const handleRedeployCollector = async () => {
    if (!listingId) return;
    
    try {
      setError(null);
      await collectorsApi.redeploy(Number(listingId));
      await loadCollector();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to redeploy collector');
      }
    } finally {
      setRedeployModalOpen(false);
    }
  };

  useEffect(() => {
    loadCollector();
  }, [listingId]);

  useEffect(() => {
    // Set the first task as selected when taskDetails change
    if (taskDetails.length > 0 && !selectedTaskArn) {
      setSelectedTaskArn(taskDetails[0].taskArn);
    } else if (taskDetails.length === 0) {
      setSelectedTaskArn('');
    }
  }, [taskDetails]);

  useEffect(() => {
    // Load logs for all tasks when component mounts or listingId changes
    if (taskDetails.length > 0) {
      loadLogs();
    }
    
    // Auto-refresh logs every 5 seconds
    const interval = setInterval(() => {
      if (taskDetails.length > 0) {
        loadLogs(false);
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [listingId, taskDetails]);

  // Auto-refresh collector data every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => loadCollector(false), 10000);
    return () => clearInterval(interval);
  }, [listingId]);

  if (loading && initialLoad) {
    return (
      <Container size="xl" py="xl">
        <Center style={{ minHeight: '60vh' }}>
          <Stack align="center" gap="xl">
            <Loader size="xl" color="green" />
            <Stack align="center" gap="xs">
              <Title order={3} c="dimmed">
                Loading Collector Details
              </Title>
              <Text size="sm" c="dimmed">
                Fetching data for collector {listingId}...
              </Text>
            </Stack>
          </Stack>
        </Center>
      </Container>
    );
  }

  if (!collector) {
    return (
      <Container size="xl" py="xl">
        <Text color="red">Collector not found</Text>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Collector {listingId}</Title>
        <Group>
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon 
              size="lg" 
              variant="filled" 
              color="green"
              onClick={() => loadCollector()}
              loading={loading}
            >
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
          {collector?.status === 'ACTIVE' && (
            <>
              <Tooltip label="Stop" position="bottom" withArrow openDelay={500}>
                <ActionIcon 
                  size="lg" 
                  variant="filled" 
                  color="red"
                  onClick={() => setStopModalOpen(true)}
                >
                  <IconPlayerStop size={20} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Redeploy" position="bottom" withArrow openDelay={500}>
                <ActionIcon 
                  size="lg" 
                  variant="filled" 
                  color="blue"
                  onClick={() => setRedeployModalOpen(true)}
                >
                  <IconAB2 size={20} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>
      </Group>

      {error && (
        <Notification 
          color="red" 
          title="Error" 
          onClose={() => setError(null)}
          mb="md"
        >
          {error}
        </Notification>
      )}

      <Grid>
        <Grid.Col span={6}>
          <Card withBorder>
            <Title order={4} mb="md">Listing Information</Title>
            {listing ? (
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={500}>Exchange:</Text>
                  <Text>{exchange?.exchangeName}</Text>
                </Group>
                <Group justify="space-between">
                  <Text fw={500}>Security:</Text>
                  <Text>{security?.symbol}</Text>
                </Group>
                <Group justify="space-between">
                  <Text fw={500}>Listing ID:</Text>
                  <Text>{listing.listingId}</Text>
                </Group>
              </Stack>
            ) : (
              <Text c="dimmed">Listing information not available</Text>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={6}>
          <Card withBorder>
            <Title order={4} mb="md">Collector Status</Title>
            <Stack gap="xs">
              <Group justify="space-between">
                <Text fw={500}>Status:</Text>
                <Badge color={getStatusColor(collector.status)}>
                  {collector.status}
                </Badge>
              </Group>
              <Group justify="space-between">
                <Text fw={500}>Last Status Change:</Text>
                <Text>
                  {collector.lastStatusChange ? 
                    <ReactTimeAgo date={collector.lastStatusChange * 1000} timeStyle="round" /> : 
                    '-'
                  }
                </Text>
              </Group>
              <Group justify="space-between">
                <Text fw={500}>Deployment Version:</Text>
                <Text>{collector.deploymentVersion}</Text>
              </Group>
              {collector.failureReason && (
                <Group justify="space-between">
                  <Text fw={500}>Failure Reason:</Text>
                  <Text c="red">{collector.failureReason}</Text>
                </Group>
              )}
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      <Card withBorder mt="md">
        <Title order={4} mb="md">Task Details</Title>
        {taskDetails.length > 0 ? (
          <Stack gap="sm">
            {taskDetails.map((task, index) => (
              <Card key={task.taskArn} withBorder p="sm">
                <Group justify="space-between">
                  <Group>
                    <Text fw={500}>Task {index + 1}</Text>
                    <Badge color={getTaskStatusColor(task.lastStatus)}>
                      {task.lastStatus}
                    </Badge>
                    {task.healthStatus && (
                      <Badge variant="light">
                        Health: {task.healthStatus}
                      </Badge>
                    )}
                  </Group>
                  <Group gap="xs">
                    <Text size="sm" c="dimmed">CPU: {task.cpu}</Text>
                    <Text size="sm" c="dimmed">Memory: {task.memory}</Text>
                  </Group>
                </Group>
                <Text size="xs" c="dimmed" mt="xs">
                  {task.taskArn.split('/').pop()}
                </Text>
              </Card>
            ))}
          </Stack>
        ) : (
          <Text c="dimmed">No running tasks</Text>
        )}
      </Card>

      <Card withBorder mt="md">
        <Group justify="space-between" mb="md">
          <Title order={4}>Container Logs</Title>
          <Group>
            {selectedTaskArn && logs.find(log => log.taskArn === selectedTaskArn)?.consoleUrl && (
              <Tooltip label="View in AWS Console" position="bottom" withArrow>
                <ActionIcon 
                  component="a"
                  href={logs.find(log => log.taskArn === selectedTaskArn)?.consoleUrl}
                  target="_blank"
                  variant="light"
                >
                  <IconExternalLink size={16} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label="Refresh Logs" position="bottom" withArrow>
              <ActionIcon 
                onClick={() => loadLogs()}
                loading={logsLoading}
                disabled={!selectedTaskArn}
              >
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {taskDetails.length > 0 ? (
          <Tabs value={selectedTaskArn} onChange={(value) => setSelectedTaskArn(value || '')}>
            <Tabs.List>
              {taskDetails.map((task, index) => (
                <Tabs.Tab key={task.taskArn} value={task.taskArn}>
                  Task {index + 1}
                </Tabs.Tab>
              ))}
            </Tabs.List>

            {taskDetails.map((task) => (
              <Tabs.Panel key={task.taskArn} value={task.taskArn} pt="md">
                <ScrollArea h={400}>
                  {logsLoading && initialLogsLoad ? (
                    <Center h={350}>
                      <Stack align="center" gap="md">
                        <Loader size="lg" color="blue" />
                        <Stack align="center" gap="xs">
                          <Text fw={500} c="dimmed">
                            Loading Logs
                          </Text>
                          <Text size="sm" c="dimmed">
                            Task {taskDetails.findIndex(t => t.taskArn === task.taskArn) + 1}
                          </Text>
                        </Stack>
                      </Stack>
                    </Center>
                  ) : logs.find(log => log.taskArn === task.taskArn)?.logs?.length || 0 > 0 ? (
                    <Stack gap="xs">
                      {logs.find(log => log.taskArn === task.taskArn)?.logs.map((logEvent, index) => (
                        <div key={index}>
                          <Group gap="xs" align="flex-start">
                            <Text size="xs" c="dimmed" style={{ minWidth: '140px' }}>
                              {new Date(logEvent.timestamp).toLocaleTimeString()}
                            </Text>
                            <Code block style={{ flex: 1, fontSize: '12px' }}>
                              {logEvent.message}
                            </Code>
                          </Group>
                          {index < (logs.find(log => log.taskArn === task.taskArn)?.logs.length || 0) - 1 && <Divider size="xs" />}
                        </div>
                      ))}
                    </Stack>
                  ) : (
                    <Center h={350}>
                      <Stack align="center" gap="xs">
                        <Text size="xl">📝</Text>
                        <Text c="dimmed">No recent logs available for this task</Text>
                      </Stack>
                    </Center>
                  )}
                </ScrollArea>
              </Tabs.Panel>
            ))}
          </Tabs>
        ) : (
          <Text c="dimmed">No running tasks - logs unavailable</Text>
        )}
      </Card>

      <Modal
        opened={stopModalOpen}
        onClose={() => setStopModalOpen(false)}
        title="Stop Collector"
      >
        <Stack>
          <Text>Are you sure you want to stop this collector?</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setStopModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              color="red" 
              onClick={handleStopCollector}
            >
              Stop Collector
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={redeployModalOpen}
        onClose={() => setRedeployModalOpen(false)}
        title="Redeploy Collector"
      >
        <Stack>
          <Text>Are you sure you want to redeploy this collector?</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRedeployModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              color="blue" 
              onClick={handleRedeployCollector}
            >
              Redeploy Collector
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default CollectorDetail;
