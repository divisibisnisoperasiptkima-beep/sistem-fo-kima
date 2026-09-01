import { useEffect, useState } from "react";
import { X, AlertCircle, CheckCircle, KeyRound, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { approvePortalRegistration, createUser, listUsers, rowsFrom } from "../../lib/rust-api";

export default function ApproveRegistrationModal({ isOpen, onClose, onSuccess, registration, session }) {
  const [loading, setLoading] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const [error, setError] = useState(null);
  const [accountError, setAccountError] = useState(null);
  const [result, setResult] = useState(null);
  const [accountStatus, setAccountStatus] = useState("checking");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState("");

  const applicantEmail = registration?.pic_email || registration?.email_perusahaan || "";

  useEffect(() => {
    if (!isOpen || !registration) return undefined;
    let cancelled = false;
    setAccountStatus("checking");
    setAccountError(null);
    setAccountPassword("");
    setAccountPasswordConfirm("");
    listUsers(session.token, 1, 5, applicantEmail)
      .then((data) => {
        if (cancelled) return;
        const user = rowsFrom(data).find((row) => row.email?.toLowerCase() === applicantEmail.toLowerCase());
        if (!user) setAccountStatus("missing");
        else if (user.role !== "pelanggan") setAccountStatus("wrong_role");
        else if (!user.is_active) setAccountStatus("inactive");
        else setAccountStatus("existing");
      })
      .catch(() => { if (!cancelled) setAccountStatus("missing"); });
    return () => { cancelled = true; };
  }, [applicantEmail, isOpen, registration, session.token]);

  if (!isOpen || !registration) return null;

  const handleApprove = async () => {
    if (!["existing", "created"].includes(accountStatus)) {
      setAccountError("Buat atau aktifkan akun Lokasi/Tenant untuk PIC terlebih dahulu.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await approvePortalRegistration(session.token, registration.id);
      setResult(data);
      onSuccess?.();
    } catch (err) {
      setError(err.message || "Gagal menerima permohonan");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (accountPassword.length < 6) {
      setAccountError("Sandi minimal 6 karakter.");
      return;
    }
    if (accountPassword !== accountPasswordConfirm) {
      setAccountError("Konfirmasi sandi belum sama.");
      return;
    }
    setAccountLoading(true);
    setAccountError(null);
    try {
      await createUser(session.token, { email: applicantEmail, password: accountPassword, role: "pelanggan" });
      setAccountStatus("created");
      setAccountPassword("");
      setAccountPasswordConfirm("");
    } catch (err) {
      setAccountError(err.message || "Akun Lokasi/Tenant belum dapat dibuat.");
    } finally {
      setAccountLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setAccountError(null);
    setResult(null);
    setAccountStatus("checking");
    setAccountPassword("");
    setAccountPasswordConfirm("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <ShieldCheck className="text-emerald-400" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Terima untuk Survei</h2>
              <p className="text-sm text-slate-400">{registration.nama_perusahaan}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            disabled={loading}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {!result && (
            <>
              <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 mb-4 space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-slate-400">PIC:</span>
                  <span className="text-white font-medium">{registration.pic_nama}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-400">Email PIC:</span>
                  <span className="text-white font-medium">{applicantEmail}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-400">Lokasi:</span>
                  <span className="text-white font-medium">{registration.lokasi_nama}</span>
                </div>
              </div>

              <div className="mb-4 rounded-lg border border-sky-400/20 bg-sky-400/10 p-4">
                <div className="flex items-start gap-3">
                  <UserPlus className="mt-0.5 shrink-0 text-sky-300" size={18} />
                  <div className="min-w-0 flex-1"><p className="text-sm font-bold text-sky-100">Buat akun Lokasi/Tenant terlebih dahulu</p><p className="mt-1 text-xs leading-5 text-sky-100/75">Admin menentukan password sementara untuk PIC lokasi melalui form ini. Setelah akun tersedia, barulah permohonan dapat diterima untuk survei.</p></div>
                </div>
                {accountStatus === "checking" && <p className="mt-3 text-xs text-white/55">Memeriksa akun dengan email PIC…</p>}
                {accountStatus === "existing" && <p className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-300"><CheckCircle size={15} />Akun Lokasi/Tenant aktif sudah tersedia dan siap ditautkan.</p>}
                {accountStatus === "created" && <p className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-300"><CheckCircle size={15} />Akun Lokasi/Tenant berhasil dibuat. Silakan lanjutkan penerimaan permohonan.</p>}
                {(accountStatus === "wrong_role" || accountStatus === "inactive") && <p className="mt-3 text-xs text-rose-200">Email PIC sudah dipakai akun lain atau akun Lokasi/Tenant sedang nonaktif. Gunakan email PIC yang sesuai atau aktifkan akun tersebut terlebih dahulu.</p>}
                {accountStatus === "missing" && <div className="mt-3 space-y-3"><label className="block text-xs font-bold text-white/75">Password sementara <div className="relative mt-1.5"><KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={15} /><input type="password" minLength={6} value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} disabled={accountLoading} placeholder="Minimal 6 karakter" className="w-full rounded-lg border border-white/15 bg-slate-950/60 py-2.5 pl-9 pr-3 text-sm font-normal text-white outline-none focus:border-sky-300/60 disabled:opacity-50" /></div></label><label className="block text-xs font-bold text-white/75">Konfirmasi password <input type="password" minLength={6} value={accountPasswordConfirm} onChange={(event) => setAccountPasswordConfirm(event.target.value)} disabled={accountLoading} placeholder="Ulangi password sementara" className="mt-1.5 w-full rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2.5 text-sm font-normal text-white outline-none focus:border-sky-300/60 disabled:opacity-50" /></label><p className="text-xs leading-5 text-sky-100/70">Password ini hanya untuk login pertama. Pemilik lokasi wajib menggantinya setelah masuk.</p><button type="button" onClick={handleCreateAccount} disabled={accountLoading || accountPassword.length < 6 || accountPassword !== accountPasswordConfirm} className="inline-flex items-center gap-2 rounded-lg border border-sky-300/30 bg-sky-300/10 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-300/20 disabled:cursor-not-allowed disabled:opacity-50">{accountLoading ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}Buat akun Lokasi/Tenant</button></div>}
                {accountError && <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 p-3 text-xs text-rose-100">{accountError}</p>}
              </div>

              {error && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
                  <AlertCircle className="text-red-400 shrink-0" size={20} />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading || accountLoading}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={loading || accountLoading || !["existing", "created"].includes(accountStatus)}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-500 hover:to-emerald-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/25"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={16} />
                      <span>Terima untuk Survei</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {result && (
            <>
                <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-4">
                  <CheckCircle className="text-emerald-400 shrink-0" size={20} />
                <p className="text-sm text-emerald-400">Permohonan diterima untuk konfirmasi kebutuhan dan survei jalur. Akun Lokasi/Tenant sudah ditautkan.</p>
              </div>

              <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 mb-4 space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">Kode:</span>
                  <span className="text-white font-medium">{result.kode_registrasi}</span>
                </div>
                <div className="flex gap-2"><span className="text-slate-400 w-24 shrink-0">Email akun:</span><span className="text-white font-medium">{applicantEmail}</span></div>
                <p className="pt-2 text-xs text-slate-300">Password sementara ditentukan oleh Admin. Pemilik lokasi wajib menggantinya saat login pertama.</p>
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                >
                  Tutup
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
