import { Anchor, Card, Group, Progress, Stack, Text, Tooltip } from '@mantine/core';
import { useQueries } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PolicyUsage, StrategySession } from '../../types';
import { registryApi } from '../../utils/api';
import { POLL, useRiskUsage } from '../../query/hooks';
import { formatLimit, usageColor, usageLabel } from '../../utils/risk-usage';

function scope(policy: PolicyUsage): string {
  if (policy.bindingSymbol) return `closest: ${policy.bindingSymbol}`;
  if (policy.listingId !== null) return `listing ${policy.listingId}`;
  return policy.level === 'global' ? 'all strategies' : policy.level;
}

function UsageBar({ policy }: { policy: PolicyUsage }) {
  const usage = policy.usage ?? 0;
  return (
    <div>
      <Group justify="space-between" gap="xs" mb={2} wrap="nowrap">
        <Text size="sm">
          {usageLabel(policy)} <Text span size="xs" c="dimmed">{scope(policy)}</Text>
        </Text>
        <Text size="sm" c={usageColor(usage)} style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {formatLimit(policy.policyType, policy.value)} of {formatLimit(policy.policyType, policy.limit)} · {Math.round(usage * 100)}%
        </Text>
      </Group>
      <Progress value={Math.min(100, usage * 100)} color={usageColor(usage)} size="sm" />
    </div>
  );
}

// How close a running session is to its limits, measured from the ledger as its OMS measures them.
export function LimitUsage({ sessionId, live }: { sessionId: string; live: boolean }) {
  const usage = useRiskUsage(sessionId, live);
  if (!live) return null;
  const running = usage.data?.policies.filter(p => !p.perOrder) ?? [];
  const perOrder = usage.data?.policies.filter(p => p.perOrder) ?? [];
  return (
    <Card withBorder p="sm" mb="md">
      <Group justify="space-between" mb="xs">
        <Text fw={600}>Limit usage</Text>
        <Text size="xs" c="dimmed">from the ledger, a moment behind the OMS</Text>
      </Group>
      {usage.isLoading && <Text size="sm" c="dimmed">Loading…</Text>}
      {usage.data && running.length === 0 && perOrder.length === 0 && (
        <Text size="sm" c="dimmed">No limits apply to this session.</Text>
      )}
      <Stack gap="sm">
        {running.map(p => <UsageBar key={p.policyId} policy={p} />)}
      </Stack>
      {perOrder.length > 0 && (
        <Text size="xs" c="dimmed" mt="sm">
          Checked on each order alone: {perOrder.map(p => `${usageLabel(p)} ${formatLimit(p.policyType, p.limit)}`).join(' · ')}
          {usage.data && ` — ${usage.data.refusedByRisk} order${usage.data.refusedByRisk === 1 ? '' : 's'} refused by risk limits this session`}
        </Text>
      )}
    </Card>
  );
}

// Each running session's limit closest to binding, for a strategy's Risk tab.
export function StrategyLimitUsage({ sessions }: { sessions: StrategySession[] }) {
  const usages = useQueries({
    queries: sessions.map(s => ({
      queryKey: ['riskUsage', s.sessionId],
      queryFn: () => registryApi.getRiskUsage(s.sessionId),
      refetchInterval: POLL.summary,
    })),
  });
  if (sessions.length === 0) return null;
  return (
    <Card withBorder p="sm" mb="md">
      <Text fw={600} mb="xs">Limit usage of running sessions</Text>
      <Stack gap="sm">
        {sessions.map((s, i) => {
          const top = usages[i].data?.policies.find(p => !p.perOrder);
          return (
            <Group key={s.sessionId} gap="sm" wrap="nowrap" align="flex-start">
              <Tooltip label={s.sessionId} withArrow>
                <Anchor component={Link} to={`/sessions/${s.sessionId}?tab=risk`} size="sm" ff="monospace" w={80}>
                  {s.sessionId.slice(0, 8)}
                </Anchor>
              </Tooltip>
              <div style={{ flex: 1 }}>
                {top ? <UsageBar policy={top} /> : (
                  <Text size="sm" c="dimmed">{usages[i].isLoading ? 'Loading…' : 'No running limits apply'}</Text>
                )}
              </div>
            </Group>
          );
        })}
      </Stack>
    </Card>
  );
}
