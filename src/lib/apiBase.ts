import { publicEnv } from "./env";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const VITE_DEV_PORTS = new Set(["5173", "4173"]);
const CLIENT_MOCK_KEY = "sprout_client_mock";

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^\[|\]$/g, "");
}

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(normalizeHost(host));
}

/** Loopback plus unspecified bind address (`0.0.0.0`) — never a usable API host from a phone. */
function isLoopbackOrUnspecifiedHost(host: string): boolean {
  const normalized = normalizeHost(host);
  return LOOPBACK_HOSTS.has(normalized) || normalized === "0.0.0.0";
}

/** RFC1918 / link-local IPv4 plus unspecified bind address. */
export function isLanHostname(host: string): boolean {
  const normalized = normalizeHost(host);
  if (normalized === "0.0.0.0") return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  return false;
}

function configuredApiBaseUrl(): string {
  return publicEnv.apiBaseUrl;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function rewriteApiHost(configured: string, pageHost: string): string {
  try {
    const url = new URL(configured);
    url.hostname = pageHost;
    if (typeof window !== "undefined") {
      url.protocol = window.location.protocol === "https:" ? "https:" : "http:";
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return configured;
  }
}

/**
 * Vite (and `vite preview`) proxy `/api` to the backend. Same-origin relative
 * paths work from a phone on Wi-Fi; `http://localhost:5000` would hit the phone itself.
 */
function shouldUseSameOriginProxy(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.DEV) return true;
  return VITE_DEV_PORTS.has(window.location.port);
}

/**
 * Resolve the backend origin for the current page.
 *
 * Prefer relative `/api` during local Vite so phones use the Network URL + proxy.
 * Otherwise rewrite loopback / 0.0.0.0 in `VITE_API_BASE_URL` to the page host.
 */
export function getApiBaseUrl(): string {
  const configured = configuredApiBaseUrl();
  if (typeof window === "undefined") return configured;
  if (shouldUseSameOriginProxy()) return "";

  const pageHost = window.location.hostname;
  if (isLoopbackHost(pageHost)) return configured;

  const apiHost = hostnameOf(configured);
  // Deployed hosts (Vercel, etc.) should use same-origin /api — not rewrite loopback:5000.
  if (!isLanHostname(pageHost) && (!apiHost || isLoopbackOrUnspecifiedHost(apiHost))) {
    return "";
  }
  if (apiHost && !isLoopbackOrUnspecifiedHost(apiHost)) return configured;

  return rewriteApiHost(configured, pageHost);
}

/** Build an API URL that tracks the current page host (never cache this at module scope). */
export function apiUrl(path: string): string {
  const prefix = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${prefix}`;
}

/** True when the page is served from a LAN IP (phone testing via Network URL). */
export function isLocalNetworkPage(): boolean {
  if (typeof window === "undefined") return false;
  return isLanHostname(window.location.hostname);
}

/** Local / LAN testing may run without a reachable Express process. */
export function allowClientMockFallback(): boolean {
  return Boolean(import.meta.env.DEV) || isLocalNetworkPage();
}

export function markClientMockMode() {
  try {
    sessionStorage.setItem(CLIENT_MOCK_KEY, "1");
  } catch {
    // ignore quota / private-mode failures
  }
}

export function isClientMockMode(): boolean {
  try {
    return sessionStorage.getItem(CLIENT_MOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearClientMockMode() {
  try {
    sessionStorage.removeItem(CLIENT_MOCK_KEY);
  } catch {
    // ignore quota / private-mode failures
  }
}
