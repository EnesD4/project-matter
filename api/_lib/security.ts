import type { IncomingMessage, ServerResponse } from "http";
import { isProductionRuntime } from "./env";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^\[|\]$/g, "");
}

function isLanHost(host: string): boolean {
  const normalized = normalizeHost(host);
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true;
  return false;
}

function hostnameOf(value: string): string | null {
  try {
    return normalizeHost(new URL(value).hostname);
  } catch {
    return null;
  }
}

function stripSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function configuredOrigins(): string[] {
  const vercelUrl = process.env.VERCEL_URL?.replace(/^https?:\/\//, "");
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^https?:\/\//, "");
  return [
    process.env.APP_ORIGIN,
    process.env.APP_URL,
    process.env.VITE_APP_ORIGIN,
    vercelUrl ? `https://${vercelUrl}` : "",
    productionUrl ? `https://${productionUrl}` : "",
  ]
    .map((value) => stripSlash(value?.trim() || ""))
    .filter(Boolean);
}

function configuredHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const origin of configuredOrigins()) {
    const host = hostnameOf(origin);
    if (host) hosts.add(host);
  }
  const vercelUrl = process.env.VERCEL_URL?.replace(/^https?:\/\//, "").split("/")[0];
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^https?:\/\//, "").split("/")[0];
  if (vercelUrl) hosts.add(normalizeHost(vercelUrl));
  if (productionUrl) hosts.add(normalizeHost(productionUrl));
  return hosts;
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const normalized = stripSlash(origin);
  if (configuredOrigins().includes(normalized)) return true;

  const host = hostnameOf(origin);
  if (!host) return false;
  if (LOOPBACK_HOSTS.has(host)) return true;
  if (configuredHosts().has(host)) return true;
  if (!isProductionRuntime() && isLanHost(host)) return true;
  return false;
}

export function applySecurityHeaders(req: IncomingMessage, res: ServerResponse, origin?: string) {
  const allowedOrigin = origin && isAllowedOrigin(origin) ? origin : "";
  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Sprout-Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  if (req.headers["x-forwarded-proto"] === "https" || isProductionRuntime()) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

export function requestOrigin(req: IncomingMessage): string | undefined {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin.trim()) return origin.trim();
  const referer = req.headers.referer;
  if (typeof referer === "string" && referer.trim()) {
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function rejectIfCrossOrigin(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = requestOrigin(req);
  applySecurityHeaders(req, res, origin);
  if (origin && !isAllowedOrigin(origin)) {
    sendJson(res, 403, { error: "Forbidden origin" });
    return true;
  }
  return false;
}

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function handlePreflight(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== "OPTIONS") return false;
  const origin = requestOrigin(req);
  applySecurityHeaders(req, res, origin);
  if (origin && !isAllowedOrigin(origin)) {
    sendJson(res, 403, { error: "Forbidden origin" });
    return true;
  }
  res.statusCode = 204;
  res.end();
  return true;
}

export function rejectIfNotPost(req: IncomingMessage, res: ServerResponse): boolean {
  return rejectIfNotMethods(req, res, ["POST"]);
}

export function rejectIfNotMethods(
  req: IncomingMessage,
  res: ServerResponse,
  methods: string[]
): boolean {
  const method = (req.method || "").toUpperCase();
  if (methods.includes(method)) return false;
  sendJson(res, 405, { error: "Method not allowed" });
  return true;
}

export function readJsonBody(req: IncomingMessage, limitBytes = 200_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > limitBytes) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export async function guardApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  return guardApiRequestMethods(req, res, ["POST"]);
}

export async function guardApiRequestMethods(
  req: IncomingMessage,
  res: ServerResponse,
  methods: string[]
): Promise<boolean> {
  if (handlePreflight(req, res)) return true;
  if (rejectIfCrossOrigin(req, res)) return true;
  if (rejectIfNotMethods(req, res, methods)) return true;
  return false;
}
