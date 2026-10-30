import { useEffect, useMemo, useState } from 'react';
import { Anchor, Badge, Grid, Group, Paper, SegmentedControl, Select, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { ContractProposition, ContractRelationship } from '../../../types';
import { summarizeProposition } from '../../../utils/propositions';
import { buildGraph, buildLadder, buildUnits, GraphEdge, Outcome } from '../../../utils/relationshipViews';
import { EvidencePanel, FlagBadges } from '../PropositionParts';
import LadderTable from './LadderTable';
import { EDGE_MEANINGS } from './edgeKinds';
import UnitGraph, { GraphLegend } from './UnitGraph';

type Selection = { kind: 'outcome'; outcome: Outcome } | { kind: 'edge'; edge: GraphEdge } | null;

function OutcomePanel({ outcome }: { outcome: Outcome }) {
  return (
    <Stack gap={6}>
      {[outcome.primary, outcome.other].filter((p): p is ContractProposition => Boolean(p)).map(p => (
        <Stack key={p.securityId} gap={2}>
          <Anchor component={Link} to={`/security-master/securities/${p.securityId}`} size="sm" fw={600}>
            {p.symbol ?? `#${p.securityId}`}
          </Anchor>
          <Text size="xs" c="dimmed">{p.exchangeCode} · {p.eventTitle ?? ''} · {p.outcomeLabel ?? ''}</Text>
          <Text size="sm" ff="monospace">{summarizeProposition(p.fields)}</Text>
        </Stack>
      ))}
      {outcome.primary.eventId != null && (
        <Anchor component={Link} to={`/predictions/events/${outcome.primary.eventId}`} size="sm">Open event</Anchor>
      )}
    </Stack>
  );
}

function EdgePanel({ edge }: { edge: GraphEdge }) {
  const r = edge.relationship;
  return (
    <Stack gap={6}>
      <Group gap={6}>
        <Badge variant="light">{r.relationshipType}</Badge>
        <FlagBadges flags={r.flags} />
      </Group>
      <Text size="sm">{EDGE_MEANINGS[edge.kind]}</Text>
      <Text size="xs" c="dimmed">{r.symbolA ?? `#${r.securityIdA}`} → {r.symbolB ?? `#${r.securityIdB}`} · {r.method}</Text>
      <EvidencePanel evidence={r.evidence} labelA={r.symbolA ?? 'A'} labelB={r.symbolB ?? 'B'} />
    </Stack>
  );
}

/** One subject's stored relationships, a derivation unit at a time: a strike ladder as a table, anything else as a
 * graph. `highlight` marks contracts (an event's own); with `onlyHighlighted`, only units holding them are offered. */
export default function UnitViews({ propositions, relationships, highlight, onlyHighlighted = false }: {
  propositions: ContractProposition[];
  relationships: ContractRelationship[];
  highlight?: Set<number>;
  onlyHighlighted?: boolean;
}) {
  const marked = useMemo(() => highlight ?? new Set<number>(), [highlight]);
  const units = useMemo(() => {
    const all = buildUnits(propositions, relationships);
    return onlyHighlighted ? all.filter(u => u.outcomes.some(o => o.securityIds.some(s => marked.has(s)))) : all;
  }, [propositions, relationships, marked, onlyHighlighted]);
  const [unitKey, setUnitKey] = useState<string | null>(null);
  const [view, setView] = useState<'table' | 'graph' | null>(null);
  const [selection, setSelection] = useState<Selection>(null);

  useEffect(() => {
    if (!units.some(u => u.key === unitKey)) setUnitKey(units[0]?.key ?? null);
  }, [units, unitKey]);
  useEffect(() => { setSelection(null); setView(null); }, [unitKey]);

  const unit = units.find(u => u.key === unitKey) ?? null;
  const ladder = useMemo(() => (unit?.kind === 'ladder' ? buildLadder(unit, relationships) : null), [unit, relationships]);
  const graph = useMemo(() => (unit ? buildGraph(unit, relationships, marked) : null), [unit, relationships, marked]);
  const outcomeById = useMemo(() => new Map(unit?.outcomes.map(o => [o.key, o]) ?? []), [unit]);

  if (units.length === 0) return <Text size="sm" c="dimmed">No propositions to show.</Text>;
  const shown = view ?? (unit?.kind === 'ladder' ? 'table' : 'graph');

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Select
          data={units.map(u => ({ value: u.key, label: `${u.label} (${u.outcomes.length})` }))}
          value={unitKey}
          onChange={setUnitKey}
          allowDeselect={false}
          searchable
          style={{ minWidth: 360 }}
        />
        {unit?.kind === 'ladder' && (
          <SegmentedControl size="xs" value={shown} onChange={v => setView(v as 'table' | 'graph')}
            data={[{ value: 'table', label: 'Ladder' }, { value: 'graph', label: 'Graph' }]} />
        )}
      </Group>
      <Grid>
        <Grid.Col span={{ base: 12, md: selection ? 8 : 12 }}>
          {shown === 'table' && ladder && (
            <LadderTable ladder={ladder} highlight={marked} onSelect={outcome => setSelection({ kind: 'outcome', outcome })} />
          )}
          {shown === 'graph' && graph && (
            <Paper withBorder>
              <UnitGraph
                nodes={graph.nodes}
                edges={graph.edges}
                onSelectEdge={edge => setSelection({ kind: 'edge', edge })}
                onSelectNode={id => { const o = outcomeById.get(id); if (o) setSelection({ kind: 'outcome', outcome: o }); }}
              />
            </Paper>
          )}
          {shown === 'graph' && <GraphLegend />}
        </Grid.Col>
        {selection && (
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Paper withBorder p="sm">
              <Group justify="flex-end"><Anchor size="xs" onClick={() => setSelection(null)}>Close</Anchor></Group>
              {selection.kind === 'outcome' ? <OutcomePanel outcome={selection.outcome} /> : <EdgePanel edge={selection.edge} />}
            </Paper>
          </Grid.Col>
        )}
      </Grid>
    </Stack>
  );
}
