import { Mode } from '../types';

// Live is the app's main green; paper is violet, so the two never look alike.
export const MODE_COLORS: Record<string, string> = {
  paper: 'violet',
  live: 'green',
};

// Which mode a page opens in when the URL doesn't say: the only one with data, else the one last chosen, else live.
export function defaultMode(modesWithData: Mode[] | undefined, remembered: Mode | null): Mode {
  if (modesWithData?.length === 1) return modesWithData[0];
  return remembered ?? 'live';
}

export function isMode(value: string | null | undefined): value is Mode {
  return value === 'paper' || value === 'live';
}
