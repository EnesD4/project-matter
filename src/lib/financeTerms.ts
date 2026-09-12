import { type PhaseId } from "./lessons";

export type FinanceTerm = {
  id: string;
  label: string;
  aliases: string[];
  sentences: [string, string];
  lessonId: string;
  phaseId: PhaseId;
};

export const FINANCE_TERMS: FinanceTerm[] = [
  {
    id: "hysa",
    label: "HYSA",
    aliases: ["High-Yield Savings Account", "HYSA"],
    sentences: [
      "A High-Yield Savings Account pays about 4–5%+ APY, while a typical bank savings account pays around 0.01%.",
      "It's FDIC insured and stays liquid, so emergency cash can earn more without being locked in the market.",
    ],
    lessonId: "emergency-fund",
    phaseId: "phase-1",
  },
  {
    id: "roth-ira",
    label: "Roth IRA",
    aliases: ["Roth IRA"],
    sentences: [
      "A Roth IRA is a retirement account you fund with after-tax dollars.",
      "Qualified withdrawals — including decades of growth — come out tax-free.",
    ],
    lessonId: "roth-vs-trad",
    phaseId: "phase-2",
  },
  {
    id: "401k-match",
    label: "401(k) Match",
    aliases: ["401(k) Match", "401(k) match", "401(k)"],
    sentences: [
      "A 401(k) match is free money: your employer adds cash when you contribute, up to a cap.",
      "Contribute at least enough to capture the full match before extra investing.",
    ],
    lessonId: "match-401k",
    phaseId: "phase-2",
  },
  {
    id: "hsa",
    label: "HSA",
    aliases: ["HSA"],
    sentences: [
      "A Health Savings Account can cut taxes going in, grow tax-free, and pay qualified medical bills tax-free.",
      "You need a high-deductible health plan to open one — then it can also work as a stealth retirement account.",
    ],
    lessonId: "hsa",
    phaseId: "phase-2",
  },
];

export type TermSegment = {
  text: string;
  term?: FinanceTerm;
};

function isWordChar(char: string | undefined): boolean {
  return Boolean(char && /[A-Za-z0-9-]/.test(char));
}

export function splitFinanceTerms(text: string): TermSegment[] {
  const parts: TermSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let best: { start: number; end: number; term: FinanceTerm } | null = null;

    for (const term of FINANCE_TERMS) {
      for (const alias of term.aliases) {
        const idx = text.toLowerCase().indexOf(alias.toLowerCase(), cursor);
        if (idx === -1) continue;
        const end = idx + alias.length;
        if (isWordChar(text[idx - 1]) || isWordChar(text[end])) continue;
        if (!best || idx < best.start || (idx === best.start && end > best.end)) {
          best = { start: idx, end, term };
        }
      }
    }

    if (!best) {
      parts.push({ text: text.slice(cursor) });
      break;
    }
    if (best.start > cursor) parts.push({ text: text.slice(cursor, best.start) });
    parts.push({ text: text.slice(best.start, best.end), term: best.term });
    cursor = best.end;
  }

  return parts;
}

export function hasFinanceTerm(text: string): boolean {
  return splitFinanceTerms(text).some((part) => part.term);
}
