import { Anchor, Card, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconAlertOctagon, IconAlertTriangle, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { AttentionItem, Mode } from '../../types';
import { attentionLink } from '../../utils/attention';
import { formatActor } from '../../utils/kill-switch';
import { DetailTooltip } from '../system/DetailTooltip';

const LABEL = { critical: 'Critical', warning: 'Warning', info: 'Info' };

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
            // Account items already name their account in the title.
            const account = item.accountLabel && !item.title.includes(item.accountLabel) ? item.accountLabel : null;
            // A halt says who turned it on: the OMS on its own, or a person.
            const actor = item.kind.endsWith('HALT') && item.actor ? `by ${formatActor(item.actor)}` : null;
            const acknowledged = item.acknowledgedBy ? `acknowledged by ${formatActor(item.acknowledgedBy)}` : null;
            const subject = [item.strategyName, item.symbol, account, item.sessionId?.slice(0, 8), actor, acknowledged]
              .filter(Boolean).join(' · ');
            return (
              <Group key={`${item.kind}/${item.sessionId}/${item.strategyId}/${item.listingId}/${i}`} gap="sm" wrap="nowrap" align="flex-start"
                opacity={item.acknowledgedBy ? 0.55 : undefined}>
                <DetailTooltip color={style.color} badge={LABEL[item.severity]} type={item.kind} title={item.title}
                  body={item.detail}
                  fields={[
                    ['Strategy', item.strategyName], ['Listing', item.symbol], ['Exchange', item.exchangeName],
                    ['Account', item.accountLabel], ['Part', item.subject], ['Session', item.sessionId],
                    ['By', item.actor && formatActor(item.actor)],
                    ['Since', item.since && new Date(item.since).toLocaleString()],
                    ['Acknowledged by', item.acknowledgedBy && formatActor(item.acknowledgedBy)],
                  ]}>
                  <ThemeIcon color={style.color} variant="light" size="md" radius="xl" style={{ cursor: 'help' }}>
                    {style.icon}
                  </ThemeIcon>
                </DetailTooltip>
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
