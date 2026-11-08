import type * as Phaser from 'phaser';
import { FX_TEXTURES } from '../config/game';
import { px } from './layout';

/** How one burst of particles flies (docs/FX.md). Sizes and speeds CSS px, times ms, angles radians. */
export interface BurstStyle {
  count: number;
  /** Half-width of the cone around the burst direction; Math.PI for every direction. */
  cone: number;
  /** Speed is `speed` × a random factor in [speedMin, speedMax]. */
  speed: number;
  speedMin: number;
  speedMax: number;
  lifeMin: number;
  lifeMax: number;
  /** Particle side (a square), random in [sizeMin, sizeMax]. */
  sizeMin: number;
  sizeMax: number;
}

const RAD_TO_DEG = 180 / Math.PI;

/** The tiny white square every particle uses (tinted per particle); baked once (BootScene, or on first use). */
export function ensureDotTexture(scene: Phaser.Scene): void {
  const { dot, dotPx } = FX_TEXTURES;
  if (scene.textures.exists(dot)) return;
  const g = scene.make.graphics({}, false);
  g.fillStyle(0xffffff, 1).fillRect(0, 0, dotPx, dotPx);
  g.generateTexture(dot, dotPx, dotPx);
  g.destroy();
}

/**
 * Bursts of particles from one Phaser ParticleEmitter created with the scene (docs/FX.md FX-2): one texture, one
 * draw call, at most `max` particles alive (a burst over the cap is cut short), all of them allocated up front.
 * The emitter's callbacks read the style of the burst being emitted, so a burst sets its direction, speed, life,
 * size and colors without reconfiguring the emitter. Particles fade out over their life; with `spin`, they turn
 * by `spin` degrees per second per CSS px/s of their sideways speed (confetti).
 */
export class ParticleBursts {
  private readonly emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private angle = 0;
  private style: BurstStyle | null = null;
  private colors: readonly number[] = [0xffffff];

  constructor(scene: Phaser.Scene, depth: number, max: number, options: { gravity?: number; spin?: number } = {}) {
    ensureDotTexture(scene);
    const spin = options.spin ?? 0;
    const dot = FX_TEXTURES.dotPx;
    const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
    this.emitter = scene.add.particles(0, 0, FX_TEXTURES.dot, {
      emitting: false,
      maxAliveParticles: max,
      reserve: max,
      gravityY: px(options.gravity ?? 0),
      angle: () => (this.angle + rnd(-1, 1) * this.style!.cone) * RAD_TO_DEG,
      speed: () => px(this.style!.speed * rnd(this.style!.speedMin, this.style!.speedMax)),
      lifespan: () => rnd(this.style!.lifeMin, this.style!.lifeMax),
      scale: () => px(rnd(this.style!.sizeMin, this.style!.sizeMax)) / dot,
      tint: () => this.colors[Math.floor(Math.random() * this.colors.length)]!,
      alpha: { start: 1, end: 0 },
      ...(spin
        ? {
            // No per-particle memory: the turn grows with the time lived and the sideways speed; the random life
            // gives each piece its own starting angle.
            rotate: {
              onEmit: (p?: Phaser.GameObjects.Particles.Particle) => ((p?.life ?? 0) * 7) % 360,
              onUpdate: (p: Phaser.GameObjects.Particles.Particle) =>
                ((p.life * 7) % 360) + ((p.life - p.lifeCurrent) / 1000) * (p.velocityX / px(1)) * spin,
            },
          }
        : {}),
    });
    this.emitter.setDepth(depth);
  }

  /** Emits `style.count` particles at (x, y) towards `angle` (radians), each colored from `colors`. */
  burst(x: number, y: number, angle: number, style: BurstStyle, colors: readonly number[], count = style.count): void {
    this.angle = angle;
    this.style = style;
    this.colors = colors;
    this.emitter.emitParticleAt(x, y, count);
  }

  /** Particles alive now (dev checks). */
  get alive(): number {
    return this.emitter.getAliveParticleCount();
  }
}
