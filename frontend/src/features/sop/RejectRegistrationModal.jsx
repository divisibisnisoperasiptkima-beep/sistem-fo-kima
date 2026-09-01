import { useState } from "react";
import { X, AlertTriangle, Loader2, CheckCircle, XCircle } from "lucide-react";
import { rejectPortalRegistration } from "../../lib/rust-api";

export default function RejectRegistrationModal({ isOpen, onClose, onSuccess, registration, session }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen || !registration) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Alasan penolakan wajib diisi");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      await rejectPortalRegistration(session.token, registration.id, reason.trim());
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err.message || "Gagal menolak pendaftaran");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setReason("");
    setError(null);
    setSuccess(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20">
              <XCircle className="text-red-400" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Tolak Permohonan</h2>
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

        <form onSubmit={handleSubmit} className="p-6">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-4">
            <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={20} />
            <p className="text-sm text-amber-200/90">
              Permohonan akan ditandai ditolak. Tidak ada kontrak, lokasi operasional, maupun ISP yang dibuat atau ditetapkan.
            </p>
          </div>

          <div className="space-y-1.5 mb-4">
            <label className="block text-sm font-medium text-slate-300">
              Alasan Penolakan <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={loading}
              rows={3}
              placeholder="Contoh: Data lokasi tidak sesuai area layanan"
              className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
              <AlertTriangle className="text-red-400 shrink-0" size={20} />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-4">
              <CheckCircle className="text-emerald-400 shrink-0" size={20} />
              <p className="text-sm text-emerald-400">Permohonan berhasil ditolak.</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || success}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-500 hover:to-red-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-500/25"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Memproses...</span>
                </>
              ) : success ? (
                <>
                  <CheckCircle size={16} />
                  <span>Ditolak!</span>
                </>
              ) : (
                <>
                  <XCircle size={16} />
                  <span>Tolak Permohonan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
