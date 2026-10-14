import { useState } from 'react';
import { Button, Container, Group, MultiSelect, SegmentedControl, Stack, Text, TextInput, Title } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { AlertSeverity, AlertStatus } from '../../types';
import { useAlerts } from '../../query/hooks';
import { registryApi } from '../../utils/api';
import { SectionCard } from '../../components/system/SectionCard';
import { AlertItem } from '../../components/system/AlertItem';

const PAGE = 100;
const SEVERITIES: AlertSeverity[] = ['CRITICAL', 'ERROR', 'WARNING', 'INFO'];

// Every alert, newest first. Closing one only ends its row here; a page is acknowledged and resolved in incident.io,
// and an alert whose problem is still there opens again on the next tick.
function Alerts() {
  const client = useQueryClient();
  const [status, setStatus] = useState<'open' | 'all'>('open');
  const [severity, setSeverity] = useState<string[]>([]);
  const [type, setType] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [closing, setClosing] = useState<number | null>(null);
  const filters = {
    status: status === 'open' ? ['PENDING', 'FIRING'] as AlertStatus[] : undefined,
    severity: severity.length > 0 ? severity as AlertSeverity[] : undefined,
    type: type.trim() || undefined,
    limit,
  };
  const alerts = useAlerts(filters);
  const rows = alerts.data ?? [];

  const close = async (alertId: number) => {
    setClosing(alertId);
    try {
      await registryApi.closeAlert(alertId);
      await client.invalidateQueries({ queryKey: ['alerts'] });
    } finally {
      setClosing(null);
    }
  };

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
          <Stack gap={10}>
            {rows.map(alert => (
              <AlertItem key={alert.alertId} alert={alert} onClose={() => close(alert.alertId)} closing={closing === alert.alertId} />
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
