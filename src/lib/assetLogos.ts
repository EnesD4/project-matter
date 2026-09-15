/**
 * High-res logo sources + instant SVG fallbacks for stocks, ETFs, and crypto.
 * Remote URLs are best-effort; callers must keep a local glyph visible until load.
 */

export type CryptoLogoMeta = {
  slug: string;
  name: string;
  color: string;
};

/** Well-known ticker → company domain, used for Clearbit / Google when no profile is loaded. */
export const TICKER_DOMAINS: Record<string, string> = {
  AAPL: "apple.com",
  MSFT: "microsoft.com",
  NVDA: "nvidia.com",
  TSLA: "tesla.com",
  AMZN: "amazon.com",
  GOOGL: "google.com",
  GOOG: "google.com",
  META: "meta.com",
  AMD: "amd.com",
  NFLX: "netflix.com",
  JPM: "jpmorganchase.com",
  V: "visa.com",
  MA: "mastercard.com",
  COST: "costco.com",
  AVGO: "broadcom.com",
  "BRK.B": "berkshirehathaway.com",
  "BRK.A": "berkshirehathaway.com",
  DIS: "disney.com",
  INTC: "intel.com",
  PYPL: "paypal.com",
  ADBE: "adobe.com",
  CRM: "salesforce.com",
  ORCL: "oracle.com",
  CSCO: "cisco.com",
  PEP: "pepsico.com",
  KO: "coca-cola.com",
  NKE: "nike.com",
  MCD: "mcdonalds.com",
  WMT: "walmart.com",
  HD: "homedepot.com",
  BA: "boeing.com",
  UNH: "unitedhealthgroup.com",
  JNJ: "jnj.com",
  PFE: "pfizer.com",
  LLY: "lilly.com",
  XOM: "exxonmobil.com",
  CVX: "chevron.com",
  BAC: "bankofamerica.com",
  GS: "goldmansachs.com",
  WFC: "wellsfargo.com",
  AXP: "americanexpress.com",
  UBER: "uber.com",
  ABNB: "airbnb.com",
  SBUX: "starbucks.com",
  QCOM: "qualcomm.com",
  INTU: "intuit.com",
  NOW: "servicenow.com",
  SHOP: "shopify.com",
  COIN: "coinbase.com",
  PLTR: "palantir.com",
  RCAT: "redcatholdings.com",
  SOFI: "sofi.com",
  CRWD: "crowdstrike.com",
  PANW: "paloaltonetworks.com",
  F: "ford.com",
  GM: "gm.com",
  RIVN: "rivian.com",
  BABA: "alibaba.com",
  TSM: "tsmc.com",
  ASML: "asml.com",
  IBM: "ibm.com",
  GE: "ge.com",
  SNOW: "snowflake.com",
  MU: "micron.com",
  AMAT: "appliedmaterials.com",
  TXN: "ti.com",
  VOO: "vanguard.com",
  VTI: "vanguard.com",
  VUG: "vanguard.com",
  SPY: "ssga.com",
  QQQ: "invesco.com",
  QQQM: "invesco.com",
  SCHD: "schwab.com",
  IVV: "ishares.com",
  SQ: "block.xyz",
  SNAP: "snap.com",
  SPOT: "spotify.com",
  ROKU: "roku.com",
  HOOD: "robinhood.com",
  DKNG: "draftkings.com",
  RBLX: "roblox.com",
  U: "unity.com",
  NET: "cloudflare.com",
  DDOG: "datadoghq.com",
  S: "sentinelone.com",
  ZS: "zscaler.com",
  OKTA: "okta.com",
  TEAM: "atlassian.com",
  MDB: "mongodb.com",
  MELI: "mercadolibre.com",
  SE: "sea.com",
  PDD: "temu.com",
  NIO: "nio.com",
  LCID: "lucidmotors.com",
  ARM: "arm.com",
  SMCI: "supermicro.com",
  DELL: "dell.com",
  HPE: "hpe.com",
  CAT: "caterpillar.com",
  DE: "deere.com",
  HON: "honeywell.com",
  RTX: "rtx.com",
  LMT: "lockheedmartin.com",
  NOC: "northropgrumman.com",
  GD: "gd.com",
  ABBV: "abbvie.com",
  MRK: "merck.com",
  AMGN: "amgen.com",
  GILD: "gilead.com",
  BMY: "bms.com",
  TMO: "thermofisher.com",
  DHR: "danaher.com",
  ISRG: "intuitive.com",
  SYK: "stryker.com",
  MDT: "medtronic.com",
  ABT: "abbott.com",
  CVS: "cvs.com",
  CI: "cigna.com",
  ELV: "elevancehealth.com",
  T: "att.com",
  VZ: "verizon.com",
  TMUS: "t-mobile.com",
  CMCSA: "comcast.com",
  CHTR: "charter.com",
  PM: "pmi.com",
  MO: "altria.com",
  PG: "pg.com",
  CL: "colgatepalmolive.com",
  KMB: "kimberly-clark.com",
  GIS: "generalmills.com",
  K: "kellogg.com",
  MDLZ: "mondelezinternational.com",
  HSY: "hersheys.com",
  CMG: "chipotle.com",
  YUM: "yum.com",
  DPZ: "dominos.com",
  LOW: "lowes.com",
  TJX: "tjx.com",
  ROST: "rossstores.com",
  TGT: "target.com",
  DG: "dollargeneral.com",
  DLTR: "dollartree.com",
  BKNG: "booking.com",
  MAR: "marriott.com",
  HLT: "hilton.com",
  AAL: "aa.com",
  DAL: "delta.com",
  UAL: "united.com",
  LUV: "southwest.com",
  FDX: "fedex.com",
  UPS: "ups.com",
  CSX: "csx.com",
  UNP: "up.com",
  NSC: "norfolksouthern.com",
  WM: "wm.com",
  RSG: "republicservices.com",
  NEE: "nexteraenergy.com",
  DUK: "duke-energy.com",
  SO: "southerncompany.com",
  AEP: "aep.com",
  SRE: "sempra.com",
  COP: "conocophillips.com",
  EOG: "eogresources.com",
  SLB: "slb.com",
  OXY: "oxy.com",
  MPC: "marathonpetroleum.com",
  PSX: "phillips66.com",
  VLO: "valero.com",
  BLK: "blackrock.com",
  SCHW: "schwab.com",
  MS: "morganstanley.com",
  C: "citigroup.com",
  USB: "usbank.com",
  PNC: "pnc.com",
  TFC: "truist.com",
  COF: "capitalone.com",
  AIG: "aig.com",
  MET: "metlife.com",
  PRU: "prudential.com",
  SPGI: "spglobal.com",
  MCO: "moodys.com",
  ICE: "ice.com",
  CME: "cmegroup.com",
  MSCI: "msci.com",
  APH: "amphenol.com",
  KLAC: "kla.com",
  LRCX: "lamresearch.com",
  ADI: "analog.com",
  SNPS: "synopsys.com",
  CDNS: "cadence.com",
  ANET: "arista.com",
  MSI: "motorolasolutions.com",
  ADSK: "autodesk.com",
  WDAY: "workday.com",
};

const CRYPTO_ASSETS: Record<string, CryptoLogoMeta> = {
  BTC: { slug: "btc", name: "Bitcoin", color: "#F7931A" },
  ETH: { slug: "eth", name: "Ethereum", color: "#627EEA" },
  SOL: { slug: "sol", name: "Solana", color: "#9945FF" },
  XRP: { slug: "xrp", name: "XRP", color: "#23292F" },
  ADA: { slug: "ada", name: "Cardano", color: "#0033AD" },
  DOGE: { slug: "doge", name: "Dogecoin", color: "#C2A633" },
  AVAX: { slug: "avax", name: "Avalanche", color: "#E84142" },
  DOT: { slug: "dot", name: "Polkadot", color: "#E6007A" },
  LINK: { slug: "link", name: "Chainlink", color: "#2A5ADA" },
  MATIC: { slug: "matic", name: "Polygon", color: "#8247E5" },
  POL: { slug: "matic", name: "Polygon", color: "#8247E5" },
  LTC: { slug: "ltc", name: "Litecoin", color: "#345D9D" },
  BCH: { slug: "bch", name: "Bitcoin Cash", color: "#0AC18E" },
  UNI: { slug: "uni", name: "Uniswap", color: "#FF007A" },
  ATOM: { slug: "atom", name: "Cosmos", color: "#2E3148" },
  NEAR: { slug: "near", name: "NEAR", color: "#000000" },
  APT: { slug: "apt", name: "Aptos", color: "#4FE2C3" },
  ARB: { slug: "arb", name: "Arbitrum", color: "#28A0F0" },
  OP: { slug: "op", name: "Optimism", color: "#FF0420" },
  SUI: { slug: "sui", name: "Sui", color: "#4DA2FF" },
  TON: { slug: "ton", name: "Toncoin", color: "#0098EA" },
  SHIB: { slug: "shib", name: "Shiba Inu", color: "#FFA409" },
  PEPE: { slug: "pepe", name: "Pepe", color: "#3D9B35" },
  TRX: { slug: "trx", name: "TRON", color: "#FF0013" },
  XLM: { slug: "xlm", name: "Stellar", color: "#14B6E7" },
  FIL: { slug: "fil", name: "Filecoin", color: "#0090FF" },
  ICP: { slug: "icp", name: "Internet Computer", color: "#29ABE2" },
  HBAR: { slug: "hbar", name: "Hedera", color: "#000000" },
  ALGO: { slug: "algo", name: "Algorand", color: "#000000" },
  AAVE: { slug: "aave", name: "Aave", color: "#B6509E" },
  MKR: { slug: "mkr", name: "Maker", color: "#1AAB9B" },
  LDO: { slug: "ldo", name: "Lido", color: "#00A3FF" },
  RENDER: { slug: "rndr", name: "Render", color: "#000000" },
  RNDR: { slug: "rndr", name: "Render", color: "#000000" },
  INJ: { slug: "inj", name: "Injective", color: "#00F2FE" },
  TIA: { slug: "tia", name: "Celestia", color: "#7B2BF9" },
  SEI: { slug: "sei", name: "Sei", color: "#9B1C1C" },
  STX: { slug: "stx", name: "Stacks", color: "#5546FF" },
  IMX: { slug: "imx", name: "Immutable", color: "#17B5CB" },
  GRT: { slug: "grt", name: "The Graph", color: "#6747ED" },
  FET: { slug: "fet", name: "Fetch.ai", color: "#1C2C50" },
  TAO: { slug: "tao", name: "Bittensor", color: "#18C8A5" },
  WIF: { slug: "wif", name: "dogwifhat", color: "#E8A838" },
  BONK: { slug: "bonk", name: "Bonk", color: "#F5A623" },
};

const QUOTE_SUFFIX = /(?:[-_/])?(USD[TC]?|EUR|GBP)$/i;

export function normalizeTicker(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/** BTC-USD / ETH/USDT → BTC / ETH for logo + glyph lookup. */
export function baseAssetSymbol(symbol: string): string {
  return normalizeTicker(symbol).replace(QUOTE_SUFFIX, "");
}

export function getCryptoAsset(symbol: string): CryptoLogoMeta | null {
  const ticker = normalizeTicker(symbol);
  return CRYPTO_ASSETS[ticker] ?? CRYPTO_ASSETS[baseAssetSymbol(ticker)] ?? null;
}

export function extractWebsiteDomain(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    const host = url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    return host || undefined;
  }
}

export function resolveLogoDomain(symbol: string, domain?: string | null): string {
  const ticker = normalizeTicker(symbol);
  const raw = (domain || TICKER_DOMAINS[ticker] || TICKER_DOMAINS[baseAssetSymbol(ticker)] || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  return raw;
}

/** Clearbit Logo API — `https://logo.clearbit.com/{domain}`. */
export function clearbitLogoUrl(domain: string, size = 256): string {
  const host = extractWebsiteDomain(domain) || domain.trim();
  return `https://logo.clearbit.com/${encodeURIComponent(host)}${size ? `?size=${size}` : ""}`;
}

export function tickerInitials(symbol: string): string {
  const letters = baseAssetSymbol(symbol).replace(/[^A-Z0-9]/gi, "");
  if (!letters) return normalizeTicker(symbol).slice(0, 2);
  if (letters.length <= 4) return letters;
  return letters.slice(0, 2);
}

/**
 * High-resolution PNG candidates. Clearbit is first for equities and issuers;
 * crypto uses dedicated coin-icon packs. Callers keep a local initials glyph
 * visible until a remote logo loads.
 */
export function logoSources(
  symbol: string,
  finnhubLogo?: string | null,
  domain?: string | null
): string[] {
  const ticker = normalizeTicker(symbol);
  const yahooTicker = ticker.replace(/\./g, "-");
  const crypto = getCryptoAsset(ticker);
  const resolvedDomain = resolveLogoDomain(ticker, domain);

  const urls: Array<string | null | undefined> = [];

  if (crypto) {
    urls.push(
      `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${crypto.slug}.png`,
      `https://assets.coincap.io/assets/icons/${crypto.slug}@2x.png`
    );
  }

  if (resolvedDomain) urls.push(clearbitLogoUrl(resolvedDomain, 256));
  if (finnhubLogo) urls.push(finnhubLogo);

  if (!crypto) {
    urls.push(
      `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker)}.png`,
      `https://images.financialmodelingprep.com/symbol/${encodeURIComponent(ticker)}.png`,
      `https://storage.googleapis.com/iex/api/logos/${encodeURIComponent(yahooTicker)}.png`,
      `https://assets.parqet.com/logos/symbol/${encodeURIComponent(ticker)}`
    );
  }

  if (resolvedDomain) {
    urls.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(resolvedDomain)}&sz=256`);
  }

  return [...new Set(urls.filter((url): url is string => Boolean(url)))];
}
