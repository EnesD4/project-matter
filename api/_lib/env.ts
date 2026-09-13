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
  const env = trim(process.env.PLAID_ENV).toLowerCase();
  const named =
    env === "production"
      ? trim(process.env.PLAID_SECRET_PRODUCTION) || trim(process.env.PLAID_PRODUCTION_SECRET)
      : trim(process.env.PLAID_SECRET_SANDBOX) || trim(process.env.PLAID_SANDBOX_SECRET);
  return named || trim(process.env.PLAID_SECRET);
}

export function missingPlaidEnvKeys(): string[] {
  const missing: string[] = [];
  if (!getPlaidClientId()) missing.push("PLAID_CLIENT_ID");
  if (!getPlaidSecret()) missing.push("PLAID_SECRET");
  return missing;
}

export function getPlaidEnv(): "sandbox" | "development" | "production" {
  const value = trim(process.env.PLAID_ENV).toLowerCase();
  if (value === "development" || value === "production") return value;
  return "sandbox";
}

export function getPlaidInstitutionId(): string {
  return trim(process.env.PLAID_INSTITUTION_ID) || "ins_109508";
}

export function getSupabaseUrl(): string {
  return trim(process.env.SUPABASE_URL) || trim(process.env.VITE_SUPABASE_URL);
}

export function getSupabaseAnonKey(): string {
  return trim(process.env.SUPABASE_ANON_KEY) || trim(process.env.VITE_SUPABASE_ANON_KEY);
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
