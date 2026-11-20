import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { Mode } from '../types';
import { TimeZoneChoice } from '../utils/format';
import { isMode } from '../utils/mode';

// Per-viewer display choices, remembered in this browser. Storage can be unavailable (private windows, blocked site
// data), so every read and write tolerates failure and the defaults always work.
const TIME_ZONE_KEY = 'pref.timeZone';
const MODE_KEY = 'pref.mode';
const HIDDEN_MARKERS_KEY = 'pref.hiddenMarkers';
const HIDDEN_PANES_KEY = 'pref.hiddenPanes';

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

function readKeys(key: string): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(read(key) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

interface Preferences {
  timeZone: TimeZoneChoice;
  setTimeZone: (zone: TimeZoneChoice) => void;
  rememberedMode: Mode | null;
  rememberMode: (mode: Mode) => void;
  // Chart marker kinds switched off, keyed by chart (`pnl:SETTLEMENT`, `price:buy`) so every chart of a kind agrees.
  hiddenMarkers: ReadonlySet<string>;
  setMarkersHidden: (keys: string[], hidden: boolean) => void;
  // Chart panes switched off (`drawdown`, `volume`, `capital`); stored as hidden so a new pane starts shown.
  hiddenPanes: ReadonlySet<string>;
  setPaneHidden: (pane: string, hidden: boolean) => void;
}

const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [timeZone, setZone] = useState<TimeZoneChoice>(() => (read(TIME_ZONE_KEY) === 'local' ? 'local' : 'UTC'));
  const [rememberedMode, setRememberedMode] = useState<Mode | null>(() => {
    const stored = read(MODE_KEY);
    return isMode(stored) ? stored : null;
  });
  const [hiddenMarkers, setHiddenMarkers] = useState<ReadonlySet<string>>(() => readKeys(HIDDEN_MARKERS_KEY));
  const [hiddenPanes, setHiddenPanes] = useState<ReadonlySet<string>>(() => readKeys(HIDDEN_PANES_KEY));
  const setTimeZone = useCallback((zone: TimeZoneChoice) => {
    setZone(zone);
    write(TIME_ZONE_KEY, zone);
  }, []);
  const rememberMode = useCallback((mode: Mode) => {
    setRememberedMode(mode);
    write(MODE_KEY, mode);
  }, []);
  const setMarkersHidden = useCallback((keys: string[], hidden: boolean) => {
    setHiddenMarkers(prior => {
      const next = new Set(prior);
      for (const key of keys) {
        if (hidden) next.add(key);
        else next.delete(key);
      }
      write(HIDDEN_MARKERS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);
  const setPaneHidden = useCallback((pane: string, hidden: boolean) => {
    setHiddenPanes(prior => {
      const next = new Set(prior);
      if (hidden) next.add(pane);
      else next.delete(pane);
      write(HIDDEN_PANES_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);
  const value = useMemo(
    () => ({
      timeZone, setTimeZone, rememberedMode, rememberMode, hiddenMarkers, setMarkersHidden, hiddenPanes, setPaneHidden,
    }),
    [timeZone, setTimeZone, rememberedMode, rememberMode, hiddenMarkers, setMarkersHidden, hiddenPanes, setPaneHidden],
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
