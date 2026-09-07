import {
  ChevronRight,
  Fingerprint,
  Landmark,
  LogOut,
  MessageSquare,
  Moon,
  User,
} from "lucide-react";
import React, { useState } from "react";
import type { AuthUser } from "../lib/auth";

type ProfileScreenProps = {
  user: AuthUser;
  onLogout: () => void;
};

type SettingsRowProps = {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
};

function SettingsRow({ icon, title, subtitle, trailing, onClick }: SettingsRowProps) {
  const content = (
    <>
      <span style={styles.rowIcon}>{icon}</span>
      <span style={styles.rowBody}>
        <span style={styles.rowTitle}>{title}</span>
        {subtitle ? <span style={styles.rowSubtitle}>{subtitle}</span> : null}
      </span>
      {trailing ?? (onClick ? <ChevronRight size={16} color="#9CA3AF" /> : null)}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={{ ...styles.row, cursor: "pointer" }}>
        {content}
      </button>
    );
  }

  return <div style={styles.row}>{content}</div>;
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        ...styles.toggle,
        background: checked ? "#10B981" : "#1F1F1F",
        borderColor: checked ? "#10B981" : "#2A2A2A",
      }}
    >
      <span
        style={{
          ...styles.toggleKnob,
          transform: checked ? "translateX(18px)" : "translateX(0)",
        }}
      />
    </button>
  );
}

export default function ProfileScreen({ user, onLogout }: ProfileScreenProps) {
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const initials = (user.name || user.email || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";

  const sendFeedback = () => {
    window.location.href =
      "mailto:feedback@matterpro.app?subject=MatterPro%20Beta%20Feedback";
  };

  return (
    <div style={styles.root}>
      {/* User card */}
      <section style={styles.userCard} aria-label="Profile">
        <div style={styles.avatar} aria-hidden="true">
          {initials}
        </div>
        <div style={styles.userMeta}>
          <h2 style={styles.userName}>{user.name}</h2>
          <p style={styles.userEmail}>{user.email}</p>
          <span style={styles.planBadge}>Free Plan</span>
        </div>
      </section>

      {/* Currency lock */}
      <section style={styles.card} aria-label="Currency">
        <p style={styles.sectionLabel}>Currency</p>
        <div style={styles.currencyRow}>
          <div>
            <p style={styles.currencyPrimary}>USD ($)</p>
            <p style={styles.currencyHint}>Primary currency · US market</p>
          </div>
          <span style={styles.lockChip}>Locked</span>
        </div>
      </section>

      {/* Account */}
      <section style={styles.card} aria-label="Account settings">
        <p style={styles.sectionLabel}>Account</p>
        <SettingsRow
          icon={<User size={16} color="#10B981" />}
          title="Personal Info"
          subtitle="Name, email, and account profile"
          onClick={() => window.alert("Personal info editing comes in a later build.")}
        />
        <div style={styles.divider} />
        <SettingsRow
          icon={<Fingerprint size={16} color="#10B981" />}
          title="Biometric Authentication"
          subtitle="Face ID / Touch ID"
          trailing={
            <Toggle
              checked={biometricEnabled}
              onChange={setBiometricEnabled}
              label="Biometric Authentication"
            />
          }
        />
      </section>

      {/* Integrations */}
      <section style={styles.card} aria-label="Integrations">
        <p style={styles.sectionLabel}>Integrations</p>
        <SettingsRow
          icon={<Landmark size={16} color="#10B981" />}
          title="Connected Brokerage Accounts"
          subtitle="No accounts connected"
          trailing={<span style={styles.statusChip}>Demo</span>}
        />
      </section>

      {/* App Preferences */}
      <section style={styles.card} aria-label="App preferences">
        <p style={styles.sectionLabel}>App Preferences</p>
        <SettingsRow
          icon={<Moon size={16} color="#10B981" />}
          title="Theme"
          subtitle="Matte Dark Mode · #000000"
          trailing={<span style={styles.statusChipActive}>Default</span>}
        />
      </section>

      {/* Support */}
      <section style={styles.card} aria-label="Support and feedback">
        <p style={styles.sectionLabel}>Support & Feedback</p>
        <button type="button" onClick={sendFeedback} style={styles.feedbackBtn}>
          <MessageSquare size={16} />
          Send Feedback
        </button>
        <p style={styles.feedbackHint}>Help shape MatterPro during beta testing.</p>
      </section>

      {/* Log out */}
      <button type="button" onClick={onLogout} style={styles.logoutBtn}>
        <LogOut size={16} />
        Log Out
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  userCard: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: "#0A0A0A",
    border: "1px solid #1F1F1F",
    borderRadius: 16,
    padding: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #10B981, #059669)",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    fontSize: 22,
    color: "#042F2E",
    boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.22)",
    flexShrink: 0,
  },
  userMeta: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  userName: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: "#FFFFFF",
  },
  userEmail: {
    margin: 0,
    fontSize: 13,
    color: "#9CA3AF",
  },
  planBadge: {
    alignSelf: "flex-start",
    marginTop: 4,
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(16, 185, 129, 0.35)",
    color: "#6EE7B7",
    borderRadius: 999,
    padding: "3px 10px",
    fontSize: 11,
    fontWeight: 700,
  },
  card: {
    background: "#0A0A0A",
    border: "1px solid #1F1F1F",
    borderRadius: 16,
    padding: 14,
  },
  sectionLabel: {
    margin: "0 0 10px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#9CA3AF",
  },
  currencyRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  currencyPrimary: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: "#FFFFFF",
  },
  currencyHint: {
    margin: "4px 0 0",
    fontSize: 12,
    color: "#9CA3AF",
  },
  lockChip: {
    background: "rgba(156, 163, 175, 0.12)",
    border: "1px solid #2A2A2A",
    color: "#9CA3AF",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  row: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 4px",
    background: "transparent",
    border: "none",
    color: "inherit",
    textAlign: "left",
    cursor: "default",
    borderRadius: 10,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: "rgba(16, 185, 129, 0.12)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#FFFFFF",
  },
  rowSubtitle: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  divider: {
    height: 1,
    background: "#1F1F1F",
    margin: "2px 0",
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 999,
    border: "1px solid",
    padding: 2,
    cursor: "pointer",
    flexShrink: 0,
    transition: "background 0.2s ease, border-color 0.2s ease",
  },
  toggleKnob: {
    display: "block",
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "#FFFFFF",
    transition: "transform 0.2s ease",
    boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
  },
  statusChip: {
    background: "rgba(156, 163, 175, 0.12)",
    border: "1px solid #2A2A2A",
    color: "#9CA3AF",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
  },
  statusChipActive: {
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(16, 185, 129, 0.35)",
    color: "#6EE7B7",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
  },
  feedbackBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(16, 185, 129, 0.4)",
    color: "#6EE7B7",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 750,
    cursor: "pointer",
  },
  feedbackHint: {
    margin: "8px 0 0",
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
  },
  logoutBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    background: "transparent",
    border: "1px solid #F43F5E",
    color: "#FDA4AF",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 750,
    cursor: "pointer",
  },
};
