import { describe, expect, it } from 'vitest';
import { SPELLS } from '../../../src/config/balance';
import { validate, type CastSpell } from '../../../src/core/sim/commands';
import { fireballKill } from '../../../src/core/sim/spells';
import { step } from '../../../src/core/sim/tick';
import { defaultModifiers } from '../../../src/core/sim/World';
import { freezeEconomy, lineWorld, run } from '../helpers';

const cast = (spell: CastSpell['spell'], nodeId: string): CastSpell => ({ type: 'cast', side: 'player', spell, nodeId });

function spellWorld(overrides: Parameters<typeof lineWorld>[0] = {}, gold = 1000) {
  return freezeEconomy(
    lineWorld(overrides, { playerStartGold: gold }, { player: { unlockedSpells: ['fireball', 'reinforcement'] } }),
  );
}

describe('fireball', () => {
  it('kills 40% of the garrison', () => {
    const world = spellWorld({ E: { troops: 30 } });
    step(world, [cast('fireball', 'E')]);
    expect(world.nodes.E!.troops).toBeCloseTo(30 * (1 - SPELLS.fireball.killShare));
    expect(world.sides.player.gold).toBe(1000 - SPELLS.fireball.cost);
  });

  it('kills at least minKill, but not more than present', () => {
    expect(fireballKill(8, defaultModifiers())).toBe(SPELLS.fireball.minKill);
    expect(fireballKill(3, defaultModifiers())).toBe(3);
  });

  it('only targets enemy nodes', () => {
    const world = spellWorld();
    expect(validate(world, cast('fireball', 'P'))).toBe('invalidTarget');
    expect(validate(world, cast('fireball', 'N'))).toBe('invalidTarget');
    expect(validate(world, cast('fireball', 'E'))).toBeNull();
  });

  it('kill share bonus from upgrades', () => {
    const mods = defaultModifiers();
    mods.spells.fireball.killShareBonus = 0.1;
    expect(fireballKill(100, mods)).toBeCloseTo(50);
  });
});

describe('reinforcement', () => {
  it('adds troops to an own node, even above capacity', () => {
    const world = spellWorld({ P: { troops: 20 } });
    step(world, [cast('reinforcement', 'P')]);
    expect(world.nodes.P!.troops).toBe(20 + SPELLS.reinforcement.troops);
  });

  it('only targets own nodes', () => {
    const world = spellWorld();
    expect(validate(world, cast('reinforcement', 'E'))).toBe('invalidTarget');
    expect(validate(world, cast('reinforcement', 'N'))).toBe('invalidTarget');
  });

  it('extra troops from upgrades', () => {
    const world = spellWorld({ P: { troops: 0 } });
    world.sides.player.modifiers.spells.reinforcement.extraTroops = 3;
    step(world, [cast('reinforcement', 'P')]);
    expect(world.nodes.P!.troops).toBe(SPELLS.reinforcement.troops + 3);
  });
});

describe('cost, cooldown, unlock', () => {
  it('rejects locked spells', () => {
    const world = freezeEconomy(lineWorld({}, { playerStartGold: 1000 }));
    expect(validate(world, cast('fireball', 'E'))).toBe('spellLocked');
  });

  it('rejects when gold is short', () => {
    const world = spellWorld({}, SPELLS.fireball.cost - 1);
    expect(validate(world, cast('fireball', 'E'))).toBe('notEnoughGold');
  });

  it('cooldown blocks recasting for exactly cooldownSec', () => {
    const world = spellWorld({ E: { troops: 1000 } });
    step(world, [cast('fireball', 'E')]); // tick 1: cast, cooldown starts
    const cooldownTicks = SPELLS.fireball.cooldownSec * 10;
    run(world, cooldownTicks - 2);
    expect(validate(world, cast('fireball', 'E'))).toBe('cooldown');
    run(world, 1);
    expect(validate(world, cast('fireball', 'E'))).toBeNull();
  });

  it('cooldown reduction from upgrades', () => {
    const world = spellWorld({ P: { troops: 0 } });
    world.sides.player.modifiers.spells.reinforcement.cooldownReductionSec = 5;
    step(world, [cast('reinforcement', 'P')]);
    expect(world.sides.player.spellCooldowns.reinforcement).toBe((SPELLS.reinforcement.cooldownSec - 5) * 1000 - 100);
  });

  it('cooldowns are per side and per spell', () => {
    const world = spellWorld({ E: { troops: 100 } });
    step(world, [cast('fireball', 'E')]);
    expect(validate(world, cast('reinforcement', 'P'))).toBeNull();
    expect(world.sides.enemy.spellCooldowns.fireball).toBe(0);
  });
});
