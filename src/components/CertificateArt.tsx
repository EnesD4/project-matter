import { Award, Sparkles } from "lucide-react";
import {
  CERTIFICATE_META,
  certificateBodyText,
  type Certificate,
  type CertificateTier,
} from "../lib/certificates";

const TIER_CLASS: Record<CertificateTier, string> = {
  gold: "certificate--gold",
  ocean: "certificate--ocean",
  flame: "certificate--flame",
};

export function CertificateArt({
  certificate,
  size = "full",
}: {
  certificate: Certificate;
  size?: "full" | "preview";
}) {
  const meta = CERTIFICATE_META[certificate.tier];
  const { name, date } = certificateBodyText(certificate);
  const preview = size === "preview";

  return (
    <article
      className={`certificate ${TIER_CLASS[certificate.tier]} ${preview ? "certificate--preview" : ""}`}
      aria-label={`${meta.title} awarded to ${name}`}
    >
      <div className="certificate__frame">
        <div className="certificate__inner">
          <p className="certificate__brand">Matter Academy</p>
          <span className="certificate__ornament" aria-hidden="true">
            <Sparkles size={preview ? 10 : 14} />
          </span>
          <h3 className="certificate__title">Certificate of Completion</h3>
          <p className="certificate__tier">{meta.title}</p>
          <p className="certificate__body">
            Congratulations <strong>{name}</strong>, you finished Matter Academy successfully in{" "}
            <strong>{date}</strong>.
          </p>
          <div className="certificate__seal" aria-hidden="true">
            <Award />
          </div>
          <p className="certificate__path">{meta.pathLabel}</p>
        </div>
      </div>
    </article>
  );
}
