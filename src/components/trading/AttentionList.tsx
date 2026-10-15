import { useState } from 'react';
import { Anchor, Badge, Card, Group, Pagination, Skeleton, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconAlertOctagon, IconAlertTriangle, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { AttentionItem, Mode } from '../../types';
import { attentionLink } from '../../utils/attention';
import { formatActor } from '../../utils/kill-switch';
import { DetailTooltip } from '../system/DetailTooltip';

const LABEL = { critical: 'Critical', warning: 'Warning', info: 'Info' };

const PAGE_SIZE = 6;

const STYLE = {
  critical: { color: 'red', icon: <IconAlertOctagon size={16} /> },
  warning: { color: 'orange', icon: <IconAlertTriangle size={16} /> },
  info: { color: 'blue', icon: <IconInfoCircle size={16} /> },
};

export function AttentionList({ items, mode, loading }: { items: AttentionItem[] | undefined; mode: Mode; loading: boolean }) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil((items?.length ?? 0) / PAGE_SIZE));
  // A refresh can shrink the list out from under the page being read.
  const current = Math.min(page, pages);
  const counts = (['critical', 'warning', 'info'] as const)
    .map(severity => [severity, items?.filter(i => i.severity === severity).length ?? 0] as const)
    .filter(([, n]) => n > 0);
  return (
    <Card withBorder p="md" h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Text fw={600}>Needs attention</Text>
        <Group gap={4}>
          {counts.map(([severity, n]) => (
            <Badge key={severity} size="sm" variant="light" color={STYLE[severity].color}>{n} {LABEL[severity].toLowerCase()}</Badge>
          ))}
        </Group>
      </Group>
      {loading && !items ? (
        <Stack gap={8}>
          {[0, 1, 2].map(i => (
            <Group key={i} gap="sm" wrap="nowrap">
              <Skeleton h={28} w={28} circle />
              <Stack gap={4} style={{ flex: 1 }}><Skeleton h={12} w="55%" /><Skeleton h={10} w="80%" /></Stack>
            </Group>
          ))}
        </Stack>
      ) : !items || items.length === 0 ? (
        <Group gap="xs">
          <ThemeIcon color="teal" variant="light" size="sm" radius="xl"><IconCircleCheck size={14} /></ThemeIcon>
          <Text size="sm" c="dimmed">Nothing in {mode} needs attention.</Text>
        </Group>
      ) : (
        <Stack gap={8} style={{ flex: 1 }}>
          {items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE).map((item, i) => {
            const style = STYLE[item.severity];
            // Account items already name their account in the title.
            const account = item.accountLabel && !item.title.includes(item.accountLabel) ? item.accountLabel : null;
            // A halt says who turned it on: the OMS on its own, or a person.
            const actor = item.kind.endsWith('HALT') && item.actor ? `by ${formatActor(item.actor)}` : null;
            const acknowledged = item.acknowledgedBy ? `acknowledged by ${formatActor(item.acknowledgedBy)}` : null;
            const subject = [item.strategyName, item.symbol, account, item.sessionId?.slice(0, 8), actor, acknowledged]
              .filter(Boolean).join(' · ');
            return (
              <Group key={`${item.alertId}/${item.kind}/${item.sessionId}/${item.strategyId}/${item.listingId}/${i}`} gap="sm" wrap="nowrap" align="flex-start"
                opacity={item.acknowledgedBy ? 0.55 : undefined}>
                <DetailTooltip color={style.color} badge={LABEL[item.severity]} type={item.kind} title={item.title}
                  body={item.detail}
                  fields={[
                    ['Strategy', item.strategyName], ['Listing', item.symbol], ['Exchange', item.exchangeName],
                    ['Account', item.accountLabel], ['Part', item.subject], ['Session', item.sessionId],
                    ['By', item.actor && formatActor(item.actor)],
                    ['Since', item.since && new Date(item.since).toLocaleString()],
                    ['Acknowledged by', item.acknowledgedBy && formatActor(item.acknowledgedBy)],
                    ['Because', item.acknowledgedReason],
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
          {pages > 1 && (
            <Group justify="center" mt="auto" pt="xs">
              <Pagination size="sm" total={pages} value={current} onChange={setPage} />
            </Group>
          )}
        </Stack>
      )}
    </Card>
  );
}
