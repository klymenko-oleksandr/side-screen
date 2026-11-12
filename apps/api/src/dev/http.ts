const TIMEOUT_MS = 15_000;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** GET a JSON API with a bearer token; readable errors for the dashboard notices. */
/** Node's fetch says only "fetch failed"; the cause (DNS, refused, timeout) is in `cause`. */
export function describeFetchError(err: unknown): string {
  const e = err as Error & { cause?: { code?: string; message?: string } };
  if (e?.name === 'TimeoutError') return 'timed out';
  const cause = e?.cause?.code ?? e?.cause?.message;
  return cause ? `${e.message} (${cause})` : (e?.message ?? String(err));
}

export async function getJson<T>(
  url: string,
  token: string | undefined,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SideScreen/1.0',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const hint =
      res.status === 401 || res.status === 403
        ? ' (check the token)'
        : res.status === 404
          ? ' (not found)'
          : '';
    throw new HttpError(res.status, `HTTP ${res.status}${hint}`);
  }
  return (await res.json()) as T;
}
