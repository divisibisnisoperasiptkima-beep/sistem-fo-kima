import { useState } from "react";
import { X, AlertCircle, CheckCircle, Loader2, Key, Eye, EyeOff } from "lucide-react";
import { resetPassword } from "../../lib/rust-api";

export default function ResetPasswordModal({ isOpen, onClose, onSuccess, user, session }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [formData, setFormData] = useState({
    new_password: "",
    confirm_password: "",
  });

  const [errors, setErrors] = useState({});

  if (!isOpen || !user) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.new_password) {
      newErrors.new_password = "Password baru wajib diisi";
    } else if (formData.new_password.length < 6) {
      newErrors.new_password = "Password minimal 6 karakter";
    }
    if (formData.new_password !== formData.confirm_password) {
      newErrors.confirm_password = "Konfirmasi password tidak cocok";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      await resetPassword(session.token, user.id, formData.new_password);
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 2000);
    } catch (err) {
      setError(err.message || "Gagal mereset password");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({ new_password: "", confirm_password: "" });
    setShowPassword(false);
    setShowConfirm(false);
    setErrors({});
    setError(null);
    setSuccess(false);
    onClose();
  };

  const inputClass = (field) =>
    `w-full px-4 py-2.5 pr-11 rounded-lg bg-slate-800/50 border text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all disabled:opacity-50 ${
      errors[field] ? "border-red-500" : "border-slate-600"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-md max-h-[90vh] overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Key className="text-blue-400" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Reset Password</h2>
              <p className="text-sm text-slate-400">{user.email}</p>
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

        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <AlertCircle className="text-blue-400 shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-sm text-blue-200 font-medium">Informasi</p>
                <p className="text-sm text-blue-400/80 mt-1">
                  Password akan direset dan semua sesi aktif pengguna akan diakhiri. Pengguna harus login ulang dengan password baru.
                </p>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="text-red-400 shrink-0" size={20} />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="text-emerald-400 shrink-0" size={20} />
                <p className="text-sm text-emerald-400">
                  Password berhasil direset! Pengguna harus login ulang.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">
                Password Baru <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="new_password"
                  value={formData.new_password}
                  onChange={handleChange}
                  disabled={loading}
                  placeholder="Minimal 6 karakter"
                  className={inputClass("new_password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={loading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.new_password && <p className="text-xs text-red-400">{errors.new_password}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">
                Konfirmasi Password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  name="confirm_password"
                  value={formData.confirm_password}
                  onChange={handleChange}
                  disabled={loading}
                  placeholder="Ulangi password baru"
                  className={inputClass("confirm_password")}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  disabled={loading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.confirm_password && <p className="text-xs text-red-400">{errors.confirm_password}</p>}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-slate-900/50">
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
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Mereset...</span>
                </>
              ) : success ? (
                <>
                  <CheckCircle size={16} />
                  <span>Berhasil!</span>
                </>
              ) : (
                <>
                  <Key size={16} />
                  <span>Reset Password</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
