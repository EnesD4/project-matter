import { Loader2, Lock, Mail, User } from "lucide-react";
import React, { useState } from "react";
import { loginUser, registerUser, saveSession, type AuthUser } from "../lib/auth";

type AuthMode = "login" | "signup";

type AuthScreenProps = {
  onAuthenticated: (user: AuthUser) => void;
};

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = isSignup
        ? await registerUser({ name: name.trim(), email: email.trim(), password })
        : await loginUser({ email: email.trim(), password });
      saveSession(result.token, result.user);
      onAuthenticated(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.glowA} aria-hidden="true" />
      <div style={styles.glowB} aria-hidden="true" />

      <div style={styles.shell}>
        <header style={styles.brandBlock}>
          <p style={styles.brand}>MatterPro</p>
          <h1 style={styles.headline}>{isSignup ? "Create your account" : "Welcome back"}</h1>
          <p style={styles.subhead}>
            {isSignup
              ? "Track your portfolio securely across devices."
              : "Sign in to pick up your portfolio where you left off."}
          </p>
        </header>

        <div style={styles.tabs} role="tablist" aria-label="Auth mode">
          <button
            type="button"
            role="tab"
            aria-selected={!isSignup}
            onClick={() => switchMode("login")}
            style={{ ...styles.tab, ...(!isSignup ? styles.tabActive : undefined) }}
          >
            Log In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSignup}
            onClick={() => switchMode("signup")}
            style={{ ...styles.tab, ...(isSignup ? styles.tabActive : undefined) }}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={onSubmit} style={styles.form} noValidate>
          {isSignup && (
            <label style={styles.field}>
              <span style={styles.label}>Full name</span>
              <span style={styles.inputWrap}>
                <User size={16} color="#6B7280" />
                <input
                  style={styles.input}
                  type="text"
                  autoComplete="name"
                  placeholder="Alex Morgan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </span>
            </label>
          )}

          <label style={styles.field}>
            <span style={styles.label}>Email</span>
            <span style={styles.inputWrap}>
              <Mail size={16} color="#6B7280" />
              <input
                style={styles.input}
                type="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </span>
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Password</span>
            <span style={styles.inputWrap}>
              <Lock size={16} color="#6B7280" />
              <input
                style={styles.input}
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder={isSignup ? "At least 6 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </span>
          </label>

          {error ? <p style={styles.error}>{error}</p> : null}

          <button type="submit" style={styles.submit} disabled={loading}>
            {loading ? <Loader2 size={18} className="animate-spin" /> : null}
            {loading ? "Please wait…" : isSignup ? "Create account" : "Log in"}
          </button>
        </form>

        <p style={styles.footerHint}>
          {isSignup ? "Already have an account?" : "New to MatterPro?"}{" "}
          <button
            type="button"
            style={styles.linkBtn}
            onClick={() => switchMode(isSignup ? "login" : "signup")}
          >
            {isSignup ? "Log in" : "Create one"}
          </button>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#000000",
    color: "#FFFFFF",
    display: "grid",
    placeItems: "center",
    padding: "32px 16px",
    position: "relative",
    overflow: "hidden",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  },
  glowA: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(16,185,129,0.18), transparent 68%)",
    top: -120,
    left: -80,
    pointerEvents: "none",
  },
  glowB: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(16,185,129,0.10), transparent 70%)",
    bottom: -100,
    right: -60,
    pointerEvents: "none",
  },
  shell: {
    width: "100%",
    maxWidth: 420,
    background: "#0A0A0A",
    border: "1px solid #1F1F1F",
    borderRadius: 20,
    padding: "28px 22px 24px",
    boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
    position: "relative",
    zIndex: 1,
  },
  brandBlock: {
    marginBottom: 22,
  },
  brand: {
    margin: 0,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#10B981",
  },
  headline: {
    margin: "10px 0 0",
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: "-0.03em",
    color: "#FFFFFF",
  },
  subhead: {
    margin: "8px 0 0",
    fontSize: 14,
    lineHeight: 1.45,
    color: "#9CA3AF",
  },
  tabs: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 6,
    padding: 4,
    background: "#121212",
    borderRadius: 12,
    border: "1px solid #1F1F1F",
    marginBottom: 20,
  },
  tab: {
    border: "none",
    background: "transparent",
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: 700,
    padding: "10px 8px",
    borderRadius: 9,
    cursor: "pointer",
  },
  tabActive: {
    background: "#10B981",
    color: "#042F2E",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#9CA3AF",
  },
  inputWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#121212",
    border: "1px solid #1F1F1F",
    borderRadius: 12,
    padding: "0 12px",
  },
  input: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#FFFFFF",
    fontSize: 15,
    padding: "13px 0",
  },
  error: {
    margin: 0,
    fontSize: 13,
    color: "#FDA4AF",
    background: "rgba(244,63,94,0.10)",
    border: "1px solid rgba(244,63,94,0.28)",
    borderRadius: 10,
    padding: "10px 12px",
  },
  submit: {
    marginTop: 4,
    border: "none",
    borderRadius: 12,
    background: "#10B981",
    color: "#042F2E",
    fontSize: 15,
    fontWeight: 800,
    padding: "13px 16px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  footerHint: {
    margin: "18px 0 0",
    textAlign: "center",
    fontSize: 13,
    color: "#9CA3AF",
  },
  linkBtn: {
    border: "none",
    background: "transparent",
    color: "#6EE7B7",
    fontWeight: 700,
    cursor: "pointer",
    padding: 0,
    fontSize: 13,
  },
};
