/** Thin client for apps/api. The MCP server holds no keys; every chain read and every unsigned tx comes from the API. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export interface FloorApi {
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
}

export function createApi(baseUrl: string, f: typeof fetch = fetch, timeoutMs = 10_000): FloorApi {
  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await f(baseUrl + path, {
        method,
        headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ApiError(502, 'api_unreachable', 'the Floor API did not answer');
    }
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON body */
    }
    if (!res.ok) {
      const e = (json as { error?: { code?: string; message?: string } } | null)?.error;
      throw new ApiError(res.status, e?.code ?? 'api_error', e?.message ?? `API answered ${res.status}`);
    }
    return json;
  }
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b) };
}
