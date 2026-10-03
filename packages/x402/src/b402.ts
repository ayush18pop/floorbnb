// B402FacilitatorClient. UNTESTED-LIVE: no merchant credentials exist. Written against
// the public docs (https://developers.binance.com/en/docs/products/onchainpay-x402/quick-start,
// .../integration-guideline, legacy-docs/onchainpay-x402/open-apis-v2/{2.verify-payment,3.settle-payment})
// and exercised only with recorded/mocked fixtures. See ops/progress/A17.md for UNVERIFIED items.
import { createSign } from 'node:crypto';
import type {
  FacilitatorClient,
  PaymentPayload,
  PaymentRequirements,
  SettleResult,
  Supported,
  VerifyResult,
} from './types';

export interface B402Options {
  baseUrl: string; // from Binance onboarding (sandbox chain 97 / production chain 56)
  clientId: string;
  signAccessToken: string;
  /** RSA private key: PEM (PKCS#8 or PKCS#1) or bare base64 PKCS#8 DER. Never log it. */
  privateKey: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** settle poll interval, doc says 3 to 5 s. Default 4000. */
  pollIntervalMs?: number;
  /** max retries on HTTP 429 (exponential backoff from 500 ms). Default 3. */
  maxRetries429?: number;
}

export class B402Error extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) {
    super(message);
    this.name = 'B402Error';
  }
}

// Success code in the envelope. The docs show code "0" in examples; "000000" is a common Binance
// value. Both accepted. UNVERIFIED.
const OK_CODES = new Set(['0', '000000', '200']);

export function toPem(key: string): string {
  const k = key.trim();
  if (k.includes('-----BEGIN')) return k;
  const body = k.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN ${'PRIVATE'} KEY-----\n${body}\n-----END ${'PRIVATE'} KEY-----`;
}

export function signB402(body: string, timestamp: string, privateKey: string): string {
  const s = createSign('RSA-SHA256');
  s.update(Buffer.from(body + timestamp, 'utf8'));
  return s.sign(toPem(privateKey), 'base64');
}

export class B402FacilitatorClient implements FacilitatorClient {
  private f: typeof fetch;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;
  private pollMs: number;
  private retries: number;

  constructor(private o: B402Options) {
    this.f = o.fetch ?? fetch;
    this.now = o.now ?? Date.now;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.pollMs = o.pollIntervalMs ?? 4000;
    this.retries = o.maxRetries429 ?? 3;
  }

  /** Build the five auth headers for an exact body string. Exposed for tests. */
  headers(body: string): Record<string, string> {
    const ts = String(this.now()); // ms, must be within 5 min of server time
    return {
      'Content-Type': 'application/json',
      'X-Tesla-ClientId': this.o.clientId,
      'X-Tesla-SignAccessToken': this.o.signAccessToken,
      'X-Tesla-Signature': signB402(body, ts, this.o.privateKey),
      'X-Tesla-Timestamp': ts,
    };
  }

  private async call<T>(path: string, payload: unknown): Promise<T> {
    const body = JSON.stringify(payload); // sign and send the same exact string
    let attempt = 0;
    for (;;) {
      const res = await this.f(this.o.baseUrl.replace(/\/$/, '') + path, {
        method: 'POST',
        headers: this.headers(body),
        body,
      });
      if (res.status === 429 && attempt < this.retries) {
        await this.sleep(500 * 2 ** attempt++);
        continue;
      }
      if (!res.ok) throw new B402Error(`b402 ${path} HTTP ${res.status}`, undefined, res.status);
      const env = (await res.json()) as { code?: string | number; message?: string; data?: T };
      if (!OK_CODES.has(String(env.code))) throw new B402Error(`b402 ${path}: ${env.message ?? 'error'}`, String(env.code), res.status);
      if (env.data === undefined) throw new B402Error(`b402 ${path}: empty data`, String(env.code));
      return env.data;
    }
  }

  async getSupported(): Promise<Supported> {
    const d = await this.call<{ kinds?: Supported['kinds'] }>('/papi/v2/b402/supported', {});
    return { kinds: d.kinds ?? [] };
  }

  async verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResult> {
    const d = await this.call<VerifyResult>('/papi/v2/b402/verify', { x402Version: 2, paymentPayload, paymentRequirements });
    return { isValid: !!d.isValid, payer: d.payer, invalidReason: d.invalidReason };
  }

  private async settleOnce(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResult> {
    const d = await this.call<SettleResult>('/papi/v2/b402/settle', { x402Version: 2, paymentPayload, paymentRequirements });
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

  /**
   * success=true: done. success=false and no tx: terminal failure. success=false with a tx: pending,
   * call /settle again (idempotent) every pollIntervalMs until maxTimeoutSeconds elapse; then
   * return pending=true so the caller can keep polling in the background.
   */
  async settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResult> {
    const deadline = this.now() + Math.max(paymentRequirements.maxTimeoutSeconds, 1) * 1000;
    let r = await this.settleOnce(paymentPayload, paymentRequirements);
    while (r.pending && this.now() < deadline) {
      await this.sleep(this.pollMs);
      r = await this.settleOnce(paymentPayload, paymentRequirements);
    }
    return r;
  }
}
