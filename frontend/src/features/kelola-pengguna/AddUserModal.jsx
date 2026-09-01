import { useState } from "react";
import { X, AlertCircle, CheckCircle, Loader2, UserPlus } from "lucide-react";
import { createUser } from "../../lib/rust-api";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin - Akses Penuh" },
  { value: "teknisi", label: "Teknisi - Operasional" },
  { value: "direksi", label: "Direksi - Persetujuan Kerja Sama" },
  { value: "keuangan", label: "Keuangan - Invoice & Pembayaran" },
  { value: "isp", label: "ISP - Mitra Penyedia Jaringan" },
  { value: "pelanggan", label: "Pelanggan - Pengaju Layanan" },
];

export default function AddUserModal({ isOpen, onClose, onSuccess, session }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    role: "teknisi",
  });

  const [errors, setErrors] = useState({});

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.email.trim()) {
      newErrors.email = "Email wajib diisi";
    }
    if (!formData.password) {
      newErrors.password = "Password wajib diisi";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password minimal 6 karakter";
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
      await createUser(session.token, {
        email: formData.email.trim(),
        password: formData.password,
        role: formData.role,
      });
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err.message || "Gagal membuat pengguna");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({ email: "", password: "", role: "teknisi" });
    setErrors({});
    setError(null);
    setSuccess(false);
    onClose();
  };

  const inputClass = (field) =>
    `w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold-accent/50 transition-all disabled:opacity-50 ${
      errors[field] ? "border-red-500" : "border-slate-600"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-md max-h-[90vh] overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gold-accent/20">
              <UserPlus className="text-gold-accent" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Tambah Pengguna Baru</h2>
              <p className="text-sm text-slate-400">Buat akun sistem baru</p>
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
            {error && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="text-red-400 shrink-0" size={20} />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="text-emerald-400 shrink-0" size={20} />
                <p className="text-sm text-emerald-400">Pengguna berhasil dibuat!</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">
                Email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
                placeholder="email@kima.co.id"
                className={inputClass("email")}
              />
              {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">
                {formData.role === "pelanggan" ? "Password sementara" : "Password"} <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                disabled={loading}
                placeholder={formData.role === "pelanggan" ? "Password sementara, minimal 6 karakter" : "Minimal 6 karakter"}
                className={inputClass("password")}
              />
              {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
              {formData.role === "pelanggan" && <p className="text-xs leading-5 text-sky-200/75">Pelanggan wajib mengganti password ini saat login pertama.</p>}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">
                Role <span className="text-red-400">*</span>
              </label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-gold-accent/50 transition-all disabled:opacity-50"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
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
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-gold-accent to-amber-500 text-white hover:from-amber-500 hover:to-amber-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/25"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : success ? (
                <>
                  <CheckCircle size={16} />
                  <span>Berhasil!</span>
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  <span>Buat Pengguna</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
