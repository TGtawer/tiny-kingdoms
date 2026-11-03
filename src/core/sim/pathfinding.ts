import type { NodeState, Side, World } from './World';

/** Armies of `side` may only travel through its own nodes. */
export function passableFor(side: Side): (node: NodeState) => boolean {
  return (node) => node.owner === side;
}

/** Route an army of `side` would take from `from` to `to`, or null if there is none. */
export function armyPath(world: World, side: Side, from: string, to: string): string[] | null {
  return findPath(world.nodes, world.roads, from, to, passableFor(side));
}

/**
 * Why `side` has no route: the first foreign (neutral or enemy) node on the shortest road path from `from` to `to`
 * when ownership is ignored. Null if the target is not reachable over roads at all, or nothing is in the way.
 */
export function blockingNode(world: World, side: Side, from: string, to: string): string | null {
  const path = findPath(world.nodes, world.roads, from, to);
  if (!path) return null;
  for (const id of path.slice(1, -1)) {
    if (world.nodes[id]!.owner !== side) return id;
  }
  return null;
}

export function distance(a: Pick<NodeState, 'x' | 'y'>, b: Pick<NodeState, 'x' | 'y'>): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Shortest path over the road graph (Dijkstra, Euclidean edge length).
 * Returns node ids from `from` to `to` inclusive, or null if unreachable.
 * Ties are broken by node insertion order, so the result is deterministic.
 *
 * `canPass` decides which nodes may be used as intermediate stops (the start and the target are always allowed).
 * Armies use `passableFor(side)`: they cannot pass through enemy or neutral nodes.
 */
export function findPath(
  nodes: Record<string, NodeState>,
  roads: ReadonlyArray<readonly [string, string]>,
  from: string,
  to: string,
  canPass: (node: NodeState) => boolean = () => true,
): string[] | null {
  if (!nodes[from] || !nodes[to]) return null;
  if (from === to) return [from];

  const adjacency = new Map<string, string[]>();
  for (const id of Object.keys(nodes)) adjacency.set(id, []);
  for (const [a, b] of roads) {
    adjacency.get(a)?.push(b);
    adjacency.get(b)?.push(a);
  }

  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const visited = new Set<string>();
  const order = Object.keys(nodes);

  for (;;) {
    let current: string | null = null;
    let best = Infinity;
    for (const id of order) {
      const d = dist.get(id);
      if (d !== undefined && !visited.has(id) && d < best) {
        best = d;
        current = id;
      }
    }
    if (current === null) return null;
    if (current === to) break;
    visited.add(current);

    const currentNode = nodes[current]!;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      if (next !== to && !canPass(nodes[next]!)) continue;
      const candidate = best + distance(currentNode, nodes[next]!);
      const known = dist.get(next);
      if (known === undefined || candidate < known) {
        dist.set(next, candidate);
        prev.set(next, current);
      }
    }
  }

  const path = [to];
  let cursor = to;
  while (cursor !== from) {
    cursor = prev.get(cursor)!;
    path.push(cursor);
  }
  return path.reverse();
}

export function pathLength(nodes: Record<string, NodeState>, path: readonly string[]): number {
  let total = 0;
  for (let i = 0; i + 1 < path.length; i++) total += distance(nodes[path[i]!]!, nodes[path[i + 1]!]!);
  return total;
}
