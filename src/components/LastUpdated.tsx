import { useEffect, useState } from 'react';
import { Badge, Tooltip } from '@mantine/core';
import ReactTimeAgo from 'react-time-ago';

interface LastUpdatedProps {
  at: Date | null;
  intervalMs: number;
  failing?: boolean;
}

const STALE_INTERVALS = 3;
const TICK_MS = 5000;

export function LastUpdated({ at, intervalMs, failing = false }: LastUpdatedProps) {
  const [now, setNow] = useState(() => Date.now());

  // The page only re-renders when its data changes, so staleness needs its own clock to surface when updates stop.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  if (at === null) {
    return (
      <Badge color={failing ? 'red' : 'gray'} variant="light" size="sm" tt="none">
        {failing ? 'Never loaded' : 'Loading…'}
      </Badge>
    );
  }

  const stale = now - at.getTime() > STALE_INTERVALS * intervalMs;
  const ago = <ReactTimeAgo date={at} timeStyle="round" />;

  let color = 'gray';
  let label = <>Updated {ago}</>;
  if (stale && failing) {
    color = 'red';
    label = <>Not updating · last success {ago}</>;
  } else if (stale) {
    color = 'orange';
    label = <>Stale · updated {ago}</>;
  }

  return (
    <Tooltip label={at.toLocaleString()} position="bottom" withArrow openDelay={500}>
      <Badge color={color} variant="light" size="sm" tt="none">
        {label}
      </Badge>
    </Tooltip>
  );
}
