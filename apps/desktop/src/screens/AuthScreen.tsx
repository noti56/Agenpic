import { useState, type FormEvent } from "react";
import { useSystemStatus } from "../hooks/useSystemStatus";
import { useAuth } from "../state/AuthContext";
import styles from "./AuthScreen.module.css";

const FEATURES = [
  { icon: "terminalIcon", title: "Real Terminal", subtitle: "Full terminal access to your environment" },
  { icon: "hangarIcon", title: "Mission Hangar", subtitle: "Plan, track, and ship with your team" },
  { icon: "mapIcon", title: "Presence Map", subtitle: "See your team and AI agents in real-time" },
  { icon: "chatIcon", title: "Team Chat", subtitle: "Discuss, share, and solve together" },
  { icon: "voiceIcon", title: "Voice & Video", subtitle: "Jump on a call, zero context switching" },
] as const;

function FeatureIcon({ kind }: { kind: (typeof FEATURES)[number]["icon"] }) {
  switch (kind) {
    case "terminalIcon":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9l3 3-3 3M13 15h4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "hangarIcon":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16M15 4v16" />
        </svg>
      );
    case "mapIcon":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="8" cy="9" r="2.5" />
          <circle cx="16" cy="9" r="2.5" />
          <path d="M4 19c0-2.5 2-4.5 4-4.5s4 2 4 4.5M12 19c0-2.5 2-4.5 4-4.5s4 2 4 4.5" strokeLinecap="round" />
        </svg>
      );
    case "chatIcon":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 5h16v11H8l-4 4V5z" strokeLinejoin="round" />
        </svg>
      );
    case "voiceIcon":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="7" width="12" height="10" rx="2" />
          <path d="M15 10l6-3v10l-6-3" strokeLinejoin="round" />
        </svg>
      );
  }
}

export function AuthScreen() {
  const { login, signup, isLoading } = useAuth();
  const status = useSystemStatus();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (mode === "login") {
        await login(email, password, remember);
      } else {
        await signup(email, password, name, remember);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.left}>
        <div className={styles.brand}>
          <img src="/favicon.png" alt="" className={styles.logoMark} />
          <div>
            <div className={styles.wordmark}>
              <span className={styles.wordmarkCyan}>AGEN</span>
              <span className={styles.wordmarkMagenta}>PIC</span>
            </div>
            <div className={styles.tagline}>CLAUDE CODE COMMAND CENTER</div>
          </div>
        </div>

        <h1 className={styles.headline}>
          Your AI Co-Pilot.
          <br />
          Your Dev <span className={styles.headlineAccent}>Command Center.</span>
        </h1>

        <ul className={styles.featureList}>
          {FEATURES.map((f) => (
            <li key={f.title} className={styles.featureItem}>
              <span className={styles.featureIcon}>
                <FeatureIcon kind={f.icon} />
              </span>
              <div>
                <div className={styles.featureTitle}>{f.title}</div>
                <div className={styles.featureSubtitle}>{f.subtitle}</div>
              </div>
            </li>
          ))}
        </ul>

        <div className={styles.statusBadge}>
          <span
            className={[
              styles.statusDot,
              status === "ok" ? styles.statusDotOk : status === "degraded" ? styles.statusDotDown : "",
            ].join(" ")}
          />
          {status === "checking" && "Checking systems…"}
          {status === "ok" && "All systems operational"}
          {status === "degraded" && "Backend unreachable"}
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            {mode === "login" ? "Welcome back, developer" : "Create your workspace"}
          </h2>
          <p className={styles.cardSubtitle}>
            {mode === "login" ? "Sign in to your Agenpic workspace" : "Set up a new Agenpic account"}
          </p>

          <div className={styles.tabs}>
            <button
              type="button"
              className={[styles.tabBtn, mode === "login" ? styles.tabBtnActive : ""].join(" ")}
              onClick={() => setMode("login")}
            >
              Sign In
            </button>
            <button
              type="button"
              className={[styles.tabBtn, mode === "signup" ? styles.tabBtnActive : ""].join(" ")}
              onClick={() => setMode("signup")}
            >
              Create Account
            </button>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            {mode === "signup" && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Name</span>
                <input
                  className={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
            )}

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Email</span>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon} aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  className={styles.inputWithIcon}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Password</span>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon} aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 118 0v3" />
                  </svg>
                </span>
                <input
                  className={styles.inputWithIcon}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="••••••••••••"
                />
                <button
                  type="button"
                  className={styles.inputTrailingBtn}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "🙈" : "👁"}
                </button>
              </div>
            </label>

            <label className={styles.rememberRow}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className={styles.checkbox}
              />
              Remember me
            </label>

            {error && <div className={styles.error}>{error}</div>}

            <button type="submit" className={styles.submitBtn} disabled={isLoading}>
              {mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
              <span aria-hidden>→</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
