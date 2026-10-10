import type { z } from 'zod';
import { Bw3Error, Bw3HttpError, Bw3TimeoutError, classifyApiError } from './errors.js';
import { broadcastData, candlesData, envelope, gasPriceData, quoteData, rwaPlatformsData, rwaPriceData, rwaSearchData, rwaTokensData, rwaUnderlyingMarketData, rwaUnderlyingProfileData, simulateData, swapData } from './schemas.js';
import type { Candle, EvmTx, QuoteRoute, SwapResult } from './schemas.js';
import { bw3Stats } from './stats.js';
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

  /** Never logs or returns headers or keys. Records one process-global stat per final outcome (after retries). */
  async request(method: 'GET' | 'POST', path: string, args: { query?: Record<string, string | undefined>; body?: unknown } = {}): Promise<unknown> {
    try {
      const data = await this.requestInner(method, path, args);
      bw3Stats.record(path, true);
      return data;
    } catch (e) {
      // class name and API code only: never the message (may echo upstream text), headers or keys
      const cls = e instanceof Error ? e.name : 'Error';
      const code = e instanceof Bw3Error && e.code ? ` ${e.code}` : '';
      bw3Stats.record(path, false, `${cls}${code}`);
      throw e;
    }
  }

  private async requestInner(method: 'GET' | 'POST', path: string, args: { query?: Record<string, string | undefined>; body?: unknown }): Promise<unknown> {
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

  // ---- RWA / Market data endpoints. Param names verified live 2026-10-10 (docs summary lists none). ----

  /** Param `tokenContractAddress` (singular, required: error 40001 otherwise). */
  async rwaUnderlyingMarket(address: string): Promise<z.infer<typeof rwaUnderlyingMarketData>> {
    const data = await this.request('GET', '/api/v1/dex/market/rwa/underlying-market', {
      query: { binanceChainId: this.o.chainId, tokenContractAddress: address },
    });
    return this.parse(rwaUnderlyingMarketData, data, 'rwaUnderlyingMarket');
  }

  /** Param `tokenContractAddress` (singular, required). */
  async rwaUnderlyingProfile(address: string): Promise<z.infer<typeof rwaUnderlyingProfileData>> {
    const data = await this.request('GET', '/api/v1/dex/market/rwa/underlying-profile', {
      query: { binanceChainId: this.o.chainId, tokenContractAddress: address },
    });
    return this.parse(rwaUnderlyingProfileData, data, 'rwaUnderlyingProfile');
  }

  /** `platformId` (e.g. "bstock") filters. The sector-tab param name is unknown: `sector` and `tab` were accepted but ignored (unverified). All params optional. */
  async rwaTokens(p: { platformId?: string; chainId?: string } = {}): Promise<z.infer<typeof rwaTokensData>> {
    const data = await this.request('GET', '/api/v1/dex/market/rwa/tokens', {
      query: { binanceChainId: p.chainId ?? this.o.chainId, platformId: p.platformId },
    });
    return this.parse(rwaTokensData, data, 'rwaTokens');
  }

  /** Param `keyword`: a ticker/name or a contract address. Rows group tokens by underlying ticker. */
  async rwaSearch(keyword: string): Promise<z.infer<typeof rwaSearchData>> {
    const data = await this.request('GET', '/api/v1/dex/market/rwa/search', { query: { keyword } });
    return this.parse(rwaSearchData, data, 'rwaSearch');
  }

  /** No params needed. */
  async rwaPlatforms(): Promise<z.infer<typeof rwaPlatformsData>> {
    const data = await this.request('GET', '/api/v1/dex/market/rwa/platforms');
    return this.parse(rwaPlatformsData, data, 'rwaPlatforms');
  }

  /**
   * Param is `bar` (NOT `interval`: `interval` is silently ignored and 1-minute candles come back). Valid bars:
   * 1s 5s 30s 1m 3m 5m 15m 30m 1h 2h 4h 6h 8h 12h 1d 3d 1w 1M. `limit` max 300 (365 and 1000 are rejected: "invalid limit range"), default 100.
   * Rows are arrays [open, high, low, close, volume, openTimeMs, trades], ascending by time (inferred from data, undocumented).
   */
  async candles(p: { address: string; interval: string; limit?: number }): Promise<Candle[]> {
    const data = await this.request('GET', '/api/v1/dex/market/candles', {
      query: { binanceChainId: this.o.chainId, tokenContractAddress: p.address, bar: p.interval, limit: p.limit === undefined ? undefined : String(p.limit) },
    });
    return this.parse(candlesData, data, 'candles');
  }
}
