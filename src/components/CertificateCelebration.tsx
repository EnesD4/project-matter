import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  acknowledgeCertificateUnlock,
  CERTIFICATE_META,
  subscribeCertificateUnlocks,
  type Certificate,
} from "../lib/certificates";
import { CertificateArt } from "./CertificateArt";

export default function CertificateCelebration() {
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const titleId = useId();

  useEffect(() => {
    return subscribeCertificateUnlocks((next) => {
      setCertificate(next);
    });
  }, []);

  useEffect(() => {
    if (!certificate) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        acknowledgeCertificateUnlock();
        setCertificate(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [certificate]);

  const close = () => {
    acknowledgeCertificateUnlock();
    setCertificate(null);
  };

  if (!certificate) return null;

  const accent = CERTIFICATE_META[certificate.tier].accent;

  return createPortal(
    <div
      className="certificate-celebrate"
      onClick={close}
      role="presentation"
    >
      <div
        className="certificate-celebrate__dialog matter-pop"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close certificate"
          className="certificate-celebrate__close"
        >
          <X size={16} />
        </button>
        <h2 id={titleId} className="certificate-celebrate__header" style={{ color: accent }}>
          CONGRATULATIONS!
        </h2>
        <div className="certificate-celebrate__glow">
          <CertificateArt certificate={certificate} />
        </div>
        <button type="button" onClick={close} className="certificate-celebrate__cta">
          Continue
        </button>
      </div>
    </div>,
    document.body
  );
}
