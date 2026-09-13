import { readFileSync } from "fs";
import { resolve } from "path";

function trim(value: string | undefined): string {
  return value?.trim() || "";
}

function applyEnvFile(fileName: string) {
  try {
    const text = readFileSync(resolve(process.cwd(), fileName), "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && value && !trim(process.env[key])) {
        process.env[key] = value;
      }
    }
  } catch {
    // File is optional in some runtimes.
  }
}

applyEnvFile(".env");
applyEnvFile(".env.local");

/** High-speed Flash model used by /api/gemini-coach. Do not read this from the browser. */
export const GEMINI_FLASH_MODEL = "gemini-3.6-flash";

/**
 * Server-only secrets. Never prefix these with VITE_ — Vite would embed them in the client bundle.
 * Intentionally ignores VITE_GEMINI_API_KEY so a leaked client env name cannot unlock Gemini.
 */
export function getGeminiApiKey(): string {
  return trim(process.env.GEMINI_API_KEY);
}

export function getGeminiModel(): string {
  return GEMINI_FLASH_MODEL;
}

export function getPlaidClientId(): string {
  return trim(process.env.PLAID_CLIENT_ID);
}

export function getPlaidSecret(): string {
  const explicit = trim(process.env.PLAID_SECRET);
  if (explicit) return explicit;
  const env = trim(process.env.PLAID_ENV).toLowerCase();
  if (env === "production") {
    return trim(process.env.PLAID_SECRET_PRODUCTION) || trim(process.env.PLAID_PRODUCTION_SECRET);
  }
  return trim(process.env.PLAID_SECRET_SANDBOX) || trim(process.env.PLAID_SANDBOX_SECRET);
}

export function missingPlaidEnvKeys(): string[] {
  const missing: string[] = [];
  if (!getPlaidClientId()) missing.push("PLAID_CLIENT_ID");
  if (!getPlaidSecret()) missing.push("PLAID_SECRET");
  return missing;
}

function looksInvalidPlaidCredential(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length < 8 ||
    /^(your[-_]?|changeme|xxx+|todo|placeholder|replace[-_]?me)/i.test(normalized)
  );
}

/** Explicit 500 body when PLAID_CLIENT_ID / PLAID_SECRET are missing or obviously invalid. */
export function plaidCredentialsError(): string | null {
  const missing = missingPlaidEnvKeys();
  if (missing.length > 0) {
    return `PLAID_CLIENT_ID or PLAID_SECRET is missing or invalid (missing ${missing.join(", ")}).`;
  }
  if (looksInvalidPlaidCredential(getPlaidClientId()) || looksInvalidPlaidCredential(getPlaidSecret())) {
    return "PLAID_CLIENT_ID or PLAID_SECRET is missing or invalid.";
  }
  return null;
}

export function getPlaidEnv(): "sandbox" | "development" | "production" {
  const value = trim(process.env.PLAID_ENV).toLowerCase();
  if (value === "development" || value === "production" || value === "sandbox") return value;
  return "sandbox";
}

export function getPlaidInstitutionId(): string {
  return trim(process.env.PLAID_INSTITUTION_ID) || "ins_109508";
}

export function getSupabaseUrl(): string {
  return (
    trim(process.env.SUPABASE_URL) ||
    trim(process.env.VITE_SUPABASE_URL) ||
    "https://rsapdgkmvihaboouwvwv.supabase.co"
  );
}

export function getSupabaseAnonKey(): string {
  return (
    trim(process.env.VITE_SUPABASE_ANON_KEY) ||
    trim(process.env.SUPABASE_CONFIG_ANON_KEY) ||
    trim(process.env.SUPABASE_ANON_KEY) ||
    "sb_publishable_x-anlnaVXC68jRD_DuYNZg_l4dSWRyW"
  );
}

export function getSupabaseServiceRoleKey(): string {
  return trim(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isPlaidConfigured(): boolean {
  return Boolean(getPlaidClientId() && getPlaidSecret());
}

export function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

export function getPolygonApiKey(): string {
  return trim(process.env.POLYGON_API_KEY);
}
