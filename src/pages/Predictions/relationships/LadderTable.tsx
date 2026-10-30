import { memo } from 'react';
import { Anchor, Badge, Group, Paper, Stack, Table, Text, Tooltip } from '@mantine/core';
import { Link } from 'react-router-dom';
import { FLAG_DESCRIPTIONS, flagLabel } from '../../../utils/propositions';
import { Ladder, Outcome } from '../../../utils/relationshipViews';

function OutcomeCell({ outcomes, highlight, onSelect }: {
  outcomes: Outcome[] | undefined;
  highlight: Set<number>;
  onSelect: (outcome: Outcome) => void;
}) {
  if (!outcomes) return <Text size="sm" c="dimmed">—</Text>;
  return (
    <Stack gap={2}>
      {outcomes.map(o => (
        <Group key={o.key} gap={6} wrap="nowrap">
          <Anchor size="sm" onClick={() => onSelect(o)} fw={o.securityIds.some(s => highlight.has(s)) ? 700 : undefined}>
            {o.primary.symbol ?? `#${o.primary.securityId}`}
          </Anchor>
          {o.securityIds.some(s => highlight.has(s)) && <Badge size="xs" variant="light">this event</Badge>}
          {o.primary.eventId != null && (
            <Anchor component={Link} to={`/predictions/events/${o.primary.eventId}`} size="xs" c="dimmed">event</Anchor>
          )}
        </Group>
      ))}
    </Stack>
  );
}

/** A strike ladder as a table: one row per value, highest first, one column per venue. Within a venue, a higher row
 * implies the lower ones (or the reverse for "below" strikes), so no edges are drawn; a row's venues are marked when
 * they are stored as equivalent. */
function LadderTable({ ladder, highlight, onSelect }: {
  ladder: Ladder;
  highlight: Set<number>;
  onSelect: (outcome: Outcome) => void;
}) {
  return (
    <Paper withBorder style={{ overflowX: 'auto' }}>
      <Table striped withColumnBorders fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: 200 }}>Value</Table.Th>
            {ladder.venues.map(v => <Table.Th key={v}>{v}</Table.Th>)}
            <Table.Th style={{ width: 140 }}>Across venues</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {ladder.rows.map(row => (
            <Table.Tr key={row.key}>
              <Table.Td><Text size="sm" ff="monospace">{row.label}</Text></Table.Td>
              {ladder.venues.map(v => (
                <Table.Td key={v}><OutcomeCell outcomes={row.cells[v]} highlight={highlight} onSelect={onSelect} /></Table.Td>
              ))}
              <Table.Td>
                {row.equivalence === 'equal' && <Badge size="sm" color="green" variant="light">equivalent</Badge>}
                {row.equivalence === 'flagged' && (
                  <Tooltip label={row.flags.map(f => FLAG_DESCRIPTIONS[f] ?? f).join(' ')} multiline w={320} withArrow>
                    <Badge size="sm" color="pink" variant="light">{row.flags.map(flagLabel).join(', ')}</Badge>
                  </Tooltip>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}

export default memo(LadderTable);
