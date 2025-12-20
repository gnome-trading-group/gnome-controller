import { useState } from 'react';
import {
  Container,
  Title,
  TextInput,
  Button,
  Group,
  Stack,
  Select,
  MultiSelect,
  NumberInput,
  Switch,
  Table,
  Badge,
  Text,
  Paper,
  ActionIcon,
  Tooltip,
  Loader,
  Alert,
  Collapse,
} from '@mantine/core';
import { IconPlus, IconTrash, IconPlayerPlay, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { latencyProbeApi } from '../../utils/api';
import { LatencyProbeResponse } from '../../types';

interface Target {
  id: string;
  url: string;
  protocol: 'http' | 'websocket' | 'tcp';
  method: string;
}

const DEFAULT_REGIONS = [
  'us-east-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
  'ap-northeast-1',
  'ap-southeast-1',
];

const ALL_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-east-2', label: 'US East (Ohio)' },
  { value: 'us-west-1', label: 'US West (N. California)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'EU (Ireland)' },
  { value: 'eu-west-2', label: 'EU (London)' },
  { value: 'eu-central-1', label: 'EU (Frankfurt)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { value: 'ap-south-1', label: 'Asia Pacific (Mumbai)' },
  { value: 'sa-east-1', label: 'South America (São Paulo)' },
];

function LatencyProbe() {
  const [targets, setTargets] = useState<Target[]>([
    { id: '1', url: '', protocol: 'http', method: 'GET' },
  ]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>(DEFAULT_REGIONS);
  const [samples, setSamples] = useState<number>(5);
  const [warmup, setWarmup] = useState<boolean>(true);
  const [timeout, setTimeout] = useState<number>(10000);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<LatencyProbeResponse | null>(null);
  const [expandedTargets, setExpandedTargets] = useState<Set<number>>(new Set([0]));

  const addTarget = () => {
    setTargets([
      ...targets,
      { id: Date.now().toString(), url: '', protocol: 'http', method: 'GET' },
    ]);
  };

  const removeTarget = (id: string) => {
    if (targets.length > 1) {
      setTargets(targets.filter((t) => t.id !== id));
    }
  };

  const updateTarget = (id: string, field: keyof Target, value: string) => {
    setTargets(
      targets.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  };

  const toggleTargetExpanded = (index: number) => {
    const newExpanded = new Set(expandedTargets);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedTargets(newExpanded);
  };

  const runProbe = async () => {
    const validTargets = targets.filter((t) => t.url.trim() !== '');
    if (validTargets.length === 0) {
      setError('Please enter at least one URL');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await latencyProbeApi.run({
        targets: validTargets.map((t) => ({
          url: t.url,
          protocol: t.protocol,
          method: t.method,
        })),
        regions: selectedRegions,
        samples,
        warmup,
        timeout,
      });
      setResults(response);
      // Expand all results
      setExpandedTargets(new Set(response.results.map((_, i) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run probe');
    } finally {
      setLoading(false);
    }
  };

  const getLatencyColor = (avg: number): string => {
    if (avg < 20) return 'green';
    if (avg < 50) return 'lime';
    if (avg < 100) return 'yellow';
    if (avg < 200) return 'orange';
    return 'red';
  };

  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="lg">Latency Probe</Title>

      {error && (
        <Alert color="red" mb="md" onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      <Paper p="md" withBorder mb="lg">
        <Stack>
          <Title order={4}>Targets</Title>
          {targets.map((target, index) => (
            <Group key={target.id} align="flex-end">
              <TextInput
                label={index === 0 ? 'URL' : undefined}
                placeholder="https://api.example.com/ping or wss://stream.example.com"
                value={target.url}
                onChange={(e) => updateTarget(target.id, 'url', e.target.value)}
                style={{ flex: 1 }}
              />
              <Select
                label={index === 0 ? 'Protocol' : undefined}
                value={target.protocol}
                onChange={(v) => updateTarget(target.id, 'protocol', v || 'http')}
                data={[
                  { value: 'http', label: 'HTTP' },
                  { value: 'websocket', label: 'WebSocket' },
                  { value: 'tcp', label: 'TCP' },
                ]}
                w={120}
              />
              {target.protocol === 'http' && (
                <Select
                  label={index === 0 ? 'Method' : undefined}
                  value={target.method}
                  onChange={(v) => updateTarget(target.id, 'method', v || 'GET')}
                  data={['GET', 'POST', 'HEAD']}
                  w={100}
                />
              )}
              <Tooltip label="Remove">
                <ActionIcon
                  color="red"
                  variant="subtle"
                  onClick={() => removeTarget(target.id)}
                  disabled={targets.length === 1}
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Tooltip>
            </Group>
          ))}
          <Button
            leftSection={<IconPlus size={16} />}
            variant="subtle"
            onClick={addTarget}
            w="fit-content"
          >
            Add Target
          </Button>
        </Stack>
      </Paper>

      <Paper p="md" withBorder mb="lg">
        <Stack>
          <Title order={4}>Options</Title>
          <Group>
            <MultiSelect
              label="Regions"
              placeholder="Select regions"
              data={ALL_REGIONS}
              value={selectedRegions}
              onChange={setSelectedRegions}
              searchable
              clearable
              w={400}
            />
            <NumberInput
              label="Samples"
              value={samples}
              onChange={(v) => setSamples(Number(v) || 5)}
              min={1}
              max={20}
              w={100}
            />
            <NumberInput
              label="Timeout (ms)"
              value={timeout}
              onChange={(v) => setTimeout(Number(v) || 10000)}
              min={1000}
              max={60000}
              step={1000}
              w={130}
            />
            <Switch
              label="Warmup"
              checked={warmup}
              onChange={(e) => setWarmup(e.currentTarget.checked)}
              mt="xl"
            />
          </Group>
        </Stack>
      </Paper>

      <Button
        leftSection={loading ? <Loader size={16} color="white" /> : <IconPlayerPlay size={16} />}
        onClick={runProbe}
        disabled={loading}
        size="lg"
        mb="lg"
      >
        {loading ? 'Running Probe...' : 'Run Probe'}
      </Button>

      {results && (
        <Stack>
          <Text size="sm" c="dimmed">
            Completed at {new Date(results.timestamp).toLocaleString()}
          </Text>
          {results.results.map((targetResult, index) => (
            <Paper key={index} p="md" withBorder>
              <Group
                style={{ cursor: 'pointer' }}
                onClick={() => toggleTargetExpanded(index)}
                mb={expandedTargets.has(index) ? 'md' : 0}
              >
                {expandedTargets.has(index) ? (
                  <IconChevronDown size={20} />
                ) : (
                  <IconChevronRight size={20} />
                )}
                <Badge color="blue" variant="light">
                  {targetResult.target.protocol.toUpperCase()}
                </Badge>
                <Text fw={500}>{targetResult.target.url}</Text>
              </Group>
              <Collapse in={expandedTargets.has(index)}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Region</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Min</Table.Th>
                      <Table.Th>Avg</Table.Th>
                      <Table.Th>P50</Table.Th>
                      <Table.Th>P95</Table.Th>
                      <Table.Th>Max</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {targetResult.regions.map((region) => (
                      <Table.Tr key={region.region}>
                        <Table.Td>
                          <Text fw={500}>{region.regionName}</Text>
                          <Text size="xs" c="dimmed">{region.region}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={region.status === 'success' ? 'green' : 'red'}>
                            {region.status}
                          </Badge>
                        </Table.Td>
                        {region.status === 'success' && region.latencies ? (
                          <>
                            <Table.Td>{region.latencies.min.toFixed(1)} ms</Table.Td>
                            <Table.Td>
                              <Badge color={getLatencyColor(region.latencies.avg)}>
                                {region.latencies.avg.toFixed(1)} ms
                              </Badge>
                            </Table.Td>
                            <Table.Td>{region.latencies.p50.toFixed(1)} ms</Table.Td>
                            <Table.Td>{region.latencies.p95.toFixed(1)} ms</Table.Td>
                            <Table.Td>{region.latencies.max.toFixed(1)} ms</Table.Td>
                          </>
                        ) : (
                          <Table.Td colSpan={5}>
                            <Text c="red" size="sm">{region.error}</Text>
                          </Table.Td>
                        )}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Collapse>
            </Paper>
          ))}
        </Stack>
      )}
    </Container>
  );
}

export default LatencyProbe;

