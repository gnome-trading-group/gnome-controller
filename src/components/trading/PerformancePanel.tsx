import { useMemo, useState } from 'react';
import { Card, Group, SegmentedControl, SimpleGrid, Text } from '@mantine/core';
import { Mode } from '../../types';
import { useDayZone } from '../../context/PreferencesContext';
import { useDailyPnl } from '../../query/hooks';
import { dailyStats } from '../../utils/performance';
import { Kpi } from './layout';
import { Money } from './values';
import { DailyBars } from './DailyBars';

const WINDOWS: Record<string, number> = { '30d': 30, '90d': 90, '1y': 365 };

// How a strategy's days have gone: one bar per day in the viewer's time zone, and what they add up to.
export function PerformancePanel({ strategyId, mode }: { strategyId: number; mode: Mode }) {
  const tz = useDayZone();
  const [window, setWindow] = useState('30d');
  const daily = useDailyPnl({ strategyId, mode }, tz, WINDOWS[window]);
  const stats = useMemo(() => (daily.data ? dailyStats(daily.data.days) : null), [daily.data]);
  const pct = stats?.winRate === null || stats?.winRate === undefined ? '—' : `${Math.round(stats.winRate * 100)}%`;

  return (
    <>
      <Card withBorder mb="md">
        <Group justify="space-between" mb="xs">
          <Text fw={600}>Daily PnL ({daily.data?.timeZone ?? tz})</Text>
          <SegmentedControl size="xs" value={window} onChange={setWindow} data={Object.keys(WINDOWS)} />
        </Group>
        <DailyBars daily={daily.data} loading={daily.isLoading} />
      </Card>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="sm">
        <Kpi label={`PnL over ${window}`} value={<Money value={stats?.total} arrow />} />
        <Kpi label="Best day" value={<Money value={stats?.best?.pnl} />} footer={stats?.best?.date} />
        <Kpi label="Worst day" value={<Money value={stats?.worst?.pnl} />} footer={stats?.worst?.date} />
        <Kpi
          label="Winning days"
          hint="Of the days that made or lost money; flat days don't count."
          value={pct}
          footer={stats && `${stats.winning} up · ${stats.losing} down · ${stats.flat} flat`}
        />
        <Kpi label="Average day" hint="Over the days that made or lost money." value={<Money value={stats?.averageDay} />} />
        <Kpi
          label="Max drawdown"
          hint="The deepest fall in end-of-day PnL from an earlier high in this window."
          value={<Money value={stats?.maxDrawdown?.amount ?? (stats ? 0n : undefined)} />}
          footer={stats?.maxDrawdown && `${stats.maxDrawdown.peakDate ?? 'window start'} → ${stats.maxDrawdown.troughDate}`}
        />
        <Kpi label="Below the high" hint="How far the latest day ended below this window's best end of day." value={<Money value={stats?.currentDrawdown} />} />
      </SimpleGrid>
    </>
  );
}
