import {
  allowClientMockFallback,
  clearClientMockMode,
  getApiBaseUrl,
  isClientMockMode,
  markClientMockMode,
} from "./apiBase";
import { resolveUserAge } from "./age";
import { emptySafetyNet, parseSafetyNet, type SafetyNetConfig } from "./safetyNet";
import { readLocalItem } from "./storage";
import { isSupabaseClientKey, SUPABASE_GUEST_CREDS_KEY } from "./supabase";
import {
  fetchUserProfile,
  nameFromUserMetadata,
  oauthNameFromSupabaseSession,
  persistUserProfile,
  signOutSupabase,
  syncSupabaseAuth,
  waitForSupabaseSession,
  type ProfileSyncInput,
  type SupabaseAuthInput,
} from "./supabaseSync";

export { queueFinancialSnapshotSync, signInWithGoogleOAuth } from "./supabaseSync";

export type { SafetyNetConfig };
export { getApiBaseUrl, isClientMockMode };

const LOCAL_DEMO_TOKEN = "local-demo";
const AUTH_TIMEOUT_MS = 2000;

const TOKEN_KEY = "sprout_jwt";
const USER_KEY = "sprout_user_profile";
const SETTINGS_KEY = "sprout_user_settings";
const LOCAL_ACCOUNTS_KEY = "sprout_local_accounts";
const LEGACY_TOKEN_KEY = "matterpro_jwt";
const LEGACY_USER_KEY = "matterpro_user";

export type UserSettings = {
  hasCompletedOnboarding: boolean;
  hasCompletedBankSetup: boolean;
  hasActiveInvestments: boolean;
  hasActiveDebts: boolean;
  wantsCapitalGrowth: boolean;
  wantsFinancialLiteracy: boolean;
  riskTolerance?: string;
  investmentGoal?: string;
  experienceLevel?: string;
  age?: number | null;
  birthDate?: string | null;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  hasCompletedOnboarding: false,
  hasCompletedBankSetup: false,
  hasActiveInvestments: false,
  hasActiveDebts: false,
  wantsCapitalGrowth: true,
  wantsFinancialLiteracy: true,
};

export const COMPLETED_USER_SETTINGS: UserSettings = {
  ...DEFAULT_USER_SETTINGS,
  hasCompletedOnboarding: true,
  hasCompletedBankSetup: true,
};

/** Profile (name + age) is done, but the first-time bank step is still required. */
export function needsBankSetup(settings: UserSettings | null | undefined): boolean {
  if (!settings?.hasCompletedOnboarding) return false;
  return settings.hasCompletedBankSetup !== true;
}

/** True when name + age were saved during onboarding. */
export function hasProfileAge(settings: UserSettings | null | undefined): boolean {
  if (!settings) return false;
  const age = settings.age;
  if (age != null && Number.isFinite(age) && age > 0) return true;
  return Boolean(settings.birthDate && settings.birthDate.trim());
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label = "Request"): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        globalThis.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export type AuthProvider = "google" | "password" | "demo" | "guest";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  hasCompletedOnboarding?: boolean;
  createdAt?: string;
  authProvider?: AuthProvider;
};

export function isGoogleAuthUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (user.authProvider === "google") return true;
  return Boolean(user.avatarUrl?.includes("googleusercontent.com"));
}

export function isDemoOrGuestSession(token = getToken(), user = getStoredUser()): boolean {
  if (token === LOCAL_DEMO_TOKEN) return true;
  if (!user) return false;
  if (user.authProvider === "demo" || user.authProvider === "guest") return true;
  if (user.id === "local-demo" || user.id.startsWith("guest-")) return true;
  return user.email.endsWith("@sprout.local") || user.email.endsWith("@guest.sprout.app");
}

/** Drop Skip / Demo auto-login tokens and guest fallback flags so startup requires real auth. */
export function clearGuestSessionFallbacks() {
  clearClientMockMode();
  try {
    localStorage.removeItem(SUPABASE_GUEST_CREDS_KEY);
  } catch {
    // private mode
  }
  if (!isDemoOrGuestSession()) return;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // private mode
  }
  writeLocalSettings({ ...DEFAULT_USER_SETTINGS });
}

function asMetadataText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export type AuthResponse = {
  token: string;
  user: AuthUser;
  settings?: UserSettings | null;
};

export function getToken(): string | null {
  try {
    return readLocalItem(TOKEN_KEY, LEGACY_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function isLocalDemoSession(token = getToken()): boolean {
  return token === LOCAL_DEMO_TOKEN;
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = readLocalItem(USER_KEY, LEGACY_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function updateStoredUser(patch: Partial<AuthUser>): AuthUser | null {
  const current = getStoredUser();
  if (!current) return null;
  const next = { ...current, ...patch };
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(next));
  } catch {
    // private mode
  }
  return next;
}

export function clearSession() {
  void signOutSupabase();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Wipe every client cache so the next visit is a true first-time session. */
export function resetLocalAppState() {
  void signOutSupabase();
  try {
    localStorage.clear();
  } catch {
    // private mode
  }
  try {
    sessionStorage.clear();
  } catch {
    // private mode
  }
}

const SESSION_KEEP_KEYS = new Set([TOKEN_KEY, USER_KEY, SETTINGS_KEY, LOCAL_ACCOUNTS_KEY]);

/** Drop caches from a previous user that in-flight effects may rewrite after a wipe. */
export function pruneForeignClientData(keepUserId: string) {
  try {
    for (const key of Object.keys(localStorage)) {
      if (SESSION_KEEP_KEYS.has(key) || isSupabaseClientKey(key)) continue;
      if (keepUserId && key.includes(keepUserId)) continue;
      localStorage.removeItem(key);
    }
  } catch {
    // private mode
  }
}

export function getStoredSettings(): UserSettings {
  return readLocalSettings();
}

type LocalAccount = { email: string; name: string; password: string };

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function displayNameFromEmail(email: string) {
  const local = email.split("@")[0] || "Investor";
  return local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function newLocalId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}

function currentUserId() {
  return getStoredUser()?.id || "local-demo";
}

function useClientMock(): boolean {
  return allowClientMockFallback() && (isClientMockMode() || isLocalDemoSession());
}

function readLocalAccounts(): LocalAccount[] {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalAccounts(accounts: LocalAccount[]) {
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // ignore quota / private-mode failures
  }
}

function findLocalAccount(email: string) {
  const normalized = normalizeEmail(email);
  return readLocalAccounts().find((account) => account.email === normalized) ?? null;
}

function upsertLocalAccount(account: LocalAccount) {
  const email = normalizeEmail(account.email);
  writeLocalAccounts([...readLocalAccounts().filter((item) => item.email !== email), { ...account, email }]);
}

/** Saved onboarding age for any module — do not ask for age again. */
export function getStoredUserAge(): number | null {
  const settings = readLocalSettings();
  return resolveUserAge(settings.age, settings.birthDate);
}

export function normalizeUserSettings(partial?: Partial<UserSettings> | null): UserSettings {
  return normalizeSettings(partial);
}

function normalizeSettings(partial?: Partial<UserSettings> | null): UserSettings {
  const parsed = partial ?? {};
  const hasCompletedOnboarding = Boolean(parsed.hasCompletedOnboarding);
  const hasCompletedBankSetup =
    parsed.hasCompletedBankSetup === true ||
    (parsed.hasCompletedBankSetup == null && hasCompletedOnboarding);
  return {
    ...DEFAULT_USER_SETTINGS,
    ...parsed,
    hasCompletedOnboarding,
    hasCompletedBankSetup,
  };
}

function readLocalSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_USER_SETTINGS };
    return normalizeSettings(JSON.parse(raw) as Partial<UserSettings>);
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

function writeLocalSettings(settings: UserSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota / private-mode failures
  }
}

function isGuestUser(user: Pick<AuthUser, "id" | "email">) {
  return (
    isLocalDemoSession() ||
    user.id.startsWith("guest-") ||
    user.id.startsWith("local-") ||
    user.email.endsWith("@sprout.local")
  );
}

function profileInputFrom(
  user: AuthUser,
  settings?: UserSettings | null,
  extra?: { name?: string }
): ProfileSyncInput {
  const next = settings ?? readLocalSettings();
  return {
    name: extra?.name ?? user.name,
    email: user.email,
    appUserId: user.id,
    birthDate: next.birthDate ?? null,
    age: next.age ?? null,
    isGuest: isGuestUser(user),
    hasCompletedOnboarding: Boolean(next.hasCompletedOnboarding || user.hasCompletedOnboarding),
    hasCompletedBankSetup: Boolean(next.hasCompletedBankSetup),
  };
}

function applyProfileRow(
  user: AuthUser,
  settings: UserSettings | null | undefined,
  row: { name?: string | null; full_name?: string | null; email?: string | null; birth_date?: string | null; age?: number | null; has_completed_onboarding?: boolean; has_completed_bank_setup?: boolean }
): { user: AuthUser; settings: UserSettings } {
  const nextSettings = normalizeSettings(settings);
  const name = row.full_name?.trim() || row.name?.trim() || user.name;
  return {
    user: {
      ...user,
      name,
      email: user.email || row.email || user.email,
      hasCompletedOnboarding: Boolean(user.hasCompletedOnboarding || row.has_completed_onboarding),
    },
    settings: {
      ...nextSettings,
      birthDate: row.birth_date || nextSettings.birthDate || null,
      age: row.age ?? nextSettings.age ?? null,
      hasCompletedOnboarding: nextSettings.hasCompletedOnboarding || Boolean(row.has_completed_onboarding),
      hasCompletedBankSetup: nextSettings.hasCompletedBankSetup || Boolean(row.has_completed_bank_setup),
    },
  };
}

async function attachSupabaseProfile(
  user: AuthUser,
  settings: UserSettings | null | undefined,
  authInput: SupabaseAuthInput
): Promise<{ user: AuthUser; settings: UserSettings }> {
  const fallback = { user, settings: normalizeSettings(settings) };
  try {
    await syncSupabaseAuth(authInput);
    const oauthName = ((await oauthNameFromSupabaseSession()) || authInput.name?.trim() || user.name.trim()).trim();
    const namedUser = { ...user, name: oauthName || user.name };
    const row = await fetchUserProfile();
    if (row) {
      const merged = applyProfileRow(namedUser, settings, row);
      const nextUser = { ...merged.user, name: merged.user.name.trim() || oauthName, authProvider: user.authProvider };
      const token = getToken();
      if (token) saveSession(token, nextUser);
      writeLocalSettings(merged.settings);
      await persistUserProfile(profileInputFrom(nextUser, merged.settings, { name: nextUser.name }));
      return { user: nextUser, settings: merged.settings };
    }
    await persistUserProfile(profileInputFrom(namedUser, settings, { name: namedUser.name }));
    return { user: namedUser, settings: fallback.settings };
  } catch {
    return fallback;
  }
}

async function tryCloudProfile(
  user: AuthUser,
  settings: UserSettings | null | undefined,
  authInput: SupabaseAuthInput
): Promise<{ user: AuthUser; settings: UserSettings }> {
  try {
    return await withTimeout(attachSupabaseProfile(user, settings, authInput), 2500, "Supabase");
  } catch {
    return { user, settings: normalizeSettings(settings) };
  }
}

/** Restore name / date of birth from the Supabase session when one is already persisted. */
export async function hydrateLocalSessionFromSupabase(): Promise<{ user: AuthUser; settings: UserSettings } | null> {
  const user = getStoredUser();
  if (!user) return null;
  const settings = readLocalSettings();
  return tryCloudProfile(user, settings, {
    kind: "guest",
    name: user.name,
    isDemo: user.id === "local-demo",
  });
}

function createLocalSession(user: { email: string; name: string; id?: string }): AuthResponse {
  markClientMockMode();
  const email = normalizeEmail(user.email);
  const settings = readLocalSettings();
  return {
    token: LOCAL_DEMO_TOKEN,
    user: {
      id: user.id || `local-${email}`,
      email,
      name: user.name.trim() || displayNameFromEmail(email),
      hasCompletedOnboarding: settings.hasCompletedOnboarding,
      authProvider: "password",
    },
    settings,
  };
}

function isUnreachableStatus(status: number) {
  return status === 502 || status === 503 || status === 504;
}

function isUnreachableError(err: unknown) {
  if (!(err instanceof Error)) return true;
  const message = err.message.toLowerCase();
  return (
    message.includes("timed out") ||
    message.includes("not reachable") ||
    message.includes("failed to fetch") ||
    message.includes("cannot reach") ||
    message.includes("network")
  );
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${getApiBaseUrl()}${path}`, init);
  } catch {
    throw new Error(
      "Request failed — this device cannot reach the API. Start the backend and open the Network URL."
    );
  }
}

export async function authFetch(path: string, init: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return apiFetch(path, {
    ...init,
    headers,
  });
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    // ignore HTML / empty proxy failures
  }
  if (isUnreachableStatus(res.status)) {
    return "Request failed — the API server is not reachable from this device. Start the backend and try again.";
  }
  return `Request failed (${res.status})`;
}

type RemoteResult<T> =
  | { ok: true; data: T }
  | { ok: false; unreachable: boolean; error: Error };

async function tryRemoteJson<T>(
  path: string,
  init: RequestInit,
  timeoutMs = AUTH_TIMEOUT_MS,
  authed = false
): Promise<RemoteResult<T>> {
  if (useClientMock()) {
    return { ok: false, unreachable: true, error: new Error("Using client mock mode") };
  }
  try {
    const res = await withTimeout(authed ? authFetch(path, init) : apiFetch(path, init), timeoutMs, "Request");
    if (res.ok) return { ok: true, data: (await res.json()) as T };
    if (isUnreachableStatus(res.status) && allowClientMockFallback()) {
      markClientMockMode();
      return { ok: false, unreachable: true, error: new Error(await parseError(res)) };
    }
    return { ok: false, unreachable: false, error: new Error(await parseError(res)) };
  } catch (err) {
    const error = err instanceof Error ? err : new Error("Request failed");
    if (allowClientMockFallback() && isUnreachableError(err)) {
      markClientMockMode();
      return { ok: false, unreachable: true, error };
    }
    return { ok: false, unreachable: false, error };
  }
}

function localRegister(input: { name: string; email: string; password: string }): AuthResponse {
  const email = normalizeEmail(input.email);
  if (findLocalAccount(email)) {
    throw new Error("An account with this email already exists");
  }
  upsertLocalAccount({ email, name: input.name.trim(), password: input.password });
  writeLocalSettings({ ...DEFAULT_USER_SETTINGS });
  return createLocalSession({ email, name: input.name });
}

function localLogin(input: { email: string; password: string }): AuthResponse {
  const email = normalizeEmail(input.email);
  const existing = findLocalAccount(email);
  if (existing && existing.password !== input.password) {
    throw new Error("Invalid email or password");
  }
  const name = existing?.name || displayNameFromEmail(email);
  if (!existing) {
    upsertLocalAccount({ email, name, password: input.password });
  }
  return createLocalSession({ email, name, id: existing ? `local-${email}` : undefined });
}

export async function registerUser(input: {
  name?: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const name = input.name?.trim() || displayNameFromEmail(input.email);
  const payload = { name, email: input.email, password: input.password };
  const remote = await tryRemoteJson<AuthResponse>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (remote.ok) {
    const cloud = await tryCloudProfile(
      { ...remote.data.user, authProvider: remote.data.user.authProvider ?? "password" },
      remote.data.settings,
      {
        kind: "password",
        email: input.email,
        password: input.password,
        name,
      }
    );
    return { ...remote.data, user: cloud.user, settings: cloud.settings };
  }
  if (remote.unreachable && allowClientMockFallback()) {
    const local = localRegister(payload);
    const cloud = await tryCloudProfile(local.user, local.settings, {
      kind: "password",
      email: input.email,
      password: input.password,
      name,
    });
    return { ...local, user: cloud.user, settings: cloud.settings };
  }
  throw remote.error;
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const remote = await tryRemoteJson<AuthResponse>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (remote.ok) {
    const cloud = await tryCloudProfile(
      { ...remote.data.user, authProvider: remote.data.user.authProvider ?? "password" },
      remote.data.settings,
      {
        kind: "password",
        email: input.email,
        password: input.password,
        name: remote.data.user.name,
      }
    );
    return { ...remote.data, user: cloud.user, settings: cloud.settings };
  }
  if (remote.unreachable && allowClientMockFallback()) {
    const local = localLogin(input);
    const cloud = await tryCloudProfile(local.user, local.settings, {
      kind: "password",
      email: input.email,
      password: input.password,
      name: local.user.name,
    });
    return { ...local, user: cloud.user, settings: cloud.settings };
  }
  throw remote.error;
}

function authUserFromSupabaseSession(session: {
  access_token: string;
  user: {
    id: string;
    email?: string | null;
    app_metadata?: Record<string, unknown> | null;
    user_metadata?: Record<string, unknown> | null;
    identities?: Array<{ provider?: string | null }> | null;
  };
}): AuthUser {
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const provider = String(session.user.app_metadata?.provider ?? "");
  const isGoogle =
    provider === "google" ||
    (session.user.identities ?? []).some((identity) => identity.provider === "google");
  return {
    id: session.user.id,
    email: asMetadataText(session.user.email).toLowerCase(),
    name: nameFromUserMetadata(meta),
    avatarUrl: asMetadataText(meta.avatar_url) || asMetadataText(meta.picture) || null,
    authProvider: isGoogle ? "google" : "password",
  };
}

/** Resume a Google (or other) Supabase session after OAuth redirect or refresh. */
export async function restoreSupabaseAuthSession(): Promise<AuthResponse | null> {
  const session = await waitForSupabaseSession();
  if (!session?.user) return null;

  const googleUser = authUserFromSupabaseSession(session);
  const stored = getStoredUser();
  const sameUser = stored?.id === googleUser.id;
  const settings = sameUser ? readLocalSettings() : { ...DEFAULT_USER_SETTINGS };
  if (!sameUser) writeLocalSettings(settings);

  const cloud = await tryCloudProfile(googleUser, settings, {
    kind: "oauth",
    name: googleUser.name,
  });
  const user: AuthUser = {
    ...cloud.user,
    authProvider: googleUser.authProvider,
    name: cloud.user.name.trim() || googleUser.name,
    avatarUrl: cloud.user.avatarUrl || googleUser.avatarUrl,
  };
  saveSession(session.access_token, user);
  writeLocalSettings(cloud.settings);
  return { token: session.access_token, user, settings: cloud.settings };
}

export type OnboardingChoices = {
  hasActiveInvestments: boolean;
  hasActiveDebts: boolean;
  wantsCapitalGrowth: boolean;
  wantsFinancialLiteracy: boolean;
};

export async function fetchMe(): Promise<{ user: AuthUser; settings: UserSettings | null }> {
  const fallback = () => {
    const user = getStoredUser();
    if (!user || isDemoOrGuestSession(getToken(), user)) {
      throw new Error("Session restore failed");
    }
    return { user, settings: readLocalSettings() };
  };
  const remote = await tryRemoteJson<{ user: AuthUser; settings: UserSettings | null }>(
    "/api/auth/me",
    {},
    AUTH_TIMEOUT_MS,
    true
  );
  const base = remote.ok
    ? {
        user: remote.data.user,
        settings: remote.data.settings ? normalizeSettings(remote.data.settings) : readLocalSettings(),
      }
    : remote.unreachable && allowClientMockFallback()
      ? fallback()
      : null;
  if (!base) {
    if (remote.ok) throw new Error("Session restore failed");
    throw remote.error;
  }
  const stored = getStoredUser();
  const user: AuthUser = {
    ...base.user,
    authProvider: base.user.authProvider ?? stored?.authProvider,
    name: base.user.name?.trim() || stored?.name || "",
    avatarUrl: base.user.avatarUrl || stored?.avatarUrl,
  };
  return tryCloudProfile(user, base.settings, {
    kind: "guest",
    name: user.name,
    isDemo: user.id === "local-demo",
  });
}

export function persistLocalUserSettings(
  input: Partial<OnboardingChoices> & {
    hasCompletedOnboarding?: boolean;
    hasCompletedBankSetup?: boolean;
    age?: number | null;
    birthDate?: string | null;
    name?: string;
  }
): UserSettings {
  const next = normalizeSettings({ ...readLocalSettings(), ...input });
  writeLocalSettings(next);
  if (input.name) {
    updateStoredUser({ name: input.name, hasCompletedOnboarding: next.hasCompletedOnboarding });
  }
  return next;
}

export async function saveUserSettings(
  input: Partial<OnboardingChoices> & {
    hasCompletedOnboarding?: boolean;
    hasCompletedBankSetup?: boolean;
    age?: number | null;
    birthDate?: string | null;
    name?: string;
  }
): Promise<UserSettings> {
  const settings = persistLocalUserSettings(input);
  const user = getStoredUser();
  try {
    await syncSupabaseAuth({
      kind: "guest",
      name: input.name ?? user?.name,
      isDemo: user?.id === "local-demo",
    });
    await persistUserProfile(
      profileInputFrom(
        user ?? {
          id: "anon",
          email: "",
          name: input.name ?? "",
        },
        settings,
        { name: input.name }
      )
    );
  } catch {
    // local settings still apply when the cloud write is unavailable
  }
  return settings;
}

/** Best-effort remote wipe so the same Google account can re-run first-time onboarding. */
export async function resetRemoteUserProgress(): Promise<void> {
  if (!getToken() || isLocalDemoSession()) return;
  try {
    await saveUserSettings({
      hasActiveInvestments: false,
      hasActiveDebts: false,
      wantsCapitalGrowth: true,
      wantsFinancialLiteracy: true,
      hasCompletedOnboarding: false,
      hasCompletedBankSetup: false,
      age: null,
      birthDate: null,
    });
  } catch {
    // local wipe still proceeds
  }
}

export type PortfolioApiItem = {
  id: string;
  userId: string;
  symbol: string;
  shares: number;
  buyPrice: number;
  purchasedAt?: string | null;
  /** "paper" (manual) or "verified" (API brokerage). Missing values are paper. */
  accountType?: string | null;
  createdAt: string;
};

export async function fetchPortfolio(): Promise<PortfolioApiItem[]> {
  const remote = await tryRemoteJson<PortfolioApiItem[]>("/api/portfolio", {}, AUTH_TIMEOUT_MS, true);
  if (remote.ok) {
    writePortfolioCache(remote.data);
    return remote.data;
  }
  if (remote.unreachable && allowClientMockFallback()) {
    return readPortfolioCache()?.items ?? [];
  }
  throw remote.error;
}

function portfolioCacheKey(userId?: string | null) {
  return `sprout_portfolio_${userId || getStoredUser()?.id || "anon"}`;
}

export function readPortfolioCache(userId?: string | null): {
  items: PortfolioApiItem[];
  updatedAt: number;
} | null {
  try {
    const raw = localStorage.getItem(portfolioCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items?: PortfolioApiItem[]; updatedAt?: number };
    if (!Array.isArray(parsed.items)) return null;
    return { items: parsed.items, updatedAt: Number(parsed.updatedAt) || 0 };
  } catch {
    return null;
  }
}

export function writePortfolioCache(items: PortfolioApiItem[], userId?: string | null) {
  try {
    localStorage.setItem(
      portfolioCacheKey(userId),
      JSON.stringify({ items, updatedAt: Date.now() })
    );
  } catch {
    // ignore quota / private-mode failures
  }
}

function mockPortfolioItems(): PortfolioApiItem[] {
  return readPortfolioCache()?.items ?? [];
}

function createLocalPortfolioItem(input: {
  symbol: string;
  shares: number;
  buyPrice: number;
  purchasedAt?: string | null;
}): PortfolioApiItem {
  const symbol = input.symbol.trim().toUpperCase();
  const items = mockPortfolioItems();
  const existing = items.find(
    (item) => item.symbol.toUpperCase() === symbol && (item.accountType || "paper") !== "verified"
  );
  if (existing) {
    const shares = existing.shares + input.shares;
    const buyPrice = (existing.shares * existing.buyPrice + input.shares * input.buyPrice) / shares;
    const updated: PortfolioApiItem = {
      ...existing,
      shares,
      buyPrice,
      purchasedAt: existing.purchasedAt || input.purchasedAt || null,
    };
    writePortfolioCache(items.map((item) => (item.id === existing.id ? updated : item)));
    return updated;
  }
  const created: PortfolioApiItem = {
    id: newLocalId("lot"),
    userId: currentUserId(),
    symbol,
    shares: input.shares,
    buyPrice: input.buyPrice,
    purchasedAt: input.purchasedAt ?? null,
    accountType: "paper",
    createdAt: new Date().toISOString(),
  };
  writePortfolioCache([created, ...items]);
  return created;
}

/** Add a paper lot, or merge into the existing paper position for that ticker. */
export async function createPortfolioItem(input: {
  symbol: string;
  shares: number;
  buyPrice: number;
  purchasedAt?: string | null;
}): Promise<PortfolioApiItem> {
  const remote = await tryRemoteJson<PortfolioApiItem>(
    "/api/portfolio",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    AUTH_TIMEOUT_MS,
    true
  );
  if (remote.ok) return remote.data;
  if (remote.unreachable && allowClientMockFallback()) return createLocalPortfolioItem(input);
  throw remote.error;
}

export async function deletePortfolioItem(id: string): Promise<void> {
  const remote = await tryRemoteJson<unknown>(
    `/api/portfolio/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    AUTH_TIMEOUT_MS,
    true
  );
  if (remote.ok) return;
  if (remote.unreachable && allowClientMockFallback()) {
    writePortfolioCache(mockPortfolioItems().filter((item) => item.id !== id));
    return;
  }
  throw remote.error;
}

export type SellPortfolioResult =
  | { deleted: true; id: string; sharesSold: number; sellPrice: number }
  | { deleted: false; item: PortfolioApiItem; sharesSold: number; sellPrice: number };

/** Reduce a paper position. Remaining shares keep the current average cost; 0 shares deletes the row. */
export async function sellPortfolioItem(
  id: string,
  input: { shares: number; sellPrice: number }
): Promise<SellPortfolioResult> {
  const remote = await tryRemoteJson<PortfolioApiItem & {
    deleted?: boolean;
    id?: string;
    sharesSold?: number;
    sellPrice?: number;
  }>(
    `/api/portfolio/${encodeURIComponent(id)}/sell`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    AUTH_TIMEOUT_MS,
    true
  );
  if (remote.ok) {
    const data = remote.data;
    const sharesSold = Number(data.sharesSold);
    const sellPrice = Number(data.sellPrice);
    if (data.deleted) {
      return {
        deleted: true,
        id: data.id || id,
        sharesSold: Number.isFinite(sharesSold) ? sharesSold : input.shares,
        sellPrice: Number.isFinite(sellPrice) ? sellPrice : input.sellPrice,
      };
    }
    return {
      deleted: false,
      item: data,
      sharesSold: Number.isFinite(sharesSold) ? sharesSold : input.shares,
      sellPrice: Number.isFinite(sellPrice) ? sellPrice : input.sellPrice,
    };
  }
  if (!(remote.unreachable && allowClientMockFallback())) throw remote.error;

  const items = mockPortfolioItems();
  const existing = items.find((item) => item.id === id);
  if (!existing) throw new Error("Portfolio item not found");
  const remaining = existing.shares - input.shares;
  if (remaining <= 1e-8) {
    writePortfolioCache(items.filter((item) => item.id !== id));
    return { deleted: true, id, sharesSold: input.shares, sellPrice: input.sellPrice };
  }
  const item = { ...existing, shares: remaining };
  writePortfolioCache(items.map((row) => (row.id === id ? item : row)));
  return { deleted: false, item, sharesSold: input.shares, sellPrice: input.sellPrice };
}

export type WatchlistApiItem = {
  id: string;
  watchlistId: string;
  symbol: string;
  name: string;
  createdAt: string;
};

export type WatchlistApiList = {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  items: WatchlistApiItem[];
};

function watchlistCacheKey() {
  const user = getStoredUser();
  return `sprout_watchlists_${user?.id ?? "anon"}`;
}

function watchlistCacheLegacyKey() {
  const user = getStoredUser();
  return `matterpro_watchlists_${user?.id ?? "anon"}`;
}

export function readWatchlistCache(): WatchlistApiList[] {
  try {
    const raw = readLocalItem(watchlistCacheKey(), watchlistCacheLegacyKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchlistApiList[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeWatchlistCache(lists: WatchlistApiList[]) {
  try {
    localStorage.setItem(watchlistCacheKey(), JSON.stringify(lists));
  } catch {
    // ignore quota / private-mode failures
  }
}

export async function fetchWatchlists(): Promise<WatchlistApiList[]> {
  const remote = await tryRemoteJson<WatchlistApiList[]>("/api/watchlists", {}, AUTH_TIMEOUT_MS, true);
  if (remote.ok) {
    writeWatchlistCache(remote.data);
    return remote.data;
  }
  if (remote.unreachable && allowClientMockFallback()) return readWatchlistCache();
  throw remote.error;
}

export async function createWatchlist(name: string): Promise<WatchlistApiList> {
  const remote = await tryRemoteJson<WatchlistApiList>(
    "/api/watchlists",
    {
      method: "POST",
      body: JSON.stringify({ name }),
    },
    AUTH_TIMEOUT_MS,
    true
  );
  if (remote.ok) return remote.data;
  if (remote.unreachable && allowClientMockFallback()) {
    const list: WatchlistApiList = {
      id: newLocalId("wl"),
      userId: currentUserId(),
      name,
      createdAt: new Date().toISOString(),
      items: [],
    };
    writeWatchlistCache([...readWatchlistCache(), list]);
    return list;
  }
  throw remote.error;
}

export async function deleteWatchlist(id: string): Promise<void> {
  const remote = await tryRemoteJson<unknown>(
    `/api/watchlists/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    AUTH_TIMEOUT_MS,
    true
  );
  if (remote.ok) return;
  if (remote.unreachable && allowClientMockFallback()) {
    writeWatchlistCache(readWatchlistCache().filter((list) => list.id !== id));
    return;
  }
  throw remote.error;
}

export async function addWatchlistItem(input: {
  watchlistId: string;
  symbol: string;
  name?: string;
}): Promise<WatchlistApiItem> {
  const remote = await tryRemoteJson<WatchlistApiItem>(
    `/api/watchlists/${encodeURIComponent(input.watchlistId)}/items`,
    {
      method: "POST",
      body: JSON.stringify({ symbol: input.symbol, name: input.name }),
    },
    AUTH_TIMEOUT_MS,
    true
  );
  if (remote.ok) return remote.data;
  if (remote.unreachable && allowClientMockFallback()) {
    const item: WatchlistApiItem = {
      id: newLocalId("wli"),
      watchlistId: input.watchlistId,
      symbol: input.symbol.trim().toUpperCase(),
      name: input.name?.trim() || input.symbol.trim().toUpperCase(),
      createdAt: new Date().toISOString(),
    };
    writeWatchlistCache(
      readWatchlistCache().map((list) =>
        list.id === input.watchlistId ? { ...list, items: [...list.items, item] } : list
      )
    );
    return item;
  }
  throw remote.error;
}

export async function deleteWatchlistItem(watchlistId: string, itemId: string): Promise<void> {
  const remote = await tryRemoteJson<unknown>(
    `/api/watchlists/${encodeURIComponent(watchlistId)}/items/${encodeURIComponent(itemId)}`,
    { method: "DELETE" },
    AUTH_TIMEOUT_MS,
    true
  );
  if (remote.ok) return;
  if (remote.unreachable && allowClientMockFallback()) {
    writeWatchlistCache(
      readWatchlistCache().map((list) =>
        list.id === watchlistId ? { ...list, items: list.items.filter((item) => item.id !== itemId) } : list
      )
    );
    return;
  }
  throw remote.error;
}

export type CashFlowExpense = { id: string; label: string; amount: number };

export type CashFlowDebt = {
  id: string;
  title: string;
  originalBalance: number;
  balance: number;
  minPayment: number;
  apr: number;
};

export type CashFlowSnapshot = {
  monthlyIncome: number;
  emergencyFund: number;
  extraPayoff: number;
  expenses: CashFlowExpense[];
  debts: CashFlowDebt[];
  safetyNet: SafetyNetConfig;
  updatedAt: number;
};

export function emptyCashFlow(): CashFlowSnapshot {
  return {
    monthlyIncome: 0,
    emergencyFund: 0,
    extraPayoff: 0,
    expenses: [],
    debts: [],
    safetyNet: emptySafetyNet(),
    updatedAt: 0,
  };
}

function cashFlowCacheKey(userId?: string | null) {
  return `sprout_cashflow_${userId || getStoredUser()?.id || "anon"}`;
}

function cashFlowCacheLegacyKey(userId?: string | null) {
  return `matterpro_cashflow_${userId || getStoredUser()?.id || "anon"}`;
}

function asFiniteMoney(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseCashFlowSnapshot(raw: unknown): CashFlowSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const expenses = Array.isArray(rec.expenses)
    ? rec.expenses
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => ({
          id: String(item.id || ""),
          label: String(item.label || "").trim(),
          amount: asFiniteMoney(item.amount),
        }))
        .filter((item) => item.id && item.label)
    : [];
  const debts = Array.isArray(rec.debts)
    ? rec.debts
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => ({
          id: String(item.id || ""),
          title: String(item.title || "").trim() || "Untitled Debt",
          originalBalance: asFiniteMoney(item.originalBalance),
          balance: asFiniteMoney(item.balance),
          minPayment: asFiniteMoney(item.minPayment),
          apr: asFiniteMoney(item.apr),
        }))
        .filter((item) => item.id)
    : [];
  const updatedAtRaw = rec.updatedAt;
  const updatedAt =
    typeof updatedAtRaw === "number" && Number.isFinite(updatedAtRaw)
      ? updatedAtRaw
      : typeof updatedAtRaw === "string"
        ? Date.parse(updatedAtRaw) || 0
        : 0;
  return {
    monthlyIncome: asFiniteMoney(rec.monthlyIncome),
    emergencyFund: asFiniteMoney(rec.emergencyFund),
    extraPayoff: asFiniteMoney(rec.extraPayoff),
    expenses,
    debts,
    safetyNet: parseSafetyNet(rec.safetyNet),
    updatedAt,
  };
}

export function readCashFlowCache(userId?: string | null): CashFlowSnapshot {
  try {
    const raw = readLocalItem(cashFlowCacheKey(userId), cashFlowCacheLegacyKey(userId));
    if (!raw) return emptyCashFlow();
    return parseCashFlowSnapshot(JSON.parse(raw)) ?? emptyCashFlow();
  } catch {
    return emptyCashFlow();
  }
}

export function writeCashFlowCache(snapshot: CashFlowSnapshot, userId?: string | null) {
  try {
    localStorage.setItem(cashFlowCacheKey(userId), JSON.stringify(snapshot));
  } catch {
    // ignore quota / private-mode failures
  }
}

export function clearCashFlowCache(userId?: string | null) {
  try {
    localStorage.removeItem(cashFlowCacheKey(userId));
  } catch {
    // ignore
  }
}

export async function fetchCashFlow(): Promise<CashFlowSnapshot> {
  try {
    const remote = await tryRemoteJson<unknown>("/api/cash-flow", {}, AUTH_TIMEOUT_MS, true);
    if (remote.ok) return parseCashFlowSnapshot(remote.data) ?? emptyCashFlow();
    return readCashFlowCache();
  } catch {
    return readCashFlowCache();
  }
}

export async function saveCashFlow(snapshot: CashFlowSnapshot): Promise<CashFlowSnapshot> {
  try {
    const remote = await tryRemoteJson<unknown>(
      "/api/cash-flow",
      {
        method: "PUT",
        body: JSON.stringify({
          monthlyIncome: snapshot.monthlyIncome,
          emergencyFund: snapshot.emergencyFund,
          extraPayoff: snapshot.extraPayoff,
          expenses: snapshot.expenses,
          debts: snapshot.debts,
          safetyNet: snapshot.safetyNet,
        }),
      },
      AUTH_TIMEOUT_MS,
      true
    );
    if (remote.ok) return parseCashFlowSnapshot(remote.data) ?? snapshot;
    writeCashFlowCache(snapshot);
    return snapshot;
  } catch {
    writeCashFlowCache(snapshot);
    return snapshot;
  }
}
