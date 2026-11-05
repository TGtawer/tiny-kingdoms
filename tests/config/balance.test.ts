import { describe, expect, it } from 'vitest';
import * as balance from '../../src/config/balance';

function numbers(value: unknown, path = ''): Array<[string, number]> {
  if (typeof value === 'number') return [[path, value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => numbers(v, path ? `${path}.${k}` : k));
  }
  return [];
}

describe('balance config', () => {
  it('all numbers are finite', () => {
    for (const [path, n] of numbers(balance)) expect(Number.isFinite(n), path).toBe(true);
  });

  it('all numbers are positive except cooldown reductions (leader presets are checked below)', () => {
    for (const [path, n] of numbers(balance)) {
      if (path.startsWith('LEADERS.')) continue;
      if (path.endsWith('cooldownSec') && path.includes('SPELL_UPGRADES')) {
        expect(n, path).toBeLessThan(0);
      } else {
        expect(n, path).toBeGreaterThan(0);
      }
    }
  });

  it('leader presets are sane', () => {
    for (const [id, preset] of Object.entries(balance.LEADERS)) {
      expect(preset.aggression, id).toBeGreaterThanOrEqual(0);
      expect(preset.aggression, id).toBeLessThanOrEqual(1);
      expect(preset.thinkMs, id).toBeGreaterThan(0);
      for (const key of ['buildReserve', 'retaliateMs', 'attackAfterMs', 'weakenedBonus'] as const) {
        expect(preset[key], `${id}.${key}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('per-level building tables have 3 levels and grow', () => {
    const tables = [
      balance.BUILDINGS.cost,
      balance.BUILDINGS.mine.extraGoldPerSec,
      balance.BUILDINGS.barracks.productionMult,
      balance.BUILDINGS.barracks.extraCapacity,
      balance.BUILDINGS.tower.shotsPerSec,
    ];
    for (const table of tables) {
      expect(table).toHaveLength(3);
      expect(table[0]).toBeLessThan(table[1]);
      expect(table[1]).toBeLessThan(table[2]);
    }
  });
});
