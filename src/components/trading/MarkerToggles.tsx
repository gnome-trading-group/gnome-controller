import { Group, Text, UnstyledButton } from '@mantine/core';
import { usePreferences } from '../../context/PreferencesContext';

export type MarkerShape = 'arrowUp' | 'arrowDown' | 'circle' | 'square';

export interface MarkerKind {
  // Namespaced by chart, e.g. `pnl:SETTLEMENT`.
  key: string;
  label: string;
  color: string;
  shape: MarkerShape;
}

const SYMBOL: Record<MarkerShape, string> = { arrowUp: '▲', arrowDown: '▼', circle: '●', square: '■' };

// Click a kind to hide or show its markers on every chart of that kind; remembered in this browser.
export function MarkerToggles({ kinds }: { kinds: MarkerKind[] }) {
  const { hiddenMarkers, setMarkersHidden } = usePreferences();
  if (kinds.length === 0) return null;
  const keys = kinds.map(k => k.key);
  const allShown = keys.every(k => !hiddenMarkers.has(k));
  return (
    <Group gap="sm" wrap="wrap">
      {kinds.map(kind => {
        const hidden = hiddenMarkers.has(kind.key);
        return (
          <UnstyledButton
            key={kind.key}
            onClick={() => setMarkersHidden([kind.key], !hidden)}
            aria-pressed={!hidden}
            title={hidden ? `Show ${kind.label} markers` : `Hide ${kind.label} markers`}
            style={{ opacity: hidden ? 0.4 : 1 }}
          >
            <Group gap={4} wrap="nowrap">
              <Text span size="xs" style={{ color: kind.color }}>{SYMBOL[kind.shape]}</Text>
              <Text span size="xs" c="dimmed" td={hidden ? 'line-through' : undefined}>{kind.label}</Text>
            </Group>
          </UnstyledButton>
        );
      })}
      {kinds.length > 2 && (
        <UnstyledButton onClick={() => setMarkersHidden(keys, allShown)}>
          <Text span size="xs" c="blue">{allShown ? 'hide all' : 'show all'}</Text>
        </UnstyledButton>
      )}
    </Group>
  );
}
