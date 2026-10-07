import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { Mode } from '../types';
import { TimeZoneChoice } from '../utils/format';
import { isMode } from '../utils/mode';

// Per-viewer display choices, remembered in this browser. Storage can be unavailable (private windows, blocked site
// data), so every read and write tolerates failure and the defaults always work.
const TIME_ZONE_KEY = 'pref.timeZone';
const MODE_KEY = 'pref.mode';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembered; the choice still applies until the page reloads.
  }
}

interface Preferences {
  timeZone: TimeZoneChoice;
  setTimeZone: (zone: TimeZoneChoice) => void;
  rememberedMode: Mode | null;
  rememberMode: (mode: Mode) => void;
}

const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [timeZone, setZone] = useState<TimeZoneChoice>(() => (read(TIME_ZONE_KEY) === 'local' ? 'local' : 'UTC'));
  const [rememberedMode, setRememberedMode] = useState<Mode | null>(() => {
    const stored = read(MODE_KEY);
    return isMode(stored) ? stored : null;
  });
  const setTimeZone = useCallback((zone: TimeZoneChoice) => {
    setZone(zone);
    write(TIME_ZONE_KEY, zone);
  }, []);
  const rememberMode = useCallback((mode: Mode) => {
    setRememberedMode(mode);
    write(MODE_KEY, mode);
  }, []);
  const value = useMemo(
    () => ({ timeZone, setTimeZone, rememberedMode, rememberMode }),
    [timeZone, setTimeZone, rememberedMode, rememberMode],
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): Preferences {
  const preferences = useContext(PreferencesContext);
  if (!preferences) throw new Error('usePreferences needs a PreferencesProvider');
  return preferences;
}

// The IANA zone the registry should use for "today".
export function useDayZone(): string {
  const { timeZone } = usePreferences();
  return timeZone === 'UTC' ? 'UTC' : Intl.DateTimeFormat().resolvedOptions().timeZone;
}
