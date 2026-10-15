import { Button, Group, Text, ThemeIcon } from '@mantine/core';
import { IconCircleCheck, IconHistory } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { useOpenAlerts } from '../../query/hooks';
import { unacknowledgedFirst } from '../../types';
import { SectionCard } from './SectionCard';
import { AlertItem } from './AlertItem';

// What alerting is reporting right now, from every source: the monitoring rules, reported events and CloudWatch.
export function OpenAlerts() {
  const alerts = useOpenAlerts();
  const open = unacknowledgedFirst(alerts.data ?? []);
  return (
    <SectionCard
      title="Open alerts"
      loading={alerts.isLoading}
      error={alerts.error}
      right={
        <Button component={Link} to="/system/alerts" variant="subtle" color="gray" size="compact-xs"
          leftSection={<IconHistory size={14} />} styles={{ section: { marginInlineEnd: 4 } }}>
          History
        </Button>
      }
    >
      {open.length === 0 ? (
        <Group gap="xs">
          <ThemeIcon color="teal" variant="light" size="sm" radius="xl"><IconCircleCheck size={14} /></ThemeIcon>
          <Text size="sm" c="dimmed">Nothing open.</Text>
        </Group>
      ) : (
        // One width for every card, wrapping onto new rows: stretched columns left most of each card empty.
        <Group gap="sm" align="stretch">
          {open.map(alert => <AlertItem key={alert.alertId} alert={alert} acknowledgeable fit />)}
        </Group>
      )}
    </SectionCard>
  );
}
