import { useState } from 'react';
import { Badge, Button, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconCircleCheck, IconHistory } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { useOpenAlerts } from '../../query/hooks';
import { Alert, AlertSeverity, groupByType, SEVERITIES, SEVERITY_COLORS, SEVERITY_LABEL, triageOrder } from '../../types';
import { SectionCard } from './SectionCard';
import { AlertGroup } from './AlertGroup';

const URGENT: AlertSeverity[] = ['CRITICAL', 'ERROR'];

function Groups({ alerts }: { alerts: Alert[] }) {
  return (
    // One width for every card, wrapping onto new rows: stretched columns left most of each card empty.
    <Group gap="sm" align="stretch">
      {groupByType(alerts).map(group => <AlertGroup key={group[0].type} alerts={group} />)}
    </Group>
  );
}

// What alerting is reporting right now, from every source: the monitoring rules, reported events and CloudWatch.
// What needs someone today shows in full; warnings and info fold away until asked for.
export function OpenAlerts() {
  const alerts = useOpenAlerts();
  const [showQuiet, setShowQuiet] = useState(false);
  const open = triageOrder(alerts.data ?? []);
  const urgent = open.filter(a => URGENT.includes(a.severity));
  const quiet = open.filter(a => !URGENT.includes(a.severity));
  const counts = SEVERITIES.map(s => [s, open.filter(a => a.severity === s).length] as const).filter(([, n]) => n > 0);
  const quietSummary = counts.filter(([s]) => !URGENT.includes(s))
    .map(([s, n]) => `${n} ${SEVERITY_LABEL[s].toLowerCase()}`).join(' · ');

  return (
    <SectionCard
      title="Open alerts"
      loading={alerts.isLoading}
      error={alerts.error}
      right={
        <>
          {counts.map(([s, n]) => (
            <Badge key={s} size="sm" variant="light" color={SEVERITY_COLORS[s]}>{n} {SEVERITY_LABEL[s].toLowerCase()}</Badge>
          ))}
          <Button component={Link} to="/system/alerts" variant="subtle" color="gray" size="compact-xs"
            leftSection={<IconHistory size={14} />} styles={{ section: { marginInlineEnd: 4 } }}>
            All alerts
          </Button>
        </>
      }
    >
      {open.length === 0 ? (
        <Group gap="xs">
          <ThemeIcon color="teal" variant="light" size="sm" radius="xl"><IconCircleCheck size={14} /></ThemeIcon>
          <Text size="sm" c="dimmed">Nothing open.</Text>
        </Group>
      ) : (
        <Stack gap="sm">
          {urgent.length > 0 ? <Groups alerts={urgent} /> : (
            <Text size="sm" c="dimmed">Nothing critical or erroring.</Text>
          )}
          {quiet.length > 0 && (
            <>
              <Button variant="subtle" color="gray" size="compact-sm" w="fit-content"
                leftSection={showQuiet ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                onClick={() => setShowQuiet(s => !s)}>
                {showQuiet ? 'Hide' : 'Show'} {quietSummary}
              </Button>
              {showQuiet && <Groups alerts={quiet} />}
            </>
          )}
        </Stack>
      )}
    </SectionCard>
  );
}
