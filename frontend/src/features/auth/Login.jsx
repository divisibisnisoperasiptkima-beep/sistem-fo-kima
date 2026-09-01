import { useEffect, useMemo, useState } from "react";
import { devAccess, login } from "../../lib/rust-api";
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
  const panelPadding = isMobile ? "1.35rem" : "2.25rem";
  const headingSize = isMobile ? "1.25rem" : "1.55rem";
  const cardRadius = isMobile ? "1.1rem" : "1.5rem";

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

  const devAccounts = useMemo(() => import.meta.env.DEV ? [
    { key: "admin", label: "Admin KIMA", description: "Permohonan, penawaran & PKS" },
    { key: "teknisi", label: "Teknisi", description: "Survei, aktivasi & BAA" },
    { key: "direksi", label: "Direksi", description: "Persetujuan kerja sama" },
    { key: "keuangan", label: "Keuangan", description: "Invoice & verifikasi bayar" },
    { key: "isp", label: "ISP", description: "Portal mitra jaringan" },
    { key: "pelanggan", label: "Pelanggan", description: "Portal pengaju layanan" },
  ] : [], []);

  const quickLogin = async (account) => {
    setError("");
    setLoading(true);
    try {
      const session = await devAccess(account.key);
      onLogin(session);
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
      <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: isStacked ? 520 : 1040, margin: isMobile ? "0 1rem" : "0 1.5rem" }}>
        <div style={{
          position: "relative", display: "grid", gridTemplateColumns: isStacked ? "1fr" : "minmax(0, 0.95fr) minmax(0, 1.05fr)",
          borderRadius: cardRadius, overflow: "hidden", minHeight: isStacked ? "auto" : 590,
          boxShadow: "0 32px 90px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.14)", background: "rgba(10,12,18,0.72)", backdropFilter: "blur(18px)"
        }}>
          {/* Left panel - Help */}
          <div style={{
            padding: panelPadding, display: activePanel === "forgot" ? "flex" : "none",
            flexDirection: "column", justifyContent: "center", background: "rgba(255,255,255,0.055)",
            gridColumn: isStacked ? "auto" : 2, gridRow: isStacked ? "auto" : 1,
            animation: "panel-enter 360ms cubic-bezier(0.22, 1, 0.36, 1) both",
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
            padding: panelPadding, display: activePanel === "login" ? "flex" : "none",
            flexDirection: "column", justifyContent: "center", background: "rgba(255,255,255,0.055)",
            gridColumn: isStacked ? "auto" : 2, gridRow: isStacked ? "auto" : 1,
            animation: "panel-enter 360ms cubic-bezier(0.22, 1, 0.36, 1) both"
          }}>
            <div style={{ marginBottom: "1.9rem" }}>
              <p style={{ margin: 0, fontSize: "0.65rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.18em", color: "#d4a937" }}>Akses sistem</p>
              <h3 style={{ fontSize: headingSize, fontWeight: 800, color: "#ffffff", margin: "0.55rem 0 0", letterSpacing: "-0.035em" }}>Masuk ke akun Anda</h3>
              <p style={{ margin: "0.5rem 0 0", color: "rgba(255,255,255,0.58)", fontSize: "0.76rem", lineHeight: 1.6 }}>Gunakan akun sesuai peran untuk mengelola layanan fiber optic KIMA.</p>
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
                width: "100%", padding: "0.82rem", borderRadius: "0.7rem", fontWeight: 800, fontSize: "0.78rem",
                border: "1px solid rgba(212,169,55,0.4)",
                background: loading ? "rgba(212,169,55,0.3)" : "linear-gradient(135deg, rgba(212,169,55,0.88), rgba(212,169,55,0.92))",
                color: "#ffffff", boxShadow: loading ? "none" : "0 8px 24px rgba(212,169,55,0.28)",
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, transition: "opacity 0.2s ease"
              }}>
                {loading ? "Memverifikasi..." : "Masuk"}
              </button>
            </form>

            {/* Permohonan layanan baru — endpoint publik /api/portal/register */}
            <div style={{ marginTop: "1.3rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
              <button type="button" disabled={loading} onClick={() => window.location.assign("/ajukan-layanan")} style={{ background: "rgba(212,169,55,0.12)", border: "1px solid rgba(212,169,55,0.28)", cursor: loading ? "not-allowed" : "pointer", fontSize: "0.68rem", fontWeight: 800, color: "#f6d77d", padding: "0.7rem", borderRadius: "0.65rem" }}>Ajukan Layanan</button>
              <button type="button" disabled={loading} onClick={() => window.location.assign("/lacak-permohonan")} style={{ background: "rgba(125,211,252,0.08)", border: "1px solid rgba(125,211,252,0.2)", cursor: loading ? "not-allowed" : "pointer", fontSize: "0.68rem", fontWeight: 800, color: "#bae6fd", padding: "0.7rem", borderRadius: "0.65rem" }}>Lacak Permohonan</button>
            </div>
            {/* Dev accounts */}
            {import.meta.env.DEV && devAccounts.length > 0 && (
              <div style={{ marginTop: "1.25rem", borderRadius: "0.9rem", padding: "0.9rem", background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.09)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <div>
                    <p style={{ fontSize: "0.65rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.2em", color: "#d4a937", margin: 0 }}>Dev Access</p>
                    <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.82)", margin: "0.25rem 0 0" }}>Quick login untuk uji role</p>
                  </div>
                  <span style={{ fontSize: "0.65rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "#d4a937", background: "rgba(212,169,55,0.12)", border: "1px solid rgba(212,169,55,0.22)", borderRadius: "999px", padding: "0.2rem 0.6rem" }}>Dev</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.5rem" }}>
                  {devAccounts.map(account => (
                    <button key={account.key} type="button" disabled={loading} onClick={() => void quickLogin(account)} style={{
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "0.625rem",
                      padding: "0.55rem 0.45rem", textAlign: "left", cursor: "pointer", transition: "background 0.2s ease, border-color 0.2s ease", opacity: loading ? 0.5 : 1
                    }}>
                      <p style={{ fontSize: "0.75rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>{account.label}</p>
                      <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.82)", margin: "0.2rem 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p style={{ margin: "1.25rem 0 0", fontSize: "0.62rem", color: "rgba(255,255,255,0.35)", textAlign: "center" }}>Akses dilindungi dan dicatat dalam audit sistem KIMA.</p>
          </div>

          {/* Brand panel */}
          <div style={{
            position: "relative", height: "auto", width: "auto", zIndex: 10, display: "flex", flexDirection: "column",
            // Brand berada terakhir di DOM untuk desktop (overlay), tetapi harus
            // muncul sebelum form saat layout ditumpuk di mobile.
            order: isStacked ? -1 : undefined,
            gridColumn: isStacked ? "auto" : 1, gridRow: isStacked ? "auto" : 1,
            justifyContent: "space-between", gap: isStacked ? "1.5rem" : 0, padding: panelPadding, overflow: "hidden",
            background: "linear-gradient(145deg, rgba(7,23,39,0.98), rgba(9,12,20,0.98))", borderLeft: isStacked ? "none" : "1px solid rgba(255,255,255,0.09)",
            borderBottom: isStacked ? "1px solid rgba(255,255,255,0.08)" : "none"
          }}>
            <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,169,55,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <img alt="Logo PT KIMA" style={{ height: isMobile ? 32 : 40, width: "auto", filter: "brightness(0) invert(1)" }} src="/logo-kima.png" />
              <div style={{ marginTop: isStacked ? "1rem" : "2.5rem" }}>
                <h2 style={{ fontSize: isMobile ? "1.35rem" : "2rem", fontWeight: 300, color: "#ffffff", lineHeight: 1.2, margin: 0 }}>
                  Satu pintu untuk<br /><span style={{ fontWeight: 800, color: "#d4a937" }}>layanan Fiber Optic.</span>
                </h2>
                <div style={{ height: 2, width: 32, background: "linear-gradient(90deg, #d4a937, transparent)", borderRadius: 2, marginTop: "1rem" }} />
                <p style={{ color: "rgba(255,255,255,0.72)", marginTop: "1rem", fontSize: "0.8rem", lineHeight: 1.7, maxWidth: isStacked ? "100%" : 310 }}>
                  Kelola pengajuan, survei jalur, dokumen kerja sama, instalasi, hingga tagihan dalam satu alur KIMA.
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

      <style>{'@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}@keyframes panel-enter{from{opacity:0;transform:translateX(18px);filter:blur(2px)}to{opacity:1;transform:translateX(0);filter:blur(0)}}.animate-shake{animation:shake 0.2s ease-in-out 2}input::placeholder{color:rgba(255,255,255,0.38)}input:-webkit-autofill{-webkit-box-shadow:0 0 0 1000px rgba(20,22,30,0.8) inset!important;-webkit-text-fill-color:rgba(255,255,255,0.9)!important;caret-color:rgba(255,255,255,0.9)}'}</style>
    </div>
  );
}

export default Login;
