import { CARD_XP, QUIZ_XP } from "./lessonProgress";

export type PhaseId = "phase-1" | "phase-2" | "phase-3" | "phase-4" | "phase-5";

export const PHASE_ORDER: PhaseId[] = ["phase-1", "phase-2", "phase-3", "phase-4", "phase-5"];

export type LessonIconName =
  | "swords"
  | "percent"
  | "shield"
  | "sprout"
  | "building"
  | "scale"
  | "heart"
  | "landmark"
  | "layers"
  | "scroll"
  | "file-text"
  | "calculator"
  | "coins"
  | "calendar"
  | "pie-chart"
  | "brain"
  | "wallet";

export type PhaseIconName = "shield" | "landmark" | "layers" | "search" | "compass";

export type LessonWidget =
  | { type: "compound"; rate: number }
  | { type: "debt-payoff" }
  | { type: "budget-503020"; minIncome: number; maxIncome: number }
  | { type: "hysa"; apy: number }
  | { type: "match-401k"; salary: number; matchRate: number; matchCap: number }
  | { type: "roth-trad"; contribution: number; years: number; returnRate: number }
  | { type: "hsa"; taxRate: number }
  | { type: "expense-ratio"; principal: number; years: number; returnRate: number }
  | { type: "tbill"; face: number }
  | { type: "balance-sheet" }
  | { type: "pe-ratio" }
  | { type: "fcf-div" }
  | { type: "dca"; years: number; returnRate: number }
  | { type: "allocation" }
  | { type: "panic-hold"; startValue: number }
  | { type: "net-margin" }
  | { type: "cash-flow" }
  | { type: "money-leaks" }
  | { type: "core-satellite" }
  | { type: "sector-mix" }
  | { type: "position-size" };

export type StoryCard = {
  id: string;
  kicker: string;
  headline: string;
  body: string;
  metaphor: string;
  widget?: LessonWidget;
};

export type ScenarioQuiz = {
  kind: "scenario";
  scenario: string;
  question: string;
  options: Array<{
    id: string;
    label: string;
    correct: boolean;
    explanation: string;
  }>;
};

export type MatchQuiz = {
  kind: "match";
  prompt: string;
  pairs: Array<{ id: string; term: string; match: string }>;
  explanation: string;
};

export type LessonQuizDef = ScenarioQuiz | MatchQuiz;

export type AssetCta = {
  assetType: "etf" | "stock";
  symbol: string;
  description: string;
  prompt: string;
};

export type LessonModuleDef = {
  id: string;
  phaseId: PhaseId;
  index: number;
  title: string;
  subtitle: string;
  icon: LessonIconName;
  accent: string;
  minutes: number;
  cards: StoryCard[];
  quiz: LessonQuizDef;
  actionCard: string;
  cta?: AssetCta;
};

export type PhaseDef = {
  id: PhaseId;
  number: number;
  title: string;
  subtitle: string;
  accent: string;
  icon: PhaseIconName;
  certificateLabel?: string;
};

export const PHASES: PhaseDef[] = [
  {
    id: "phase-1",
    number: 1,
    title: "Phase 1: Financial Foundation & Defense",
    subtitle: "Debt payoff, cash flow, 50/30/20, and your HYSA shield",
    accent: "#F59E0B",
    icon: "shield",
  },
  {
    id: "phase-2",
    number: 2,
    title: "Phase 2: US Tax & Retirement Accounts",
    subtitle: "Compounding, 401(k) match, Roth vs Traditional, HSA",
    accent: "#38BDF8",
    icon: "landmark",
  },
  {
    id: "phase-3",
    number: 3,
    title: "Phase 3: US Investment Assets",
    subtitle: "Equities, ETFs & expense ratios, Treasuries",
    accent: "#22D3EE",
    icon: "layers",
  },
  {
    id: "phase-4",
    number: 4,
    title: "Phase 4: Company Valuation & Fundamental Analysis",
    subtitle: "Balance sheet, income statement, P/E, free cash flow",
    accent: "#A78BFA",
    icon: "search",
  },
  {
    id: "phase-5",
    number: 5,
    title: "Phase 5: Strategy, Psychology & Portfolio Management",
    subtitle: "DCA, risk architecture, FOMO & panic selling",
    accent: "#FB7185",
    icon: "compass",
  },
];

export const LESSON_MODULES: LessonModuleDef[] = [
  {
    id: "debt-battles",
    phaseId: "phase-1",
    index: 1,
    title: "Debt Payoff",
    subtitle: "Snowball vs Avalanche",
    icon: "swords",
    accent: "#F59E0B",
    minutes: 4,
    cards: [
      {
        id: "db-1",
        kicker: "The rule",
        headline: "Don't fight every debt at once.",
        body: "Pay the **minimum on everything** so nothing goes delinquent. Then throw every extra dollar at **one target**.",
        metaphor: "🎯",
      },
      {
        id: "db-2",
        kicker: "Snowball",
        headline: "Smallest balance first. Fast wins.",
        body: "Knock out the little one, then roll that payment into the next. It's a **motivation machine** — not always the cheapest path.",
        metaphor: "❄️",
      },
      {
        id: "db-3",
        kicker: "Avalanche",
        headline: "Highest APR first. Least interest.",
        body: "Math's favorite. The **22% card dies** before the 6% loan. You keep more money. It just feels slower at the start.",
        metaphor: "🏔️",
      },
      {
        id: "db-4",
        kicker: "Try it",
        headline: "Slide extra cash. Watch both clocks.",
        body: "Two sample debts: a **$3k card at 22%** and a **$9k loan at 6%**. Extra payment is the only lever. Compare months and interest.",
        metaphor: "🎚️",
        widget: { type: "debt-payoff" },
      },
      {
        id: "db-5",
        kicker: "The real pick",
        headline: "The winning method is the one you'll finish.",
        body: "A perfect plan you abandon loses to a **good-enough plan** you actually run for a year.",
        metaphor: "🏁",
      },
    ],
    quiz: {
      kind: "match",
      prompt: "Match each tactic to what it actually does.",
      pairs: [
        { id: "snowball", term: "Snowball", match: "Smallest balance first" },
        { id: "avalanche", term: "Avalanche", match: "Highest APR first" },
        { id: "minimums", term: "Minimums", match: "Keep every other debt current" },
      ],
      explanation:
        "Minimums protect your score. Snowball buys momentum. Avalanche buys the lowest total interest. Extra cash hits only one target at a time.",
    },
    actionCard: "List your debts. Circle the highest APR (Avalanche) and the smallest balance (Snowball).",
  },
  {
    id: "rule-503020",
    phaseId: "phase-1",
    index: 2,
    title: "The 50/30/20 Rule",
    subtitle: "A simple map for take-home pay",
    icon: "percent",
    accent: "#34D399",
    minutes: 3,
    cards: [
      {
        id: "b-1",
        kicker: "Three buckets",
        headline: "Every dollar needs a job.",
        body: "Split take-home pay into **Needs (50%)**, **Wants (30%)**, and **Save/Debt (20%)**. It's a compass, not a cage.",
        metaphor: "🥧",
      },
      {
        id: "b-2",
        kicker: "Needs",
        headline: "50% keeps the lights on.",
        body: "Rent, groceries, utilities, insurance, minimum debt payments. If needs blow past 50% in a high-cost city, **trim wants first** — then raise income.",
        metaphor: "🏠",
      },
      {
        id: "b-3",
        kicker: "Wants & future you",
        headline: "30% living. 20% building.",
        body: "Wants are restaurants, hobbies, upgrades. The **20% bucket** is emergency fund, extra debt, and investing. That slice is how you stop living paycheck to paycheck.",
        metaphor: "🌱",
      },
      {
        id: "b-4",
        kicker: "Try it",
        headline: "Slide take-home. Watch the split.",
        body: "These are **targets**, not laws. If 20% feels impossible, start with 10% and climb.",
        metaphor: "🎚️",
        widget: { type: "budget-503020", minIncome: 2000, maxIncome: 10000 },
      },
    ],
    quiz: {
      kind: "scenario",
      scenario: "Jordan's take-home pay is $4,000 a month. They want a 50/30/20 split.",
      question: "How much belongs in the Save/Debt bucket?",
      options: [
        {
          id: "a",
          label: "$800 — 20% of take-home",
          correct: true,
          explanation: "$4,000 × 0.20 = $800. That's the slice for the emergency fund, extra debt, and investing.",
        },
        {
          id: "b",
          label: "$2,000 — half of take-home",
          correct: false,
          explanation: "Half is the Needs bucket (50%). Save/Debt is the 20% slice.",
        },
        {
          id: "c",
          label: "$1,200 — the wants bucket",
          correct: false,
          explanation: "$1,200 is 30% — lifestyle spending. The future-you bucket is 20%.",
        },
      ],
    },
    actionCard: "Write last month's take-home, then three numbers: 50% needs, 30% wants, 20% save/debt. Circle the bucket that's over.",
  },
  {
    id: "emergency-fund",
    phaseId: "phase-1",
    index: 3,
    title: "HYSA Emergency Fund",
    subtitle: "3–6 months in a high-yield account",
    icon: "shield",
    accent: "#8B5CF6",
    minutes: 4,
    cards: [
      {
        id: "ef-1",
        kicker: "Why it exists",
        headline: "A surprise shouldn't become a new card balance.",
        body: "Job loss, a medical bill, a dead transmission — emergencies don't wait for payday. **Cash buys you time.**",
        metaphor: "🛡️",
      },
      {
        id: "ef-2",
        kicker: "The target",
        headline: "3–6 months of essentials. Not vibes.",
        body: "Essentials = rent, food, utilities, insurance. Not takeout. Not vacations. Park it in a **High-Yield Savings Account (HYSA)** so it earns while it waits.",
        metaphor: "📅",
      },
      {
        id: "ef-3",
        kicker: "Why HYSA",
        headline: "Traditional savings: 0.01% APY. A HYSA: 4–5%+.",
        body: "A typical bank savings account pays about **0.01% APY**. A High-Yield Savings Account (HYSA) often pays **4–5%+ APY** — same cash, far more interest. It stays **FDIC insured** (up to $250,000) and fully liquid, so emergency money remains safe and reachable — not locked in the market.",
        metaphor: "🏦",
      },
      {
        id: "ef-4",
        kicker: "Try it",
        headline: "Slide the cushion. Compare the yield.",
        body: "Same dollars in a HYSA vs a sleepy checking account. The gap is **free money for being slightly more organized.**",
        metaphor: "🎚️",
        widget: { type: "hysa", apy: 0.045 },
      },
      {
        id: "ef-5",
        kicker: "Priority",
        headline: "Fund the shield before you chase returns.",
        body: "Until the net is funded, extra money (bonuses included) belongs **here first**. Markets can drop the week you need the cash.",
        metaphor: "🧰",
      },
    ],
    quiz: {
      kind: "scenario",
      scenario: "Zoe's essential bills are $2,000 a month. She has $2,000 and wants a real emergency fund.",
      question: "Where should that money live, and what's the target?",
      options: [
        {
          id: "a",
          label: "HYSA, aiming for $6,000–$12,000 (3–6 months)",
          correct: true,
          explanation:
            "3–6 months of essentials in a high-yield savings account keeps the cash liquid, FDIC-insured, and earning — without stock-market risk.",
        },
        {
          id: "b",
          label: "A broad stock ETF so it grows faster",
          correct: false,
          explanation: "The point of this cash is that it's there on a bad week. Stocks can be down exactly when you need them.",
        },
        {
          id: "c",
          label: "$2,000 in checking is already enough",
          correct: false,
          explanation: "One month covers a hiccup. Job loss and medical bills usually last longer — and checking pays almost nothing.",
        },
      ],
    },
    actionCard: "Open or note a HYSA. Add up essential monthly bills × 3. That's your starter shield.",
  },
  {
    id: "cash-flow-budget",
    phaseId: "phase-1",
    index: 4,
    title: "Cash Flow & Budgeting Mastery",
    subtitle: "Track inflow, plug leaks, allocate every dollar",
    icon: "wallet",
    accent: "#2DD4BF",
    minutes: 5,
    cards: [
      {
        id: "cf-1",
        kicker: "The scoreboard",
        headline: "Cash flow is inflow minus outflow. That's it.",
        body: "**Money in** (paycheck, side hustle, refunds) minus **money out** (bills, food, subscriptions) is your monthly surplus — or deficit. You can't defend or invest what you never see.",
        metaphor: "🌊",
      },
      {
        id: "cf-2",
        kicker: "Track it",
        headline: "Write the two numbers. Watch the gap.",
        body: "Slide take-home vs typical spend. A **green surplus** is fuel for debt, HYSA, and investing. A **red deficit** means the 50/30/20 map has to wait — first stop the bleed.",
        metaphor: "📊",
        widget: { type: "cash-flow" },
      },
      {
        id: "cf-3",
        kicker: "Hidden leaks",
        headline: "The money you forget is still leaving.",
        body: "Streaming you don't open, a gym you skip, delivery fees, unused apps. Tap a leak to **plug it**. Small monthly drips are how a paycheck disappears without a big purchase.",
        metaphor: "🕳️",
        widget: { type: "money-leaks" },
      },
      {
        id: "cf-4",
        kicker: "Allocate it",
        headline: "50/30/20 turns leftover cash into a plan.",
        body: "Once you know the surplus, give every dollar a job: **Needs 50%**, **Wants 30%**, **Save/Debt 20%**. Same compass as Lesson 2 — now driven by real inflow and plugged leaks.",
        metaphor: "🥧",
        widget: { type: "budget-503020", minIncome: 2000, maxIncome: 10000 },
      },
      {
        id: "cf-5",
        kicker: "The loop",
        headline: "Surplus has a job: shield, then snowball, then invest.",
        body: "Don't let a good month become lifestyle creep. Route extra cash to the **HYSA** until the shield is funded, then extra debt, then investing. Tracking is useless if the leftover has nowhere to go.",
        metaphor: "🔁",
      },
    ],
    quiz: {
      kind: "scenario",
      scenario:
        "Maya's take-home is $4,000. She spends about $3,900. A 10-minute audit finds $80 of unused streaming, a $45 gym she never visits, and $60 in delivery fees.",
      question: "What's the first cash-flow move?",
      options: [
        {
          id: "a",
          label: "Plug the $185 of leaks — that's hidden outflow she can send to the 20% bucket",
          correct: true,
          explanation:
            "Those three line items are $185/month she already agreed not to value. Recovering them turns a $100 leftover into $285 — enough to start the save/debt slice without a raise.",
        },
        {
          id: "b",
          label: "Ignore the leaks and pick a stock so the leftover grows faster",
          correct: false,
          explanation:
            "A $100 surplus can vanish the next time a subscription renews. Plug leaks first — then the 20% bucket has something to invest.",
        },
        {
          id: "c",
          label: "Cut rent in half this month",
          correct: false,
          explanation:
            "Needs don't flex overnight. The easy win is forgotten outflow, not a lease you can't rewrite by Friday.",
        },
      ],
    },
    actionCard:
      "List last month's inflow and outflow. Circle three leaks. Re-run 50/30/20 on the recovered cash.",
  },
  {
    id: "compound",
    phaseId: "phase-2",
    index: 1,
    title: "The Compound Engine",
    subtitle: "Why time beats intensity",
    icon: "sprout",
    accent: "#34D399",
    minutes: 4,
    cards: [
      {
        id: "ci-1",
        kicker: "The engine",
        headline: "Interest on interest. That's the whole trick.",
        body: "Your dollars earn a return. Then those earnings earn a return. Leave it alone long enough and the curve **stops looking linear.**",
        metaphor: "🌱",
      },
      {
        id: "ci-2",
        kicker: "The multiplier",
        headline: "Time beats a heroic monthly amount.",
        body: "Starting **small and early** usually crushes starting big and late. The calendar does most of the lifting.",
        metaphor: "⏳",
      },
      {
        id: "ci-3",
        kicker: "Try it",
        headline: "Drag the sliders. Watch a habit become a pile.",
        body: "This uses a **7% annual return** — a long-run US market ballpark, not a promise. Play with monthly cash and years.",
        metaphor: "📈",
        widget: { type: "compound", rate: 0.07 },
      },
      {
        id: "ci-4",
        kicker: "The wrapper",
        headline: "Accounts are how you keep more of the engine.",
        body: "A 401(k), IRA, or HSA doesn't change compounding — it changes **who gets taxed**, and when. That's the rest of this phase.",
        metaphor: "📦",
      },
      {
        id: "ci-5",
        kicker: "The flex",
        headline: "Staying invested is the skill.",
        body: "Picking a genius stock is optional. **Not interrupting compounding** is the actual superpower.",
        metaphor: "🧘",
      },
    ],
    quiz: {
      kind: "scenario",
      scenario: "Same 7% return. No withdrawals.",
      question: "Which pile is larger at the end?",
      options: [
        {
          id: "a",
          label: "$200 / month for 30 years",
          correct: true,
          explanation:
            "Time wins. $200 × 30 years compounds to roughly $227k, while $400 × 10 years is about $69k. The extra 20 years are the engine.",
        },
        {
          id: "b",
          label: "$400 / month for 10 years",
          correct: false,
          explanation: "Double the monthly amount, but you cut away 20 years of compounding. The smaller, longer habit still wins.",
        },
        {
          id: "c",
          label: "They're almost the same",
          correct: false,
          explanation: "Compounding is exponential. Extra decades change the result by a lot, not a rounding error.",
        },
      ],
    },
    actionCard: "Pick a monthly number you could automate — even $50 — and treat it as untouchable.",
  },
  {
    id: "match-401k",
    phaseId: "phase-2",
    index: 2,
    title: "The 401(k) Match",
    subtitle: "Never leave free money on the table",
    icon: "building",
    accent: "#60A5FA",
    minutes: 4,
    cards: [
      {
        id: "k-1",
        kicker: "Free return",
        headline: "The match is an instant raise.",
        body: "If your employer puts in **$0.50 (or $1) per $1 you contribute** up to a cap, that's a **50–100% return** before the market even moves.",
        metaphor: "🎁",
      },
      {
        id: "k-2",
        kicker: "The typical deal",
        headline: "50% match up to 6% of salary is common.",
        body: "Earn $72k and contribute 6% ($4,320). A 50% match adds **$2,160 of company money**. Contribute 3% and you **leave half of that on the table.**",
        metaphor: "🏢",
      },
      {
        id: "k-3",
        kicker: "Try it",
        headline: "Slide your contribution. Watch free money.",
        body: "Sample job: **$72,000 salary**, 50% match on the first 6%. Green is captured. Amber is still sitting in your employer's pocket.",
        metaphor: "🎚️",
        widget: { type: "match-401k", salary: 72000, matchRate: 0.5, matchCap: 0.06 },
      },
      {
        id: "k-4",
        kicker: "Order of operations",
        headline: "Grab the full match before extra IRA money.",
        body: "After the match is maxed, then decide Roth IRA vs more 401(k). Vesting schedules exist — **you still want the match** while you work there.",
        metaphor: "🪜",
      },
    ],
    quiz: {
      kind: "scenario",
      scenario: "Sam earns $60,000. The company matches 50% of contributions up to 6% of salary. Sam only contributes 3%.",
      question: "What's happening?",
      options: [
        {
          id: "a",
          label: "Sam is leaving $900/year of match unclaimed",
          correct: true,
          explanation: "Full match = 6% × $60,000 × 50% = $1,800. At 3%, Sam only gets $900. The other $900 is free money unused.",
        },
        {
          id: "b",
          label: "Sam already gets the entire match",
          correct: false,
          explanation: "The cap is 6% of salary. Contributing 3% only unlocks half of the available match.",
        },
        {
          id: "c",
          label: "The match only applies after 10 years",
          correct: false,
          explanation: "Vesting can delay ownership, but the contribution still happens now. Skipping the match is skipping the deposit.",
        },
      ],
    },
    actionCard: "Check your plan: salary × match cap × match rate. Contribute at least that far.",
  },
  {
    id: "roth-vs-trad",
    phaseId: "phase-2",
    index: 3,
    title: "Roth IRA vs Traditional IRA",
    subtitle: "Pay tax now, or pay tax later",
    icon: "scale",
    accent: "#FBBF24",
    minutes: 4,
    cards: [
      {
        id: "r-1",
        kicker: "Same engine, different tax",
        headline: "Both are retirement wrappers.",
        body: "An IRA is a **tax-advantaged bucket**. Traditional and Roth can hold the same funds. The difference is **when the IRS gets paid.**",
        metaphor: "🪣",
      },
      {
        id: "r-2",
        kicker: "Traditional",
        headline: "Tax break now. Tax later.",
        body: "Contributions can **lower taxable income today**. Withdrawals in retirement are taxed as ordinary income. Useful if you're in a **high bracket now.**",
        metaphor: "📉",
      },
      {
        id: "r-3",
        kicker: "Roth",
        headline: "After-tax in. Tax-free out.",
        body: "No deduction today. Qualified withdrawals — including growth — are **tax-free**. Powerful if you expect a **higher bracket later**, or want tax-free income in retirement.",
        metaphor: "🌈",
      },
      {
        id: "r-4",
        kicker: "Try it",
        headline: "Slide today's tax bracket.",
        body: "$7,000 contributed. Traditional **saves tax this year**. Roth **keeps the whole pile** later. If your retirement bracket matches today's, investing the Traditional tax savings closes the gap.",
        metaphor: "🎚️",
        widget: { type: "roth-trad", contribution: 7000, years: 25, returnRate: 0.07 },
      },
      {
        id: "r-5",
        kicker: "A practical bias",
        headline: "Young + low bracket often leans Roth.",
        body: "A 24-year-old in the **12% bracket** who expects higher earnings later is the textbook Roth case. High earners often lean Traditional — and may hit Roth **income limits.**",
        metaphor: "🧭",
      },
    ],
    quiz: {
      kind: "scenario",
      scenario: "Alex is 24, in the 12% federal bracket, and expects to earn more (and pay higher rates) later.",
      question: "Which IRA usually fits that story better?",
      options: [
        {
          id: "a",
          label: "Roth — pay 12% tax now, take growth out tax-free",
          correct: true,
          explanation:
            "Locking in a low rate today and letting decades of growth come out tax-free is the classic young-Roth case.",
        },
        {
          id: "b",
          label: "Traditional — always the cheaper option",
          correct: false,
          explanation: "Traditional shines when today's rate is high and tomorrow's is lower. Alex's story is the opposite.",
        },
        {
          id: "c",
          label: "Neither — IRAs don't allow stock funds",
          correct: false,
          explanation: "IRAs can hold funds and stocks. The wrapper is about tax timing, not what sits inside.",
        },
      ],
    },
    actionCard: "Write your federal bracket and whether you expect it higher or lower in retirement. That tilts Roth vs Traditional.",
  },
  {
    id: "hsa",
    phaseId: "phase-2",
    index: 4,
    title: "The HSA Triple Play",
    subtitle: "Health savings with three tax wins",
    icon: "heart",
    accent: "#F472B6",
    minutes: 4,
    cards: [
      {
        id: "h-1",
        kicker: "The ticket",
        headline: "You need a high-deductible health plan.",
        body: "A Health Savings Account (HSA) only opens if you're on a qualifying **HDHP**. It's a medical account that can also be a **stealth retirement account.**",
        metaphor: "🎟️",
      },
      {
        id: "h-2",
        kicker: "Triple tax",
        headline: "In tax-free. Grow tax-free. Out tax-free.",
        body: "1) Contributions **cut taxable income**. 2) Growth isn't taxed. 3) Qualified medical withdrawals aren't taxed. **No other US account hits all three.**",
        metaphor: "🏆",
      },
      {
        id: "h-3",
        kicker: "Try it",
        headline: "Slide the contribution. See the tax cut.",
        body: "At a **22%** federal bracket, every $1,000 you put in is about **$220 the IRS doesn't take this year** — before state tax, and before tax-free growth.",
        metaphor: "🎚️",
        widget: { type: "hsa", taxRate: 0.22 },
      },
      {
        id: "h-4",
        kicker: "The long game",
        headline: "Pay medical from checking if you can.",
        body: "Save receipts. Invest the HSA. After **age 65**, non-medical withdrawals are taxed like a Traditional IRA — so unused HSA money still has a retirement job.",
        metaphor: "🧾",
      },
    ],
    quiz: {
      kind: "scenario",
      scenario: "Priya can choose a regular savings account, a Roth IRA, or an HSA (she's on an HDHP).",
      question: "Which one can be contributed pre-tax, grow tax-free, and come out tax-free for medical bills?",
      options: [
        {
          id: "a",
          label: "The HSA — the triple tax advantage",
          correct: true,
          explanation: "Only the HSA stacks all three: deductible contributions, tax-free growth, and tax-free qualified withdrawals.",
        },
        {
          id: "b",
          label: "The Roth IRA — everything is tax-free",
          correct: false,
          explanation: "Roth withdrawals can be tax-free, but contributions are after-tax. You don't get the upfront deduction.",
        },
        {
          id: "c",
          label: "A normal savings account — it's already tax-simple",
          correct: false,
          explanation: "Interest in a normal savings account is taxable, and contributions aren't deductible.",
        },
      ],
    },
    actionCard: "If you're on an HDHP, check this year's HSA contribution limit and whether you can invest the balance.",
  },
  {
    id: "equities",
    phaseId: "phase-3",
    index: 1,
    title: "Owning Equities",
    subtitle: "A share is a slice of a business",
    icon: "landmark",
    accent: "#818CF8",
    minutes: 3,
    cards: [
      {
        id: "eq-1",
        kicker: "What you buy",
        headline: "A share is ownership, not a ticket.",
        body: "Buy a stock and you own a **tiny piece of the company** — its assets, profits, and risks. You're not lending. You're **on the owner's side.**",
        metaphor: "🔑",
      },
      {
        id: "eq-2",
        kicker: "How you get paid",
        headline: "Price change + dividends.",
        body: "Return = what the market will pay later, plus any **cash the company sends you**. Over long stretches, US equities have beaten cash and bonds — with **bigger swings.**",
        metaphor: "📈",
      },
      {
        id: "eq-3",
        kicker: "The risk",
        headline: "A company can shrink — or disappear.",
        body: "That's why **one stock is a story** and a **basket is a business plan**. Diversification is how owners sleep.",
        metaphor: "🎲",
      },
      {
        id: "eq-4",
        kicker: "Horizon",
        headline: "Stocks are for money you won't need soon.",
        body: "A 10+ year horizon lets you ride through drawdowns. Money for a house down payment next year does **not** belong in individual stocks.",
        metaphor: "⏳",
      },
    ],
    quiz: {
      kind: "scenario",
      scenario: "Riley buys 10 shares of a US company.",
      question: "What does Riley actually own?",
      options: [
        {
          id: "a",
          label: "A slice of the business — residual claim on profits and assets",
          correct: true,
          explanation: "Equity holders own a piece of the company. They benefit if it grows, and they stand behind lenders if it fails.",
        },
        {
          id: "b",
          label: "A loan the company must repay on a schedule",
          correct: false,
          explanation: "That's a bond. Stocks have no promised repayment date.",
        },
        {
          id: "c",
          label: "A guaranteed annual interest payment",
          correct: false,
          explanation: "Dividends are optional. Companies can cut or skip them. Nothing in a share is guaranteed.",
        },
      ],
    },
    actionCard: "Pick one company you know. Write in one sentence: what it sells, and how it makes a profit.",
  },
  {
    id: "etfs",
    phaseId: "phase-3",
    index: 2,
    title: "ETFs, Index Funds & Fees",
    subtitle: "A basket — and the expense ratio that eats it",
    icon: "layers",
    accent: "#22D3EE",
    minutes: 4,
    cards: [
      {
        id: "et-1",
        kicker: "What it is",
        headline: "An ETF is a basket you can buy like a stock.",
        body: "One ticker. Dozens or hundreds of companies inside. You're not marrying a single story — you're buying a **slice of a whole group.**",
        metaphor: "🧺",
      },
      {
        id: "et-2",
        kicker: "Index funds",
        headline: "Don't bet on one tree. Buy the orchard.",
        body: "An **S&P 500 index ETF** holds 500 large US companies. A single stock can 10× — or go to zero. The index spreads that risk.",
        metaphor: "🌳",
      },
      {
        id: "et-3",
        kicker: "Expense ratio",
        headline: "A tiny fee, charged every year, forever.",
        body: "**0.03%** vs **1.00%** looks harmless. Over 30 years it is not. Fees compound against you the same way returns compound for you.",
        metaphor: "🐜",
      },
      {
        id: "et-4",
        kicker: "Try it",
        headline: "Slide the fee. Watch the drag.",
        body: "$10,000, 30 years, 7% market return. The only change is the **expense ratio**. Cheap index funds exist so you keep more of the orchard.",
        metaphor: "🎚️",
        widget: { type: "expense-ratio", principal: 10000, years: 30, returnRate: 0.07 },
      },
      {
        id: "et-5",
        kicker: "A starter",
        headline: "VOO is a slice of the S&P 500.",
        body: "Low fees, instant diversification, and a common first holding **on purpose**. Boring is a feature.",
        metaphor: "🇺🇸",
      },
    ],
    quiz: {
      kind: "scenario",
      scenario: "Jordan can buy one company or a broad US index ETF with the same cash. The ETF charges 0.03% a year.",
      question: "What's the main advantage of the ETF?",
      options: [
        {
          id: "a",
          label: "Instant diversification at a tiny ongoing cost",
          correct: true,
          explanation:
            "One ticker spreads the bet across hundreds of companies, and a 0.03% fee barely nicks the compounding engine.",
        },
        {
          id: "b",
          label: "It's guaranteed to beat every stock",
          correct: false,
          explanation: "Nothing is guaranteed. The edge is diversification and low cost — not a promise to win every year.",
        },
        {
          id: "c",
          label: "You can never lose money",
          correct: false,
          explanation: "Markets drop. ETFs can fall too — they just usually fall with the orchard, not because one tree died.",
        },
      ],
    },
    actionCard: "If you practice with one fund, make it a broad, low-fee index ETF — then ignore it for a while.",
    cta: {
      assetType: "etf",
      symbol: "VOO",
      description: "Vanguard S&P 500 ETF",
      prompt: "Want to add a low-fee S&P 500 ETF to your Paper Portfolio?",
    },
  },
  {
    id: "tbills-bonds",
    phaseId: "phase-3",
    index: 3,
    title: "US T-Bills & Bonds",
    subtitle: "Lending to the Treasury",
    icon: "scroll",
    accent: "#94A3B8",
    minutes: 4,
    cards: [
      {
        id: "tb-1",
        kicker: "What it is",
        headline: "A bond is a loan. You are the lender.",
        body: "US Treasuries are loans to the federal government. **T-bills** mature in a year or less. Notes and bonds last longer. You get paid **yield**, not ownership.",
        metaphor: "📜",
      },
      {
        id: "tb-2",
        kicker: "T-bills",
        headline: "Bought at a discount. Mature at par.",
        body: "A 1-year bill with a **4% yield** and $10,000 face might cost about **$9,615**. At maturity you receive $10,000. The gap is your interest.",
        metaphor: "🏷️",
      },
      {
        id: "tb-3",
        kicker: "Rates vs prices",
        headline: "When rates rise, existing bond prices fall.",
        body: "Old bonds paying 3% look worse if new ones pay 5%. Their **market price drops**. Hold to maturity and you still get par (if the issuer pays).",
        metaphor: "⚖️",
      },
      {
        id: "tb-4",
        kicker: "Try it",
        headline: "Slide the yield. See the discount.",
        body: "Face value **$10,000**, one-year bill. Higher yield → **lower purchase price** today, more interest earned if held to maturity.",
        metaphor: "🎚️",
        widget: { type: "tbill", face: 10000 },
      },
      {
        id: "tb-5",
        kicker: "The job",
        headline: "Ballast — not the growth engine.",
        body: "Treasuries dampen a stock portfolio and park cash you can't afford to swing. They are **defense**, like the HYSA, with a defined term.",
        metaphor: "🧱",
      },
    ],
    quiz: {
      kind: "scenario",
      scenario: "You bought a 10-year Treasury when yields were 3%. New 10-year Treasuries now yield 5%.",
      question: "What happened to the market price of your old bond?",
      options: [
        {
          id: "a",
          label: "It fell — newer bonds pay more, so yours is worth less today",
          correct: true,
          explanation: "Bond prices move opposite yields. You still get par if you hold to maturity; the mark-to-market value dropped.",
        },
        {
          id: "b",
          label: "It rose — bonds always climb with time",
          correct: false,
          explanation: "Time pulls a discount/premium toward par, but a rate spike hits the price of existing bonds first.",
        },
        {
          id: "c",
          label: "Nothing — Treasury prices never change",
          correct: false,
          explanation: "They trade every day. Short T-bills move less; long bonds move more.",
        },
      ],
    },
    actionCard: "Note one rate: the current 3-month T-bill or your HYSA APY. That's your risk-free-ish yardstick.",
  },
  {
    id: "balance-sheet",
    phaseId: "phase-4",
    index: 1,
    title: "The Balance Sheet",
    subtitle: "Assets = Liabilities + Equity",
    icon: "file-text",
    accent: "#A78BFA",
    minutes: 3,
    cards: [
      {
        id: "bs-1",
        kicker: "A snapshot",
        headline: "What the company owns and owes — right now.",
        body: "The balance sheet is a **still photo**, not a movie. Assets on one side. Claims on those assets on the other.",
        metaphor: "📷",
      },
      {
        id: "bs-2",
        kicker: "The equation",
        headline: "Assets = Liabilities + Equity. Always.",
        body: "**Assets** = cash, inventory, factories, patents. **Liabilities** = bills and debt. **Equity** = what's left for owners. If it doesn't balance, someone miscounted.",
        metaphor: "⚖️",
      },
      {
        id: "bs-3",
        kicker: "Try it",
        headline: "Slide assets and debt. Watch equity.",
        body: "Equity is the **residual**. More debt against the same assets **shrinks the owners' slice** — and adds risk.",
        metaphor: "🎚️",
        widget: { type: "balance-sheet" },
      },
      {
        id: "bs-4",
        kicker: "Why you care",
        headline: "You're buying the equity, not the building.",
        body: "As a shareholder you own the **leftover claim**. Heavy liabilities mean lenders eat first if things go wrong.",
        metaphor: "🧩",
      },
    ],
    quiz: {
      kind: "scenario",
      scenario: "A company reports $100 million in assets and $40 million in liabilities.",
      question: "What is shareholders' equity?",
      options: [
        {
          id: "a",
          label: "$60 million — assets minus liabilities",
          correct: true,
          explanation: "Equity = Assets − Liabilities = $100m − $40m = $60m. That's the owners' residual claim.",
        },
        {
          id: "b",
          label: "$140 million — add them together",
          correct: false,
          explanation: "Liabilities are a claim on assets, not something you add to get a bigger pile.",
        },
        {
          id: "c",
          label: "$40 million — same as the debt",
          correct: false,
          explanation: "Debt is the lenders' claim. Owners get what's left after that claim.",
        },
      ],
    },
    actionCard: "On any stock page, find Total Assets, Total Liabilities, and Equity. Check that A = L + E.",
  },
  {
    id: "income-statement",
    phaseId: "phase-4",
    index: 2,
    title: "The Income Statement",
    subtitle: "Revenue down to net income",
    icon: "scroll",
    accent: "#38BDF8",
    minutes: 3,
    cards: [
      {
        id: "is-1",
        kicker: "A movie",
        headline: "How much it earned over a period.",
        body: "The income statement covers a **quarter or a year**. It starts with **Revenue** (sales) and subtracts costs until you hit **Net Income** (the bottom line).",
        metaphor: "🎬",
      },
      {
        id: "is-2",
        kicker: "The stack",
        headline: "Sales → costs → operating profit → net income.",
        body: "Gross profit is sales minus cost of goods. Operating income subtracts running the business. **Net income** is after interest and taxes — the headline earnings number.",
        metaphor: "🧮",
      },
      {
        id: "is-3",
        kicker: "The trap",
        headline: "Profit is not the same as cash.",
        body: "You can book a sale before the customer pays. That's why Phase 4 also looks at **free cash flow**. Treat net income as the report card, not the bank balance.",
        metaphor: "⚠️",
      },
      {
        id: "is-4",
        kicker: "Try it",
        headline: "Net margin = net income ÷ revenue.",
        body: "A company with **$10 of net income on $100 of sales** has a 10% net margin. Slide the two lines and watch the ratio. **Trends beat one lucky quarter.**",
        metaphor: "📏",
        widget: { type: "net-margin" },
      },
    ],
    quiz: {
      kind: "scenario",
      scenario: "A company booked $50 million of revenue and $8 million of net income this year.",
      question: "Which statement is true?",
      options: [
        {
          id: "a",
          label: "Net margin is 16% — and that profit still might not be cash in the bank",
          correct: true,
          explanation: "$8m ÷ $50m = 16%. Net income is an accounting result; cash can lag because of receivables, inventory, and capex.",
        },
        {
          id: "b",
          label: "The company must have $8 million sitting in cash",
          correct: false,
          explanation: "Net income is not a cash pile. The cash flow statement (and FCF) answers that.",
        },
        {
          id: "c",
          label: "Revenue and net income are the same thing",
          correct: false,
          explanation: "Revenue is the top line. Net income is what's left after almost every cost.",
        },
      ],
    },
    actionCard: "Pick a company. Write Revenue, Net Income, and Net Margin for the last full year.",
  },
  {
    id: "pe-eps",
    phaseId: "phase-4",
    index: 3,
    title: "P/E & EPS",
    subtitle: "What you pay for a dollar of earnings",
    icon: "calculator",
    accent: "#F59E0B",
    minutes: 4,
    cards: [
      {
        id: "pe-1",
        kicker: "EPS",
        headline: "Earnings per share = profit ÷ shares.",
        body: "If a company earns **$10 million** and has **10 million shares**, EPS is **$1**. It's the per-slice version of net income.",
        metaphor: "🍰",
      },
      {
        id: "pe-2",
        kicker: "P/E",
        headline: "Price ÷ EPS. The multiple.",
        body: "A **$20 stock** with **$1 of EPS** trades at **20× earnings**. You're paying $20 for each $1 the company earned (usually trailing twelve months).",
        metaphor: "🏷️",
      },
      {
        id: "pe-3",
        kicker: "Try it",
        headline: "Slide price and EPS. Read the multiple.",
        body: "Rough bands: **under ~15** often looks cheap, **~15–25** is a common fair zone, **much higher** usually means the market is paying for growth — or overpaying.",
        metaphor: "🎚️",
        widget: { type: "pe-ratio" },
      },
      {
        id: "pe-4",
        kicker: "Context",
        headline: "A multiple without a story is a trap.",
        body: "High P/E can be **earned growth**. Low P/E can be a **value trap**. Compare vs the company's history and its peers — never vs a random number from a tweet.",
        metaphor: "🧭",
      },
    ],
    quiz: {
      kind: "scenario",
      scenario: "Nova Co. trades at $100 a share. Trailing EPS is $5.",
      question: "What is Nova's P/E ratio?",
      options: [
        {
          id: "a",
          label: "20× — $100 ÷ $5",
          correct: true,
          explanation: "P/E = price / EPS = 100 / 5 = 20. Investors are paying $20 per $1 of trailing earnings.",
        },
        {
          id: "b",
          label: "5× — $5 ÷ $100",
          correct: false,
          explanation: "That's the earnings yield (EPS/price), the inverse of P/E — not the P/E itself.",
        },
        {
          id: "c",
          label: "500× — multiply them",
          correct: false,
          explanation: "You divide price by earnings. Multiplying them doesn't mean anything here.",
        },
      ],
    },
    actionCard: "Look up one stock's price, EPS, and P/E. Write whether it's above or below 20× and one reason that might be fair.",
  },
  {
    id: "fcf-dividends",
    phaseId: "phase-4",
    index: 4,
    title: "Free Cash Flow & Dividends",
    subtitle: "Cash the business can actually spend",
    icon: "coins",
    accent: "#34D399",
    minutes: 4,
    cards: [
      {
        id: "fc-1",
        kicker: "FCF",
        headline: "Cash left after keeping the lights on and the factory standing.",
        body: "**Free cash flow** ≈ operating cash minus capital expenditures. It's the pile that can pay **debt, buybacks, or dividends** without borrowing the story.",
        metaphor: "💵",
      },
      {
        id: "fc-2",
        kicker: "Dividends",
        headline: "A dividend is a cash thank-you — optional.",
        body: "Companies **don't have to** pay dividends. When they do, the cash has to come from somewhere. **Profit on paper can't mail a check.**",
        metaphor: "📬",
      },
      {
        id: "fc-3",
        kicker: "Try it",
        headline: "Slide FCF vs the dividend. Check coverage.",
        body: "**Payout ratio** = dividends ÷ FCF. Under ~80% (and certainly under 100%) is a healthier sign than a yield that only works if they keep borrowing.",
        metaphor: "🎚️",
        widget: { type: "fcf-div" },
      },
      {
        id: "fc-4",
        kicker: "Buybacks",
        headline: "Another way to return cash.",
        body: "Repurchasing shares shrinks the share count so each remaining slice is larger. Like dividends, they're only **quality** if FCF supports them.",
        metaphor: "♻️",
      },
    ],
    quiz: {
      kind: "scenario",
      scenario: "A company generated $2 billion of free cash flow and paid $2.4 billion of dividends this year.",
      question: "What's the honest read?",
      options: [
        {
          id: "a",
          label: "The dividend isn't fully covered by FCF — it may be stretching",
          correct: true,
          explanation:
            "Payout is 120% of FCF. That gap is filled with cash on hand, extra debt, or one-time items. Not automatically fatal — but not a comfortable cover.",
        },
        {
          id: "b",
          label: "Dividends always come from net income, so FCF doesn't matter",
          correct: false,
          explanation: "Checks are cashed in dollars. FCF is the cleaner read of whether those dollars were actually generated.",
        },
        {
          id: "c",
          label: "A payout over 100% means the company is extra generous and extra safe",
          correct: false,
          explanation: "Generosity that exceeds cash generation is a warning light, not a gold star.",
        },
      ],
    },
    actionCard: "On a dividend stock, compare annual dividends to free cash flow. Is the payout under 100%?",
  },
  {
    id: "dca",
    phaseId: "phase-5",
    index: 1,
    title: "Dollar-Cost Averaging",
    subtitle: "A schedule beats a mood",
    icon: "calendar",
    accent: "#22D3EE",
    minutes: 4,
    cards: [
      {
        id: "dca-1",
        kicker: "The habit",
        headline: "Invest a fixed amount on a fixed schedule.",
        body: "Same dollar amount, every paycheck or month, **whether the market is boring or screaming**. That's dollar-cost averaging (DCA).",
        metaphor: "📅",
      },
      {
        id: "dca-2",
        kicker: "The mechanic",
        headline: "You buy more shares when prices are down.",
        body: "$200 buys **more shares at $20** than at $40. Over time your **average cost** is smoothed. You stop trying to pick the perfect Tuesday.",
        metaphor: "📉",
      },
      {
        id: "dca-3",
        kicker: "Try it",
        headline: "Slide the monthly habit. Watch the pile.",
        body: "Same 7% ballpark as before. DCA's real gift is **behavior**: you stay in the game. Lump sum often wins on a spreadsheet if the cash is already sitting there.",
        metaphor: "🎚️",
        widget: { type: "dca", years: 20, returnRate: 0.07 },
      },
      {
        id: "dca-4",
        kicker: "When lump sum wins",
        headline: "If the money is already in cash, time in the market usually beats waiting.",
        body: "DCA shines when you're **investing each paycheck**. Don't park a lump sum for two years waiting for a crash that may not arrive.",
        metaphor: "⚡",
      },
    ],
    quiz: {
      kind: "scenario",
      scenario: "Casey gets paid twice a month and is tempted to wait for 'the dip' before buying an index ETF.",
      question: "What's the main job of DCA here?",
      options: [
        {
          id: "a",
          label: "Turn each paycheck into an automatic buy so mood doesn't run the plan",
          correct: true,
          explanation: "DCA is a behavior tool. It keeps you investing through FOMO and fear instead of timing every print.",
        },
        {
          id: "b",
          label: "Guarantee a higher return than investing all at once",
          correct: false,
          explanation: "Lump sum often wins historically when the cash is already available. DCA is about consistency, not a return promise.",
        },
        {
          id: "c",
          label: "Avoid stocks entirely until volatility is zero",
          correct: false,
          explanation: "Volatility never goes to zero. Waiting for calm is how people miss decades of compounding.",
        },
      ],
    },
    actionCard: "Set a calendar reminder or auto-invest date. Same dollar amount. Same fund. No vibe check.",
  },
  {
    id: "allocation",
    phaseId: "phase-5",
    index: 2,
    title: "Risk Management & Portfolio Architecture",
    subtitle: "Core, sectors, position size, and your life stage",
    icon: "pie-chart",
    accent: "#A78BFA",
    minutes: 5,
    cards: [
      {
        id: "al-1",
        kicker: "Core & Satellite Allocation",
        headline: "Build an unshakeable core. Then take satellite bets.",
        body: "**Core (60%–80%)**: broad, low-cost index funds — S&P 500 or **VTI** — that you don't tinker with. **Satellite (20%–40%)**: individual names (Apple, Nvidia) or thematic ETFs you chose after reading a balance sheet. The core pays you to be patient. Satellites are how you express a view without betting the house.",
        metaphor: "🪐",
        widget: { type: "core-satellite" },
      },
      {
        id: "al-2",
        kicker: "Sector Diversification",
        headline: "The Single Sector Trap looks like a genius year — until it isn't.",
        body: "A book of **100% tech stocks** isn't a portfolio; it's one bet. The S&P 500 spans **11 sectors** — Tech, Healthcare, Financials, Energy, Industrials, Staples, Discretionary, Communications, Utilities, Real Estate, Materials. Non-correlated groups don't crash in lockstep, so a healthcare or energy year can **offset** a tech drawdown.",
        metaphor: "🧩",
        widget: { type: "sector-mix" },
      },
      {
        id: "al-3",
        kicker: "Max 5%–10% Rule",
        headline: "No single stock should be able to sink you.",
        body: "Cap any **individual name at 5%–10%** of total portfolio value. A 40% Nvidia sleeve can look brilliant — until one earnings miss, lawsuit, or product cycle wipes years of savings. Index core holdings can run larger because they already spread the company risk.",
        metaphor: "⚖️",
        widget: { type: "position-size" },
      },
      {
        id: "al-4",
        kicker: "Lifecycle Investing",
        headline: "Age and the goal change the risk you can afford.",
        body: "**Young investors** (20s–30s, 20+ year horizon) can lean into growth: higher equity, more satellite room, ride drawdowns. **Near-retirement** investors protect the pile they already built — more **bonds, Treasuries, and dividend ballast**, fewer all-or-nothing stock bets. Same architecture. Different risk budget.",
        metaphor: "🎂",
        widget: { type: "allocation" },
      },
    ],
    quiz: {
      kind: "scenario",
      scenario:
        "Riley has $10,000 to invest and just finished this lesson. They love Nvidia, but they also want a portfolio that can survive a bad year.",
      question: "Which plan follows Core & Satellite and the 5%–10% rule?",
      options: [
        {
          id: "a",
          label: "$7,000 in VTI / S&P 500, $1,000 in Nvidia, $2,000 in other satellites",
          correct: true,
          explanation:
            "70% core is inside the 60%–80% band. Nvidia is 10% of the book — the top of the single-stock cap — and the rest of the satellite sleeve can be other names or a thematic ETF.",
        },
        {
          id: "b",
          label: "$2,000 in an index fund, $8,000 in Nvidia",
          correct: false,
          explanation:
            "That's an 80% satellite / 20% core flip, and Nvidia is 80% of the portfolio. One company now controls the outcome.",
        },
        {
          id: "c",
          label: "$10,000 in three tech stocks — sectors don't matter if they're winners",
          correct: false,
          explanation:
            "That's the Single Sector Trap with no core. Three correlated names can fall together. Architecture comes before conviction.",
        },
      ],
    },
    actionCard:
      "Write your core % (60–80), list every individual stock and its % of the total, and circle any name over 10%.",
  },
  {
    id: "fomo-panic",
    phaseId: "phase-5",
    index: 3,
    title: "FOMO & Panic Selling",
    subtitle: "Your brain vs your written plan",
    icon: "brain",
    accent: "#FB7185",
    minutes: 4,
    cards: [
      {
        id: "fp-1",
        kicker: "FOMO",
        headline: "Buying because everyone else looks rich.",
        body: "Fear of missing out pushes people to **chase last year's winner** at a worse price. That's how you buy a story after the easy money is gone.",
        metaphor: "🏃",
      },
      {
        id: "fp-2",
        kicker: "Panic",
        headline: "Selling a crash to make the pain stop.",
        body: "A **−30% year** feels like failure. Selling **locks the loss**. The market's long-run return includes those ugly years — you only get it if you stay.",
        metaphor: "😱",
      },
      {
        id: "fp-3",
        kicker: "Try it",
        headline: "Slide a drop. See the recovery math.",
        body: "A **33% fall** needs a **50% rally** just to get back to even. Panic selling is how a temporary drawdown becomes a **permanent scar.**",
        metaphor: "🎚️",
        widget: { type: "panic-hold", startValue: 10000 },
      },
      {
        id: "fp-4",
        kicker: "Guardrails",
        headline: "Write the rules when you're calm.",
        body: "Auto-invest. Own a boring mix. **No all-in on hype**. If you must act in a crash, rebalance — don't abandon a 20-year plan for a 20-day feeling.",
        metaphor: "📝",
      },
      {
        id: "fp-5",
        kicker: "The whole curriculum",
        headline: "Defense, then accounts, then assets, then judgment.",
        body: "You built a shield, captured tax-advantaged compounding, bought diversified assets, and learned to read a business. **Psychology is the last boss.** Time in the market still beats timing it.",
        metaphor: "🏁",
      },
    ],
    quiz: {
      kind: "scenario",
      scenario:
        "Taylor's diversified index portfolio is down 30% this year. Retirement is 25 years away. A friend says 'get out before it goes to zero.'",
      question: "What's the plan-aligned move?",
      options: [
        {
          id: "a",
          label: "Hold (or keep DCA-ing) — a crash isn't a 25-year thesis change",
          correct: true,
          explanation:
            "Long-horizon owners expect drawdowns. Selling turns a paper loss into a real one and misses the recovery that historically follows.",
        },
        {
          id: "b",
          label: "Sell everything and wait for the all-clear headline",
          correct: false,
          explanation: "The all-clear usually arrives after prices have already rebounded. That's how panic sells the bottom.",
        },
        {
          id: "c",
          label: "Double down on whatever went up this week",
          correct: false,
          explanation: "That's FOMO, the other trap. A written allocation beats chasing heat.",
        },
      ],
    },
    actionCard: "Write one rule: 'If my index fund drops 20%, I will ___ (keep buying / rebalance / do nothing).' Stick it on the plan.",
  },
];

export function phaseIndex(phaseId: PhaseId): number {
  return PHASE_ORDER.indexOf(phaseId);
}

export function modulesForPhase(phaseId: PhaseId): LessonModuleDef[] {
  return LESSON_MODULES.filter((moduleDef) => moduleDef.phaseId === phaseId);
}

export type PhaseUnlockOptions = {
  recommendedPhaseId?: PhaseId;
  lockedPhaseIds?: PhaseId[];
  phaseOrder?: PhaseId[];
  unlockAllPhases?: boolean;
};

export function curriculumIsComplete(completed: Record<string, boolean>): boolean {
  return PHASE_ORDER.every((phaseId) => phaseIsComplete(phaseId, completed));
}

export function previousPhaseId(phaseId: PhaseId, order: PhaseId[] = PHASE_ORDER): PhaseId | null {
  const index = order.indexOf(phaseId);
  return index > 0 ? order[index - 1] : null;
}

export function nextPhaseId(phaseId: PhaseId, order: PhaseId[] = PHASE_ORDER): PhaseId | null {
  const index = order.indexOf(phaseId);
  return index >= 0 ? order[index + 1] ?? null : null;
}

export function phaseIsComplete(phaseId: PhaseId, completed: Record<string, boolean>): boolean {
  const modules = modulesForPhase(phaseId);
  return modules.length > 0 && modules.every((moduleDef) => Boolean(completed[moduleDef.id]));
}

export function isPhaseUnlocked(
  phaseId: PhaseId,
  completed: Record<string, boolean>,
  _recommendedPhaseId?: PhaseId,
  options?: PhaseUnlockOptions
): boolean {
  if (options?.unlockAllPhases) return true;

  const locked = options?.lockedPhaseIds ?? [];
  if (locked.includes(phaseId)) return false;

  const sequence = PHASE_ORDER;
  const index = sequence.indexOf(phaseId);
  if (index <= 0) return true;
  const previous = sequence[index - 1];
  return previous ? phaseIsComplete(previous, completed) : true;
}

export function lessonXpPossible(moduleDef: LessonModuleDef): number {
  return moduleDef.cards.length * CARD_XP + QUIZ_XP;
}

export const OPEN_LESSON_EVENT = "matterpro:open-lesson";

export type OpenLessonDetail = {
  moduleId?: string;
  phaseId?: PhaseId;
};

export function requestOpenLesson(detail: OpenLessonDetail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OpenLessonDetail>(OPEN_LESSON_EVENT, { detail }));
}
