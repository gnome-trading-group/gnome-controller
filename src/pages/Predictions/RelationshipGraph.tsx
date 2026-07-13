import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import { ContractRelationship, Event, EventContract } from '../../types';
import ContractNode, { type ContractNodeData } from './graph/ContractNode';
import RelationshipEdge, { type RelationshipEdgeData } from './graph/RelationshipEdge';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 70;

const nodeTypes = { contract: ContractNode };
const edgeTypes = { relationship: RelationshipEdge };

function layoutGraph(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120 });

  nodes.forEach(n => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach(e => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } };
  });
}

export interface RelationshipGraphProps {
  relationships: ContractRelationship[];
  securitySymbols: Record<number, string>;
  eventContracts?: EventContract[];
  events?: Event[];
  height?: string | number;
  onApprove?: (relationshipId: number) => void;
  onDelete?: (relationshipId: number) => void;
}

function RelationshipGraph({
  relationships,
  securitySymbols,
  eventContracts = [],
  events = [],
  height = 500,
}: RelationshipGraphProps) {
  const eventById = useMemo(() => Object.fromEntries(events.map(e => [e.eventId, e])), [events]);
  const contractBySecurity = useMemo(
    () => Object.fromEntries(eventContracts.map(ec => [ec.securityId, ec])),
    [eventContracts],
  );

  const { initialNodes, initialEdges } = useMemo(() => {
    const uniqueSecurityIds = [...new Set(relationships.flatMap(r => [r.securityIdA, r.securityIdB]))];

    const rawNodes: Node<ContractNodeData>[] = uniqueSecurityIds.map(id => {
      const ec = contractBySecurity[id];
      const event = ec ? eventById[ec.eventId] : undefined;
      return {
        id: String(id),
        type: 'contract',
        position: { x: 0, y: 0 },
        data: {
          symbol: securitySymbols[id] ?? `#${id}`,
          outcomeLabel: ec?.outcomeLabel,
          eventTitle: event?.title,
          resolved: event?.resolved,
        },
      };
    });

    // Track which node pairs already have an edge to apply curvature offsets for parallel edges
    const pairCount: Record<string, number> = {};
    const pairIndex: Record<string, number> = {};

    for (const r of relationships) {
      const key = [Math.min(r.securityIdA, r.securityIdB), Math.max(r.securityIdA, r.securityIdB)].join('-');
      pairCount[key] = (pairCount[key] ?? 0) + 1;
    }

    const rawEdges: Edge<RelationshipEdgeData>[] = relationships.map(r => {
      const key = [Math.min(r.securityIdA, r.securityIdB), Math.max(r.securityIdA, r.securityIdB)].join('-');
      const idx = pairIndex[key] ?? 0;
      pairIndex[key] = idx + 1;
      const total = pairCount[key];

      // Offset curvature so parallel edges spread out rather than overlap.
      // With 1 edge: curvature 0.25 (slight curve). With 2+: alternate above/below center line.
      const curvature = total > 1 ? 0.15 + idx * 0.25 : 0.25;

      return {
        id: String(r.relationshipId),
        source: String(r.securityIdA),
        target: String(r.securityIdB),
        type: 'relationship',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
        },
        pathOptions: { curvature },
        data: {
          relationshipType: r.relationshipType,
          confidence: r.confidence,
          reviewed: r.reviewed,
          method: r.method,
        },
      };
    });

    const laid = layoutGraph(rawNodes, rawEdges);
    return { initialNodes: laid, initialEdges: rawEdges };
  }, [relationships, securitySymbols, contractBySecurity, eventById]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onInit = useCallback((instance: any) => {
    instance.fitView({ padding: 0.2 });
  }, []);

  if (relationships.length === 0) {
    return null;
  }

  return (
    <div style={{ height, width: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.2 }}
        onInit={onInit}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--mantine-color-dark-5)" />
        <Controls />
        <MiniMap
          nodeColor="var(--mantine-color-dark-4)"
          maskColor="rgba(0,0,0,0.4)"
          style={{ backgroundColor: 'var(--mantine-color-dark-7)' }}
        />
      </ReactFlow>
    </div>
  );
}

export default RelationshipGraph;
