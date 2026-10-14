import { Anchor, Group, SimpleGrid, Text, ThemeIcon } from '@mantine/core';
import { IconCircleCheck } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { useOpenAlerts } from '../../query/hooks';
import { SectionCard } from './SectionCard';
import { AlertItem } from './AlertItem';

// What alerting is reporting right now, from every source: the monitoring rules, reported events and CloudWatch.
export function OpenAlerts() {
  const alerts = useOpenAlerts();
  const open = alerts.data ?? [];
  return (
    <SectionCard
      title="Open alerts"
      loading={alerts.isLoading}
      error={alerts.error}
      right={<Anchor component={Link} to="/system/alerts" size="xs">History</Anchor>}
    >
      {open.length === 0 ? (
        <Group gap="xs">
          <ThemeIcon color="teal" variant="light" size="sm" radius="xl"><IconCircleCheck size={14} /></ThemeIcon>
          <Text size="sm" c="dimmed">Nothing open.</Text>
        </Group>
      ) : (
        // Side by side, so a handful of alerts doesn't leave the page's width empty.
        <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="lg" verticalSpacing="sm">
          {open.map(alert => <AlertItem key={alert.alertId} alert={alert} />)}
        </SimpleGrid>
      )}
    </SectionCard>
  );
}
