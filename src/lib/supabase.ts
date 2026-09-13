import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function readProcessEnv(name: string): string {
  try {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const value = env?.[name];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

const supabaseUrl =
  String(import.meta.env.VITE_SUPABASE_URL || "").trim() ||
  readProcessEnv("SUPABASE_URL") ||
  "https://rsapdgkmvihaboouwvwv.supabase.co";
const supabaseAnonKey =
  String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim() ||
  readProcessEnv("SUPABASE_CONFIG_ANON_KEY") ||
  readProcessEnv("SUPABASE_ANON_KEY") ||
  "sb_publishable_x-anlnaVXC68jRD_DuYNZg_l4dSWRyW";

const SUPABASE_URL = supabaseUrl;
const SUPABASE_ANON_KEY = supabaseAnonKey;

export const SUPABASE_GUEST_CREDS_KEY = "sprout_supabase_guest";

export type ProfileRow = {
  id: string;
  app_user_id: string | null;
  email: string | null;
  name: string;
  full_name?: string | null;
  birth_date: string | null;
  age: number | null;
  is_guest: boolean;
  has_completed_onboarding: boolean;
  has_completed_bank_setup: boolean;
  created_at: string;
  updated_at: string;
};

const missingTables = new Set<string>();

export function isMissingSupabaseRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const rec = error as { code?: string; message?: string; details?: string; hint?: string };
  const blob = `${rec.code || ""} ${rec.message || ""} ${rec.details || ""} ${rec.hint || ""}`;
  return /PGRST205|PGRST204|42P01|42703|does not exist|schema cache|could not find the table|could not find the .* column/i.test(
    blob
  );
}

export function isSupabaseTableUnavailable(table: string): boolean {
  return missingTables.has(table);
}

/** Remember a missing table/column so later reads skip the 404/400 instead of repeating it. */
export function noteSupabaseRelationError(table: string, error: unknown): boolean {
  if (!isMissingSupabaseRelationError(error)) return false;
  missingTables.add(table);
  return true;
}

export type FinancialSnapshotRow = {
  user_id: string;
  cash_balance: number;
  debt: number;
  investment_assets: number;
  monthly_income: number;
  updated_at: string;
};

export type BankAccountRow = {
  id: string;
  user_id: string;
  plaid_account_id: string;
  name: string;
  official_name: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  institution: string | null;
  balance: number;
  available_balance: number | null;
  iso_currency: string | null;
  min_payment: number | null;
  apr: number | null;
  created_at: string;
  updated_at: string;
};

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function isSupabaseClientKey(key: string): boolean {
  return key.startsWith("sb-") || key.startsWith("sprout_supabase");
}

export function canReachSupabase(): boolean {
  if (!isSupabaseConfigured()) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return true;
}

/** Shared browser client. Session is persisted to localStorage by supabase-js. */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: supabaseAuthStorageKey(),
    },
  });
  return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const instance = getSupabase();
    if (!instance) {
      throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
    }
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

function supabaseAuthStorageKey() {
  try {
    const ref = new URL(SUPABASE_URL).hostname.split(".")[0] || "sprout";
    return `sb-${ref}-auth-token`;
  } catch {
    return "sb-sprout-auth-token";
  }
}
