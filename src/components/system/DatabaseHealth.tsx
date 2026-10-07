import { Badge, Group, Progress, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { DatabaseSection } from '../../types';
import { registryApi } from '../../utils/api';
import { useSystemHealth } from '../../query/hooks';
import { formatBytes, untilFull } from '../../utils/system';
import { usageColor } from '../../utils/risk-usage';
import { MetricLine } from './MetricLine';
import { SectionCard } from './SectionCard';

const percent = (v: number) => `${v.toFixed(1)}%`;
const latency = (v: number) => `${(v * 1000).toFixed(1)} ms`;

// Every RDS instance's storage against its cap, and how it's been doing over the last day; plus the registry
// database's largest tables.
export function DatabaseHealth() {
  const databases = useSystemHealth<DatabaseSection>('database');
  const tables = useQuery({ queryKey: ['tableSizes'], queryFn: () => registryApi.getTableSizes(), refetchInterval: 300_000 });

  return (
    <SectionCard
      title="Databases"
      subtitle="Storage against its cap, with a projection from the last 14 days; activity over the last 24 hours"
      loading={databases.isLoading}
      error={databases.error}
      regionErrors={databases.data?.errors}
      asOf={databases.data?.asOf}
      onRefresh={() => { databases.refresh(); tables.refetch(); }}
      refreshing={databases.refreshing || tables.isFetching}
    >
      {(databases.data?.databases ?? []).length === 0 && <Text size="sm" c="dimmed">No databases in this account.</Text>}
      <Stack gap="lg">
        {(databases.data?.databases ?? []).map(db => {
          const used = db.storage.usedGiB ?? 0;
          const share = db.storage.capacityGiB ? used / db.storage.capacityGiB : 0;
          return (
            <div key={`${db.region}/${db.identifier}`}>
              <Group gap="xs" mb={6}>
                <Text fw={600} size="sm" ff="monospace">{db.identifier}</Text>
                <Badge size="xs" variant="light" color={db.status === 'available' ? 'teal' : 'orange'}>{db.status}</Badge>
                <Text size="xs" c="dimmed">{db.engine} · {db.instanceClass} · {db.region}{db.multiAz ? ' · multi-AZ' : ''}</Text>
              </Group>
              <Group justify="space-between" mb={4}>
                <Text size="sm">
                  Storage: {db.storage.usedGiB === null ? '—' : `${used.toFixed(1)} GiB`} of {db.storage.capacityGiB} GiB
                  <Text span size="xs" c="dimmed"> ({db.allocatedGiB} GiB allocated{db.maxAllocatedGiB ? `, grows up to ${db.maxAllocatedGiB}` : ''})</Text>
                </Text>
                <Text size="sm" c={db.storage.daysUntilFull !== null && db.storage.daysUntilFull < 60 ? 'red' : 'dimmed'}>
                  full in {untilFull(db.storage.daysUntilFull)}
                  {db.storage.growthGiBPerDay !== null && db.storage.growthGiBPerDay > 0 && ` · +${db.storage.growthGiBPerDay.toFixed(2)} GiB/day`}
                </Text>
              </Group>
              <Progress value={Math.min(100, share * 100)} color={usageColor(share)} size="sm" mb="md" />
              <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="md">
                <MetricLine label="CPU" points={db.metrics.cpu} format={percent} />
                <MetricLine label="Free memory" points={db.metrics.memory} format={formatBytes} />
                <MetricLine label="Connections" points={db.metrics.connections} format={v => String(Math.round(v))} />
                <MetricLine label="Read latency" points={db.metrics.readLatency} format={latency} />
                <MetricLine label="Write latency" points={db.metrics.writeLatency} format={latency} />
              </SimpleGrid>
            </div>
          );
        })}
      </Stack>
      {tables.data && (
        <>
          <Text fw={600} size="sm" mt="lg" mb={4}>
            Registry's largest tables <Text span size="xs" c="dimmed">({formatBytes(tables.data.databaseBytes)} in all)</Text>
          </Text>
          <Table verticalSpacing={4} fz="sm" striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Table</Table.Th>
                <Table.Th ta="right">Rows (est.)</Table.Th>
                <Table.Th ta="right">Data</Table.Th>
                <Table.Th ta="right">Indexes</Table.Th>
                <Table.Th ta="right">Total</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tables.data.tables.slice(0, 10).map(t => (
                <Table.Tr key={`${t.schema}.${t.name}`}>
                  <Table.Td><Text span size="sm" ff="monospace">{t.schema}.{t.name}</Text></Table.Td>
                  <Table.Td ta="right">{Number(t.rows).toLocaleString()}</Table.Td>
                  <Table.Td ta="right">{formatBytes(t.tableBytes)}</Table.Td>
                  <Table.Td ta="right">{formatBytes(t.indexBytes)}</Table.Td>
                  <Table.Td ta="right"><Text span size="sm" fw={600}>{formatBytes(t.totalBytes)}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
    </SectionCard>
  );
}
