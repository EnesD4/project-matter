import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Award, ChevronDown, ChevronUp, GraduationCap, X } from "lucide-react";
import {
  CERTIFICATE_META,
  CERTIFICATE_UNLOCKED_EVENT,
  certificateBodyText,
  loadCertificates,
  type Certificate,
} from "../lib/certificates";
import { playAchievementFanfare } from "../lib/audioService";
import { CertificateArt } from "./CertificateArt";

export default function CertificatesSection({
  userId,
}: {
  userId: string;
}) {
  const [open, setOpen] = useState(true);
  const [certificates, setCertificates] = useState<Certificate[]>(() => loadCertificates(userId));
  const [selected, setSelected] = useState<Certificate | null>(null);
  const panelId = useId();
  const titleId = useId();
  const dialogId = useId();
  const dialogTitleId = useId();

  useEffect(() => {
    const refresh = () => setCertificates(loadCertificates(userId));
    refresh();
    window.addEventListener(CERTIFICATE_UNLOCKED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CERTIFICATE_UNLOCKED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [userId]);

  useEffect(() => {
    if (selected) playAchievementFanfare();
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [selected]);

  const count = certificates.length;

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A]">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-3 p-3.5 text-left transition hover:bg-white/[0.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
        >
          <span className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-[10px] bg-amber-500/15">
            <Award size={16} color="#E8C547" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span id={titleId} className="block text-[14px] font-bold text-white">
              Certificates & Diplomas
            </span>
            <span className="mt-0.5 block text-[12px] text-[#9CA3AF]">
              {count === 0
                ? "Earn the Sprout Gold Financial Master Certificate at 100% of all 5 phases"
                : "Sprout Gold Financial Master Certificate earned"}
            </span>
          </span>
          <span className="flex flex-shrink-0 items-center gap-1">
            {count > 0 ? (
              <span className="rounded-full border border-amber-500/35 bg-amber-500/12 px-2 py-0.5 text-[10px] font-extrabold tabular-nums text-[#F5D76E]">
                {count}
              </span>
            ) : null}
            {open ? (
              <ChevronUp size={16} color="#9CA3AF" aria-hidden="true" />
            ) : (
              <ChevronDown size={16} color="#9CA3AF" aria-hidden="true" />
            )}
          </span>
        </button>

        <div
          id={panelId}
          role="region"
          aria-labelledby={titleId}
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div className="space-y-2 border-t border-[#1F1F1F] px-3.5 pb-3.5 pt-3">
              {certificates.length === 0 ? (
                <UnearnedCertificatePlaceholder />
              ) : (
                certificates.map((certificate) => (
                  <CertificatePreviewCard
                    key={certificate.tier}
                    certificate={certificate}
                    onOpen={() => setSelected(certificate)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {selected
        ? createPortal(
            <div
              className="certificate-celebrate certificate-celebrate--viewer"
              onClick={() => setSelected(null)}
              role="presentation"
            >
              <div
                id={dialogId}
                className="certificate-celebrate__dialog matter-pop"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
              >
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Close certificate"
                  className="certificate-celebrate__close"
                >
                  <X size={16} />
                </button>
                <h2 id={dialogTitleId} className="sr-only">
                  {CERTIFICATE_META[selected.tier].title}
                </h2>
                <div className="certificate-celebrate__glow">
                  <CertificateArt certificate={selected} />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function CertificatePreviewCard({
  certificate,
  onOpen,
}: {
  certificate: Certificate;
  onOpen: () => void;
}) {
  const meta = CERTIFICATE_META[certificate.tier];
  const { date } = certificateBodyText(certificate);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="certificate-preview-card"
      aria-label={`View ${meta.title} full size`}
      style={{
        borderColor: `${meta.accent}55`,
        boxShadow: `inset 3px 0 0 ${meta.accent}`,
      }}
    >
      <span className="certificate-preview-card__mini" aria-hidden="true">
        <CertificateArt certificate={certificate} size="preview" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[13px] font-extrabold text-white">{meta.title}</span>
        <span className="mt-0.5 block text-[11px] text-[#9CA3AF]">{meta.pathLabel}</span>
        <span className="mt-1 block text-[11px] font-semibold" style={{ color: meta.accent }}>
          Awarded {date}
        </span>
      </span>
    </button>
  );
}

function UnearnedCertificatePlaceholder() {
  return (
    <div className="certificate-preview-card certificate-preview-card--empty">
      <span
        className="grid h-[52px] w-[52px] flex-shrink-0 place-items-center rounded-xl bg-white/[0.04] text-[#9CA3AF]"
        aria-hidden="true"
      >
        <GraduationCap size={18} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[13px] font-extrabold text-white">Sprout Gold Financial Master awaits</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-[#9CA3AF]">
          Complete all 5 curriculum phases at 100%. Phase badges live in the Trophy Cabinet.
        </span>
      </span>
    </div>
  );
}

