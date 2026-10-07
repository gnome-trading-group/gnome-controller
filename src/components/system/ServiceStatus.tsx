import { useState } from 'react';
import { Badge, Card, Group, SimpleGrid, Stack, Table, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { IconAlertOctagon, IconCircleCheck, IconQuestionMark } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { AlarmsSection, AlarmState } from '../../types';
import { useSystemHealth } from '../../query/hooks';
import { SectionCard } from './SectionCard';

const STATE_COLORS: Record<AlarmState, string> = { ALARM: 'red', INSUFFICIENT_DATA: 'gray', OK: 'teal' };
const STATE_LABELS: Record<AlarmState, string> = { ALARM: 'firing', INSUFFICIENT_DATA: 'no data', OK: 'ok' };

// Every CloudWatch alarm in the account, by the service its name says it belongs to.
export function ServiceStatus() {
  const alarms = useSystemHealth<AlarmsSection>('alarms');
  const [open, setOpen] = useState<string | null>(null);
  const services = alarms.data?.services ?? [];
  const selected = services.find(s => s.name === open);

  return (
    <SectionCard
      title="Services"
      subtitle="Every CloudWatch alarm, grouped by its name's prefix"
      loading={alarms.isLoading}
      error={alarms.error}
      regionErrors={alarms.data?.errors}
      asOf={alarms.data?.asOf}
      onRefresh={alarms.refresh}
      refreshing={alarms.refreshing}
    >
      {services.length === 0 ? <Text size="sm" c="dimmed">No alarms in this account.</Text> : (
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="sm">
          {services.map(s => {
            const color = s.firing > 0 ? 'red' : 'teal';
            return (
              <UnstyledButton key={s.name} onClick={() => setOpen(open === s.name ? null : s.name)}>
                <Card withBorder p="sm" style={{ borderColor: open === s.name ? `var(--mantine-color-${color}-6)` : undefined }}>
                  <Group gap="xs" wrap="nowrap">
                    <ThemeIcon color={color} variant="light" radius="xl" size="sm">
                      {s.firing > 0 ? <IconAlertOctagon size={12} /> : <IconCircleCheck size={12} />}
                    </ThemeIcon>
                    <Text fw={600} size="sm" truncate>{s.name}</Text>
                  </Group>
                  <Text size="xs" c={s.firing > 0 ? 'red' : 'dimmed'} mt={4}>
                    {s.firing > 0 ? `${s.firing} firing` : 'all ok'} · {s.total} alarm{s.total > 1 ? 's' : ''}
                    {s.insufficient > 0 && ` · ${s.insufficient} no data`}
                  </Text>
                </Card>
              </UnstyledButton>
            );
          })}
        </SimpleGrid>
      )}
      {selected && (
        <Table mt="md" verticalSpacing={6} fz="sm" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Alarm</Table.Th>
              <Table.Th>State</Table.Th>
              <Table.Th>Since</Table.Th>
              <Table.Th>Region</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {selected.alarms.map(a => (
              <Table.Tr key={`${a.region}/${a.name}`}>
                <Table.Td>
                  <Stack gap={0}>
                    <Text size="sm">{a.name}</Text>
                    {a.state !== 'OK' && a.reason && <Text size="xs" c="dimmed" lineClamp={2}>{a.reason}</Text>}
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Badge size="xs" variant="light" color={STATE_COLORS[a.state]}
                      leftSection={a.state === 'INSUFFICIENT_DATA' ? <IconQuestionMark size={10} /> : undefined}>
                      {STATE_LABELS[a.state]}
                    </Badge>
                    {!a.actionsEnabled && <Badge size="xs" variant="outline" color="gray">notifications off</Badge>}
                  </Group>
                </Table.Td>
                <Table.Td>{a.since ? <ReactTimeAgo date={new Date(a.since)} timeStyle="round" /> : '—'}</Table.Td>
                <Table.Td><Text size="xs" ff="monospace">{a.region}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </SectionCard>
  );
}
