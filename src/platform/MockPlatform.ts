import { resolveLang, type Lang } from '../i18n/i18n';
import type { AdResult, PauseHandlers, Platform, ProductId, Purchase } from './Platform';

const SAVE_KEY = 'tiny-kingdoms.save';
const FAKE_AD_MS = 1000;

/** Dev platform: ads are timers, purchases succeed instantly, saves go to localStorage. */
export class MockPlatform implements Platform {
  private pauseHandlers: PauseHandlers | null = null;
  private purchaseSeq = 0;

  async init(): Promise<void> {
    log('init');
  }

  ready(): void {
    log('ready');
  }

  gameplayStart(): void {
    log('gameplayStart');
  }

  gameplayStop(): void {
    log('gameplayStop');
  }

  setPauseHandlers(handlers: PauseHandlers): void {
    this.pauseHandlers = handlers;
  }

  showInterstitial(): Promise<AdResult> {
    return this.fakeAd('interstitial', 'closed');
  }

  showRewarded(): Promise<AdResult> {
    return this.fakeAd('rewarded', 'rewarded');
  }

  async purchase(productId: ProductId): Promise<Purchase | null> {
    this.purchaseSeq += 1;
    const purchase: Purchase = { productId, token: `mock-${productId}-${this.purchaseSeq}` };
    log('purchase', purchase);
    return purchase;
  }

  async getPurchases(): Promise<Purchase[]> {
    return [];
  }

  async consume(token: string): Promise<void> {
    log('consume', token);
  }

  async load(): Promise<string | null> {
    try {
      return localStorage.getItem(SAVE_KEY);
    } catch {
      return null;
    }
  }

  async save(data: string): Promise<void> {
    try {
      localStorage.setItem(SAVE_KEY, data);
    } catch {
      // Storage may be unavailable (private mode); saving is best-effort.
    }
  }

  lang(): Lang {
    return resolveLang(typeof navigator === 'undefined' ? '' : navigator.language);
  }

  private fakeAd(kind: string, result: AdResult): Promise<AdResult> {
    log(`ad:${kind} open`);
    this.pauseHandlers?.pause();
    return new Promise((resolve) => {
      setTimeout(() => {
        this.pauseHandlers?.resume();
        log(`ad:${kind} ${result}`);
        resolve(result);
      }, FAKE_AD_MS);
    });
  }
}

function log(...args: unknown[]): void {
  console.info('[MockPlatform]', ...args);
}
