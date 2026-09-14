import type { AuthChangeEvent, AuthError, Session } from "@supabase/supabase-js";
import { ageFromBirthDate } from "./age";
import {
  canReachSupabase,
  clearSupabaseAuthStorage,
  getSupabase,
  isSupabaseClientKey,
  isSupabaseTableUnavailable,
  noteSupabaseRelationError,
  supabase,
  SUPABASE_GUEST_CREDS_KEY,
  type FinancialSnapshotRow,
  type ProfileRow,
} from "./supabase";

export const AUTH_RATE_LIMIT_MESSAGE = "Too many attempts, please wait a minute";

/** Auth HTTP / API failures that should drop the user to the login screen. */
export function isFatalAuthError(error: unknown): boolean {
  if (!error) return false;
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: number }).status)
      : NaN;
  if (status === 400 || status === 401 || status === 403 || status === 422 || status === 429) {
    return true;
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : String(error);
  return /invalid (jwt|token|refresh|login credentials)|jwt expired|refresh_token|session.*expired|user not found|email not confirmed|rate.?limit|too many (requests|attempts)|422|429/i.test(
    message
  );
}

export function isAuthRateLimitError(error: unknown): boolean {
  if (!error) return false;
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: number }).status)
      : NaN;
  if (status === 429) return true;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : String(error);
  return /rate.?limit|too many (requests|attempts)|over_request_rate_limit/i.test(message);
}

export function messageForAuthError(error: unknown, fallback = "Authentication failed"): string {
  if (isAuthRateLimitError(error)) return AUTH_RATE_LIMIT_MESSAGE;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const msg = String((error as { message?: unknown }).message || "").trim();
    if (msg) return msg;
  }
  return fallback;
}

function throwAuthError(error: AuthError | null | undefined): never {
  if (isAuthRateLimitError(error)) {
    throw new Error(AUTH_RATE_LIMIT_MESSAGE);
  }
  throw new Error(messageForAuthError(error, "Authentication failed"));
}

/** Clear bad tokens and force a local sign-out when the session is unusable. */
export async function invalidateSupabaseAuth(reason?: unknown) {
  if (reason) {
    console.warn("Clearing Supabase auth after failure:", messageForAuthError(reason));
  }
  clearSupabaseAuthStorage();
  const client = getSupabase();
  if (!client) return;
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // already cleared / offline
  }
}

export type SupabaseAuthKind = "password" | "guest" | "oauth";

export type SupabaseAuthInput = {
  kind: SupabaseAuthKind;
  email?: string;
  password?: string;
  name?: string;
  isDemo?: boolean;
};

export type ProfileSyncInput = {
  name?: string | null;
  email?: string | null;
  appUserId?: string | null;
  birthDate?: string | null;
  age?: number | null;
  isGuest?: boolean;
  hasCompletedOnboarding?: boolean;
  hasCompletedBankSetup?: boolean;
};

export type FinancialSnapshotInput = {
  cashBalance: number;
  debt: number;
  investmentAssets: number;
  monthlyIncome?: number;
};

type GuestCreds = { email: string; password: string };

/** Google / OAuth metadata: prefer full_name, then name, then given + family. */
export function nameFromUserMetadata(meta?: Record<string, unknown> | null): string {
  if (!meta) return "";
  const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const fullName = asText(meta.full_name);
  const name = asText(meta.name);
  const given = asText(meta.given_name);
  const family = asText(meta.family_name);
  return fullName || name || [given, family].filter(Boolean).join(" ");
}

export async function oauthNameFromSupabaseSession(): Promise<string> {
  try {
    const user = await currentUser();
    return nameFromUserMetadata(user?.user_metadata as Record<string, unknown> | undefined);
  } catch {
    return "";
  }
}

function urlLooksLikeOAuthCallback() {
  if (typeof window === "undefined") return false;
  return /access_token|refresh_token|code=/.test(`${window.location.hash}${window.location.search}`);
}

function hasPersistedSupabaseAuth(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (const key of Object.keys(localStorage)) {
      if (!isSupabaseClientKey(key)) continue;
      const raw = localStorage.getItem(key);
      if (raw && raw !== "null" && raw !== "{}") return true;
    }
  } catch {
    // private mode
  }
  return false;
}

/** Wait for detectSessionInUrl / persisted storage after a Google redirect. */
export async function waitForSupabaseSession(timeoutMs = 4000): Promise<Session | null> {
  const client = getSupabase();
  if (!client || !canReachSupabase()) return null;

  try {
    const existing = await client.auth.getSession();
    if (existing.error && isFatalAuthError(existing.error)) {
      await invalidateSupabaseAuth(existing.error);
      return null;
    }
    if (existing.data.session?.user) return existing.data.session;
  } catch (err) {
    if (isFatalAuthError(err)) {
      await invalidateSupabaseAuth(err);
      return null;
    }
    // Hash exchange may still be in flight — keep waiting instead of aborting.
  }

  const shouldWait = urlLooksLikeOAuthCallback() || hasPersistedSupabaseAuth();
  if (!shouldWait) return null;

  return new Promise((resolve) => {
    let done = false;
    let unsubscribe = () => {};
    const finish = (session: Session | null) => {
      if (done) return;
      done = true;
      try {
        unsubscribe();
      } catch {
        // already unsubscribed
      }
      window.clearTimeout(timer);
      resolve(session);
    };

    try {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        if (session?.user) finish(session);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch (err) {
      if (isFatalAuthError(err)) {
        void invalidateSupabaseAuth(err).finally(() => finish(null));
        return;
      }
      finish(null);
      return;
    }

    const timer = window.setTimeout(() => {
      void client.auth
        .getSession()
        .then(async ({ data: next, error }) => {
          if (error && isFatalAuthError(error)) {
            await invalidateSupabaseAuth(error);
            finish(null);
            return;
          }
          finish(next.session ?? null);
        })
        .catch(async (err) => {
          if (isFatalAuthError(err)) await invalidateSupabaseAuth(err);
          finish(null);
        });
    }, timeoutMs);
  });
}

/** Keep React auth state in sync with Supabase. Listener errors must not unmount the tree. */
export function subscribeSupabaseAuth(
  listener: (event: AuthChangeEvent, session: Session | null) => void
): () => void {
  const client = getSupabase();
  if (!client) return () => {};
  try {
    const { data } = client.auth.onAuthStateChange((event, session) => {
      try {
        listener(event, session);
      } catch (err) {
        console.warn("Auth state listener failed:", err);
      }
    });
    return () => {
      try {
        data.subscription.unsubscribe();
      } catch {
        // already torn down
      }
    };
  } catch {
    return () => {};
  }
}

export async function signInWithGoogleOAuth(): Promise<void> {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) throwAuthError(error);
  } catch (err) {
    if (isAuthRateLimitError(err)) {
      throw new Error(AUTH_RATE_LIMIT_MESSAGE);
    }
    throw err instanceof Error ? err : new Error(messageForAuthError(err, "Google sign-in failed"));
  }
}

function asMoney(value: number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function guestEmail(id: string) {
  return `guest-${id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}@guest.sprout.app`;
}

function newGuestPassword() {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `Sg-${uuid}-x9`;
}

function readGuestCreds(): GuestCreds | null {
  try {
    const raw = localStorage.getItem(SUPABASE_GUEST_CREDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuestCreds>;
    if (!parsed.email || !parsed.password) return null;
    return { email: parsed.email, password: parsed.password };
  } catch {
    return null;
  }
}

function writeGuestCreds(creds: GuestCreds) {
  try {
    localStorage.setItem(SUPABASE_GUEST_CREDS_KEY, JSON.stringify(creds));
  } catch {
    // private mode
  }
}

function clearGuestCreds() {
  try {
    localStorage.removeItem(SUPABASE_GUEST_CREDS_KEY);
  } catch {
    // private mode
  }
}

async function currentUser() {
  const client = getSupabase();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getUser();
    if (error) {
      if (isFatalAuthError(error)) {
        await invalidateSupabaseAuth(error);
      }
      return null;
    }
    return data.user ?? null;
  } catch (err) {
    if (isFatalAuthError(err)) {
      await invalidateSupabaseAuth(err);
    }
    return null;
  }
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  const client = getSupabase();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getSession();
    if (error && isFatalAuthError(error)) {
      await invalidateSupabaseAuth(error);
      return null;
    }
    return data.session?.access_token ?? null;
  } catch (err) {
    if (isFatalAuthError(err)) await invalidateSupabaseAuth(err);
    return null;
  }
}

export async function getSupabaseUserId(): Promise<string | null> {
  try {
    const user = await currentUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function syncSupabaseAuth(input: SupabaseAuthInput): Promise<string | null> {
  const client = getSupabase();
  if (!client || !canReachSupabase()) return null;

  try {
    const existing = await currentUser();
    if (existing) return existing.id;
    if (input.kind === "oauth") return null;

    if (input.kind === "password" && input.email && input.password) {
      const signedIn = await client.auth.signInWithPassword({
        email: input.email.trim().toLowerCase(),
        password: input.password,
      });
      if (signedIn.error) {
        if (isAuthRateLimitError(signedIn.error)) throwAuthError(signedIn.error);
        // Wrong password / no account — try sign-up once, but never loop on fatal auth errors.
        if (signedIn.error.status && ![400, 422].includes(signedIn.error.status)) {
          throwAuthError(signedIn.error);
        }
      }
      if (signedIn.data.user) return signedIn.data.user.id;

      const signedUp = await client.auth.signUp({
        email: input.email.trim().toLowerCase(),
        password: input.password,
        options: {
          data: {
            name: input.name?.trim() || "",
            full_name: input.name?.trim() || "",
            is_guest: false,
          },
        },
      });
      if (signedUp.error) {
        if (isFatalAuthError(signedUp.error)) throwAuthError(signedUp.error);
        return null;
      }
      return signedUp.data.session?.user.id ?? signedUp.data.user?.id ?? null;
    }

    const anonymous = await client.auth.signInAnonymously({
      options: {
        data: {
          name: input.name?.trim() || "",
          full_name: input.name?.trim() || "",
          is_guest: true,
          is_demo: Boolean(input.isDemo),
        },
      },
    });
    if (anonymous.error && isAuthRateLimitError(anonymous.error)) {
      throwAuthError(anonymous.error);
    }
    if (anonymous.data.user) return anonymous.data.user.id;

    const creds = readGuestCreds() ?? {
      email: guestEmail(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`),
      password: newGuestPassword(),
    };
    const guestIn = await client.auth.signInWithPassword(creds);
    if (guestIn.error && isAuthRateLimitError(guestIn.error)) {
      throwAuthError(guestIn.error);
    }
    if (guestIn.data.user) {
      writeGuestCreds(creds);
      return guestIn.data.user.id;
    }
    const guestUp = await client.auth.signUp({
      email: creds.email,
      password: creds.password,
      options: {
        data: {
          name: input.name?.trim() || "",
          full_name: input.name?.trim() || "",
          is_guest: true,
        },
      },
    });
    if (guestUp.error && isFatalAuthError(guestUp.error)) {
      throwAuthError(guestUp.error);
    }
    if (guestUp.data.session?.user) {
      writeGuestCreds(creds);
      return guestUp.data.session.user.id;
    }
    return null;
  } catch (err) {
    if (isAuthRateLimitError(err)) {
      throw new Error(AUTH_RATE_LIMIT_MESSAGE);
    }
    if (isFatalAuthError(err)) {
      await invalidateSupabaseAuth(err);
      // Only interactive password flows must bubble fatal auth errors to the UI.
      if (input.kind === "password") {
        throw new Error(messageForAuthError(err));
      }
    }
    return null;
  }
}

export async function fetchUserProfile(): Promise<ProfileRow | null> {
  const client = getSupabase();
  if (!client || !canReachSupabase() || isSupabaseTableUnavailable("profiles")) return null;
  try {
    const user = await currentUser();
    if (!user) return null;
    const { data, error } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (error) {
      noteSupabaseRelationError("profiles", error);
      return null;
    }
    if (!data) return null;
    const row = data as ProfileRow;
    const displayName = row.full_name?.trim() || row.name?.trim() || "";
    return { ...row, name: displayName, full_name: row.full_name ?? displayName };
  } catch (error) {
    noteSupabaseRelationError("profiles", error);
    return null;
  }
}

export async function persistUserProfile(input: ProfileSyncInput): Promise<ProfileRow | null> {
  const client = getSupabase();
  if (!client || !canReachSupabase() || isSupabaseTableUnavailable("profiles")) return null;
  try {
    const user = await currentUser();
    if (!user) return null;
    const birthDate = input.birthDate?.trim() || null;
    const age =
      input.age != null && Number.isFinite(input.age)
        ? Math.round(input.age)
        : birthDate
          ? ageFromBirthDate(birthDate)
          : null;
    const displayName =
      input.name?.trim() || nameFromUserMetadata(user.user_metadata as Record<string, unknown> | undefined) || "";
    const payload = {
      id: user.id,
      app_user_id: input.appUserId ?? null,
      email: input.email?.trim().toLowerCase() || user.email || null,
      name: displayName,
      full_name: displayName,
      birth_date: birthDate,
      age,
      is_guest: Boolean(input.isGuest),
      has_completed_onboarding: Boolean(input.hasCompletedOnboarding),
      has_completed_bank_setup: Boolean(input.hasCompletedBankSetup),
      updated_at: new Date().toISOString(),
    };
    let { data, error } = await client.from("profiles").upsert(payload, { onConflict: "id" }).select("*").maybeSingle();
    if (error && /full_name|column|schema cache/i.test(error.message || "")) {
      const { full_name: _ignored, ...withoutFullName } = payload;
      const retry = await client.from("profiles").upsert(withoutFullName, { onConflict: "id" }).select("*").maybeSingle();
      data = retry.data;
      error = retry.error;
    }
    if (error) {
      noteSupabaseRelationError("profiles", error);
      return null;
    }
    return (data as ProfileRow | null) ?? null;
  } catch (error) {
    noteSupabaseRelationError("profiles", error);
    return null;
  }
}

export async function fetchFinancialSnapshot(): Promise<FinancialSnapshotRow | null> {
  const client = getSupabase();
  if (!client || !canReachSupabase() || isSupabaseTableUnavailable("financial_snapshots")) return null;
  try {
    const user = await currentUser();
    if (!user) return null;
    const { data, error } = await client
      .from("financial_snapshots")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      noteSupabaseRelationError("financial_snapshots", error);
      return null;
    }
    if (!data) return null;
    const row = data as FinancialSnapshotRow;
    return {
      ...row,
      cash_balance: asMoney(row.cash_balance),
      debt: asMoney(row.debt),
      investment_assets: asMoney(row.investment_assets),
      monthly_income: asMoney(row.monthly_income),
    };
  } catch {
    return null;
  }
}

export async function persistFinancialSnapshot(input: FinancialSnapshotInput): Promise<FinancialSnapshotRow | null> {
  const client = getSupabase();
  if (!client || !canReachSupabase() || isSupabaseTableUnavailable("financial_snapshots")) return null;
  try {
    const user = await currentUser();
    if (!user) return null;
    const payload = {
      user_id: user.id,
      cash_balance: asMoney(input.cashBalance),
      debt: asMoney(input.debt),
      investment_assets: asMoney(input.investmentAssets),
      monthly_income: asMoney(input.monthlyIncome),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from("financial_snapshots")
      .upsert(payload, { onConflict: "user_id" })
      .select("*")
      .maybeSingle();
    if (error) {
      noteSupabaseRelationError("financial_snapshots", error);
      return null;
    }
    return (data as FinancialSnapshotRow | null) ?? null;
  } catch {
    return null;
  }
}

let snapshotTimer: number | null = null;
let pendingSnapshot: FinancialSnapshotInput | null = null;

/** Debounced write so cash/debt/holdings updates do not hammer Postgres. */
export function queueFinancialSnapshotSync(input: FinancialSnapshotInput) {
  pendingSnapshot = input;
  if (typeof window === "undefined") {
    void persistFinancialSnapshot(input);
    return;
  }
  if (snapshotTimer != null) window.clearTimeout(snapshotTimer);
  snapshotTimer = window.setTimeout(() => {
    snapshotTimer = null;
    const next = pendingSnapshot;
    pendingSnapshot = null;
    if (next) void persistFinancialSnapshot(next);
  }, 600);
}

export async function signOutSupabase() {
  const client = getSupabase();
  clearGuestCreds();
  clearSupabaseAuthStorage();
  if (!client) return;
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // offline / already signed out
  }
}
