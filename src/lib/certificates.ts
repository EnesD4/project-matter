import { curriculumIsComplete, PHASE_ORDER, type PhaseId } from "./lessons";
import { readLocalItem } from "./storage";

export const CERTIFICATE_TIERS = ["gold"] as const;
export type CertificateTier = (typeof CERTIFICATE_TIERS)[number];
export type AcademyPhaseId = PhaseId;

export type Certificate = {
  tier: CertificateTier;
  userName: string;
  awardedAt: string;
  startPhase: AcademyPhaseId;
};

type CertificatePersist = {
  startPhase?: AcademyPhaseId;
  certificates: Partial<Record<CertificateTier, Certificate>>;
};

export const CERTIFICATE_UNLOCKED_EVENT = "matterpro:certificate-unlocked";

export type CertificateUnlockedDetail = {
  certificate: Certificate;
};

export const CERTIFICATE_META: Record<
  CertificateTier,
  {
    title: string;
    pathLabel: string;
    accent: string;
    accentSoft: string;
    glow: string;
  }
> = {
  gold: {
    title: "Sprout Gold Financial Master Certificate",
    pathLabel: "All 5 Curriculum Phases",
    accent: "#E8C547",
    accentSoft: "rgba(232, 197, 71, 0.18)",
    glow: "rgba(232, 197, 71, 0.55)",
  },
};

function storageKey(userId: string) {
  return `sprout_academy_certificates_${userId || "anon"}`;
}

function legacyStorageKey(userId: string) {
  return `matterpro:academy-certificates:${userId || "anon"}`;
}

function emptyPersist(): CertificatePersist {
  return { certificates: {} };
}

function isPhaseId(value: unknown): value is AcademyPhaseId {
  return typeof value === "string" && (PHASE_ORDER as readonly string[]).includes(value);
}

function isTier(value: unknown): value is CertificateTier {
  return value === "gold";
}

function loadPersist(userId: string): CertificatePersist {
  try {
    const raw = readLocalItem(storageKey(userId), legacyStorageKey(userId));
    if (!raw) return emptyPersist();
    const parsed = JSON.parse(raw) as Partial<CertificatePersist>;
    const certificates: Partial<Record<CertificateTier, Certificate>> = {};
    const rawCerts =
      parsed.certificates && typeof parsed.certificates === "object" ? parsed.certificates : {};
    for (const tier of CERTIFICATE_TIERS) {
      const entry = rawCerts[tier];
      if (!entry || typeof entry !== "object") continue;
      if (!isTier(entry.tier)) continue;
      if (typeof entry.userName !== "string") continue;
      if (typeof entry.awardedAt !== "string" || Number.isNaN(Date.parse(entry.awardedAt))) continue;
      certificates[tier] = {
        tier: entry.tier,
        userName: entry.userName,
        awardedAt: entry.awardedAt,
        startPhase: isPhaseId(entry.startPhase) ? entry.startPhase : "phase-1",
      };
    }
    return {
      startPhase: isPhaseId(parsed.startPhase) ? parsed.startPhase : undefined,
      certificates,
    };
  } catch {
    return emptyPersist();
  }
}

function savePersist(userId: string, state: CertificatePersist) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // ignore quota / private-mode failures
  }
}

const announcedUnlocks = new Set<string>();
let pendingUnlock: Certificate | null = null;
const unlockListeners = new Set<(certificate: Certificate) => void>();

export function subscribeCertificateUnlocks(listener: (certificate: Certificate) => void): () => void {
  unlockListeners.add(listener);
  if (pendingUnlock) listener(pendingUnlock);
  return () => {
    unlockListeners.delete(listener);
  };
}

export function acknowledgeCertificateUnlock() {
  pendingUnlock = null;
}

function publishUnlock(certificate: Certificate) {
  pendingUnlock = certificate;
  for (const listener of unlockListeners) listener(certificate);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<CertificateUnlockedDetail>(CERTIFICATE_UNLOCKED_EVENT, {
        detail: { certificate },
      })
    );
  }
}

export function loadCertificates(userId: string): Certificate[] {
  const persist = loadPersist(userId);
  return CERTIFICATE_TIERS.map((tier) => persist.certificates[tier]).filter(
    (cert): cert is Certificate => Boolean(cert)
  );
}

export function loadAcademyStartPhase(userId: string): AcademyPhaseId {
  return loadPersist(userId).startPhase ?? "phase-1";
}

export function saveAcademyStartPhase(userId: string, phase: AcademyPhaseId) {
  const persist = loadPersist(userId);
  if (persist.startPhase === phase) return;
  persist.startPhase = phase;
  savePersist(userId, persist);
}

export function formatCertificateDate(iso?: string, now = new Date()): string {
  const date = iso ? new Date(iso) : now;
  if (Number.isNaN(date.getTime())) {
    return now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function certificateBodyText(certificate: Certificate): { name: string; date: string } {
  return {
    name: certificate.userName.trim() || "Investor",
    date: formatCertificateDate(certificate.awardedAt),
  };
}

function awardCertificate(
  userId: string,
  tier: CertificateTier,
  userName: string,
  startPhase: AcademyPhaseId,
  now = new Date()
): Certificate | null {
  const persist = loadPersist(userId);
  const existing = persist.certificates[tier];
  const key = `${userId}:${tier}`;
  if (existing) {
    announcedUnlocks.add(key);
    return null;
  }

  const certificate: Certificate = {
    tier,
    userName: userName.trim() || "Investor",
    awardedAt: now.toISOString(),
    startPhase,
  };
  persist.certificates[tier] = certificate;
  if (!persist.startPhase) persist.startPhase = startPhase;
  savePersist(userId, persist);

  if (announcedUnlocks.has(key)) return certificate;
  announcedUnlocks.add(key);
  publishUnlock(certificate);
  return certificate;
}

export function maybeAwardGoldMasterCertificate(
  userId: string,
  userName: string,
  completed: Record<string, boolean>
): Certificate | null {
  if (!curriculumIsComplete(completed)) return null;
  return awardCertificate(userId, "gold", userName, "phase-1");
}
