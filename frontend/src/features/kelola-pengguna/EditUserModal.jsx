import { useEffect, useState } from "react";
import { X, AlertCircle, CheckCircle, Loader2, Save } from "lucide-react";
import { listCustomers, listUserPelangganAccess, rowsFrom, updateUser, updateUserPelangganAccess } from "../../lib/rust-api";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin - Akses Penuh" },
  { value: "teknisi", label: "Teknisi - Operasional" },
  { value: "direksi", label: "Direksi - Persetujuan Kerja Sama" },
  { value: "keuangan", label: "Keuangan - Invoice & Pembayaran" },
  { value: "isp", label: "ISP - Mitra Penyedia Jaringan" },
];

export default function EditUserModal({ isOpen, onClose, onSuccess, user, session }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [pelangganIds, setPelangganIds] = useState([]);
  const [initialPelangganIds, setInitialPelangganIds] = useState([]);

  const [formData, setFormData] = useState({
    email: "",
    role: "",
    is_active: true,
  });

  useEffect(() => {
    if (!isOpen || !user) return;
    let cancelled = false;
    setFormData({
      email: user.email || "",
      role: user.role || "teknisi",
      is_active: user.is_active !== undefined ? user.is_active : true,
    });
    setError(null);
    setSuccess(false);
    const load = async () => {
      try {
        const customerData = await listCustomers(session.token, 1, 100);
        if (!cancelled) setCustomers(rowsFrom(customerData));
        if (String(user.role || "").toLowerCase() === "isp") {
          const assigned = await listUserPelangganAccess(session.token, user.id);
          if (!cancelled) {
            const ids = assigned.map((item) => item.id);
            setPelangganIds(ids);
            setInitialPelangganIds(ids);
          }
        } else if (!cancelled) {
          setPelangganIds([]);
          setInitialPelangganIds([]);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Gagal memuat penugasan pelanggan.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [isOpen, session.token, user]);

  if (!isOpen || !user) return null;

  const currentRole = String(formData.role || user.role || "").toLowerCase();

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {};
      const email = formData.email.trim();
      if (email && email !== user.email) {
        payload.email = email;
      }
      if (formData.role && formData.role !== user.role) {
        payload.role = formData.role;
      }
      if (formData.is_active !== user.is_active) {
        payload.is_active = formData.is_active;
      }

      const normalizedAccess = [...pelangganIds].sort((a, b) => a - b);
      const normalizedInitialAccess = [...initialPelangganIds].sort((a, b) => a - b);
      const accessChanged = formData.role === "isp" && (
        formData.role !== user.role || normalizedAccess.join(",") !== normalizedInitialAccess.join(",")
      );
      if (Object.keys(payload).length === 0 && !accessChanged) {
        setError("Tidak ada perubahan yang dilakukan.");
        setLoading(false);
        return;
      }

      if (Object.keys(payload).length > 0) {
        await updateUser(session.token, user.id, payload);
      }
      if (accessChanged) {
        await updateUserPelangganAccess(session.token, user.id, pelangganIds);
      }
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err.message || "Gagal memperbarui pengguna");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({ email: "", role: "", is_active: true });
    setError(null);
    setSuccess(false);
    setCustomers([]);
    setPelangganIds([]);
    setInitialPelangganIds([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-md max-h-[90vh] overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20">
              <Save className="text-amber-400" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Edit Pengguna</h2>
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
            {error && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="text-red-400 shrink-0" size={20} />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="text-emerald-400 shrink-0" size={20} />
                <p className="text-sm text-emerald-400">Pengguna berhasil diperbarui!</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
                placeholder={user.email}
                className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all disabled:opacity-50"
              />
            </div>

            {currentRole === "isp" && (
              <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <div>
                  <p className="text-sm font-medium text-slate-200">Pelanggan yang dapat diakses</p>
                  <p className="mt-1 text-xs text-slate-400">Akun ini hanya dapat melihat dan mengunggah dokumen untuk pelanggan yang dipilih.</p>
                </div>
                <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                  {customers.map((customer) => (
                    <label key={customer.id} className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={pelangganIds.includes(customer.id)}
                        disabled={loading}
                        onChange={(event) => setPelangganIds((current) => event.target.checked ? [...current, customer.id] : current.filter((id) => id !== customer.id))}
                        className="h-4 w-4 rounded border-slate-500 accent-amber-500"
                      />
                      <span>{customer.kode_pelanggan ? `${customer.kode_pelanggan} — ` : ""}{customer.nama_pelanggan}</span>
                    </label>
                  ))}
                  {!customers.length && <p className="text-xs text-slate-500">Tidak ada pelanggan tersedia.</p>}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">Role</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all disabled:opacity-50"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <label className="text-sm font-medium text-slate-300">Status Aktif</label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleChange}
                  disabled={loading}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
              </label>
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
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-amber-600 to-amber-500 text-white hover:from-amber-500 hover:to-amber-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/25"
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
                  <Save size={16} />
                  <span>Simpan Perubahan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
