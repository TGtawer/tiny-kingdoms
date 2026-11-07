import type * as Phaser from 'phaser';

/**
 * Drawings that change only on a layout change, baked into one screen-sized texture (docs/PERF.md PF-G).
 * Phaser 4 rebuilds a Graphics' geometry every frame even when nothing changed; one Image costs nothing.
 * Baked through canvas 2D (Graphics.generateTexture into one canvas): its edges are smoothed like the frame's.
 * A WebGL DynamicTexture would be the same pipeline, but Phaser 4 draws it without MSAA, so road and grass
 * edges came out stepped.
 * Create it where the drawings used to be in the display list: the Image takes their place.
 */
export class BakedLayer {
  readonly image: Phaser.GameObjects.Image;
  private readonly texture: Phaser.Textures.CanvasTexture;

  constructor(scene: Phaser.Scene, private readonly key: string) {
    // Kept across scene restarts (a level restart bakes into the same texture).
    const existing = scene.textures.exists(key) ? scene.textures.get(key) : null;
    this.texture = (existing as Phaser.Textures.CanvasTexture | null) ?? scene.textures.createCanvas(key, 2, 2)!;
    this.image = scene.add.image(0, 0, key).setOrigin(0, 0);
  }

  /** Redraws the layer: `sources` in order, at their own positions, on a w x h texture, then uploads it once. */
  bake(width: number, height: number, sources: Phaser.GameObjects.Graphics[]): void {
    const t = this.texture;
    const w = Math.max(1, Math.ceil(width));
    const h = Math.max(1, Math.ceil(height));
    if (t.width !== w || t.height !== h) t.setSize(w, h);
    t.context.clearRect(0, 0, w, h);
    for (const g of sources) g.generateTexture(t.canvas, w, h);
    t.refresh();
    // The texture may have changed size: the Image picks up the new frame.
    this.image.setTexture(this.key);
  }
}
