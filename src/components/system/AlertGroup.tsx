import { useState } from 'react';
import { Anchor, Badge, Card, Collapse, Group, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { Alert, alertContext, canAcknowledge } from '../../types';
import { AcknowledgeAction, AlertItem } from './AlertItem';
import { SEVERITY_STYLE } from './severityStyle';

// One problem hitting many sessions (a venue reconnecting, a pipeline failing) reads as one card, not a wall of them.
export function AlertGroup({ alerts }: { alerts: Alert[] }) {
  const [opened, setOpened] = useState(false);
  if (alerts.length === 1) return <AlertItem alert={alerts[0]} acknowledgeable fit />;

  const worst = alerts[0];
  const style = SEVERITY_STYLE[worst.severity];
  const untaken = alerts.filter(canAcknowledge);
  const where = [...new Set(alerts.map(a => alertContext(a)[0]).filter(Boolean))];
  return (
    <Card withBorder p="sm" w={340} opacity={untaken.length === 0 ? 0.55 : undefined}>
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <ThemeIcon color={style.color} variant="light" size="sm" radius="xl">{style.icon}</ThemeIcon>
        <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
          <UnstyledButton onClick={() => setOpened(o => !o)}>
            <Group gap={4} wrap="nowrap">
              <Text size="sm" fw={600} c={style.color} truncate>{worst.type}</Text>
              <Badge size="xs" variant="light" color={style.color}>×{alerts.length}</Badge>
              {opened ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            </Group>
          </UnstyledButton>
          <Text size="xs" c="dimmed" truncate>
            {where.length > 0 ? where.join(', ') : worst.title} · latest <ReactTimeAgo date={new Date(worst.firstSeen)} timeStyle="round" />
          </Text>
        </Stack>
        {untaken.length > 0 && <AcknowledgeAction alerts={untaken} label="All" />}
      </Group>
      <Collapse in={opened}>
        <Stack gap={4} mt="xs">
          {alerts.map(alert => (
            <Group key={alert.alertId} gap="xs" wrap="nowrap" opacity={canAcknowledge(alert) ? undefined : 0.55}>
              <Anchor component={Link} to={alert.sessionId ? `/sessions/${alert.sessionId}` : '/system/alerts'} size="xs"
                truncate style={{ flex: 1, minWidth: 0 }}>
                {alert.title}
              </Anchor>
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                <ReactTimeAgo date={new Date(alert.firstSeen)} timeStyle="round" />
              </Text>
              {canAcknowledge(alert) && <AcknowledgeAction alerts={[alert]} />}
            </Group>
          ))}
        </Stack>
      </Collapse>
    </Card>
  );
}
