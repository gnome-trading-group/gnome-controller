import { Badge, Group, Stack, Text, Tooltip } from '@mantine/core';
import { GatewayStatus } from '../../../types/gateways';
import { zoneLabel, zonePlacement } from '../../../utils/zones';

/**
 * A gateway's region and the zone its host runs in, against its exchange's home zone: a running gateway away from
 * home moves at its next start (or at once when it holds nothing).
 */
export function GatewayZone({ gateway }: { gateway: GatewayStatus }) {
  const running = gateway.endpoint?.availabilityZoneId ?? null;
  const placement = zonePlacement(gateway.homeZoneId, running);
  return (
    <Stack gap={2}>
      <Text size="sm">{gateway.region}</Text>
      <Group gap={4} wrap="nowrap">
        {gateway.endpoint?.availabilityZone && <Text size="xs" c="dimmed">{gateway.endpoint.availabilityZone}</Text>}
        {placement === 'home' && <Badge size="xs" color="green" variant="light">home zone</Badge>}
        {placement === 'away' && (
          <Tooltip
            multiline
            w={300}
            withArrow
            label={`Its home zone is ${zoneLabel(gateway.homeZoneId)}. It moves there at its next start, or at once`
              + ' once it holds no session and no order.'}
          >
            <Badge size="xs" color="orange" variant="light">away from home</Badge>
          </Tooltip>
        )}
        {placement === 'unknown' && (
          <Text size="xs" c="dimmed">home {zoneLabel(gateway.homeZoneId)}</Text>
        )}
      </Group>
    </Stack>
  );
}
