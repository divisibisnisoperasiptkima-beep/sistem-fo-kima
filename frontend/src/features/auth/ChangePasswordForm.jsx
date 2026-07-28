import { useState } from "react";
import { Eye, EyeOff, Lock, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { changePassword } from "../../lib/rust-api";

export default function ChangePasswordForm({ token, onSuccess, onCancel }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!newPassword) { setError("Password baru wajib diisi."); return; }
    if (newPassword.length < 6) { setError("Password minimal 6 karakter."); return; }
    if (newPassword !== confirmPassword) { setError("Konfirmasi password tidak cocok."); return; }

    setLoading(true);
    try {
      const session = await changePassword(token, newPassword);
      setSuccess(true);
      setTimeout(() => {
        onSuccess(session);
      }, 1500);
    } catch (err) {
      setError(err.message || "Gagal mengubah password.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%", fontSize: "0.7rem", padding: "0.5rem 2.75rem 0.5rem 0.75rem", borderRadius: "0.5rem",
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

  return (
    <div style={{
      position: "relative", minHeight: "100vh", width: "100%", display: "flex",
      alignItems: "center", justifyContent: "center",
      overflowX: "hidden", overflowY: "auto", padding: "1.5rem 0",
      fontFamily: "'Inter', sans-serif", background: "#0a0c12"
    }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 0, backgroundImage: "url(/kima2.jpeg)", backgroundSize: "cover", backgroundPosition: "center", filter: "brightness(0.68) saturate(0.82) contrast(0.95)" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 1, background: "rgba(10,12,18,0.70)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 2, background: "radial-gradient(circle at 80% 20%, rgba(212,169,55,0.14) 0%, transparent 45%), radial-gradient(circle at 20% 80%, rgba(0,104,123,0.12) 0%, transparent 45%)", pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 420, margin: "0 1rem" }}>
        <div style={{
          borderRadius: "1.25rem", padding: "2rem", background: "rgba(255,255,255,0.13)",
          border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 32px 80px rgba(0,0,0,0.4)"
        }}>
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <div style={{ width: 4, height: 24, borderRadius: 4, background: "linear-gradient(180deg, #d4a937, rgba(212,169,55,0.3))" }} />
              <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>
                Ubah Password
              </h3>
            </div>
            <p style={{ color: "rgba(255,255,255,0.9)", marginTop: "0.5rem", fontSize: "0.7rem", lineHeight: 1.6 }}>
              Administrator telah mewajibkan Anda untuk mengubah password sebelum melanjutkan.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {error && (
              <div style={{
                display: "flex", alignItems: "center", gap: "0.75rem", borderRadius: "0.75rem",
                background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
                color: "#fca5a5", padding: "0.875rem 1rem", fontSize: "0.75rem", fontWeight: 600
              }}>
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {success && (
              <div style={{
                display: "flex", alignItems: "center", gap: "0.75rem", borderRadius: "0.75rem",
                background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)",
                color: "#6ee7b7", padding: "0.875rem 1rem", fontSize: "0.75rem", fontWeight: 600
              }}>
                <CheckCircle size={16} />
                Password berhasil diubah!
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.85)", marginBottom: "0.5rem" }}>
                Password Baru
              </label>
              <div style={{ position: "relative" }}>
                <input type={showNew ? "text" : "password"} placeholder="Minimal 6 karakter" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
                <button type="button" onClick={() => setShowNew(v => !v)} tabIndex={-1} style={{
                  position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", padding: "0.25rem", display: "flex",
                  alignItems: "center", color: "rgba(255,255,255,0.45)"
                }}>
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.85)", marginBottom: "0.5rem" }}>
                Konfirmasi Password
              </label>
              <div style={{ position: "relative" }}>
                <input type={showConfirm ? "text" : "password"} placeholder="Ulangi password baru" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
                <button type="button" onClick={() => setShowConfirm(v => !v)} tabIndex={-1} style={{
                  position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", padding: "0.25rem", display: "flex",
                  alignItems: "center", color: "rgba(255,255,255,0.45)"
                }}>
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
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
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                  <Loader2 size={14} className="animate-spin" />
                  Mengubah...
                </span>
              ) : "Ubah Password"}
            </button>

            <button type="button" onClick={onCancel} disabled={loading} style={{
              width: "100%", background: "none", border: "none", cursor: "pointer", fontSize: "0.6rem", fontWeight: 700,
              color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: "0.08em",
              marginTop: "-0.25rem"
            }}>
              Nanti Saja
            </button>
          </form>
        </div>

        <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.45em", color: "rgba(255,255,255,0.55)" }}>
            Powered by IT Support KIMA
          </p>
        </div>
      </div>
    </div>
  );
}
