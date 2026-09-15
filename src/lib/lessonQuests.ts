import type { PhaseId } from "./lessons";

export type PracticalQuestDef = {
  id: string;
  moduleId: string;
  title: string;
  blurb: string;
  /** CTA button label, e.g. "Execute Quest: Add a $50/mo …" */
  actionLabel: string;
  kind: "paper-trade" | "checklist";
  symbol?: string;
  description?: string;
  /** Simulated monthly DCA amount for paper trading / impact preview */
  monthlyAmount?: number;
  years?: number;
  annualReturn?: number;
};

export type AiScenarioOption = {
  id: string;
  label: string;
  /** Short philosophy tag used for local fallback feedback */
  stance: "hold" | "buy-dip" | "sell" | "rebalance" | "speculate" | "plan";
};

export type AiScenarioDef = {
  id: string;
  moduleId: string;
  scenario: string;
  question: string;
  options: AiScenarioOption[];
  /** Philosophies Sprout should ground feedback in */
  philosophies: string[];
};

const DEFAULT_RETURN = 0.07;

export const LESSON_QUESTS: Record<string, PracticalQuestDef> = {
  "debt-battles": {
    id: "quest-debt-battles",
    moduleId: "debt-battles",
    title: "Practical Quest",
    blurb: "List your real debts and mark one Avalanche target (highest APR) or Snowball target (smallest balance).",
    actionLabel: "Mark quest done — I've named my first target",
    kind: "checklist",
  },
  "rule-503020": {
    id: "quest-rule-503020",
    moduleId: "rule-503020",
    title: "Practical Quest",
    blurb: "Write last month's take-home and circle which bucket (needs / wants / save) ran over.",
    actionLabel: "Mark quest done — I've mapped my 50/30/20",
    kind: "checklist",
  },
  "emergency-fund": {
    id: "quest-emergency-fund",
    moduleId: "emergency-fund",
    title: "Practical Quest",
    blurb: "Note a HYSA and set a starter shield: essentials × 3.",
    actionLabel: "Mark quest done — shield target written",
    kind: "checklist",
  },
  "cash-flow-budget": {
    id: "quest-cash-flow-budget",
    moduleId: "cash-flow-budget",
    title: "Practical Quest",
    blurb: "Plug three money leaks this week and route the recovered cash to your 20% bucket.",
    actionLabel: "Mark quest done — three leaks named",
    kind: "checklist",
  },
  compound: {
    id: "quest-compound",
    moduleId: "compound",
    title: "Practical Quest",
    blurb: "Automate a small monthly habit in Paper Trading so you can see compounding in motion.",
    actionLabel: "Execute Quest: Add a $50/mo simulated allocation to VOO in Paper Trading",
    kind: "paper-trade",
    symbol: "VOO",
    description: "Vanguard S&P 500 ETF",
    monthlyAmount: 50,
    years: 20,
    annualReturn: DEFAULT_RETURN,
  },
  "match-401k": {
    id: "quest-match-401k",
    moduleId: "match-401k",
    title: "Practical Quest",
    blurb: "Check your plan's match cap and contribute at least that far — then practice the surplus in paper.",
    actionLabel: "Execute Quest: Paper-allocate $100 toward a broad index (VOO)",
    kind: "paper-trade",
    symbol: "VOO",
    description: "Vanguard S&P 500 ETF",
    monthlyAmount: 100,
    years: 15,
    annualReturn: DEFAULT_RETURN,
  },
  "roth-vs-trad": {
    id: "quest-roth-vs-trad",
    moduleId: "roth-vs-trad",
    title: "Practical Quest",
    blurb: "Write your federal bracket and whether you expect it higher or lower later — that tilts Roth vs Traditional.",
    actionLabel: "Mark quest done — bracket note saved",
    kind: "checklist",
  },
  hsa: {
    id: "quest-hsa",
    moduleId: "hsa",
    title: "Practical Quest",
    blurb: "If you're on an HDHP, note this year's HSA limit and whether the balance can be invested.",
    actionLabel: "Mark quest done — HSA limit checked",
    kind: "checklist",
  },
  equities: {
    id: "quest-equities",
    moduleId: "equities",
    title: "Practical Quest",
    blurb: "Practice ownership: add one familiar company to Paper Trading with a tiny simulated lot.",
    actionLabel: "Execute Quest: Open Paper Trading and add a $50 practice lot",
    kind: "paper-trade",
    symbol: "AAPL",
    description: "Apple Inc.",
    monthlyAmount: 50,
    years: 10,
    annualReturn: DEFAULT_RETURN,
  },
  etfs: {
    id: "quest-etfs",
    moduleId: "etfs",
    title: "Practical Quest",
    blurb: "Put the lesson to work: simulate a recurring $50/mo buy of a low-fee S&P 500 ETF.",
    actionLabel: "Execute Quest: Add a $50/mo simulated allocation to VOO in Paper Trading",
    kind: "paper-trade",
    symbol: "VOO",
    description: "Vanguard S&P 500 ETF",
    monthlyAmount: 50,
    years: 20,
    annualReturn: DEFAULT_RETURN,
  },
  "tbills-bonds": {
    id: "quest-tbills-bonds",
    moduleId: "tbills-bonds",
    title: "Practical Quest",
    blurb: "Note today's 3-month T-bill yield or your HYSA APY — your risk-free-ish yardstick.",
    actionLabel: "Mark quest done — yield yardstick noted",
    kind: "checklist",
  },
  "balance-sheet": {
    id: "quest-balance-sheet",
    moduleId: "balance-sheet",
    title: "Practical Quest",
    blurb: "On any stock page, find Assets, Liabilities, and Equity and confirm A = L + E.",
    actionLabel: "Mark quest done — equation checked",
    kind: "checklist",
  },
  "income-statement": {
    id: "quest-income-statement",
    moduleId: "income-statement",
    title: "Practical Quest",
    blurb: "Pick a company and write Revenue, Net Income, and Net Margin for the last full year.",
    actionLabel: "Mark quest done — margin noted",
    kind: "checklist",
  },
  "pe-eps": {
    id: "quest-pe-eps",
    moduleId: "pe-eps",
    title: "Practical Quest",
    blurb: "Look up one stock's price, EPS, and P/E. Note whether it's above or below 20× and why that might be fair.",
    actionLabel: "Mark quest done — P/E context written",
    kind: "checklist",
  },
  "fcf-dividends": {
    id: "quest-fcf-dividends",
    moduleId: "fcf-dividends",
    title: "Practical Quest",
    blurb: "On a dividend name, compare annual dividends to free cash flow. Is payout under 100%?",
    actionLabel: "Mark quest done — coverage checked",
    kind: "checklist",
  },
  dca: {
    id: "quest-dca",
    moduleId: "dca",
    title: "Practical Quest",
    blurb: "Turn DCA into a paper habit: schedule the same dollar amount into the same fund.",
    actionLabel: "Execute Quest: Add a $75/mo simulated DCA to VOO in Paper Trading",
    kind: "paper-trade",
    symbol: "VOO",
    description: "Vanguard S&P 500 ETF",
    monthlyAmount: 75,
    years: 20,
    annualReturn: DEFAULT_RETURN,
  },
  allocation: {
    id: "quest-allocation",
    moduleId: "allocation",
    title: "Practical Quest",
    blurb: "Write your core % (60–80) and list every individual stock's weight. Circle any name over 10%.",
    actionLabel: "Execute Quest: Seed a paper core with $100 of VTI",
    kind: "paper-trade",
    symbol: "VTI",
    description: "Vanguard Total Stock Market ETF",
    monthlyAmount: 100,
    years: 15,
    annualReturn: DEFAULT_RETURN,
  },
  "fomo-panic": {
    id: "quest-fomo-panic",
    moduleId: "fomo-panic",
    title: "Practical Quest",
    blurb: "Write one crash rule: 'If my index fund drops 20%, I will ___.' Stick it on the plan.",
    actionLabel: "Mark quest done — crash rule written",
    kind: "checklist",
  },
};

export const LESSON_SCENARIOS: Record<string, AiScenarioDef> = {
  "debt-battles": {
    id: "scenario-debt-battles",
    moduleId: "debt-battles",
    scenario:
      "You have a $2,400 card at 22% APR and a $9,000 student loan at 5%. You found an extra $200 this month.",
    question: "Where should the extra $200 go first?",
    philosophies: ["Avalanche vs Snowball", "opportunity cost of high-APR debt"],
    options: [
      { id: "a", label: "Throw it at the 22% card (Avalanche)", stance: "plan" },
      { id: "b", label: "Split it evenly across both debts", stance: "rebalance" },
      { id: "c", label: "Buy a hot stock so the debt 'pays itself'", stance: "speculate" },
    ],
  },
  "rule-503020": {
    id: "scenario-rule-503020",
    moduleId: "rule-503020",
    scenario: "Take-home is $5,000. Needs already run $2,800. A friend says 'just invest more.'",
    question: "What's the plan-aligned move?",
    philosophies: ["50/30/20 allocation", "pay yourself first"],
    options: [
      { id: "a", label: "Trim wants first, protect a 20% save/debt slice", stance: "plan" },
      { id: "b", label: "Ignore the map and max a brokerage account", stance: "speculate" },
      { id: "c", label: "Cut rent overnight to hit exactly 50%", stance: "sell" },
    ],
  },
  "emergency-fund": {
    id: "scenario-emergency-fund",
    moduleId: "emergency-fund",
    scenario: "Your essentials are $2,500/mo. You have $1,000 in checking and a bonus of $3,000.",
    question: "Best use of the bonus right now?",
    philosophies: ["liquidity before speculation", "HYSA as a shield"],
    options: [
      { id: "a", label: "Park most of it in a HYSA toward 3 months of essentials", stance: "plan" },
      { id: "b", label: "Put all $3,000 into a meme stock", stance: "speculate" },
      { id: "c", label: "Leave it in checking forever — yield doesn't matter", stance: "hold" },
    ],
  },
  "cash-flow-budget": {
    id: "scenario-cash-flow-budget",
    moduleId: "cash-flow-budget",
    scenario:
      "Inflow $4,200, outflow $4,100. An audit finds $160/mo in unused subscriptions and delivery fees.",
    question: "First cash-flow move?",
    philosophies: ["plug leaks before investing", "surplus allocation"],
    options: [
      { id: "a", label: "Plug the leaks and route recovered cash to save/debt", stance: "plan" },
      { id: "b", label: "Ignore leaks and day-trade the $100 leftover", stance: "speculate" },
      { id: "c", label: "Take on a new car payment to 'feel motivated'", stance: "sell" },
    ],
  },
  compound: {
    id: "scenario-compound",
    moduleId: "compound",
    scenario: "Two friends: one invests $150/mo for 25 years; the other waits and plans $400/mo for 8 years.",
    question: "Which story usually builds the larger pile at the same return?",
    philosophies: ["time in the market", "compound interest"],
    options: [
      { id: "a", label: "The smaller, longer habit — time is the multiplier", stance: "plan" },
      { id: "b", label: "The late hero amount always wins", stance: "speculate" },
      { id: "c", label: "Neither — compounding only works for millionaires", stance: "sell" },
    ],
  },
  "match-401k": {
    id: "scenario-match-401k",
    moduleId: "match-401k",
    scenario: "Employer matches 50% up to 6% of salary. You only contribute 2% to 'invest elsewhere.'",
    question: "What's the educational takeaway?",
    philosophies: ["free match as an instant return", "order of operations"],
    options: [
      { id: "a", label: "Capture the full match before extra speculative bets", stance: "plan" },
      { id: "b", label: "Skip the match — brokers are always better", stance: "speculate" },
      { id: "c", label: "The match only matters after age 60", stance: "hold" },
    ],
  },
  "roth-vs-trad": {
    id: "scenario-roth-vs-trad",
    moduleId: "roth-vs-trad",
    scenario: "You're 25 in a low tax bracket and expect higher earnings later.",
    question: "Which IRA story usually fits?",
    philosophies: ["tax timing", "Roth for low-bracket years"],
    options: [
      { id: "a", label: "Roth — pay a low rate now, seek tax-free growth later", stance: "plan" },
      { id: "b", label: "Traditional is always cheaper for everyone", stance: "hold" },
      { id: "c", label: "Skip IRAs and trade options in a taxable account", stance: "speculate" },
    ],
  },
  hsa: {
    id: "scenario-hsa",
    moduleId: "hsa",
    scenario: "You're on an HDHP and can fund an HSA, a Roth IRA, or a taxable brokerage this month.",
    question: "Which account can stack three tax advantages for qualified medical costs?",
    philosophies: ["HSA triple tax advantage"],
    options: [
      { id: "a", label: "The HSA — in, grow, and out tax-advantaged for medical", stance: "plan" },
      { id: "b", label: "Only the taxable brokerage — simplest is best", stance: "speculate" },
      { id: "c", label: "None — medical accounts can't be invested", stance: "sell" },
    ],
  },
  equities: {
    id: "scenario-equities",
    moduleId: "equities",
    scenario: "A coworker says stocks are 'just gambling tickets.'",
    question: "What's the ownership framing?",
    philosophies: ["Benjamin Graham — business ownership", "equity as residual claim"],
    options: [
      { id: "a", label: "A share is a slice of a business — price + dividends over time", stance: "plan" },
      { id: "b", label: "Stocks are loans the company must repay on a schedule", stance: "hold" },
      { id: "c", label: "Buy whatever TikTok is pumping tonight", stance: "speculate" },
    ],
  },
  etfs: {
    id: "scenario-etfs",
    moduleId: "etfs",
    scenario: "The market dropped 5% today. You were about to start a $50/mo VOO habit.",
    question: "How do you handle the decision?",
    philosophies: ["Benjamin Graham margin of safety", "Bogleheads indexing", "dollar-cost averaging"],
    options: [
      { id: "a", label: "Start the automated $50/mo — dips are when DCA buys more shares", stance: "buy-dip" },
      { id: "b", label: "Wait for the all-clear headline before buying anything", stance: "sell" },
      { id: "c", label: "Abandon the index and all-in on one meme ticker", stance: "speculate" },
    ],
  },
  "tbills-bonds": {
    id: "scenario-tbills-bonds",
    moduleId: "tbills-bonds",
    scenario: "You bought a long Treasury at 3% yields. New issues now yield 5%.",
    question: "What happened to the market price of your old bond?",
    philosophies: ["rates vs bond prices", "ballast vs growth"],
    options: [
      { id: "a", label: "It fell — newer bonds pay more, so yours marks lower", stance: "plan" },
      { id: "b", label: "Treasury prices never change", stance: "hold" },
      { id: "c", label: "Sell everything and buy leveraged ETFs", stance: "speculate" },
    ],
  },
  "balance-sheet": {
    id: "scenario-balance-sheet",
    moduleId: "balance-sheet",
    scenario: "A company shows $120m assets and $70m liabilities.",
    question: "What is shareholders' equity — and why do you care?",
    philosophies: ["Graham — ownership of the residual", "Assets = Liabilities + Equity"],
    options: [
      { id: "a", label: "$50m equity — you're buying the leftover claim", stance: "plan" },
      { id: "b", label: "$190m — add assets and liabilities", stance: "speculate" },
      { id: "c", label: "Equity doesn't matter if the brand is famous", stance: "hold" },
    ],
  },
  "income-statement": {
    id: "scenario-income-statement",
    moduleId: "income-statement",
    scenario: "Net income looks great, but free cash flow is weak.",
    question: "What's the careful read?",
    philosophies: ["earnings vs cash", "quality of profits"],
    options: [
      { id: "a", label: "Profit on paper isn't the same as cash in the bank", stance: "plan" },
      { id: "b", label: "Net income always equals cash on hand", stance: "hold" },
      { id: "c", label: "Ignore statements — chart patterns are enough", stance: "speculate" },
    ],
  },
  "pe-eps": {
    id: "scenario-pe-eps",
    moduleId: "pe-eps",
    scenario: "A stock trades at 45× earnings after a viral rally. A friend says 'it's cheap because it's growing.'",
    question: "How would a value-minded investor respond?",
    philosophies: ["Benjamin Graham — price vs value", "margin of safety"],
    options: [
      { id: "a", label: "High P/E can be earned growth — or overpaying; demand a margin of safety", stance: "plan" },
      { id: "b", label: "Any P/E is fine if the logo is famous", stance: "speculate" },
      { id: "c", label: "Sell every stock with a P/E under 50", stance: "sell" },
    ],
  },
  "fcf-dividends": {
    id: "scenario-fcf-dividends",
    moduleId: "fcf-dividends",
    scenario: "A stock yields 8%. Dividends exceed free cash flow this year.",
    question: "What's the honest read?",
    philosophies: ["dividend coverage", "sustainable payouts"],
    options: [
      { id: "a", label: "Yield may be a warning — payout isn't fully covered by FCF", stance: "plan" },
      { id: "b", label: "Higher yield is always safer", stance: "speculate" },
      { id: "c", label: "Dividends are guaranteed by law", stance: "hold" },
    ],
  },
  dca: {
    id: "scenario-dca",
    moduleId: "dca",
    scenario: "You get paid twice a month and keep waiting for 'the perfect dip' before buying an index ETF.",
    question: "What is DCA's main job here?",
    philosophies: ["behavior over timing", "automatic investing"],
    options: [
      { id: "a", label: "Turn each paycheck into an automatic buy so mood doesn't run the plan", stance: "plan" },
      { id: "b", label: "Guarantee higher returns than investing all at once", stance: "speculate" },
      { id: "c", label: "Wait until volatility is zero", stance: "sell" },
    ],
  },
  allocation: {
    id: "scenario-allocation",
    moduleId: "allocation",
    scenario: "You love one chip stock and want it to be 60% of a $10k portfolio.",
    question: "Which architecture follows core/satellite and the 5%–10% rule?",
    philosophies: ["diversification", "position sizing", "Graham risk control"],
    options: [
      { id: "a", label: "~70% broad index core, single name capped near 10%", stance: "rebalance" },
      { id: "b", label: "60% one stock — conviction beats math", stance: "speculate" },
      { id: "c", label: "100% cash until you feel certain", stance: "sell" },
    ],
  },
  "fomo-panic": {
    id: "scenario-fomo-panic",
    moduleId: "fomo-panic",
    scenario: "Your diversified index portfolio is down 30%. Retirement is 25 years away. A friend says get out.",
    question: "What's the plan-aligned move?",
    philosophies: ["Mr. Market allegory (Graham)", "time horizon", "avoid panic selling"],
    options: [
      { id: "a", label: "Hold or keep DCA-ing — a crash isn't a 25-year thesis change", stance: "hold" },
      { id: "b", label: "Sell everything and wait for the all-clear headline", stance: "sell" },
      { id: "c", label: "Double down on whatever went up this week", stance: "speculate" },
    ],
  },
};

export function questForModule(moduleId: string): PracticalQuestDef | null {
  return LESSON_QUESTS[moduleId] ?? null;
}

export function scenarioForModule(moduleId: string): AiScenarioDef | null {
  return LESSON_SCENARIOS[moduleId] ?? null;
}

export function monthlyCompoundFuture(
  monthly: number,
  years: number,
  annualReturn = DEFAULT_RETURN
): { invested: number; projected: number } {
  const months = Math.max(0, years) * 12;
  const r = annualReturn / 12;
  const invested = Math.max(0, monthly) * months;
  if (months === 0 || monthly <= 0) return { invested: 0, projected: 0 };
  if (r === 0) return { invested, projected: invested };
  const projected = monthly * ((Math.pow(1 + r, months) - 1) / r);
  return { invested, projected };
}

export function phaseAccentForModule(phaseId: PhaseId): string {
  const map: Record<PhaseId, string> = {
    "phase-1": "#F59E0B",
    "phase-2": "#38BDF8",
    "phase-3": "#22D3EE",
    "phase-4": "#A78BFA",
    "phase-5": "#FB7185",
  };
  return map[phaseId] ?? "#10B981";
}
