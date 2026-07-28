import { useEffect, useMemo, useState } from "react";
import { login } from "../../lib/rust-api";
import ChangePasswordForm from "./ChangePasswordForm";

/**
 * Login page component
 */
function Login({ onLogin }) {
  const [activePanel, setActivePanel] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [mustChangePw, setMustChangePw] = useState(false);
  const [pendingToken, setPendingToken] = useState(null);

  useEffect(() => {
    const handle = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  const isMobile = windowWidth < 640;
  const isStacked = windowWidth < 860;
  const panelPadding = isMobile ? "1.25rem" : "1.5rem";
  const headingSize = isMobile ? "1.1rem" : "1.25rem";
  const cardRadius = isMobile ? "1rem" : "1.25rem";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!email.trim()) { setError("Email wajib diisi."); return; }
    if (!password) { setError("Password wajib diisi."); return; }
    setLoading(true);
    try {
      const session = await login(email.trim(), password);
      if (session.must_change_password) {
        setPendingToken(session.token);
        setMustChangePw(true);
      } else {
        onLogin(session);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const devAccounts = useMemo(() => {
    if (!import.meta.env.DEV) return [];
    return [
      { key: "admin", label: "Admin", description: "Akses penuh", email: import.meta.env.VITE_DEV_ADMIN_EMAIL, password: import.meta.env.VITE_DEV_ADMIN_PASSWORD },
      { key: "teknisi", label: "Teknisi", description: "Operasional", email: import.meta.env.VITE_DEV_TEKNISI_EMAIL, password: import.meta.env.VITE_DEV_TEKNISI_PASSWORD },
      { key: "isp", label: "ISP", description: "Mitra", email: import.meta.env.VITE_DEV_ISP_EMAIL, password: import.meta.env.VITE_DEV_ISP_PASSWORD },
    ].filter(a => a.email && a.password);
  }, []);

  const quickLogin = async (account) => {
    setEmail(account.email);
    setPassword(account.password);
    setError("");
    setLoading(true);
    try {
      const session = await login(account.email, account.password);
      if (session.must_change_password) {
        setPendingToken(session.token);
        setMustChangePw(true);
      } else {
        onLogin(session);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%", fontSize: "0.7rem", padding: "0.5rem 0.75rem", borderRadius: "0.5rem",
    outline: "none", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
    color: "rgba(255,255,255,0.92)", transition: "border-color 0.2s ease, background 0.2s ease", boxSizing: "border-box"
  };

  const inputFocus = (e) => {
    e.target.style.borderColor = "rgba(212,169,55,0.6)";
    e.target.style.background = "rgba(255,255,255,0.11)";
  };

  const inputBlur = (e) => {
    e.target.style.borderColor = "rgba(255,255,255,0.15)";
    e.target.style.background = "rgba(255,255,255,0.07)";
  };

  if (mustChangePw && pendingToken) {
    return (
      <ChangePasswordForm
        token={pendingToken}
        onSuccess={(session) => {
          setMustChangePw(false);
          setPendingToken(null);
          onLogin(session);
        }}
        onCancel={() => {
          setMustChangePw(false);
          setPendingToken(null);
        }}
      />
    );
  }

  return (
    <div style={{
      position: "relative", minHeight: "100vh", width: "100%", display: "flex",
      alignItems: isMobile ? "flex-start" : "center", justifyContent: "center",
      overflowX: "hidden", overflowY: "auto", padding: isMobile ? "1rem 0" : "1.5rem 0",
      fontFamily: "'Inter', sans-serif", background: "#0a0c12"
    }}>
      {/* Background layers */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0, backgroundImage: "url(/kima2.jpeg)", backgroundSize: "cover", backgroundPosition: "center", filter: "brightness(0.68) saturate(0.82) contrast(0.95)" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 1, background: "rgba(10,12,18,0.70)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 2, background: "radial-gradient(circle at 80% 20%, rgba(212,169,55,0.14) 0%, transparent 45%), radial-gradient(circle at 20% 80%, rgba(0,104,123,0.12) 0%, transparent 45%)", pointerEvents: "none" }} />

      {/* Main card */}
      <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: isStacked ? 480 : 720, margin: isMobile ? "0 1rem" : "0 1.5rem" }}>
        <div style={{
          position: "relative", display: "grid", gridTemplateColumns: isStacked ? "1fr" : "1fr 1fr",
          borderRadius: cardRadius, overflow: "hidden", minHeight: isStacked ? "auto" : 440,
          boxShadow: "0 32px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.12)"
        }}>
          {/* Left panel - Help */}
          <div style={{
            padding: panelPadding, display: activePanel === "forgot" || !isStacked ? "flex" : "none",
            flexDirection: "column", justifyContent: "center", background: "rgba(255,255,255,0.13)",
            minHeight: isStacked ? "auto" : "unset"
          }}>
            <div style={{ marginBottom: "2rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <div style={{ width: 4, height: 24, borderRadius: 4, background: "linear-gradient(180deg, #d4a937, rgba(212,169,55,0.3))" }} />
                <h3 style={{ fontSize: headingSize, fontWeight: 800, color: "#ffffff", margin: 0, letterSpacing: "-0.02em", textShadow: "0 2px 12px rgba(212,169,55,0.25)" }}>
                  Bantuan Akses
                </h3>
              </div>
              <p style={{ color: "rgba(255,255,255,0.9)", marginTop: "0.75rem", fontSize: "0.7rem", lineHeight: 1.6 }}>
                Pemulihan akun memerlukan verifikasi Administrator TI. Silakan hubungi unit terkait.
              </p>
            </div>
            <button onClick={() => setActivePanel("login")} style={{
              background: "none", border: "none", cursor: "pointer", fontSize: "0.6rem", fontWeight: 700,
              color: "rgba(255,255,255,0.82)", letterSpacing: "0.08em", textTransform: "uppercase", transition: "color 0.2s ease"
            }}>
              ← Kembali ke Halaman Login
            </button>
          </div>

          {/* Right panel - Login form */}
          <div style={{
            padding: panelPadding, display: activePanel === "login" || !isStacked ? "flex" : "none",
            flexDirection: "column", justifyContent: "center", background: "rgba(255,255,255,0.13)"
          }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <div style={{ width: 4, height: 24, borderRadius: 4, background: "linear-gradient(180deg, #d4a937, rgba(212,169,55,0.3))" }} />
                <h3 style={{ fontSize: headingSize, fontWeight: 800, color: "#ffffff", margin: 0, letterSpacing: "-0.02em", textShadow: "0 2px 12px rgba(212,169,55,0.25)" }}>
                  Sign In
                </h3>
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {error && (
                <div className="animate-shake" style={{
                  display: "flex", alignItems: "center", gap: "0.75rem", borderRadius: "0.75rem",
                  background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
                  color: "#fca5a5", padding: "0.875rem 1rem", fontSize: "0.75rem", fontWeight: 600
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f87171", flexShrink: 0 }} />
                  {error}
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.85)", marginBottom: "0.5rem" }}>
                  Email
                </label>
                <input type="email" placeholder="nama@kima.co.id" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.85)", marginBottom: "0.5rem" }}>
                  Password
                </label>
                <div style={{ position: "relative" }}>
                  <input type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} style={{ ...inputStyle, paddingRight: "2.75rem" }} onFocus={inputFocus} onBlur={inputBlur} />
                  <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1} style={{
                    position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", padding: "0.25rem", display: "flex",
                    alignItems: "center", color: "rgba(255,255,255,0.45)", transition: "color 0.2s"
                  }}>
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                  <button type="button" disabled={loading} onClick={() => setActivePanel("forgot")} style={{
                    background: "none", border: "none", cursor: "pointer", fontSize: "0.6rem", fontWeight: 700,
                    color: "rgba(212,169,55,0.8)", textTransform: "uppercase", letterSpacing: "0.08em", transition: "color 0.2s"
                  }}>
                    Lupa Password?
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} style={{
                width: "100%", padding: "0.625rem", borderRadius: "0.5rem", fontWeight: 700, fontSize: "0.7rem",
                border: "1px solid rgba(212,169,55,0.4)",
                background: loading ? "rgba(212,169,55,0.3)" : "linear-gradient(135deg, rgba(212,169,55,0.88), rgba(212,169,55,0.92))",
                color: "#ffffff", boxShadow: loading ? "none" : "0 8px 24px rgba(212,169,55,0.28)",
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, transition: "opacity 0.2s ease"
              }}>
                {loading ? "Memverifikasi..." : "Masuk"}
              </button>
            </form>

            {/* Dev accounts */}
            {import.meta.env.DEV && devAccounts.length > 0 && (
              <div style={{ marginTop: "1.25rem", borderRadius: "1rem", padding: "1rem", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <div>
                    <p style={{ fontSize: "0.65rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.2em", color: "#d4a937", margin: 0 }}>Dev Access</p>
                    <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.82)", margin: "0.25rem 0 0" }}>Quick login untuk uji role</p>
                  </div>
                  <span style={{ fontSize: "0.65rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "#d4a937", background: "rgba(212,169,55,0.12)", border: "1px solid rgba(212,169,55,0.22)", borderRadius: "999px", padding: "0.2rem 0.6rem" }}>Dev</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: "0.5rem" }}>
                  {devAccounts.map(account => (
                    <button key={account.key} type="button" disabled={loading} onClick={() => { setEmail(account.email); setPassword(account.password); setError(""); void quickLogin(account); }} style={{
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "0.625rem",
                      padding: "0.625rem 0.5rem", textAlign: "left", cursor: "pointer", transition: "background 0.2s ease, border-color 0.2s ease", opacity: loading ? 0.5 : 1
                    }}>
                      <p style={{ fontSize: "0.75rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>{account.label}</p>
                      <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.82)", margin: "0.2rem 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Social links */}
            <div style={{ marginTop: "1.25rem", display: "flex", alignItems: "center", gap: "1rem" }}>
              <span style={{ fontSize: "0.55rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255,255,255,0.65)", flexShrink: 0 }}>Connect</span>
              <div style={{ height: 1, flexGrow: 1, background: "rgba(255,255,255,0.2)" }} />
            </div>
          </div>

          {/* Brand panel */}
          <div style={{
            position: isStacked ? "relative" : "absolute", top: 0, left: 0, height: isStacked ? "auto" : "100%",
            width: isStacked ? "100%" : "50%", zIndex: 10, display: "flex", flexDirection: "column",
            justifyContent: "space-between", gap: isStacked ? "1.5rem" : 0, padding: panelPadding, overflow: "hidden",
            background: "rgba(10,12,18,0.97)", borderRight: isStacked ? "none" : "1px solid rgba(255,255,255,0.08)",
            borderBottom: isStacked ? "1px solid rgba(255,255,255,0.08)" : "none",
            transition: isStacked ? "none" : "transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            transform: isStacked ? "none" : activePanel === "login" ? "translateX(0%)" : "translateX(100%)",
            willChange: isStacked ? "auto" : "transform"
          }}>
            <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,169,55,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <img alt="Logo PT KIMA" style={{ height: isMobile ? 32 : 40, width: "auto", filter: "brightness(0) invert(1)" }} src="/logo-kima.png" />
              <div style={{ marginTop: isStacked ? "1rem" : "2.5rem" }}>
                <h2 style={{ fontSize: isMobile ? "1.1rem" : "1.35rem", fontWeight: 300, color: "#ffffff", lineHeight: 1.35, margin: 0 }}>
                  Selamat Datang di<br /><span style={{ fontWeight: 800, color: "#d4a937" }}>Digital Archive</span>
                </h2>
                <div style={{ height: 2, width: 32, background: "linear-gradient(90deg, #d4a937, transparent)", borderRadius: 2, marginTop: "1rem" }} />
                <p style={{ color: "rgba(255,255,255,0.9)", marginTop: "0.75rem", fontSize: "0.7rem", lineHeight: 1.6, maxWidth: isStacked ? "100%" : 240 }}>
                  Sistem manajemen arsip terintegrasi untuk efisiensi dan keamanan data PT Kawasan Industri Makassar.
                </p>
              </div>
            </div>
            <div style={{ position: "relative", zIndex: 1 }}>
              <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.7)", margin: 0 }}>© 2026 PT Kawasan Industri Makassar.</p>
            </div>
          </div>
        </div>

        <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: isMobile ? "0.2em" : "0.45em", color: "rgba(255,255,255,0.55)" }}>
            Powered by IT Support KIMA
          </p>
        </div>
      </div>

      <style>{'@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}.animate-shake{animation:shake 0.2s ease-in-out 2}input::placeholder{color:rgba(255,255,255,0.38)}input:-webkit-autofill{-webkit-box-shadow:0 0 0 1000px rgba(20,22,30,0.8) inset!important;-webkit-text-fill-color:rgba(255,255,255,0.9)!important;caret-color:rgba(255,255,255,0.9)}'}</style>
    </div>
  );
}

export default Login;
