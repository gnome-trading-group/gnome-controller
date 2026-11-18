import { type ReactNode, useMemo } from 'react';
import { Anchor, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { BacktestJob, BacktestRun } from '../../../types/backtests';
import { formatDuration } from '../../../utils/format';
import {
  MISSING_FRACTION_KEY, PNL_KEY, PNL_WITH_REWARDS_KEY, earnedRewards, formatMetric, metricValue, runResults,
} from '../../../utils/backtestStats';
import { runElapsedMs } from '../../../components/batch/status';

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="sm" fw={500} component="div">{children}</Text>
    </Stack>
  );
}

function Signed({ value }: { value: number | undefined | null }) {
  if (value === undefined || value === null) return <Text span c="dimmed" size="sm">—</Text>;
  return <Text span size="sm" fw={500} c={value >= 0 ? 'green' : 'red'}>{formatMetric(value)}</Text>;
}

const plain = (v: number | undefined | null) => (v === undefined || v === null ? '—' : formatMetric(v));
const percent = (f: number | undefined | null) => (f === undefined || f === null ? '—' : `${(f * 100).toFixed(1)}%`);

function JobLink({ job, value, label, onSelect }: {
  job: BacktestJob | undefined;
  value: number;
  label: (job: BacktestJob) => string;
  onSelect: (index: number) => void;
}) {
  if (!job) return null;
  return (
    <Group gap={6} wrap="nowrap">
      <Signed value={value} />
      <Anchor size="xs" ff="monospace" onClick={() => onSelect(job.arrayIndex)}>
        #{String(job.arrayIndex).padStart(4, '0')}
      </Anchor>
      <Text size="xs" c="dimmed" truncate="end" style={{ minWidth: 0 }} title={label(job)}>{label(job)}</Text>
    </Group>
  );
}

export function RunResultsCard({ run, jobs, jobLabel, onSelectJob, onShowFailed }: {
  run: BacktestRun;
  jobs: BacktestJob[];
  jobLabel: (job: BacktestJob) => string;
  onSelectJob: (index: number) => void;
  onShowFailed: () => void;
}) {
  const succeeded = useMemo(() => jobs.filter(j => j.status === 'SUCCEEDED'), [jobs]);
  const results = useMemo(() => runResults(succeeded, run.cpu), [succeeded, run.cpu]);
  const rewards = earnedRewards(succeeded);
  const wall = formatDuration(runElapsedMs(run));
  const compute = results.vcpuHours !== null ? `${results.vcpuHours.toFixed(results.vcpuHours < 10 ? 2 : 1)} vCPU-h` : null;

  if (jobs.length === 1) {
    const job = jobs[0];
    return (
      <Card withBorder p="md" h="100%">
        <Text fw={500} mb="sm">Results</Text>
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" verticalSpacing="sm">
          <Tile label="Wall time">{wall}</Tile>
          <Tile label="PnL"><Signed value={metricValue(job, PNL_KEY)} /></Tile>
          {rewards && <Tile label="PnL + rewards (est.)"><Signed value={metricValue(job, PNL_WITH_REWARDS_KEY)} /></Tile>}
          <Tile label="Sharpe">{plain(metricValue(job, 'sharpe'))}</Tile>
          <Tile label="Sortino">{plain(metricValue(job, 'sortino'))}</Tile>
          <Tile label="Fills">{plain(metricValue(job, 'fill_count'))}</Tile>
          <Tile label="Fees">{plain(metricValue(job, 'total_fees'))}</Tile>
          <Tile label="Missing data">{percent(metricValue(job, MISSING_FRACTION_KEY))}</Tile>
          {compute && <Tile label="Compute">{compute}</Tile>}
        </SimpleGrid>
      </Card>
    );
  }

  const byIndex = new Map(jobs.map(j => [j.arrayIndex, j]));
  const pnlLabel = results.pnlKey === PNL_WITH_REWARDS_KEY ? 'PnL + rewards (est.)' : 'PnL';
  return (
    <Card withBorder p="md" h="100%">
      <Group justify="space-between" mb="sm">
        <Text fw={500}>Results</Text>
        <Text size="xs" c="dimmed">over {succeeded.length} succeeded job{succeeded.length === 1 ? '' : 's'} · {pnlLabel}</Text>
      </Group>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" verticalSpacing="sm">
          <Tile label="Wall time">{wall}</Tile>
          <Tile label="Job time">{formatDuration(results.jobTimeMs)}</Tile>
          {compute && <Tile label="Compute">{compute}</Tile>}
          <Tile label="Jobs">
            {run.completedCount}/{run.jobCount}
            {run.failedCount > 0 && (
              <Anchor size="sm" c="red" ml={6} onClick={onShowFailed}>{run.failedCount} failed</Anchor>
            )}
          </Tile>
          <Tile label="Median"><Signed value={results.pnl?.median} /></Tile>
          <Tile label="Mean"><Signed value={results.pnl?.mean} /></Tile>
          <Tile label="Profitable">{results.pnl ? `${(results.pnl.positiveFraction * 100).toFixed(0)}%` : '—'}</Tile>
          <Tile label="Total fills">{plain(results.totalFills)}</Tile>
          <Tile label="Total fees">{plain(results.totalFees)}</Tile>
          <Tile label="Mean missing data">{percent(results.meanMissingFraction)}</Tile>
        </SimpleGrid>
        {results.best && results.worst && (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Tile label="Best job">
              <JobLink job={byIndex.get(results.best.arrayIndex)} value={results.best.value} label={jobLabel} onSelect={onSelectJob} />
            </Tile>
            <Tile label="Worst job">
              <JobLink job={byIndex.get(results.worst.arrayIndex)} value={results.worst.value} label={jobLabel} onSelect={onSelectJob} />
            </Tile>
          </SimpleGrid>
        )}
      </Stack>
    </Card>
  );
}
