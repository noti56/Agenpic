import { useState, type FormEvent } from "react";
// Deep-imported per icon (see the matching note in screens/Shell.tsx) so
// the bundle only includes the handful of icons actually used here.
import { Terminal } from "@phosphor-icons/react/Terminal";
import { Kanban } from "@phosphor-icons/react/Kanban";
import { MapTrifold } from "@phosphor-icons/react/MapTrifold";
import { ChatCircle } from "@phosphor-icons/react/ChatCircle";
import { VideoCamera } from "@phosphor-icons/react/VideoCamera";
import { EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { Lock } from "@phosphor-icons/react/Lock";
import { Eye } from "@phosphor-icons/react/Eye";
import { EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { useSystemStatus } from "../hooks/useSystemStatus";
import { useAuth } from "../state/AuthContext";
import styles from "./AuthScreen.module.css";

const FEATURES = [
  { icon: Terminal, title: "Real Terminal", subtitle: "Full terminal access to your environment" },
  { icon: Kanban, title: "Mission Hangar", subtitle: "Plan, track, and ship with your team" },
  { icon: MapTrifold, title: "Presence Map", subtitle: "See your team and AI agents in real-time" },
  { icon: ChatCircle, title: "Team Chat", subtitle: "Discuss, share, and solve together" },
  { icon: VideoCamera, title: "Voice & Video", subtitle: "Jump on a call, zero context switching" },
] as const;

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
                <f.icon size={18} />
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
                  <EnvelopeSimple size={15} />
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
                  <Lock size={15} />
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
                  {showPassword ? <EyeSlash size={15} /> : <Eye size={15} />}
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
