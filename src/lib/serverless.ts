/** Same-origin Vercel / Vite API routes. Never rewrite these to the Express host. */
export function serverlessUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export async function serverlessFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(serverlessUrl(path), {
    ...init,
    headers,
  });
}
