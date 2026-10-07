import { ReactNode } from 'react';
import { Anchor, Badge, Card, Divider, Group, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import ReactTimeAgo from 'react-time-ago';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { controllerApi, marketDataApi } from '../../utils/api';
import { BacktestRun } from '../../types/backtests';
import { ResearchSession } from '../../types/research';

interface Collector {
  listingId: number;
  status: string;
  failureReason: string | null;
}

const BACKTEST_STATUS_COLORS: Record<string, string> = {
  SUBMITTED: 'blue',
  PENDING: 'blue',
  RUNNING: 'green',
  COMPLETED: 'teal',
  PARTIALLY_FAILED: 'orange',
  FAILED: 'red',
  CANCELLED: 'gray',
};

const RESEARCH_STATUS_COLORS: Record<string, string> = {
  running: 'green',
  completed: 'teal',
  stalled: 'orange',
  paused: 'yellow',
};

const REFRESH_MS = 60_000;
const SHOWN = 5;

function PlatformCard({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <Card withBorder p="md">
      <Group justify="space-between" mb="sm">
        <Text fw={600}>{title}</Text>
        <Anchor component={Link} to={href} size="xs" c="dimmed">View all →</Anchor>
      </Group>
      {children}
    </Card>
  );
}

// One line of a compact list: what it is on the left, its status and age on the right.
function Row({ onClick, label, badge, when }: { onClick: () => void; label: ReactNode; badge: ReactNode; when: string | null }) {
  return (
    <UnstyledButton onClick={onClick} style={{ borderRadius: 4 }}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text size="sm" truncate style={{ minWidth: 0 }}>{label}</Text>
        <Group gap={8} wrap="nowrap">
          {badge}
          <Text size="xs" c="dimmed" w={70} ta="right">
            {when ? <ReactTimeAgo date={new Date(when)} timeStyle="round" /> : '—'}
          </Text>
        </Group>
      </Group>
    </UnstyledButton>
  );
}

function Empty({ loading, children }: { loading: boolean; children: ReactNode }) {
  return <Text size="sm" c="dimmed">{loading ? 'Loading…' : children}</Text>;
}

// The rest of the platform, below the trading overview: market data collectors, backtests and research.
export function PlatformSection() {
  const navigate = useNavigate();
  const collectors = useQuery({
    queryKey: ['collectors'],
    queryFn: async () => (await marketDataApi.listCollectors() as { collectors: Collector[] }).collectors,
    refetchInterval: REFRESH_MS,
  });
  const backtests = useQuery({
    queryKey: ['recentBacktests'],
    queryFn: async () => (await controllerApi.listBacktests({ limit: 10 }) as { runs: BacktestRun[] }).runs,
    refetchInterval: REFRESH_MS,
  });
  const research = useQuery({
    queryKey: ['recentResearch'],
    queryFn: async () => (await controllerApi.listResearchSessions({ limit: 10 }) as { sessions: ResearchSession[] }).sessions,
    refetchInterval: REFRESH_MS,
  });

  const all = collectors.data ?? [];
  const active = all.filter(c => c.status === 'ACTIVE').length;
  const failed = all.filter(c => c.status === 'FAILED');
  const recentBacktests = (backtests.data ?? []).slice(0, SHOWN);
  const recentResearch = (research.data ?? []).slice(0, SHOWN);

  return (
    <>
      <Divider label="Platform" labelPosition="left" mt="xl" mb="md" />
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        <PlatformCard title="Market data collectors" href="/market-data/collectors">
          <Group gap="xl" mb={failed.length ? 'sm' : 0}>
            <div>
              <Text size="xl" fw={700}>{collectors.isLoading ? '—' : active}</Text>
              <Text size="xs" c="dimmed">active</Text>
            </div>
            <div>
              <Text size="xl" fw={700} c={failed.length ? 'red' : undefined}>{collectors.isLoading ? '—' : failed.length}</Text>
              <Text size="xs" c="dimmed">failed</Text>
            </div>
            <div>
              <Text size="xl" fw={700}>{collectors.isLoading ? '—' : all.length}</Text>
              <Text size="xs" c="dimmed">total</Text>
            </div>
          </Group>
          {failed.length > 0 && (
            <Stack gap={4}>
              {failed.slice(0, SHOWN).map(c => (
                <Anchor key={c.listingId} component={Link} to={`/market-data/collectors/${c.listingId}`} size="sm" c="red" truncate>
                  Listing {c.listingId}{c.failureReason ? `: ${c.failureReason}` : ''}
                </Anchor>
              ))}
            </Stack>
          )}
        </PlatformCard>

        <PlatformCard title="Recent backtests" href="/backtests">
          {recentBacktests.length === 0 ? <Empty loading={backtests.isLoading}>No recent backtests</Empty> : (
            <Stack gap={8}>
              {recentBacktests.map(run => (
                <Row
                  key={run.runId}
                  onClick={() => navigate(`/backtests/${run.runId}`)}
                  label={<>{run.strategy} <Text span size="xs" c="dimmed">{run.completedCount}/{run.jobCount}</Text></>}
                  badge={<Badge size="xs" variant="light" color={BACKTEST_STATUS_COLORS[run.status] ?? 'gray'}>{run.status.toLowerCase().replace(/_/g, ' ')}</Badge>}
                  when={run.submittedAt}
                />
              ))}
            </Stack>
          )}
        </PlatformCard>

        <PlatformCard title="Recent research" href="/research/sessions">
          {recentResearch.length === 0 ? <Empty loading={research.isLoading}>No recent research sessions</Empty> : (
            <Stack gap={8}>
              {recentResearch.map(r => (
                <Row
                  key={r.sessionName}
                  onClick={() => navigate(`/research/sessions/${r.sessionName}`)}
                  label={<>
                    <Text span size="sm" ff="monospace">{r.sessionName}</Text>
                    {r.bestSharpe != null && <Text span size="xs" c="dimmed"> · Sharpe {r.bestSharpe.toFixed(2)}</Text>}
                  </>}
                  badge={<Badge size="xs" variant="light" color={RESEARCH_STATUS_COLORS[r.status] ?? 'gray'}>{r.status}</Badge>}
                  when={r.updatedAt}
                />
              ))}
            </Stack>
          )}
        </PlatformCard>
      </SimpleGrid>
    </>
  );
}
