import { useState } from "react";
import { X, AlertTriangle, Loader2, CheckCircle, Trash2 } from "lucide-react";
import { deleteCustomer } from "../../lib/rust-api";

/**
 * Delete Pelanggan Modal
 */
export default function DeletePelangganModal({ isOpen, onClose, onSuccess, customer, session }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen || !customer) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await deleteCustomer(session.token, customer.id);
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err.message || "Gagal menghapus pelanggan");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setSuccess(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20">
              <Trash2 className="text-red-400" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Hapus Pelanggan</h2>
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
          {/* Warning */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-4">
            <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-sm text-amber-200 font-medium">Tindakan ini tidak dapat dibatalkan</p>
              <p className="text-sm text-amber-400/80 mt-1">
                Folder dan data pelanggan (ISP) akan dihapus secara permanen.
              </p>
            </div>
          </div>

          {/* Customer Info */}
          <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 mb-4">
            <div className="space-y-2 text-sm">
              {customer.kode_pelanggan && (
                <div className="flex gap-2">
                  <span className="text-slate-400">Kode:</span>
                  <span className="text-white font-medium">{customer.kode_pelanggan}</span>
                </div>
              )}
              <div className="flex gap-2">
                <span className="text-slate-400">Nama:</span>
                <span className="text-white font-medium">{customer.nama_pelanggan}</span>
              </div>
              {(customer.lokasi_beroperasi > 0 || customer.lokasi_belum_beroperasi > 0 || customer.lokasi_proses_perpanjangan > 0) && (
                <div className="flex gap-2">
                  <span className="text-slate-400">Lokasi:</span>
                  <span className="text-white">
                    {customer.lokasi_beroperasi + customer.lokasi_belum_beroperasi + (customer.lokasi_proses_perpanjangan ?? 0)} kontrak
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
              <AlertTriangle className="text-red-400 shrink-0" size={20} />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-4">
              <CheckCircle className="text-emerald-400 shrink-0" size={20} />
              <p className="text-sm text-emerald-400">Pelanggan berhasil dihapus!</p>
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
                  <span>Hapus Pelanggan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
