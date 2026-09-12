import { useGoogleLogin } from "@react-oauth/google";
import { Loader2, Lock, Mail, User } from "lucide-react";
import React, { useState } from "react";
import {
  loginUser,
  loginWithGoogle,
  registerUser,
  saveSession,
  type AuthUser,
  type UserSettings,
} from "../lib/auth";

type AuthMode = "login" | "signup";

type AuthScreenProps = {
  onAuthenticated: (user: AuthUser, settings?: UserSettings | null) => void;
};

function GoogleGLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.94 1 10.93 1 13s.43 4.06 1.18 5.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";

  const finishAuth = (token: string, user: AuthUser, settings?: UserSettings | null) => {
    saveSession(token, user);
    onAuthenticated(user, settings);
  };

  const googleLogin = useGoogleLogin({
    flow: "implicit",
    scope: "openid email profile",
    onSuccess: async (tokenResponse) => {
      if (!tokenResponse.access_token) {
        setError("Google did not return a credential.");
        return;
      }
      setError(null);
      setLoading(true);
      try {
        const result = await loginWithGoogle(tokenResponse.access_token);
        finishAuth(result.token, result.user, result.settings ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Google sign-in failed");
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      setError("Google sign-in was cancelled or failed.");
    },
  });

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
      finishAuth(result.token, result.user, result.settings ?? null);
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
          <p style={styles.brand}>Sprout</p>
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

        <div style={styles.divider} role="separator" aria-label="or">
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <span style={styles.dividerLine} />
        </div>

        <button
          type="button"
          style={{
            ...styles.googleBtn,
            ...(loading ? styles.googleBtnDisabled : undefined),
          }}
          disabled={loading}
          onClick={() => googleLogin()}
        >
          <GoogleGLogo />
          Continue with Google
        </button>

        <p style={styles.footerHint}>
          {isSignup ? "Already have an account?" : "New to Sprout?"}{" "}
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
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "16px 0 14px",
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: "#1F1F1F",
  },
  dividerText: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#6B7280",
  },
  googleBtn: {
    width: "100%",
    border: "1px solid rgba(16, 185, 129, 0.38)",
    borderRadius: 12,
    background: "#000000",
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: 700,
    padding: "12px 16px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    boxShadow: "0 0 0 1px rgba(16, 185, 129, 0.08)",
  },
  googleBtnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
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
