import { useEffect, useState } from 'react';
import { Badge, Tooltip } from '@mantine/core';
import ReactTimeAgo from 'react-time-ago';
import classes from './LastUpdated.module.css';

interface LastUpdatedProps {
  at: Date | null;
  intervalMs: number;
  failing?: boolean;
}

const STALE_INTERVALS = 3;
const TICK_MS = 5000;

// Shows the data's state rather than a ticking "Xs ago": the label only changes when the state does, so it doesn't
// jitter on every refresh. The pulse is the "still live" signal; a still dot means updates have stopped.
export function LastUpdated({ at, intervalMs, failing = false }: LastUpdatedProps) {
  const [now, setNow] = useState(() => Date.now());

  // The page only re-renders when its data changes, so staleness needs its own clock to surface when updates stop.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const stale = at !== null && now - at.getTime() > STALE_INTERVALS * intervalMs;

  let color = 'green';
  let label = 'Live';
  let pulsing = true;
  if (at === null) {
    color = failing ? 'red' : 'gray';
    label = failing ? 'Never loaded' : 'Loading';
    pulsing = false;
  } else if (stale && failing) {
    color = 'red';
    label = 'Not updating';
    pulsing = false;
  } else if (stale) {
    color = 'orange';
    label = 'Stale';
    pulsing = false;
  }

  const dot = (
    <span
      className={`${classes.dot} ${pulsing ? classes.pulse : ''}`}
      style={{ '--dot-color': `var(--mantine-color-${color}-6)` } as React.CSSProperties}
    />
  );

  return (
    <Tooltip
      label={at ? <>Last updated <ReactTimeAgo date={at} timeStyle="round" /> ({at.toLocaleTimeString()})</> : 'No successful update yet'}
      position="bottom"
      withArrow
      openDelay={300}
    >
      <Badge color={color} variant="light" size="sm" tt="none" leftSection={dot}>
        {label}
      </Badge>
    </Tooltip>
  );
}
