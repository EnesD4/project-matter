function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Browser-safe configuration only.
 * Gemini, Plaid, and Supabase service-role keys stay on the server (see api/_lib/env.ts).
 */
export const publicEnv = {
  googleClientId: trim(import.meta.env.VITE_GOOGLE_CLIENT_ID),
  apiBaseUrl: (trim(import.meta.env.VITE_API_BASE_URL) || "http://localhost:5000").replace(/\/$/, ""),
  supabaseUrl:
    trim(import.meta.env.VITE_SUPABASE_URL) ||
    trim(import.meta.env.SUPABASE_URL) ||
    "https://rsapdgkmvihaboouwvwv.supabase.co",
  supabaseAnonKey:
    trim(import.meta.env.VITE_SUPABASE_ANON_KEY) ||
    trim(import.meta.env.SUPABASE_ANON_KEY) ||
    "sb_publishable_x-anlnaVXC68jRD_DuYNZg_l4dSWRyW",
  appOrigin: trim(import.meta.env.VITE_APP_ORIGIN),
};
