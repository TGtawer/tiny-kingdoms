import type { Lang } from '../i18n/i18n';

export type AdResult = 'rewarded' | 'closed' | 'error';

export type ProductId = 'remove_ads' | 'crystals_s' | 'crystals_m' | 'crystals_l' | 'starter_pack';

export interface Purchase {
  productId: ProductId;
  /** Token used to consume a consumable purchase after it has been granted. */
  token: string;
}

/** Called by the platform when the game must pause (ads) or may resume. */
export interface PauseHandlers {
  pause(): void;
  resume(): void;
}

/** The only gateway to the hosting platform (Yandex Games SDK or a dev mock). */
export interface Platform {
  init(): Promise<void>;
  /** Game is loaded and ready for interaction. */
  ready(): void;
  gameplayStart(): void;
  gameplayStop(): void;

  setPauseHandlers(handlers: PauseHandlers): void;
  /** Pauses the game for the duration of the ad via the pause handlers. */
  showInterstitial(): Promise<AdResult>;
  showRewarded(): Promise<AdResult>;

  purchase(productId: ProductId): Promise<Purchase | null>;
  getPurchases(): Promise<Purchase[]>;
  consume(token: string): Promise<void>;

  load(): Promise<string | null>;
  save(data: string): Promise<void>;

  lang(): Lang;
}
