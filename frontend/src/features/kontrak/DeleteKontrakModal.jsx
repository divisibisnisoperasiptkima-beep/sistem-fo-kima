import { useState } from "react";
import { X, AlertTriangle, Loader2, CheckCircle, Trash2 } from "lucide-react";
import { deleteContract } from "../../lib/rust-api";

/**
 * Delete Kontrak Modal
 * Confirmation dialog before deleting a contract
 */
export default function DeleteKontrakModal({ isOpen, onClose, onSuccess, contract, session }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen || !contract) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError(null);

    try {
      await deleteContract(session.token, contract.id);

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err.message || "Gagal menghapus kontrak");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setSuccess(false);
    onClose();
  };

  // Format dates for display
  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20">
              <Trash2 className="text-red-400" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Hapus Kontrak</h2>
              <p className="text-sm text-slate-400">Konfirmasi penghapusan</p>
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

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* Warning Message */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-4">
            <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-sm text-amber-200 font-medium">Tindakan ini tidak dapat dibatalkan</p>
              <p className="text-sm text-amber-400/80 mt-1">
                Folder kontrak di Google Drive juga akan dihapus secara permanen.
              </p>
            </div>
          </div>

          {/* Contract Info */}
          <div className="space-y-3 mb-6">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wide">Kode Kontrak</p>
                  <p className="text-white font-medium">{contract.kode_kontrak || "—"}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wide">Pelanggan</p>
                  <p className="text-white font-medium">{contract.nama_pelanggan || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-slate-400 text-xs uppercase tracking-wide">Lokasi</p>
                  <p className="text-white font-medium">{contract.nama_lokasi || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-slate-400 text-xs uppercase tracking-wide">Periode</p>
                  <p className="text-white">
                    {formatDate(contract.periode_awal)} s.d. {formatDate(contract.periode_berakhir)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wide">Status</p>
                  <p className="text-white">{contract.status_kontrak || "—"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
              <AlertTriangle className="text-red-400 shrink-0" size={20} />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-4">
              <CheckCircle className="text-emerald-400 shrink-0" size={20} />
              <p className="text-sm text-emerald-400">Kontrak berhasil dihapus!</p>
            </div>
          )}

          {/* Footer */}
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
                  <span>Menghapus...</span>
                </>
              ) : success ? (
                <>
                  <CheckCircle size={16} />
                  <span>Dihapus!</span>
                </>
              ) : (
                <>
                  <Trash2 size={16} />
                  <span>Hapus Kontrak</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
