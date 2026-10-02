export class Bw3Error extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = new.target.name;
  }
}
/** "Minimum order amount is 5 USD". */
export class MinOrder extends Bw3Error {}
export class InsufficientLiquidity extends Bw3Error {}
/** The route needs an RFQ quote the API would not give (for example a contract taker). */
export class RfqRequired extends Bw3Error {}
export class Bw3HttpError extends Bw3Error {
  constructor(message: string, readonly status: number) {
    super(message, String(status));
  }
}
export class Bw3TimeoutError extends Bw3Error {}

/** Maps an API error message to a typed error. Matching is by message text because the code list is not documented (unverified). */
export function classifyApiError(code: string | undefined, msg: string): Bw3Error {
  if (/minimum order amount/i.test(msg)) return new MinOrder(msg, code);
  if (/insufficient liquidity|liquidity (is )?(not enough|insufficient)/i.test(msg)) return new InsufficientLiquidity(msg, code);
  if (/\brfq\b/i.test(msg)) return new RfqRequired(msg, code);
  return new Bw3Error(msg, code);
}
