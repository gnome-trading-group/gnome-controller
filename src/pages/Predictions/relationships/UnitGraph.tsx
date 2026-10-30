import { memo, useEffect, useMemo, useState } from 'react';
import { Center, Group, Loader, Text, useComputedColorScheme } from '@mantine/core';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { GraphEdge, GraphEdgeKind, GraphNode } from '../../../utils/relationshipViews';
import { EDGE_COLORS, EDGE_MEANINGS } from './edgeKinds';
import { layout, NODE_HEIGHT, NODE_WIDTH } from './elkLayout';

type OutcomeNodeData = { label: string; venue: string; highlighted: boolean };

// Plain markup and no Mantine components: a graph can hold hundreds of these, re-rendered on every pan.
const OutcomeNode = memo(function OutcomeNode({ data, selected }: NodeProps<Node<OutcomeNodeData>>) {
  return (
    <div style={{
      width: NODE_WIDTH, height: NODE_HEIGHT, padding: '6px 8px', boxSizing: 'border-box', borderRadius: 6,
      border: `1px solid ${selected ? 'var(--mantine-color-blue-4)' : 'var(--mantine-color-default-border)'}`,
      background: data.highlighted ? 'var(--mantine-color-yellow-light)' : 'var(--mantine-color-body)',
      fontSize: 11, lineHeight: 1.3, overflow: 'hidden',
    }}>
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <div style={{ color: 'var(--mantine-color-dimmed)' }}>{data.venue}</div>
      <div style={{ fontFamily: 'var(--mantine-font-family-monospace)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}
        title={data.label}>
        {data.label}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
    </div>
  );
});

const nodeTypes = { outcome: OutcomeNode };

function UnitGraph({ nodes, edges, height = 520, onSelectEdge, onSelectNode }: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  height?: number | string;
  onSelectEdge: (edge: GraphEdge) => void;
  onSelectNode: (nodeId: string) => void;
}) {
  const colorScheme = useComputedColorScheme('dark');
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPositions(null);
    setError(null);
    layout(nodes.map(n => n.id), edges)
      .then(p => { if (!cancelled) setPositions(p); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [nodes, edges]);

  const flowNodes = useMemo<Node<OutcomeNodeData>[]>(() => nodes.map(n => ({
    id: n.id, type: 'outcome', position: positions?.[n.id] ?? { x: 0, y: 0 },
    data: { label: n.label, venue: n.venue, highlighted: n.highlighted }, draggable: false,
  })), [nodes, positions]);

  const byId = useMemo(() => new Map(edges.map(e => [e.id, e])), [edges]);
  const flowEdges = useMemo<Edge[]>(() => edges.map(e => ({
    id: e.id, source: e.source, target: e.target, type: 'straight',
    style: { stroke: EDGE_COLORS[e.kind], strokeWidth: 1.5, strokeDasharray: e.flags.length > 0 ? '5 4' : undefined },
    markerEnd: e.kind === 'implies' ? { type: MarkerType.ArrowClosed, width: 12, height: 12, color: EDGE_COLORS[e.kind] } : undefined,
    interactionWidth: 12,
  })), [edges]);

  if (error) return <Text c="red" size="sm">Layout failed: {error}</Text>;
  if (!positions) return <Center h={height}><Loader size="sm" /></Center>;

  return (
    <div style={{ height, width: '100%' }}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onlyRenderVisibleElements
        nodesConnectable={false}
        fitView
        minZoom={0.1}
        maxZoom={2}
        onEdgeClick={(_, edge) => { const e = byId.get(edge.id); if (e) onSelectEdge(e); }}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        colorMode={colorScheme}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export function GraphLegend() {
  return (
    <Group gap="md">
      {(Object.keys(EDGE_COLORS) as GraphEdgeKind[]).map(kind => (
        <Group key={kind} gap={6} wrap="nowrap">
          <div style={{ width: 18, height: 0, borderTop: `2px solid ${EDGE_COLORS[kind]}` }} />
          <Text size="xs" c="dimmed">{EDGE_MEANINGS[kind]}</Text>
        </Group>
      ))}
      <Group gap={6} wrap="nowrap">
        <div style={{ width: 18, height: 0, borderTop: '2px dashed var(--mantine-color-dimmed)' }} />
        <Text size="xs" c="dimmed">flagged</Text>
      </Group>
    </Group>
  );
}

export default memo(UnitGraph);
