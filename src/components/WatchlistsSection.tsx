import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Loader2,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addWatchlistItem,
  createWatchlist,
  deleteWatchlist,
  deleteWatchlistItem,
  fetchWatchlists,
  getApiBaseUrl,
  getStoredUser,
  readWatchlistCache,
  writeWatchlistCache,
  type WatchlistApiItem,
  type WatchlistApiList,
} from "../lib/auth";
import { privacyMoney } from "../lib/privacy";
import { readLocalItem } from "../lib/storage";
import StockLogo from "./StockLogo";

const GAIN_GREEN = "#10B981";
const LOSS_RED = "#EF4444";
const SEARCH_DEBOUNCE_MS = 350;
const API_BASE_URL = getApiBaseUrl();

type StockSearchResult = {
  symbol: string;
  displaySymbol: string;
  description: string;
  type: string;
};

type LiveQuote = {
  price: number;
  changePct: number;
  name?: string;
  logo?: string;
  domain?: string;
};

export type WatchlistStockPick = {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  logo?: string;
  domain?: string;
};

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

const KNOWN_NAMES: Record<string, string> = {
  AAPL: "Apple Inc.",
  MSFT: "Microsoft Corporation",
  NVDA: "NVIDIA Corporation",
  TSLA: "Tesla, Inc.",
  AMZN: "Amazon.com, Inc.",
  GOOGL: "Alphabet Inc.",
  GOOG: "Alphabet Inc.",
  META: "Meta Platforms, Inc.",
  AMD: "Advanced Micro Devices",
  NFLX: "Netflix, Inc.",
  SPY: "SPDR S&P 500 ETF",
  QQQ: "Invesco QQQ Trust",
  VOO: "Vanguard S&P 500 ETF",
  VTI: "Vanguard Total Stock Market",
  JPM: "JPMorgan Chase & Co.",
  V: "Visa Inc.",
  MA: "Mastercard Inc.",
  COST: "Costco Wholesale",
  AVGO: "Broadcom Inc.",
  "BRK.B": "Berkshire Hathaway",
};

function localId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}

function activeListStorageKey() {
  const user = getStoredUser();
  return `sprout_active_watchlist_${user?.id ?? "anon"}`;
}

function activeListLegacyKey() {
  const user = getStoredUser();
  return `matterpro_active_watchlist_${user?.id ?? "anon"}`;
}

function mockLiveQuote(symbol: string): LiveQuote {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const price = 12 + (Math.abs(h) % 620) + (Math.abs(h >> 8) % 100) / 100;
  const changePct = ((Math.abs(h >> 4) % 900) / 100) - 4.5;
  return {
    price: Math.round(price * 100) / 100,
    changePct: Math.round(changePct * 100) / 100,
    name: KNOWN_NAMES[symbol],
  };
}

function companyName(item: WatchlistApiItem, quote?: LiveQuote) {
  return item.name || quote?.name || KNOWN_NAMES[item.symbol] || item.symbol;
}

function persistLists(lists: WatchlistApiList[]) {
  writeWatchlistCache(lists);
  return lists;
}

function stockCountLabel(count: number) {
  return count === 1 ? "1 stock" : `${count} stocks`;
}

function WatchlistCard({
  list,
  quotes,
  expanded,
  onToggle,
  onAddTicker,
  onRemoveTicker,
  onDeleteList,
  onSelectStock,
  adding,
  removingItemId,
  deletingList,
  privacyMode,
}: {
  list: WatchlistApiList;
  quotes: Record<string, LiveQuote>;
  expanded: boolean;
  onToggle: () => void;
  onAddTicker: (list: WatchlistApiList, symbol: string, description?: string) => Promise<void>;
  onRemoveTicker: (list: WatchlistApiList, item: WatchlistApiItem) => Promise<void>;
  onDeleteList: (list: WatchlistApiList) => Promise<void>;
  onSelectStock?: (pick: WatchlistStockPick) => void;
  adding: boolean;
  removingItemId: string | null;
  deletingList: boolean;
  privacyMode: boolean;
}) {
  const [tickerQuery, setTickerQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const panelId = `watchlist-panel-${list.id}`;

  useEffect(() => {
    const query = tickerQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/stocks/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("search failed");
        const data: StockSearchResult[] = await res.json();
        const primary = data.filter((r) => !r.symbol.includes("."));
        setSearchResults((primary.length > 0 ? primary : data).slice(0, 6));
      } catch (err) {
        if ((err as Error).name !== "AbortError") setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [tickerQuery]);

  useEffect(() => {
    if (!expanded) {
      setConfirmDelete(false);
      setAddError(null);
    }
  }, [expanded]);

  const submitTicker = (e: React.FormEvent) => {
    e.preventDefault();
    const top = searchResults[0];
    void (async () => {
      try {
        setAddError(null);
        await onAddTicker(list, top?.displaySymbol || top?.symbol || tickerQuery, top?.description);
        setTickerQuery("");
        setSearchResults([]);
      } catch (err) {
        setAddError(err instanceof Error ? err.message : "Couldn't add ticker");
      }
    })();
  };

  return (
    <article className={`rounded-2xl border border-[#1F2937] bg-[#0A0A0A] ${expanded ? "overflow-visible" : "overflow-hidden"}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-white/[0.03]"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{list.name}</p>
        </div>
        <span className="flex-shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-extrabold tabular-nums text-emerald-300">
          {stockCountLabel(list.items.length)}
        </span>
        {expanded ? (
          <ChevronUp size={16} className="flex-shrink-0 text-[#9CA3AF]" />
        ) : (
          <ChevronDown size={16} className="flex-shrink-0 text-[#9CA3AF]" />
        )}
      </button>

      <div
        id={panelId}
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className={`min-h-0 ${expanded ? "overflow-visible" : "overflow-hidden"}`}>
          <div className="border-t border-[#1F2937] px-3 pb-3 pt-2">
            <form onSubmit={submitTicker} className="relative">
              <div className="flex items-center gap-2 rounded-xl border border-[#1F2937] bg-black/30 px-3 py-2 focus-within:border-emerald-500/50">
                {searchLoading || adding ? (
                  <Loader2 size={14} className="flex-shrink-0 animate-spin text-slate-500" />
                ) : (
                  <Search size={14} className="flex-shrink-0 text-slate-500" />
                )}
                <input
                  type="text"
                  value={tickerQuery}
                  onChange={(e) => {
                    setTickerQuery(e.target.value.toUpperCase());
                    setAddError(null);
                  }}
                  placeholder="Add ticker (AAPL, NVDA, TSLA)"
                  autoComplete="off"
                  className="w-full bg-transparent text-xs font-semibold uppercase tracking-wide text-white outline-none placeholder:text-slate-600 placeholder:normal-case placeholder:tracking-normal"
                />
                <button
                  type="submit"
                  disabled={adding || !tickerQuery.trim()}
                  className="flex-shrink-0 rounded-lg bg-[#10B981] px-2 py-1 text-[10px] font-extrabold text-[#042F2E] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Add
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="absolute z-10 mt-1.5 w-full overflow-hidden rounded-xl border border-[#1F2937] bg-[#0A0A0A]">
                  {searchResults.map((result) => {
                    const symbol = result.displaySymbol || result.symbol;
                    return (
                      <button
                        key={result.symbol}
                        type="button"
                        onClick={() => {
                          void (async () => {
                            try {
                              setAddError(null);
                              await onAddTicker(list, symbol, result.description);
                              setTickerQuery("");
                              setSearchResults([]);
                            } catch (err) {
                              setAddError(err instanceof Error ? err.message : "Couldn't add ticker");
                            }
                          })();
                        }}
                        className="flex w-full items-center justify-between gap-2 border-b border-[#1F2937]/60 px-3 py-2 text-left last:border-b-0 hover:bg-emerald-500/10"
                      >
                        <StockLogo symbol={symbol} size={32} />
                        <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-300">
                          {symbol}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{result.description}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </form>

            {addError && <p className="mt-1.5 text-[11px] font-semibold text-rose-300">{addError}</p>}

            <div className="mt-2 divide-y divide-[#1F2937]">
              {list.items.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-[#6B7280]">
                  This list is empty. Add a ticker to start tracking it.
                </p>
              ) : (
                list.items.map((item) => {
                  const quote = quotes[item.symbol] ?? mockLiveQuote(item.symbol);
                  const up = quote.changePct > 0;
                  const down = quote.changePct < 0;
                  const changeColor = down ? LOSS_RED : up ? GAIN_GREEN : "#9CA3AF";
                  return (
                    <div key={item.id} className="flex items-center gap-2 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectStock?.({
                            symbol: item.symbol,
                            name: companyName(item, quote),
                            price: quote.price,
                            changePct: quote.changePct,
                            logo: quote.logo,
                            domain: quote.domain,
                          })
                        }
                        className="flex min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-90 active:scale-[0.995]"
                      >
                        <StockLogo
                          symbol={item.symbol}
                          finnhubLogo={quote.logo}
                          domain={quote.domain}
                          size={40}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">{item.symbol}</p>
                          <p className="truncate text-[11px] text-[#9CA3AF]">{companyName(item, quote)}</p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className="text-sm font-bold tabular-nums text-white">{privacyMoney(privacyMode, quote.price)}</p>
                          <p className="text-[11px] font-bold tabular-nums" style={{ color: changeColor }}>
                            {up ? "+" : ""}
                            {quote.changePct.toFixed(2)}%
                          </p>
                        </div>
                        <ChevronRight size={14} className="flex-shrink-0 text-[#9CA3AF]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void onRemoveTicker(list, item)}
                        disabled={removingItemId === item.id}
                        aria-label={`Remove ${item.symbol}`}
                        className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-[#6B7280] transition hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        {removingItemId === item.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <X size={14} />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-2">
              {confirmDelete ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                  <p className="text-[11px] font-semibold text-rose-200">Delete &quot;{list.name}&quot;?</p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => void onDeleteList(list)}
                      disabled={deletingList}
                      className="rounded-lg bg-rose-500 px-2.5 py-1 text-[10px] font-extrabold text-white"
                    >
                      {deletingList ? "Deleting…" : "Delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-lg px-2.5 py-1 text-[10px] font-bold text-[#9CA3AF]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[#6B7280] transition hover:text-rose-300"
                >
                  <Trash2 size={12} />
                  Delete list
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function WatchlistsSection({
  onSelectStock,
  privacyMode = false,
}: {
  onSelectStock?: (pick: WatchlistStockPick) => void;
  privacyMode?: boolean;
}) {
  const [lists, setLists] = useState<WatchlistApiList[]>(() => readWatchlistCache());
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return readLocalItem(activeListStorageKey(), activeListLegacyKey());
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);

  const [adding, setAdding] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [deletingList, setDeletingList] = useState(false);

  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [openListIds, setOpenListIds] = useState<string[]>(() => {
    try {
      const stored = readLocalItem(activeListStorageKey(), activeListLegacyKey());
      return stored ? [stored] : [];
    } catch {
      return [];
    }
  });

  const activeList = useMemo(
    () => lists.find((list) => list.id === activeId) ?? lists[0] ?? null,
    [lists, activeId]
  );

  useEffect(() => {
    if (!activeList) return;
    if (activeId !== activeList.id) setActiveId(activeList.id);
    try {
      localStorage.setItem(activeListStorageKey(), activeList.id);
    } catch {
      // ignore
    }
  }, [activeList, activeId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchWatchlists();
        if (!cancelled) setLists(next);
      } catch (err) {
        if (!cancelled) {
          const cached = readWatchlistCache();
          setLists(cached);
          if (cached.length === 0) {
            setError(err instanceof Error ? err.message : "Couldn't load watchlists");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const allSymbolsKey = useMemo(
    () =>
      Array.from(new Set(lists.flatMap((list) => list.items.map((item) => item.symbol))))
        .sort()
        .join(","),
    [lists]
  );

  useEffect(() => {
    const symbols = allSymbolsKey ? allSymbolsKey.split(",") : [];
    if (symbols.length === 0) return;

    let cancelled = false;

    symbols.forEach((symbol) => {
      const mock = mockLiveQuote(symbol);
      setQuotes((prev) => (prev[symbol] ? prev : { ...prev, [symbol]: mock }));

      (async () => {
        try {
          const [quoteRes, profileRes] = await Promise.allSettled([
            fetch(`${API_BASE_URL}/api/stocks/quote?symbol=${encodeURIComponent(symbol)}`).then((r) => {
              if (!r.ok) throw new Error("quote failed");
              return r.json() as Promise<{ c: number; dp: number }>;
            }),
            fetch(`${API_BASE_URL}/api/stocks/profile?symbol=${encodeURIComponent(symbol)}`).then((r) => {
              if (!r.ok) throw new Error("profile failed");
              return r.json() as Promise<{ name?: string; logo?: string; weburl?: string }>;
            }),
          ]);

          if (cancelled) return;

          const live: LiveQuote = { ...mock };
          if (quoteRes.status === "fulfilled" && quoteRes.value.c > 0) {
            live.price = quoteRes.value.c;
            live.changePct = quoteRes.value.dp ?? mock.changePct;
          }
          if (profileRes.status === "fulfilled") {
            if (profileRes.value.name) live.name = profileRes.value.name;
            if (profileRes.value.logo) live.logo = profileRes.value.logo;
            const domain = extractDomain(profileRes.value.weburl);
            if (domain) live.domain = domain;
          }
          setQuotes((prev) => ({ ...prev, [symbol]: live }));
        } catch {
          // keep the seeded mock quote
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [allSymbolsKey]);

  const updateLists = (next: WatchlistApiList[]) => {
    setLists(persistLists(next));
  };

  const submitCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = createName.trim().replace(/\s+/g, " ").slice(0, 48);
    if (!name || creating) return;

    setCreating(true);
    setError(null);
    try {
      const created = await createWatchlist(name);
      updateLists([...lists, created]);
      setActiveId(created.id);
      setOpenListIds((ids) => (ids.includes(created.id) ? ids : [...ids, created.id]));
      setCreateName("");
      setCreateOpen(false);
    } catch {
      const created: WatchlistApiList = {
        id: localId("list"),
        userId: getStoredUser()?.id ?? "local",
        name,
        createdAt: new Date().toISOString(),
        items: [],
      };
      updateLists([...lists, created]);
      setActiveId(created.id);
      setOpenListIds((ids) => (ids.includes(created.id) ? ids : [...ids, created.id]));
      setCreateName("");
      setCreateOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const addTicker = async (targetList: WatchlistApiList, symbolRaw: string, description?: string) => {
    if (adding) return;
    const symbol = symbolRaw.trim().toUpperCase().replace(/[^A-Z0-9.]/g, "");
    if (!symbol) {
      throw new Error("Enter a ticker symbol");
    }
    const latest = lists.find((list) => list.id === targetList.id) ?? targetList;
    if (latest.items.some((item) => item.symbol === symbol)) {
      throw new Error(`${symbol} is already in this list`);
    }

    const name = description || KNOWN_NAMES[symbol] || symbol;
    setAdding(true);
    setActiveId(targetList.id);
    try {
      const saved = await addWatchlistItem({ watchlistId: targetList.id, symbol, name });
      updateLists(
        lists.map((list) =>
          list.id === targetList.id ? { ...list, items: [...list.items, saved] } : list
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't add ticker";
      if (/already/i.test(message)) {
        throw new Error(message);
      }
      const saved: WatchlistApiItem = {
        id: localId("item"),
        watchlistId: targetList.id,
        symbol,
        name,
        createdAt: new Date().toISOString(),
      };
      updateLists(
        lists.map((list) =>
          list.id === targetList.id ? { ...list, items: [...list.items, saved] } : list
        )
      );
    } finally {
      setAdding(false);
    }
  };

  const removeTicker = async (targetList: WatchlistApiList, item: WatchlistApiItem) => {
    if (removingItemId) return;
    setRemovingItemId(item.id);
    try {
      await deleteWatchlistItem(targetList.id, item.id);
    } catch {
      // still remove locally if the API is unavailable
    }
    updateLists(
      lists.map((list) =>
        list.id === targetList.id
          ? { ...list, items: list.items.filter((row) => row.id !== item.id) }
          : list
      )
    );
    setRemovingItemId(null);
  };

  const removeList = async (targetList: WatchlistApiList) => {
    if (deletingList) return;
    setDeletingList(true);
    try {
      await deleteWatchlist(targetList.id);
    } catch {
      // still delete locally if the API is unavailable
    }
    const remaining = lists.filter((list) => list.id !== targetList.id);
    updateLists(remaining);
    setOpenListIds((ids) => ids.filter((id) => id !== targetList.id));
    setActiveId(remaining[0]?.id ?? null);
    setDeletingList(false);
  };

  const toggleListOpen = (listId: string) => {
    setOpenListIds((ids) => (ids.includes(listId) ? ids.filter((id) => id !== listId) : [...ids, listId]));
    setActiveId(listId);
  };

  const totalItems = useMemo(
    () => lists.reduce((sum, list) => sum + list.items.length, 0),
    [lists]
  );

  const seededOpenLists = useRef(false);

  useEffect(() => {
    if (lists.length === 0) return;
    setOpenListIds((ids) => {
      const valid = ids.filter((id) => lists.some((list) => list.id === id));
      if (valid.length > 0) {
        seededOpenLists.current = true;
        const unchanged = valid.length === ids.length && valid.every((id, i) => id === ids[i]);
        return unchanged ? ids : valid;
      }
      if (!seededOpenLists.current) {
        seededOpenLists.current = true;
        return [lists[0].id];
      }
      return valid;
    });
  }, [lists]);

  return (
    <section>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 py-1">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <Star size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-extrabold leading-snug tracking-tight text-white">
              Watchlists
            </h2>
            <p className="text-[12px] font-medium italic leading-snug text-[#9CA3AF]">
              Saved assets to follow
            </p>
          </div>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-extrabold tabular-nums text-emerald-300">
            {totalItems}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateOpen(true);
          }}
          className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 transition hover:border-emerald-500/60 hover:bg-emerald-500/15"
        >
          <Plus size={12} />
          Create List
        </button>
      </div>

      <div id="watchlists-panel">

      {loading && lists.length === 0 && (
        <p className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-[#9CA3AF]">
          <Loader2 size={13} className="animate-spin text-emerald-400" />
          Loading watchlists…
        </p>
      )}

      {error && lists.length === 0 && (
        <p className="mt-3 text-[11px] font-semibold text-rose-300">{error}</p>
      )}

      {createOpen && (
        <form onSubmit={submitCreateList} className="mt-3 rounded-xl border border-[#1F2937] bg-[#0A0A0A] p-3">
          <label htmlFor="watchlist-name" className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            List name
          </label>
          <input
            id="watchlist-name"
            type="text"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder='e.g. Tech Growth, Dividend Candidates'
            autoFocus
            maxLength={48}
            className="mt-1.5 w-full rounded-xl border border-[#1F2937] bg-black/40 px-3 py-2 text-xs font-semibold text-white outline-none placeholder:text-slate-600 focus:border-emerald-500/50"
          />
          <div className="mt-2.5 flex gap-2">
            <button
              type="submit"
              disabled={!createName.trim() || creating}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                createName.trim() && !creating
                  ? "bg-[#10B981] text-[#042F2E] hover:bg-emerald-400"
                  : "cursor-not-allowed bg-black/30 text-slate-600"
              }`}
            >
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateOpen(false);
                setCreateName("");
              }}
              className="rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] px-3 py-2 text-xs font-bold text-[#9CA3AF] transition hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {lists.length === 0 && !loading && !createOpen && (
        <div className="mt-3 rounded-2xl border border-dashed border-[#1F2937] bg-black/20 px-4 py-6 text-center">
          <p className="text-sm font-bold text-white">No watchlists yet</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#9CA3AF]">
            Create a list like &quot;Tech Growth&quot; or &quot;Dividend Candidates&quot; and add tickers to follow.
          </p>
        </div>
      )}

      {lists.length > 0 && (
        <div className="mt-3 space-y-2">
          {lists.map((list) => (
            <WatchlistCard
              key={list.id}
              list={list}
              quotes={quotes}
              expanded={openListIds.includes(list.id)}
              onToggle={() => toggleListOpen(list.id)}
              onAddTicker={addTicker}
              onRemoveTicker={removeTicker}
              onDeleteList={removeList}
              onSelectStock={onSelectStock}
              adding={adding}
              removingItemId={removingItemId}
              deletingList={deletingList}
              privacyMode={privacyMode}
            />
          ))}
        </div>
      )}
      </div>
    </section>
  );
}
