import { ActionIcon, Anchor, Badge, CopyButton, Divider, Drawer, Group, Loader, Stack, Text, Timeline, Tooltip } from '@mantine/core';
import { IconCheck, IconCircleDot, IconCopy, IconFlag, IconSend, IconX } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { LedgerOrder } from '../../types';
import { useOrderFills } from '../../query/hooks';
import { formatDuration } from '../../utils/format';
import { Money, Price, Qty, SideLabel, Time } from './values';

// Time since the order was opened, as the timeline shows it.
function after(openedAt: string | null, at: string | null): string {
  if (!openedAt || !at) return '';
  const ms = Date.parse(at) - Date.parse(openedAt);
  return ms < 1000 ? `+${ms}ms` : `+${formatDuration(ms)}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="md">
      <Text size="sm" c="dimmed">{label}</Text>
      <Text size="sm" component="div" ta="right" style={{ minWidth: 0 }}>{children}</Text>
    </Group>
  );
}

// One order's whole life: sent, acknowledged by the venue, each fill, and how it ended.
export function OrderDrawer({ order, onClose }: { order: LedgerOrder | null; onClose: () => void }) {
  const fills = useOrderFills(order);
  const format = { exchangeId: order?.exchangeId, tickSize: order?.tickSize };
  const ended = order && order.status !== 'OPEN';
  const outcome = order?.status === 'RECOVERED' ? 'Recovered' : order?.closeState ? order.closeState.toLowerCase() : 'closed';

  return (
    <Drawer opened={!!order} onClose={onClose} position="right" size="md"
      title={order && <Group gap="xs"><Text fw={700}>{order.symbol ?? `Listing ${order.listingId}`}</Text><SideLabel side={order.side} /></Group>}>
      {order && (
        <Stack gap="md">
          <Stack gap={6}>
            <Field label="Price">{order.price === null ? 'market' : <Price value={order.price} {...format} />}</Field>
            <Field label="Filled / size">
              <Qty value={order.fillQty} lotSize={order.lotSize} /> / <Qty value={order.size} lotSize={order.lotSize} />
            </Field>
            <Field label="Average fill"><Price value={order.avgFillPrice} {...format} derived /></Field>
            <Field label="Fees"><Money value={order.fees} pnl={false} /></Field>
            <Field label="Session">
              <Anchor component={Link} to={`/sessions/${order.sessionId}`} size="sm" ff="monospace">{order.sessionId.slice(0, 8)}</Anchor>
            </Field>
            <Field label="Order number"><Text span size="sm" ff="monospace">{order.clientOidCounter}</Text></Field>
            <Field label="Venue id">
              {order.exchangeOrderId ? (
                <Group gap={4} wrap="nowrap" justify="flex-end">
                  <Text span size="xs" ff="monospace" truncate maw={220}>{order.exchangeOrderId}</Text>
                  <CopyButton value={order.exchangeOrderId}>
                    {({ copied, copy }) => (
                      <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow>
                        <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                </Group>
              ) : <Text span size="sm" c="dimmed">{order.ackedAt ? 'none given' : 'not acknowledged'}</Text>}
            </Field>
          </Stack>

          <Divider label="Timeline" labelPosition="left" />
          <Timeline bulletSize={22} lineWidth={2} active={99}>
            <Timeline.Item bullet={<IconSend size={12} />} title="Sent">
              <Time value={order.openedAt} precision="ms" size="xs" c="dimmed" />
            </Timeline.Item>
            {order.ackedAt && (
              <Timeline.Item bullet={<IconCircleDot size={12} />} title={`Acknowledged ${after(order.openedAt, order.ackedAt)}`}>
                <Time value={order.ackedAt} precision="ms" size="xs" c="dimmed" />
              </Timeline.Item>
            )}
            {fills.isLoading && <Timeline.Item bullet={<Loader size={10} />} title="Loading fills…" />}
            {(fills.data ?? []).map(f => (
              <Timeline.Item
                key={f.fillId}
                bullet={<IconCheck size={12} />}
                color={f.source === 'RECOVERY' ? 'blue' : 'teal'}
                title={<>Filled <Qty value={f.fillQty} lotSize={f.lotSize} /> @ <Price value={f.fillPrice} exchangeId={f.exchangeId} tickSize={f.tickSize} /> {after(order.openedAt, f.recordedAt)}</>}
              >
                <Text size="xs" c="dimmed" component="div">
                  <Time value={f.recordedAt} precision="ms" size="xs" />
                  {f.liquidity && <> · {f.liquidity.toLowerCase()}</>}
                  {' · fee '}<Money value={f.fee} pnl={false} size="xs" />
                  {f.slippage !== null && <> · vs mark <Money value={f.slippage} size="xs" /></>}
                </Text>
                {f.source === 'RECOVERY' && (
                  <Text size="xs" c="blue">
                    Found on the venue at startup by session{' '}
                    <Anchor component={Link} to={`/sessions/${f.sessionId}`} size="xs" ff="monospace">{f.sessionId?.slice(0, 8)}</Anchor>
                  </Text>
                )}
              </Timeline.Item>
            ))}
            {ended ? (
              <Timeline.Item
                bullet={order.closeState === 'REJECTED' ? <IconX size={12} /> : <IconFlag size={12} />}
                color={order.closeState === 'REJECTED' ? 'red' : order.closeState === 'FILLED' ? 'teal' : 'gray'}
                title={<>{outcome.charAt(0).toUpperCase() + outcome.slice(1)} {after(order.openedAt, order.closedAt)}</>}
              >
                <Time value={order.closedAt} precision="ms" size="xs" c="dimmed" />
                {order.rejectReason && <Badge size="xs" color="red" variant="light" ml={6}>{order.rejectReason}</Badge>}
                {order.status === 'RECOVERED' && (
                  <Text size="xs" c="dimmed">Left resting when its session ended; a later session settled it on the venue.</Text>
                )}
              </Timeline.Item>
            ) : (
              <Timeline.Item bullet={<Loader size={10} />} title="Working" lineVariant="dashed">
                <Text size="xs" c="dimmed">Still open</Text>
              </Timeline.Item>
            )}
          </Timeline>
        </Stack>
      )}
    </Drawer>
  );
}
