import { useMemo, useState } from 'react';
import { Alert, Badge, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useSamples } from '../../query/hooks';
import { StrategySession } from '../../types';
import { ActivityData, FeedReading, JournalReading, LedgerReading, RuntimeData, Sample } from '../../types/samples';
import {
  MINUTE_MS, RUNTIME_INTERVAL_MS, activitySeries, everyMsFor, feedSeries, journalSeries, ledgerSeries, ofKind,
  rejectionTotals, ringSeries,
} from '../../utils/samples';
import { Chart, LatencySection, RangeControl, RuntimeSection } from '../../components/samples/SampleCharts';
import { RANGES } from '../../components/samples/sampleFormat';
import { SampleWindow } from '../../utils/api';

// The session kinds the charts use (positions and gateways aren't charted, so aren't read).
const SESSION_KINDS = ['session.activity', 'session.rings', 'session.marketdata', 'session.ledger', 'session.journal'];

// The range back from the session's end (or now, for a live one), never before it started. Worked out when a read runs,
// so a live window moves with each poll without changing the query key.
function windowFor(session: StrategySession, rangeMs: number): SampleWindow {
  const end = session.stoppedAt ? Date.parse(session.stoppedAt) : Date.now();
  const toMs = Math.ceil(end / MINUTE_MS) * MINUTE_MS;
  const started = session.startedAt ? Date.parse(session.startedAt) : toMs - rangeMs;
  return { fromMs: Math.max(started - MINUTE_MS, toMs - rangeMs), toMs };
}

function ActivitySection({ samples, rangeMs, loading, thinned }: {
  samples: Sample<ActivityData>[]; rangeMs: number; loading: boolean; thinned: boolean;
}) {
  const points = useMemo(() => activitySeries(samples), [samples]);
  const rejections = useMemo(() => rejectionTotals(samples), [samples]);
  return (
    <Stack gap="xs">
      <Title order={5}>Activity</Title>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Chart title="Sent per minute" points={points} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'intents' }, { key: 'newOrders', label: 'new orders' }, { key: 'cancels' }, { key: 'modifies' }]} />
        <Chart title="Fills, rejects and refusals per minute" points={points} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'fills' }, { key: 'rejects', label: 'venue rejects' }, { key: 'refused', label: 'OMS refusals' }]} />
      </SimpleGrid>
      {rejections.length > 0 && (
        <Group gap={6}>
          <Text size="xs" c="dimmed">{thinned ? 'In the sampled minutes:' : 'In this window:'}</Text>
          {rejections.map(r => (
            <Badge key={`${r.source}${r.reason}`} variant="light" color={r.source === 'venue' ? 'orange' : 'red'} size="sm">
              {r.source === 'venue' ? 'venue' : 'OMS'} {r.reason}: {r.count}
            </Badge>
          ))}
        </Group>
      )}
    </Stack>
  );
}

function PipelineSection({ samples, rangeMs, loading, thinned }: {
  samples: Sample[]; rangeMs: number; loading: boolean; thinned: boolean;
}) {
  const rings = useMemo(() => ringSeries(ofKind(samples, 'session.rings')), [samples]);
  const feeds = useMemo(() => feedSeries(ofKind<{ feeds: FeedReading[] }>(samples, 'session.marketdata')), [samples]);
  const ledger = useMemo(() => ledgerSeries(ofKind<LedgerReading>(samples, 'session.ledger')), [samples]);
  const journal = useMemo(() => journalSeries(ofKind<JournalReading>(samples, 'session.journal')), [samples]);
  const resynced = [...feeds.resyncs.entries()].filter(([, n]) => n > 0);
  return (
    <Stack gap="xs">
      <Title order={5}>Pipeline</Title>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Chart title="Ring backlog, worst in the minute" unit="events" points={rings.points} rangeMs={rangeMs} loading={loading}
          lines={rings.names.map(key => ({ key }))} />
        <Chart title="Market data per stream" unit="records per minute" points={feeds.points} rangeMs={rangeMs} loading={loading}
          lines={feeds.names.map(key => ({ key }))} />
        <Chart title="Ledger" points={ledger} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'lag', label: 'events not yet stored' }, { key: 'failures', label: 'failures in a row' }]} />
        {journal.length > 0 && (
          <Chart title="Journal" points={journal} rangeMs={rangeMs} loading={loading}
            lines={[{ key: 'pending', label: 'segments waiting' }, { key: 'oldestSeconds', label: 'oldest waiting (s)' }]} />
        )}
      </SimpleGrid>
      {resynced.length > 0 && (
        <Group gap={6}>
          <Text size="xs" c="dimmed">{thinned ? 'Resyncs in the sampled minutes:' : 'Resyncs in this window:'}</Text>
          {resynced.map(([name, n]) => <Badge key={name} variant="light" color="orange" size="sm">{name}: {n}</Badge>)}
        </Group>
      )}
    </Stack>
  );
}

/**
 * The session's samples over time: latency, activity, runtime and its pipeline. Sessions on orchestrator releases that
 * send no samples (and any session past the samples' 7 days) show a note instead.
 */
export function SessionPerformance({ session, live }: { session: StrategySession; live: boolean }) {
  const [range, setRange] = useState('1h');
  const rangeMs = RANGES[range];
  const span = () => windowFor(session, rangeMs);
  const subject = { subjectKind: 'session' as const, subjectId: session.sessionId };
  const latency = useSamples({ ...subject, kindPrefix: 'latency.', everyMs: everyMsFor(rangeMs, MINUTE_MS) }, range, span, live);
  const state = useSamples({ ...subject, kinds: SESSION_KINDS, everyMs: everyMsFor(rangeMs, MINUTE_MS) }, range, span, live);
  const runtime = useSamples(
    { ...subject, kind: 'runtime', everyMs: everyMsFor(rangeMs, RUNTIME_INTERVAL_MS) }, range, span, live);

  const loading = latency.isLoading || state.isLoading || runtime.isLoading;
  // Kept on screen while a new range loads: say so, rather than let the old range pass for the new one.
  const switching = latency.isPlaceholderData || state.isPlaceholderData || runtime.isPlaceholderData;
  const error = latency.error ?? state.error ?? runtime.error;
  const latencySamples = latency.data?.samples ?? [];
  const stateSamples = state.data?.samples ?? [];
  const runtimeSamples = runtime.data?.samples ?? [];
  const truncated = !!(latency.data?.truncated || state.data?.truncated || runtime.data?.truncated);
  const none = !loading && !error
    && latencySamples.length === 0 && stateSamples.length === 0 && runtimeSamples.length === 0;
  const thinned = everyMsFor(rangeMs, MINUTE_MS) !== undefined;

  return (
    <Stack gap="md">
      <RangeControl range={range} onChange={setRange} switching={switching} />
      {error && <Alert color="red" title="Couldn't read the session's samples">{(error as Error).message}</Alert>}
      {truncated && (
        <Alert color="yellow" title="Only part of this range was read">
          It holds more samples than one view reads, so its newest part is missing. Pick a shorter range.
        </Alert>
      )}
      {none ? (
        <Alert color="gray" title="No samples for this window">
          This session sent none in it. Samples come from orchestrator releases that send them, and are kept for 7 days
          {session.orchestratorVersion ? ` (this session runs orchestrator ${session.orchestratorVersion})` : ''}.
        </Alert>
      ) : (
        <>
          <LatencySection samples={latencySamples} rangeMs={rangeMs} loading={latency.isLoading} />
          <ActivitySection samples={ofKind<ActivityData>(stateSamples, 'session.activity')} rangeMs={rangeMs}
            loading={state.isLoading} thinned={thinned} />
          <RuntimeSection samples={ofKind<RuntimeData>(runtimeSamples, 'runtime')} rangeMs={rangeMs} loading={runtime.isLoading} />
          <PipelineSection samples={stateSamples} rangeMs={rangeMs} loading={state.isLoading} thinned={thinned} />
        </>
      )}
    </Stack>
  );
}
