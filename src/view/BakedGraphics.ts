import type * as Phaser from 'phaser';

/** A box around a drawing's origin, game px: how far it reaches left, right, up and down. */
export interface BakeBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * A Graphics drawing shown as a baked Image (docs/PERF.md PF-5): Phaser 4 rebuilds every Graphics' geometry each
 * frame (each circle is a 100-gon), an Image costs nothing. Draw into `graphics` around (0, 0), then `bake`.
 * Baked by the same WebGL Graphics at `supersample` times the size and shown scaled back: the same shapes and line
 * widths, edges smoothed by the extra resolution (render textures get no MSAA). The Image sits on whole screen
 * pixels, so the texture is not resampled beyond the scale-down.
 */
export class BakedGraphics {
  /** Off the display list: only drawn into the texture. */
  readonly graphics: Phaser.GameObjects.Graphics;
  /** Add it to the parent container where the Graphics used to be. */
  readonly image: Phaser.GameObjects.Image;
  private readonly texture: Phaser.Textures.DynamicTexture;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly key: string,
    private readonly supersample: number,
  ) {
    this.graphics = scene.make.graphics({}, false);
    const existing = scene.textures.exists(key) ? scene.textures.get(key) : null;
    this.texture = (existing as Phaser.Textures.DynamicTexture | null) ?? scene.textures.addDynamicTexture(key, 2, 2, false)!;
    this.image = scene.add.image(0, 0, key).setOrigin(0, 0);
  }

  /**
   * Bakes the drawing. (`x`, `y`): where its origin is on the screen (the parent's position); `box`: its extent.
   * An empty drawing just hides the image.
   */
  bake(x: number, y: number, box: BakeBox): void {
    if (this.graphics.commandBuffer.length === 0) {
      this.image.setVisible(false);
      return;
    }
    const ss = this.supersample;
    const left = Math.floor(x - box.left);
    const top = Math.floor(y - box.top);
    const width = Math.ceil(x + box.right) - left;
    const height = Math.ceil(y + box.bottom) - top;
    const t = this.texture;
    t.setSize(width * ss, height * ss, false);
    t.clear();
    this.graphics.setScale(ss).setPosition((x - left) * ss, (y - top) * ss);
    t.draw(this.graphics);
    t.render();
    this.image
      .setTexture(this.key)
      .setScale(1 / ss)
      .setPosition(left - x, top - y)
      .setVisible(true);
  }

  /** Frees the drawing after the last bake; the image and its texture stay (a texture kept for reuse by key). */
  release(): void {
    this.graphics.destroy();
  }

  destroy(): void {
    this.graphics.destroy();
    this.image.destroy();
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
  }
}
