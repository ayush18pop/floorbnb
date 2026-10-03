import { b64decode, b64encode, paymentKey } from './encoding';
import type {
  FacilitatorClient,
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  ReceiptKey,
  ReceiptStore,
  SettleResult,
  Supported,
  SupportedKind,
} from './types';

export interface PaidAsset {
  address: string;
  symbol: string;
  /** Must equal the on-chain decimals (U and USD1: 18, VERIFIED on a BSC fork). */
  decimals: number;
  method: 'eip3009' | 'permit2';
  /** EIP-712 name. Used to match a /supported kind when the kind carries no `asset`. */
  name?: string;
}

export interface Price {
  /** Price in USD as a decimal string, e.g. "0.01". Stablecoins are treated as 1 USD. */
  usd: string;
  description?: string;
  mimeType?: string;
}

export interface GateOptions {
  facilitator: FacilitatorClient;
  receipts: ReceiptStore;
  payTo: string;
  network: string; // eip155:56
  assets: PaidAsset[];
  maxTimeoutSeconds?: number; // default 60
  /** return a pending PAYMENT-RESPONSE if settle takes longer (default 20000 ms). */
  settleDeadlineMs?: number;
  supportedTtlMs?: number; // default 600000
  now?: () => number;
  onBackgroundSettle?: (r: SettleResult) => void;
}

export interface GateExtra {
  /** Payment already extracted by the caller, e.g. from MCP params._meta["x402/payment"]. */
  payment?: PaymentPayload;
}

export function usdToAtomic(usd: string, decimals: number): string {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(usd.trim());
  if (!m) throw new Error(`bad price ${usd}`);
  const frac = (m[2] ?? '').padEnd(decimals, '0');
  if (frac.length > decimals && /[1-9]/.test(frac.slice(decimals))) throw new Error(`price ${usd} too precise for ${decimals} decimals`);
  return (BigInt(m[1]!) * 10n ** BigInt(decimals) + BigInt(frac.slice(0, decimals) || '0')).toString();
}

function sameReq(a: PaymentRequirements, b: PaymentRequirements): boolean {
  return (
    a.scheme === b.scheme &&
    a.network === b.network &&
    a.amount === b.amount &&
    a.asset.toLowerCase() === b.asset.toLowerCase() &&
    a.payTo.toLowerCase() === b.payTo.toLowerCase()
  );
}

export class Gate {
  private supported?: { at: number; v: Supported };
  private o: Required<Pick<GateOptions, 'maxTimeoutSeconds' | 'settleDeadlineMs' | 'supportedTtlMs'>> & GateOptions;
  private now: () => number;

  constructor(o: GateOptions) {
    this.o = { maxTimeoutSeconds: 60, settleDeadlineMs: 20_000, supportedTtlMs: 600_000, ...o };
    this.now = o.now ?? Date.now;
  }

  private async getSupported(): Promise<Supported> {
    if (this.supported && this.now() - this.supported.at < this.o.supportedTtlMs) return this.supported.v;
    const v = await this.o.facilitator.getSupported();
    this.supported = { at: this.now(), v };
    return v;
  }

  private kindFor(a: PaidAsset, kinds: SupportedKind[]): SupportedKind | undefined {
    const byAsset = kinds.find((k) => k.asset?.toLowerCase() === a.address.toLowerCase());
    if (byAsset) return byAsset;
    return kinds.find(
      (k) => !k.asset && k.extra.assetTransferMethod === a.method && (!a.name || k.extra.name === a.name),
    );
  }

  /** accepts built from the facilitator's /supported; eip3009 first. The whole `extra` is echoed. */
  async buildAccepts(price: Price): Promise<PaymentRequirements[]> {
    const sup = await this.getSupported();
    const out: PaymentRequirements[] = [];
    for (const a of this.o.assets) {
      const k = this.kindFor(a, sup.kinds);
      if (!k) continue;
      if (k.network && k.network !== this.o.network) continue;
      out.push({
        scheme: 'exact',
        network: this.o.network,
        asset: a.address,
        amount: usdToAtomic(price.usd, a.decimals),
        payTo: this.o.payTo,
        maxTimeoutSeconds: this.o.maxTimeoutSeconds,
        extra: { ...k.extra, assetTransferMethod: k.extra.assetTransferMethod ?? a.method },
      });
    }
    const rank = (r: PaymentRequirements) => (r.extra.assetTransferMethod === 'eip3009' ? 0 : 1);
    return out.sort((x, y) => rank(x) - rank(y));
  }

  private paymentRequired(req: Request, price: Price, accepts: PaymentRequirements[], error: string): Response {
    const body: PaymentRequired = {
      x402Version: 2,
      error,
      resource: { url: req.url, description: price.description, mimeType: price.mimeType ?? 'application/json' },
      accepts,
    };
    return new Response(JSON.stringify(body), {
      status: 402,
      headers: { 'content-type': 'application/json', 'PAYMENT-REQUIRED': b64encode(body) },
    });
  }

  private withPaymentResponse(res: Response, sr: SettleResult): Response {
    const h = new Headers(res.headers);
    h.set('PAYMENT-RESPONSE', b64encode({
      success: sr.success,
      transaction: sr.transaction,
      network: sr.network,
      payer: sr.payer,
      ...(sr.pending ? { pending: true } : {}),
      ...(sr.errorReason ? { errorReason: sr.errorReason } : {}),
    }));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  }

  /**
   * No payment: 402 + PAYMENT-REQUIRED. Payment present: verify, reserve receipt (replay guard),
   * run handler, settle, return handler response + PAYMENT-RESPONSE.
   * Failure ordering note: the handler runs before settle (arch step 5 then 6), so a settle failure
   * after a successful handler returns 402 and withholds the handler body.
   */
  async gate(req: Request, price: Price, handler: (req: Request) => Promise<Response> | Response, extra: GateExtra = {}): Promise<Response> {
    let accepts: PaymentRequirements[];
    try {
      accepts = await this.buildAccepts(price);
    } catch {
      return new Response(JSON.stringify({ error: 'facilitator_unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } });
    }
    if (accepts.length === 0) return new Response(JSON.stringify({ error: 'no_payment_options' }), { status: 503, headers: { 'content-type': 'application/json' } });

    let payment = extra.payment;
    if (!payment) {
      const hv = req.headers.get('payment-signature');
      if (!hv) return this.paymentRequired(req, price, accepts, 'payment_required');
      try {
        payment = b64decode<PaymentPayload>(hv);
      } catch {
        return this.paymentRequired(req, price, accepts, 'invalid_payment_header');
      }
    }
    if (!payment || payment.x402Version !== 2 || !payment.accepted || !payment.payload) return this.paymentRequired(req, price, accepts, 'invalid_payment');

    // Use OUR requirements entry, never the client's copy.
    const requirements = accepts.find((a) => sameReq(a, payment!.accepted));
    if (!requirements) return this.paymentRequired(req, price, accepts, 'payment_requirements_mismatch');
    const key = paymentKey(payment);
    if (!key) return this.paymentRequired(req, price, accepts, 'invalid_payload');

    const v = await this.o.facilitator.verify(payment, requirements);
    if (!v.isValid) return this.paymentRequired(req, price, accepts, v.invalidReason ?? 'invalid_payment');
    const k: ReceiptKey = { ...key, payer: (v.payer ?? key.payer).toLowerCase() };

    const reserved = await this.o.receipts.reserve({
      nonce: k.nonce, network: k.network, payer: k.payer,
      asset: requirements.asset, amount: requirements.amount, resource: req.url,
    });
    if (!reserved) return this.paymentRequired(req, price, accepts, 'payment_already_used');

    let res: Response;
    try {
      res = await handler(req);
    } catch (e) {
      await this.o.receipts.release(k);
      throw e;
    }
    if (res.status >= 400) {
      await this.o.receipts.release(k); // do not charge for failed work
      return res;
    }

    const settling = this.o.facilitator.settle(payment, requirements).catch((e): SettleResult => ({
      success: false, transaction: '', network: requirements.network, payer: k.payer,
      errorReason: 'settle_error:' + (e instanceof Error ? e.message : 'unknown'),
    }));
    const finish = async (sr: SettleResult) => {
      if (sr.success) await this.o.receipts.update(k, { status: 'settled', transaction: sr.transaction });
      else if (sr.pending) await this.o.receipts.update(k, { status: 'pending', transaction: sr.transaction });
      else await this.o.receipts.update(k, { status: 'failed' });
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((r) => { timer = setTimeout(() => r('timeout'), this.o.settleDeadlineMs); });
    const first = await Promise.race([settling, timeout]);
    clearTimeout(timer);

    if (first === 'timeout') {
      // keep polling in the background; mark pending now
      await this.o.receipts.update(k, { status: 'pending' });
      void settling.then(finish).then(() => undefined, () => undefined);
      void settling.then((r) => this.o.onBackgroundSettle?.(r));
      return this.withPaymentResponse(res, { success: false, pending: true, transaction: '', network: requirements.network, payer: k.payer });
    }
    await finish(first);
    if (!first.success && !first.pending) {
      return this.paymentRequired(req, price, accepts, first.errorReason ?? 'settlement_failed');
    }
    return this.withPaymentResponse(res, first);
  }
}

export function createGate(o: GateOptions) {
  const g = new Gate(o);
  return Object.assign(
    (req: Request, price: Price, handler: (req: Request) => Promise<Response> | Response, extra?: GateExtra) => g.gate(req, price, handler, extra),
    { instance: g },
  );
}
