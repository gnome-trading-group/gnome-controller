import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { Badge } from '@mantine/core';
import { ContractRelationshipType } from '../../../types';

const RELATIONSHIP_COLORS: Record<ContractRelationshipType, string> = {
  EQUIVALENT: 'green',
  IMPLIES: 'blue',
  MUTUALLY_EXCLUSIVE: 'orange',
  HEDGEABLE_WITH: 'violet',
};

export interface RelationshipEdgeData {
  relationshipType: ContractRelationshipType;
  confidence: number;
  method: string;
  [key: string]: unknown;
}

function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  markerStart,
  data,
  selected,
}: EdgeProps) {
  const edgeData = data as RelationshipEdgeData | undefined;
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  const color = edgeData ? RELATIONSHIP_COLORS[edgeData.relationshipType] ?? 'gray' : 'gray';
  const strokeColor = selected ? 'var(--mantine-color-green-4)' : `var(--mantine-color-${color}-5)`;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{
          stroke: strokeColor,
          strokeWidth: selected ? 2.5 : 1.5,
        }}
      />
      {edgeData && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
          >
            <Badge
              size="xs"
              color={color}
              variant="filled"
              style={{ cursor: 'default', opacity: 0.9 }}
              title={`${edgeData.method} | ${(edgeData.confidence * 100).toFixed(0)}% confidence`}
            >
              {edgeData.relationshipType.replace(/_/g, ' ')} {(edgeData.confidence * 100).toFixed(0)}%
            </Badge>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(RelationshipEdge);
