import { Badge, Select, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { OrderRole } from '../../types';

const ROLE_COLORS: Record<OrderRole, string> = { QUOTE: 'blue', HEDGE: 'grape', ARB_LEG: 'indigo', EXIT: 'gray' };

// What the order was for in its strategy. With an episode (the strategy's id for a quote fill and the hedges it set
// off), clicking it opens the episode.
export function RoleBadge({ role, episodeId, onOpenEpisode }: {
  role: OrderRole | null; episodeId?: string | null; onOpenEpisode?: () => void;
}) {
  if (!role) return <Text span c="dimmed">—</Text>;
  const badge = (
    <Badge size="xs" variant={episodeId ? 'filled' : 'light'} color={ROLE_COLORS[role]}>
      {role.replace('_', ' ').toLowerCase()}
    </Badge>
  );
  if (!episodeId || !onOpenEpisode) return badge;
  return (
    <Tooltip label={`Episode ${episodeId}: open its fills`} withArrow openDelay={300}>
      <UnstyledButton onClick={e => { e.stopPropagation(); onOpenEpisode(); }}>{badge}</UnstyledButton>
    </Tooltip>
  );
}

const ROLE_OPTIONS = [
  { value: 'QUOTE', label: 'Quotes' },
  { value: 'HEDGE', label: 'Hedges' },
  { value: 'ARB_LEG', label: 'Arb legs' },
  { value: 'EXIT', label: 'Exits' },
  { value: 'NONE', label: 'Unstated' },
];

export function RoleFilter({ value, onChange, label = 'For' }: {
  value: string | null; onChange: (role: string | null) => void; label?: string;
}) {
  return (
    <Select label={label} placeholder="Anything" size="xs" w={130} clearable data={ROLE_OPTIONS}
      value={value} onChange={onChange} />
  );
}
