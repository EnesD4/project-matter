import { BookOpen, X } from "lucide-react";
import React, { useEffect } from "react";
import { type FinanceTerm, splitFinanceTerms } from "../lib/financeTerms";
import { requestOpenLesson } from "../lib/lessons";

type TermInfoPopoverProps = {
  term: FinanceTerm;
  onClose: () => void;
  onLearnInLessons?: () => void;
};

export function TermInfoPopover({ term, onClose, onLearnInLessons }: TermInfoPopoverProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const learn = () => {
    requestOpenLesson({ moduleId: term.lessonId, phaseId: term.phaseId });
    onLearnInLessons?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="matter-pop w-full max-w-sm overflow-hidden rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`term-info-${term.id}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="m-0 text-[10px] font-extrabold uppercase tracking-[0.14em] text-emerald-400">Quick explainer</p>
            <h4 id={`term-info-${term.id}`} className="mt-1 mb-0 text-base font-extrabold text-white">
              {term.label}
            </h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${term.label} explainer`}
            className="flex-shrink-0 rounded-lg p-1 text-neutral-500 transition hover:bg-white/5 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
        <p className="mt-2 mb-0 text-[13px] font-semibold leading-relaxed text-slate-300">{term.sentences[0]}</p>
        <p className="mt-2 mb-0 text-[13px] font-semibold leading-relaxed text-slate-300">{term.sentences[1]}</p>
        <button
          type="button"
          onClick={learn}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2.5 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400"
        >
          <BookOpen size={15} />
          Learn in Lessons
        </button>
      </div>
    </div>
  );
}

type TermRichTextProps = {
  text: string;
  onOpenTerm: (term: FinanceTerm) => void;
  className?: string;
  strike?: boolean;
};

export function TermRichText({ text, onOpenTerm, className, strike = false }: TermRichTextProps) {
  const parts = splitFinanceTerms(text);
  const textClass = strike ? "line-through decoration-emerald-500/60" : undefined;
  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.term ? (
          <span key={`${part.term.id}-${index}`} className="whitespace-nowrap">
            <span className={textClass}>{part.text}</span>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenTerm(part.term!);
              }}
              aria-label={`What is ${part.term.label}?`}
              className="term-info-btn ml-0.5 mb-px inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-neutral-500/80 bg-transparent align-middle text-[8px] font-extrabold leading-none text-neutral-400 no-underline transition hover:border-emerald-400 hover:text-emerald-400"
            >
              i
            </button>
          </span>
        ) : (
          <span key={`t-${index}`} className={textClass}>
            {part.text}
          </span>
        )
      )}
    </span>
  );
}
