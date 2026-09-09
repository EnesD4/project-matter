/**
 * Curated circular icon metadata for popular ETFs / index funds.
 * Finnhub & Clearbit often lack reliable logos for these tickers, so we
 * render issuer-branded badges instead of broken image URLs.
 */

export type EtfIconMeta = {
  /** Short label drawn inside the circle (1–4 chars). */
  label: string;
  /** Brand fill color. */
  bg: string;
  /** Text / accent on the badge. */
  fg: string;
  /** Optional issuer name for accessibility. */
  issuer: string;
};

/** Normalized uppercase symbol → icon meta. */
export const ETF_ICON_MAP: Record<string, EtfIconMeta> = {
  // Vanguard
  VOO: { label: "VOO", bg: "#C8102E", fg: "#FFFFFF", issuer: "Vanguard" },
  VTI: { label: "VTI", bg: "#C8102E", fg: "#FFFFFF", issuer: "Vanguard" },
  VUG: { label: "VUG", bg: "#C8102E", fg: "#FFFFFF", issuer: "Vanguard" },
  VEA: { label: "VEA", bg: "#C8102E", fg: "#FFFFFF", issuer: "Vanguard" },
  VWO: { label: "VWO", bg: "#C8102E", fg: "#FFFFFF", issuer: "Vanguard" },
  VXUS: { label: "VXUS", bg: "#C8102E", fg: "#FFFFFF", issuer: "Vanguard" },
  BND: { label: "BND", bg: "#C8102E", fg: "#FFFFFF", issuer: "Vanguard" },
  VNQ: { label: "VNQ", bg: "#C8102E", fg: "#FFFFFF", issuer: "Vanguard" },
  VIG: { label: "VIG", bg: "#C8102E", fg: "#FFFFFF", issuer: "Vanguard" },
  VTV: { label: "VTV", bg: "#C8102E", fg: "#FFFFFF", issuer: "Vanguard" },
  VO: { label: "VO", bg: "#C8102E", fg: "#FFFFFF", issuer: "Vanguard" },
  VB: { label: "VB", bg: "#C8102E", fg: "#FFFFFF", issuer: "Vanguard" },
  VGT: { label: "VGT", bg: "#C8102E", fg: "#FFFFFF", issuer: "Vanguard" },

  // Charles Schwab
  SCHD: { label: "SCHD", bg: "#00A0DF", fg: "#FFFFFF", issuer: "Schwab" },
  SCHB: { label: "SCHB", bg: "#00A0DF", fg: "#FFFFFF", issuer: "Schwab" },
  SCHG: { label: "SCHG", bg: "#00A0DF", fg: "#FFFFFF", issuer: "Schwab" },
  SCHX: { label: "SCHX", bg: "#00A0DF", fg: "#FFFFFF", issuer: "Schwab" },
  SCHA: { label: "SCHA", bg: "#00A0DF", fg: "#FFFFFF", issuer: "Schwab" },
  SCHF: { label: "SCHF", bg: "#00A0DF", fg: "#FFFFFF", issuer: "Schwab" },
  SCHE: { label: "SCHE", bg: "#00A0DF", fg: "#FFFFFF", issuer: "Schwab" },
  SCHZ: { label: "SCHZ", bg: "#00A0DF", fg: "#FFFFFF", issuer: "Schwab" },

  // Invesco
  QQQ: { label: "QQQ", bg: "#1B365D", fg: "#FFFFFF", issuer: "Invesco" },
  QQQM: { label: "QQQM", bg: "#1B365D", fg: "#FFFFFF", issuer: "Invesco" },

  // SPDR / State Street
  SPY: { label: "SPY", bg: "#0033A0", fg: "#FFFFFF", issuer: "SPDR" },
  SPYG: { label: "SPYG", bg: "#0033A0", fg: "#FFFFFF", issuer: "SPDR" },
  SPYV: { label: "SPYV", bg: "#0033A0", fg: "#FFFFFF", issuer: "SPDR" },
  DIA: { label: "DIA", bg: "#0033A0", fg: "#FFFFFF", issuer: "SPDR" },
  GLD: { label: "GLD", bg: "#D4AF37", fg: "#1A1A1A", issuer: "SPDR" },
  XLK: { label: "XLK", bg: "#0033A0", fg: "#FFFFFF", issuer: "SPDR" },
  XLF: { label: "XLF", bg: "#0033A0", fg: "#FFFFFF", issuer: "SPDR" },
  XLE: { label: "XLE", bg: "#0033A0", fg: "#FFFFFF", issuer: "SPDR" },

  // iShares / BlackRock
  IVV: { label: "IVV", bg: "#111111", fg: "#FFFFFF", issuer: "iShares" },
  IWM: { label: "IWM", bg: "#111111", fg: "#FFFFFF", issuer: "iShares" },
  IJR: { label: "IJR", bg: "#111111", fg: "#FFFFFF", issuer: "iShares" },
  IJH: { label: "IJH", bg: "#111111", fg: "#FFFFFF", issuer: "iShares" },
  EFA: { label: "EFA", bg: "#111111", fg: "#FFFFFF", issuer: "iShares" },
  EEM: { label: "EEM", bg: "#111111", fg: "#FFFFFF", issuer: "iShares" },
  AGG: { label: "AGG", bg: "#111111", fg: "#FFFFFF", issuer: "iShares" },
  TLT: { label: "TLT", bg: "#111111", fg: "#FFFFFF", issuer: "iShares" },
  IWF: { label: "IWF", bg: "#111111", fg: "#FFFFFF", issuer: "iShares" },
  IWD: { label: "IWD", bg: "#111111", fg: "#FFFFFF", issuer: "iShares" },

  // ARK
  ARKK: { label: "ARKK", bg: "#5B2C6F", fg: "#FFFFFF", issuer: "ARK" },
  ARKG: { label: "ARKG", bg: "#5B2C6F", fg: "#FFFFFF", issuer: "ARK" },
  ARKW: { label: "ARKW", bg: "#5B2C6F", fg: "#FFFFFF", issuer: "ARK" },

  // Other popular
  JEPI: { label: "JEPI", bg: "#003366", fg: "#FFFFFF", issuer: "JPMorgan" },
  JEPQ: { label: "JEPQ", bg: "#003366", fg: "#FFFFFF", issuer: "JPMorgan" },
};

export function getEtfIcon(symbol: string): EtfIconMeta | null {
  const key = symbol.trim().toUpperCase();
  return ETF_ICON_MAP[key] ?? null;
}

const ETF_NAME_RE = /\b(etf|etn|etp|exchange[\s-]?traded(?:\s+fund)?)\b/i;
const ETF_TYPES = new Set(["ETF", "ETP", "ETN"]);

/** True for known ETF tickers (VOO, SCHD, VIG, …) or assets flagged as funds. */
export function isEtfAsset(
  symbol: string,
  extra?: { name?: string | null; type?: string | null }
): boolean {
  if (getEtfIcon(symbol)) return true;
  const type = extra?.type?.trim().toUpperCase() ?? "";
  if (ETF_TYPES.has(type)) return true;
  return ETF_NAME_RE.test(`${symbol} ${extra?.name ?? ""}`);
}
