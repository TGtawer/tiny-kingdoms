import { SPECIAL_NODES, TICK_MS } from '../../config/balance';
import { sendAmount } from './commands';
import { distance } from './pathfinding';
import { random, type NodeState, type World } from './World';

export interface BanditRaid {
  from: string;
  to: string;
  armyId: string;
  count: number;
}

const RAID_TICKS = Math.round(SPECIAL_NODES.bandits.raidEveryMs / TICK_MS);

/**
 * Bandit camps (GDD 3.12): every raid interval a neutral camp sends 75% of its troops (as a swipe)
 * to the nearest neighbouring node of the player or the enemy; ties go to the weaker node, then to the seeded RNG.
 * No non-neutral neighbour or too few troops: no raid this time. Mutates `world`.
 */
export function stepBandits(world: World): BanditRaid[] {
  const raids: BanditRaid[] = [];
  for (const camp of Object.values(world.nodes)) {
    if (camp.kind !== 'bandits' || camp.owner !== 'neutral' || camp.raidTick === null) continue;
    if (world.tick < camp.raidTick) continue;
    camp.raidTick += RAID_TICKS;

    const target = raidTarget(world, camp);
    const count = sendAmount(camp.troops, 'swipe');
    if (!target || count <= 0) continue;
    camp.troops -= count;
    const armyId = `a${world.nextArmyId++}`;
    world.armies.push({ id: armyId, owner: 'neutral', count, path: [camp.id, target.id], segment: 0, progress: 0, targetId: target.id });
    raids.push({ from: camp.id, to: target.id, armyId, count });
  }
  return raids;
}

/** Nearest road neighbour owned by the player or the enemy; ties: fewer troops, then random. */
export function raidTarget(world: World, camp: NodeState): NodeState | null {
  const neighbours = world.roads
    .flatMap(([a, b]) => (a === camp.id ? [b] : b === camp.id ? [a] : []))
    .map((id) => world.nodes[id]!)
    .filter((n) => n.owner !== 'neutral');
  if (neighbours.length === 0) return null;

  const EPS = 1e-9;
  let best: NodeState[] = [];
  let bestD = Infinity;
  let bestTroops = Infinity;
  for (const n of neighbours) {
    const d = distance(camp, n);
    if (d < bestD - EPS || (Math.abs(d - bestD) <= EPS && n.troops < bestTroops - EPS)) {
      best = [n];
      bestD = d;
      bestTroops = n.troops;
    } else if (Math.abs(d - bestD) <= EPS && Math.abs(n.troops - bestTroops) <= EPS) {
      best.push(n);
    }
  }
  return best.length === 1 ? best[0]! : best[Math.floor(random(world) * best.length)]!;
}
