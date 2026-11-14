import { CheckoutAdapter, CheckoutPlatformId } from '../types';
import { HotmartAdapter } from './hotmart.adapter';
import { KiwifyAdapter } from './kiwify.adapter';
import { CaktoAdapter } from './cakto.adapter';
import { MonetizzeAdapter } from './monetizze.adapter';
import { PerfectPayAdapter } from './perfectpay.adapter';
import { EduzzAdapter } from './eduzz.adapter';
import { BraipAdapter } from './braip.adapter';
import { CustomWebhookAdapter } from './custom.adapter';

export class CheckoutAdapterFactory {
  private static adapters: Map<CheckoutPlatformId, CheckoutAdapter> = new Map();

  static {
    this.register(new HotmartAdapter());
    this.register(new KiwifyAdapter());
    this.register(new CaktoAdapter());
    this.register(new MonetizzeAdapter());
    this.register(new PerfectPayAdapter());
    this.register(new EduzzAdapter());
    this.register(new BraipAdapter());
    this.register(new CustomWebhookAdapter());
  }

  static register(adapter: CheckoutAdapter) {
    this.adapters.set(adapter.platform, adapter);
  }

  static getAdapter(platform: CheckoutPlatformId | string): CheckoutAdapter {
    const key = (platform || '').toUpperCase() as CheckoutPlatformId;
    const adapter = this.adapters.get(key);
    if (adapter) return adapter;
    return this.adapters.get('CUSTOM')!;
  }

  /**
   * Identifica automaticamente a plataforma do webhook a partir do payload ou headers
   */
  static detectAdapter(payload: any, headers: Record<string, string> = {}): CheckoutAdapter {
    const entries: [CheckoutPlatformId, CheckoutAdapter][] = Array.from(this.adapters.entries());
    for (let i = 0; i < entries.length; i++) {
      const [platform, adapter] = entries[i];
      if (platform !== 'CUSTOM' && adapter.canHandle(payload, headers)) {
        return adapter;
      }
    }
    return this.adapters.get('CUSTOM')!;
  }
}
