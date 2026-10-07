import { Anchor, Card, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconAlertOctagon, IconAlertTriangle, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { AttentionItem, Mode } from '../../types';
import { attentionLink } from '../../utils/attention';

const STYLE = {
  critical: { color: 'red', icon: <IconAlertOctagon size={16} /> },
  warning: { color: 'orange', icon: <IconAlertTriangle size={16} /> },
  info: { color: 'blue', icon: <IconInfoCircle size={16} /> },
};

export function AttentionList({ items, mode, loading }: { items: AttentionItem[] | undefined; mode: Mode; loading: boolean }) {
  return (
    <Card withBorder p="md" h="100%">
      <Text fw={600} mb="sm">Needs attention</Text>
      {!items || items.length === 0 ? (
        <Group gap="xs">
          {!loading && <ThemeIcon color="teal" variant="light" size="sm" radius="xl"><IconCircleCheck size={14} /></ThemeIcon>}
          <Text size="sm" c="dimmed">{loading ? 'Checking…' : `Nothing in ${mode} needs attention.`}</Text>
        </Group>
      ) : (
        <Stack gap={8}>
          {items.map((item, i) => {
            const style = STYLE[item.severity];
            const subject = [item.strategyName, item.symbol, item.sessionId?.slice(0, 8)].filter(Boolean).join(' · ');
            return (
              <Group key={`${item.kind}/${item.sessionId}/${item.strategyId}/${item.listingId}/${i}`} gap="sm" wrap="nowrap" align="flex-start">
                <ThemeIcon color={style.color} variant="light" size="md" radius="xl">{style.icon}</ThemeIcon>
                <Stack gap={0} style={{ minWidth: 0 }}>
                  <Anchor component={Link} to={attentionLink(item, mode)} size="sm" fw={600} c={style.color}>
                    {item.title}
                  </Anchor>
                  <Text size="xs" c="dimmed" truncate>
                    {subject}
                    {item.since && <> · <ReactTimeAgo date={new Date(item.since)} timeStyle="round" /></>}
                  </Text>
                  {item.detail && <Text size="xs" c="dimmed" lineClamp={2}>{item.detail}</Text>}
                </Stack>
              </Group>
            );
          })}
        </Stack>
      )}
    </Card>
  );
}
