import type { z } from 'zod';
import { Bw3Error, Bw3HttpError, Bw3TimeoutError, classifyApiError } from './errors.js';
import { broadcastData, envelope, gasPriceData, quoteData, rwaPriceData, simulateData, swapData } from './schemas.js';
import type { EvmTx, QuoteRoute, SwapResult } from './schemas.js';
import { isoTimestamp, sign, type SignEncoding } from './sign.js';

export interface Bw3Options {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  chainId?: string;
  timeoutMs?: number;
  signEncoding?: SignEncoding;
  /** Backoff delays in ms for 5xx / 429 / network errors. Default 2 s, 4 s, 8 s. */
  retryDelaysMs?: number[];
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Every path is sent under this prefix, in the URL AND in the signed string. */
export const BUILD_PREFIX = '/build';

export class Bw3Client {
  private readonly o: Required<Omit<Bw3Options, 'fetch' | 'sleep' | 'now'>> & Pick<Bw3Options, 'fetch' | 'sleep' | 'now'>;

  constructor(opts: Bw3Options) {
    this.o = {
      baseUrl: 'https://web3.binance.com',
      chainId: '56',
      timeoutMs: 10_000,
      signEncoding: 'base64',
      retryDelaysMs: [2000, 4000, 8000],
      ...opts,
    };
  }

  /** Never logs or returns headers or keys. */
  async request(method: 'GET' | 'POST', path: string, args: { query?: Record<string, string | undefined>; body?: unknown } = {}): Promise<unknown> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(args.query ?? {})) if (v !== undefined) q.set(k, v);
    const qs = q.toString();
    const signedPath = `${BUILD_PREFIX}${path}${qs ? `?${qs}` : ''}`;
    const body = args.body === undefined ? '' : JSON.stringify(args.body);
    const doFetch = this.o.fetch ?? fetch;
    const sleep = this.o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const now = this.o.now ?? Date.now;

    for (let attempt = 0; ; attempt++) {
      const timestamp = isoTimestamp(now());
      const headers: Record<string, string> = {
        'X-OC-APIKEY': this.o.apiKey,
        'X-OC-TIMESTAMP': timestamp,
        'X-OC-SIGN': sign({ secret: this.o.apiSecret, timestamp, method, path: signedPath, body, encoding: this.o.signEncoding }),
      };
      if (body) headers['Content-Type'] = 'application/json';
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), this.o.timeoutMs);
      let retryable = false;
      let failure: Bw3Error;
      try {
        const res = await doFetch(this.o.baseUrl + signedPath, { method, headers, body: body || undefined, signal: ctl.signal });
        if (res.status === 429 || res.status >= 500) {
          retryable = true;
          failure = new Bw3HttpError(`HTTP ${res.status} from ${path}`, res.status);
        } else {
          const text = await res.text();
          let json: unknown;
          try { json = JSON.parse(text); } catch { throw new Bw3HttpError(`HTTP ${res.status} non-JSON body from ${path}`, res.status); }
          const env = envelope.parse(json);
          const code = env.code === undefined ? undefined : String(env.code);
          if (!res.ok || (code !== undefined && code !== '000000' && code !== '0')) {
            throw classifyApiError(code, env.msg ?? `HTTP ${res.status} from ${path}`);
          }
          return env.data;
        }
      } catch (e) {
        if (e instanceof Bw3Error) throw e;
        if (e instanceof Error && e.name === 'AbortError') {
          retryable = true;
          failure = new Bw3TimeoutError(`timeout after ${this.o.timeoutMs} ms on ${path}`);
        } else if (e instanceof Error && e.name === 'ZodError') {
          throw new Bw3Error(`unexpected response shape from ${path}`);
        } else {
          retryable = true;
          failure = new Bw3Error(`network error on ${path}: ${e instanceof Error ? e.message : String(e)}`);
        }
      } finally {
        clearTimeout(timer);
      }
      const delay = this.o.retryDelaysMs[attempt];
      if (!retryable || delay === undefined) throw failure;
      await sleep(delay);
    }
  }

  private parse<T extends z.ZodType>(schema: T, data: unknown, what: string): z.infer<T> {
    const r = schema.safeParse(data);
    if (!r.success) throw new Bw3Error(`unexpected ${what} response shape: ${r.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
    return r.data;
  }

  /** The query parameter is `tokenContractAddresses` (plural, comma-separated), even for one address. Row fields are unverified. */
  async rwaPrice(addresses: string[]): Promise<Record<string, unknown>[]> {
    const data = await this.request('GET', '/api/v1/dex/market/rwa/price', {
      query: { binanceChainId: this.o.chainId, tokenContractAddresses: addresses.join(',') },
    });
    return this.parse(rwaPriceData, data, 'rwaPrice');
  }

  /** Routes sorted best first by the API. `amount` is in the token's SMALLEST unit (wei; verified live: "10" = 10 wei, "10.0" is rejected). `userWalletAddress` is required for RFQ routes. */
  async quote(p: { from: string; to: string; amount: string; userWalletAddress: string; vendor?: string }): Promise<QuoteRoute[]> {
    const data = await this.request('GET', '/api/v1/dex/aggregator/quote', {
      query: { binanceChainId: this.o.chainId, amount: p.amount, fromTokenAddress: p.from, toTokenAddress: p.to, userWalletAddress: p.userWalletAddress, vendor: p.vendor },
    });
    return this.parse(quoteData, data, 'quote');
  }

  /** `signatureData[0]` is a JSON string (not an object); `approveContract` inside it is the approveTarget. */
  async swap(p: { from: string; to: string; amount: string; userWalletAddress: string; quoteId: string; slippagePercent: string; vendor?: string }): Promise<SwapResult> {
    const raw = await this.request('GET', '/api/v1/dex/aggregator/swap', {
      query: {
        binanceChainId: this.o.chainId, amount: p.amount, fromTokenAddress: p.from, toTokenAddress: p.to, userWalletAddress: p.userWalletAddress,
        quoteId: p.quoteId, slippagePercent: p.slippagePercent, approveTransaction: 'true', vendor: p.vendor,
      },
    });
    const d = this.parse(swapData, Array.isArray(raw) ? raw[0] : raw, 'swap');
    const sig = d.tx.signatureData?.[0];
    let approveTarget: string | undefined;
    if (sig) {
      try { approveTarget = (JSON.parse(sig) as { approveContract?: string }).approveContract; } catch { /* handled below */ }
    }
    if (!approveTarget) throw new Bw3Error('swap response has no approveTarget (signatureData[0].approveContract)');
    return { to: d.tx.to, data: d.tx.data, minReceiveAmount: d.tx.minReceiveAmount, approveTarget, executionMode: d.executionMode ?? 'SWAP' };
  }

  async simulate(evmTx: EvmTx): Promise<z.infer<typeof simulateData>> {
    const data = await this.request('POST', '/api/v1/dex/pre-transaction/simulate', {
      body: { binanceChainId: this.o.chainId, evmTx: { value: '0', ...evmTx } },
    });
    return this.parse(simulateData, data, 'simulate');
  }

  async gasPrice(): Promise<z.infer<typeof gasPriceData>> {
    const data = await this.request('GET', '/api/v1/dex/pre-transaction/gas-price', { query: { binanceChainId: this.o.chainId } });
    return this.parse(gasPriceData, data, 'gasPrice');
  }

  /** `address` is the sender. MEV protection routes through a private mempool (docs: enableMevProtection). */
  async broadcast(signedTx: string, o: { mev?: boolean; address: string }): Promise<z.infer<typeof broadcastData>> {
    const data = await this.request('POST', '/api/v1/dex/pre-transaction/broadcast-transaction', {
      body: { binanceChainId: this.o.chainId, signedTransaction: signedTx, address: o.address, enableMevProtection: o.mev ?? false },
    });
    return this.parse(broadcastData, data, 'broadcast');
  }
}
