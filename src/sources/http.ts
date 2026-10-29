export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** POST/GET JSON. Errors never include request headers, so tokens are not leaked. */
export async function requestJson<T>(fetchFn: FetchLike, url: string, init: RequestInit, service: string): Promise<T> {
  const res = await fetchFn(url, init);
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`${service} request failed: ${res.status} ${res.statusText}${body ? ` - ${body}` : ""}`);
  }
  return (await res.json()) as T;
}
