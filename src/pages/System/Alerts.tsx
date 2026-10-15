import { useState } from 'react';
import { Button, Container, Group, MultiSelect, SegmentedControl, Stack, Text, TextInput, Title } from '@mantine/core';
import { AlertSeverity, AlertStatus, unacknowledgedFirst } from '../../types';
import { useAlerts } from '../../query/hooks';
import { SectionCard } from '../../components/system/SectionCard';
import { AlertItem } from '../../components/system/AlertItem';

const PAGE = 100;
const SEVERITIES: AlertSeverity[] = ['CRITICAL', 'ERROR', 'WARNING', 'INFO'];

// Every alert, newest first. Acknowledging stops its page and marks it taken in Slack; an ongoing problem stays open
// until it clears, so it can't page again in the meantime.
function Alerts() {
  const [status, setStatus] = useState<'open' | 'all'>('open');
  const [severity, setSeverity] = useState<string[]>([]);
  const [type, setType] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const filters = {
    status: status === 'open' ? ['PENDING', 'FIRING'] as AlertStatus[] : undefined,
    severity: severity.length > 0 ? severity as AlertSeverity[] : undefined,
    type: type.trim() || undefined,
    limit,
  };
  const alerts = useAlerts(filters);
  const rows = status === 'open' ? unacknowledgedFirst(alerts.data ?? []) : alerts.data ?? [];


  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="md">Alerts</Title>
      <Group mb="md" align="flex-end">
        <SegmentedControl value={status} onChange={v => setStatus(v as 'open' | 'all')}
          data={[{ label: 'Open', value: 'open' }, { label: 'All', value: 'all' }]} />
        <MultiSelect placeholder="Severity" data={SEVERITIES} value={severity} onChange={setSeverity} clearable w={260} />
        <TextInput placeholder="Type, e.g. SILENT" value={type} onChange={e => setType(e.currentTarget.value.toUpperCase())} w={220} />
      </Group>
      <SectionCard title={status === 'open' ? 'Open' : 'All'} loading={alerts.isLoading} error={alerts.error}>
        {rows.length === 0 ? <Text size="sm" c="dimmed">No alerts.</Text> : (
          <Stack gap="sm">
            {rows.map(alert => (
              <AlertItem key={alert.alertId} alert={alert} acknowledgeable />
            ))}
          </Stack>
        )}
        {rows.length >= limit && (
          <Group justify="center" mt="sm">
            <Button variant="subtle" size="xs" onClick={() => setLimit(limit + PAGE)}>Load more</Button>
          </Group>
        )}
      </SectionCard>
    </Container>
  );
}

export default Alerts;
