import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from "./env";
import type { PlaidAccount } from "./plaidClient";

export type StoredPlaidItem = {
  userId: string;
  itemId: string;
  accessToken: string;
  institutionId: string;
  institutionName: string;
};

const memoryItems = new Map<string, StoredPlaidItem[]>();

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export function bearerFromAuthorization(value: string | string[] | undefined): string {
  const raw = headerValue(value).trim();
  return raw.replace(/^Bearer\s+/i, "").trim();
}

function getSupabaseAdmin(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function resolveSupabaseUserId(accessToken: string | null): Promise<string | null> {
  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  if (!url || !anon || !accessToken) return null;
  try {
    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function resolveApiUser(input: {
  authorization?: string | string[];
  sproutAuthorization?: string | string[];
}): Promise<{ id: string; supabaseUserId: string | null }> {
  const supabaseToken = bearerFromAuthorization(input.authorization);
  const supabaseUserId = await resolveSupabaseUserId(supabaseToken);
  if (supabaseUserId) return { id: supabaseUserId, supabaseUserId };

  const sproutToken =
    bearerFromAuthorization(input.sproutAuthorization) ||
    (supabaseToken && !supabaseUserId ? supabaseToken : "");
  if (sproutToken) {
    const payload = decodeJwtPayload(sproutToken);
    const id = String(payload?.id || payload?.sub || "").trim();
    if (id) return { id, supabaseUserId: null };
  }

  return { id: `guest-${Date.now()}`, supabaseUserId: null };
}

function rememberItem(item: StoredPlaidItem) {
  const existing = memoryItems.get(item.userId) || [];
  const next = [...existing.filter((row) => row.itemId !== item.itemId), item];
  memoryItems.set(item.userId, next);
}

export async function savePlaidItem(item: StoredPlaidItem): Promise<void> {
  rememberItem(item);
  const admin = getSupabaseAdmin();
  if (!admin) return;
  try {
    await admin.from("plaid_items").upsert(
      {
        user_id: item.userId,
        item_id: item.itemId,
        access_token: item.accessToken,
        institution_id: item.institutionId || null,
        institution_name: item.institutionName || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "item_id" }
    );
  } catch (error) {
    console.error("Failed to persist Plaid item:", error);
  }
}

export async function loadPlaidItems(userId: string): Promise<StoredPlaidItem[]> {
  const cached = memoryItems.get(userId) || [];
  const admin = getSupabaseAdmin();
  if (!admin) return cached;
  try {
    const { data, error } = await admin.from("plaid_items").select("*").eq("user_id", userId);
    if (error || !Array.isArray(data)) return cached;
    const rows = data
      .map((row) => {
        const rec = row as Record<string, unknown>;
        return {
          userId,
          itemId: String(rec.item_id || ""),
          accessToken: String(rec.access_token || ""),
          institutionId: String(rec.institution_id || ""),
          institutionName: String(rec.institution_name || "Linked bank"),
        };
      })
      .filter((row) => row.itemId && row.accessToken);
    for (const row of rows) rememberItem(row);
    return rows.length > 0 ? rows : cached;
  } catch {
    return cached;
  }
}

export async function saveBankAccounts(userId: string, accounts: PlaidAccount[]): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin || accounts.length === 0) return;
  const now = new Date().toISOString();
  const rows = accounts.map((account) => ({
    user_id: userId,
    plaid_account_id: account.id,
    name: account.name,
    official_name: account.officialName,
    type: account.type,
    subtype: account.subtype,
    mask: account.mask || null,
    institution: account.institution || null,
    balance: account.balance,
    available_balance: account.availableBalance ?? null,
    iso_currency: account.isoCurrency || "USD",
    min_payment: account.minPayment ?? null,
    apr: account.apr ?? null,
    updated_at: now,
  }));
  try {
    await admin.from("bank_accounts").upsert(rows, { onConflict: "user_id,plaid_account_id" });
  } catch (error) {
    console.error("Failed to persist bank accounts:", error);
  }
}

export async function loadBankAccounts(userId: string): Promise<PlaidAccount[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  try {
    const { data, error } = await admin.from("bank_accounts").select("*").eq("user_id", userId);
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => {
      const rec = row as Record<string, unknown>;
      const type = String(rec.type || "depository");
      return {
        id: String(rec.plaid_account_id || rec.id || ""),
        name: String(rec.name || "Linked account"),
        officialName: String(rec.official_name || rec.name || "Linked account"),
        type: (["depository", "investment", "credit", "loan"].includes(type)
          ? type
          : "depository") as PlaidAccount["type"],
        subtype: String(rec.subtype || ""),
        mask: String(rec.mask || ""),
        institution: String(rec.institution || "Linked bank"),
        balance: Number(rec.balance) || 0,
        availableBalance: Number(rec.available_balance ?? rec.balance) || 0,
        isoCurrency: String(rec.iso_currency || "USD"),
        minPayment: rec.min_payment != null ? Number(rec.min_payment) || undefined : undefined,
        apr: rec.apr != null ? Number(rec.apr) || undefined : undefined,
      };
    });
  } catch {
    return [];
  }
}
