import type * as Phaser from 'phaser';

/**
 * Drawings that change only on a layout change, baked into one screen-sized texture (docs/PERF.md PF-G).
 * Phaser 4 rebuilds a Graphics' geometry every frame even when nothing changed; one Image costs nothing.
 * Baked through canvas 2D (Graphics.generateTexture into one canvas): its edges are smoothed like the frame's.
 * A WebGL DynamicTexture would be the same pipeline, but Phaser 4 draws it without MSAA, so road and grass
 * edges came out stepped.
 * The layer has a base (meadow, roads: redrawn only by `bake`) and an overlay on top of it (tower zones,
 * docs/TOWER.md TW-3: `rebakeOverlay` when they change). The base is kept in its own canvas, so a new overlay
 * copies it instead of redrawing thousands of commands.
 * Create it where the drawings used to be in the display list: the Image takes their place.
 */
export class BakedLayer {
  readonly image: Phaser.GameObjects.Image;
  private readonly texture: Phaser.Textures.CanvasTexture;
  /** The base drawings as last baked. */
  private readonly base: HTMLCanvasElement;

  constructor(scene: Phaser.Scene, private readonly key: string) {
    // Kept across scene restarts (a level restart bakes into the same texture).
    const existing = scene.textures.exists(key) ? scene.textures.get(key) : null;
    this.texture = (existing as Phaser.Textures.CanvasTexture | null) ?? scene.textures.createCanvas(key, 2, 2)!;
    this.image = scene.add.image(0, 0, key).setOrigin(0, 0);
    this.base = document.createElement('canvas');
  }

  /** Redraws the layer: `base` in order, at their own positions, on a w x h texture, then `overlay` on top. */
  bake(width: number, height: number, base: Phaser.GameObjects.Graphics[], overlay: Phaser.GameObjects.Graphics[] = []): void {
    const w = Math.max(1, Math.ceil(width));
    const h = Math.max(1, Math.ceil(height));
    const b = this.base;
    if (b.width !== w || b.height !== h) {
      b.width = w;
      b.height = h;
    }
    const ctx = b.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    // Joins as the WebGL Graphics draws them (canvas defaults to sharp miters).
    ctx.lineJoin = 'round';
    for (const g of base) g.generateTexture(b, w, h);
    this.rebakeOverlay(overlay);
  }

  /** The base as last baked plus a new `overlay` on top, uploaded once. */
  rebakeOverlay(overlay: Phaser.GameObjects.Graphics[]): void {
    const t = this.texture;
    const w = this.base.width;
    const h = this.base.height;
    if (t.width !== w || t.height !== h) t.setSize(w, h);
    t.context.clearRect(0, 0, w, h);
    t.context.drawImage(this.base, 0, 0);
    t.context.lineJoin = 'round';
    for (const g of overlay) g.generateTexture(t.canvas, w, h);
    t.refresh();
    // The texture may have changed size: the Image picks up the new frame.
    this.image.setTexture(this.key);
  }
}
