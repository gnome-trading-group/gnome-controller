import { Anchor, Badge } from '@mantine/core';
import { Link } from 'react-router-dom';
import { RunStatus } from '../../../types/pipeline';

const STATUS_COLORS: Record<RunStatus, string> = {
  SUCCEEDED: 'green',
  FAILED: 'red',
  RUNNING: 'blue',
  PENDING: 'yellow',
  CANCELLED: 'gray',
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return <Badge size="sm" variant="light" color={STATUS_COLORS[status] ?? 'gray'}>{status}</Badge>;
}

// gnome-pipelines stamps every publish with <pipeline>/<run id>; a laptop run's id starts with local-.
export function RunLink({ runId }: { runId: string | null | undefined }) {
  if (!runId) return <>—</>;
  const [pipeline, run] = runId.includes('/') ? runId.split('/', 2) : [null, runId];
  if (!pipeline || run.startsWith('local-')) {
    return <span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{runId}</span>;
  }
  return (
    <Anchor component={Link} to={`/data/pipelines/${pipeline}?run=${run}`} size="xs" ff="monospace">
      {runId}
    </Anchor>
  );
}

// gnome-pipelines@<commit>[-dirty]; -dirty means it ran from a laptop with uncommitted changes.
export function CodeVersion({ version }: { version: string | null | undefined }) {
  if (!version) return <>—</>;
  return <span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{version.replace('gnome-pipelines@', '')}</span>;
}
