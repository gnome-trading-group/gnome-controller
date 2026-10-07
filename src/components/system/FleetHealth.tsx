import { Anchor, Badge, Table, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { FleetSection } from '../../types';
import { useSystemHealth } from '../../query/hooks';
import { SectionCard } from './SectionCard';

// Machine images older than this are worth rebuilding (OS patches).
const OLD_IMAGE_DAYS = 30;

// Every instance the platform tags with its purpose: trading sessions' machines and anything else it launches.
export function FleetHealth() {
  const fleet = useSystemHealth<FleetSection>('fleet');
  const rows = fleet.data?.instances ?? [];
  return (
    <SectionCard
      title="Trading fleet"
      subtitle="Instances tagged gnome:purpose, in every region"
      loading={fleet.isLoading}
      error={fleet.error}
      regionErrors={fleet.data?.errors}
      asOf={fleet.data?.asOf}
      onRefresh={fleet.refresh}
      refreshing={fleet.refreshing}
    >
      {rows.length === 0 ? <Text size="sm" c="dimmed">No instances running.</Text> : (
        <Table verticalSpacing={6} fz="sm" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Instance</Table.Th>
              <Table.Th>Session</Table.Th>
              <Table.Th>State</Table.Th>
              <Table.Th>Checks</Table.Th>
              <Table.Th ta="right">CPU</Table.Th>
              <Table.Th>Image</Table.Th>
              <Table.Th>Launched</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(i => (
              <Table.Tr key={i.instanceId}>
                <Table.Td>
                  <Text size="sm" ff="monospace">{i.instanceId}</Text>
                  <Text size="xs" c="dimmed">{i.type} · {i.region} · {i.purpose}</Text>
                </Table.Td>
                <Table.Td>
                  {i.sessionId
                    ? <Anchor component={Link} to={`/sessions/${i.sessionId}`} size="sm" ff="monospace">{i.sessionId.slice(0, 8)}</Anchor>
                    : <Text span size="sm" c="dimmed">—</Text>}
                </Table.Td>
                <Table.Td><Badge size="xs" variant="light" color={i.state === 'running' ? 'teal' : 'gray'}>{i.state}</Badge></Table.Td>
                <Table.Td>
                  {i.checks === null ? <Text span size="sm" c="dimmed">—</Text>
                    : <Badge size="xs" variant="light" color={i.checks === 'ok' ? 'teal' : 'red'}>{i.checks}</Badge>}
                </Table.Td>
                <Table.Td ta="right">{i.cpuPercent === null ? '—' : `${i.cpuPercent}%`}</Table.Td>
                <Table.Td>
                  <Text size="xs" truncate maw={220}>{i.imageName ?? '—'}</Text>
                  {i.imageAgeDays !== null && (
                    <Text size="xs" c={i.imageAgeDays > OLD_IMAGE_DAYS ? 'orange' : 'dimmed'}>{Math.round(i.imageAgeDays)} days old</Text>
                  )}
                </Table.Td>
                <Table.Td>{i.launchedAt ? <ReactTimeAgo date={new Date(i.launchedAt)} timeStyle="round" /> : '—'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </SectionCard>
  );
}
