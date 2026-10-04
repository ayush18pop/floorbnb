// B402FacilitatorClient: Binance Web3 API "B402 Payments" (https://web3.binance.com/build/api/v2/b402/*).
// Auth is the ordinary Web3 API key (needs the "B402 Payments" permission) with the X-OC-* HMAC headers.
// The merchant is resolved from the key's Developer Portal project: never send a merchantId.
import { createHmac } from 'node:crypto';
import type {
  FacilitatorClient,
  PaymentPayload,
  PaymentRequirements,
  SettleResult,
  Supported,
  VerifyResult,
} from './types';

export const B402_BASE_URL = 'https://web3.binance.com/build';

export interface B402Options {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string; // default B402_BASE_URL
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** max retries on HTTP 429 (exponential backoff from 500 ms). Default 3. */
  maxRetries429?: number;
}

export class B402Error extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) {
    super(message);
    this.name = 'B402Error';
  }
}

/** HMAC-SHA256(timestamp + METHOD + path + body), Base64. `path` includes the /build prefix. */
export function signB402(secret: string, timestamp: string, method: string, path: string, body: string): string {
  return createHmac('sha256', secret).update(timestamp + method.toUpperCase() + path + body).digest('base64');
}

interface Envelope<T> {
  status?: string;
  code?: string | number;
  errorData?: unknown;
  data?: T;
}

export class B402FacilitatorClient implements FacilitatorClient {
  private f: typeof fetch;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;
  private retries: number;
  private base: string;

  constructor(private o: B402Options) {
    this.f = o.fetch ?? fetch;
    this.now = o.now ?? Date.now;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.retries = o.maxRetries429 ?? 3;
    this.base = (o.baseUrl ?? B402_BASE_URL).replace(/\/$/, '');
  }

  private get prefix(): string {
    return new URL(this.base).pathname.replace(/\/$/, ''); // '/build'
  }

  /** Headers for an exact body string. Exposed for tests. */
  headers(path: string, body: string): Record<string, string> {
    const ts = new Date(this.now()).toISOString();
    return {
      'Content-Type': 'application/json',
      'X-OC-APIKEY': this.o.apiKey,
      'X-OC-TIMESTAMP': ts,
      'X-OC-SIGN': signB402(this.o.apiSecret, ts, 'POST', this.prefix + path, body),
    };
  }

  private async call<T>(path: string, inner: unknown): Promise<T> {
    const body = JSON.stringify({ body: inner }); // sign and send the same exact string
    const url = new URL(this.base);
    let attempt = 0;
    for (;;) {
      const res = await this.f(url.origin + this.prefix + path, { method: 'POST', headers: this.headers(path, body), body });
      if (res.status === 429 && attempt < this.retries) {
        await this.sleep(500 * 2 ** attempt++);
        continue;
      }
      let env: Envelope<T> | undefined;
      try { env = (await res.json()) as Envelope<T>; } catch { /* non-JSON */ }
      if (!res.ok) throw new B402Error(`b402 ${path} HTTP ${res.status}${env?.code ? ` code ${env.code}` : ''}`, env?.code === undefined ? undefined : String(env.code), res.status);
      if (!env || env.status === 'ERROR' || env.data === undefined) {
        throw new B402Error(`b402 ${path}: ${env?.status ?? 'bad envelope'} ${JSON.stringify(env?.errorData ?? '')}`, env?.code === undefined ? undefined : String(env.code), res.status);
      }
      return env.data;
    }
  }

  async getSupported(): Promise<Supported> {
    const d = await this.call<{ kinds?: Supported['kinds'] }>('/api/v2/b402/supported', {});
    return { kinds: d.kinds ?? [] };
  }

  /** Invalid payments are HTTP 200 with data.isValid=false. */
  async verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResult> {
    const d = await this.call<VerifyResult>('/api/v2/b402/verify', { x402Version: 2, paymentPayload, paymentRequirements });
    return { isValid: !!d.isValid, payer: d.payer, invalidReason: d.invalidReason };
  }

  /**
   * Moves real funds, irreversible: called exactly once, never auto-retried. Failure is HTTP 200 with
   * data.success=false; a non-empty transaction on a failure means broadcast-but-unconfirmed, so we
   * return pending=true and the caller must reconcile that tx hash instead of settling again.
   */
  async settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResult> {
    const d = await this.call<SettleResult>('/api/v2/b402/settle', { x402Version: 2, paymentPayload, paymentRequirements });
    const transaction = d.transaction ?? '';
    return {
      success: !!d.success,
      transaction,
      network: d.network ?? paymentRequirements.network,
      payer: d.payer,
      amount: d.amount,
      errorReason: d.errorReason,
      pending: !d.success && transaction !== '',
    };
  }
}
