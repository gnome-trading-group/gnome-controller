import { GraphEdgeKind } from '../../../utils/relationshipViews';

export const EDGE_COLORS: Record<GraphEdgeKind, string> = {
  implies: 'var(--mantine-color-blue-5)',
  equivalent: 'var(--mantine-color-green-5)',
  excludes: 'var(--mantine-color-red-5)',
  covers: 'var(--mantine-color-orange-5)',
  opposite: 'var(--mantine-color-violet-5)',
};

export const EDGE_MEANINGS: Record<GraphEdgeKind, string> = {
  implies: 'implies (arrow points to the implied outcome)',
  equivalent: 'equivalent',
  excludes: 'excludes: both cannot be Yes',
  covers: 'covers: at least one is Yes',
  opposite: 'opposite: one is Yes exactly when the other is No',
};
