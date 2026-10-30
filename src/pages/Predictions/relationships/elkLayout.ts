import ELK, { type ELK as ElkInstance } from 'elkjs/lib/elk-api';
import ElkWorker from 'elkjs/lib/elk-worker.min.js?worker';

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 56;

let elk: ElkInstance | null = null;

// Layout runs in a worker: a layered layout of a few hundred nodes takes long enough to freeze the page otherwise.
function instance(): ElkInstance {
  elk ??= new ELK({ workerFactory: () => new ElkWorker() });
  return elk;
}

/** Top-down layered positions (top-left corners) for the nodes, implications pointing down. */
export async function layout(
  nodeIds: string[],
  edges: { id: string; source: string; target: string }[],
): Promise<Record<string, { x: number; y: number }>> {
  const result = await instance().layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '30',
      'elk.layered.spacing.nodeNodeBetweenLayers': '50',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    },
    children: nodeIds.map(id => ({ id, width: NODE_WIDTH, height: NODE_HEIGHT })),
    edges: edges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  });
  return Object.fromEntries((result.children ?? []).map(c => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
}
