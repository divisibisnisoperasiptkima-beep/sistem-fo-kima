import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { createIspDirectory, listIspDirectory, updateIspDirectory } from "../../lib/rust-api";

const emptyForm = {
  nama_isp: "",
  pic_nama: "",
  email: "",
  telepon: "",
  wilayah: "",
  catatan: "",
  status: "aktif",
};

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("id-ID", { dateStyle: "medium" });
}

export default function IspDirectoryPage({ session }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listIspDirectory(session.token);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Gagal memuat daftar ISP.");
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setNotice("");
    setError("");
    setShowForm(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({
      nama_isp: row.nama_isp || "",
      pic_nama: row.pic_nama || "",
      email: row.email || "",
      telepon: row.telepon || "",
      wilayah: row.wilayah || "",
      catatan: row.catatan || "",
      status: row.status || "aktif",
    });
    setNotice("");
    setError("");
    setShowForm(true);
  };

  const closeForm = () => {
    if (!saving) setShowForm(false);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form.nama_isp.trim()) {
      setError("Nama ISP wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const payload = {
      ...form,
      nama_isp: form.nama_isp.trim(),
      pic_nama: form.pic_nama.trim() || null,
      email: form.email.trim() || null,
      telepon: form.telepon.trim() || null,
      wilayah: form.wilayah.trim() || null,
      catatan: form.catatan.trim() || null,
    };
    try {
      if (editingId) await updateIspDirectory(session.token, editingId, payload);
      else await createIspDirectory(session.token, payload);
      setShowForm(false);
      setNotice(editingId ? "Data ISP berhasil diperbarui." : "ISP berhasil ditambahkan ke direktori.");
      await load();
    } catch (err) {
      setError(err.message || "Gagal menyimpan data ISP.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <span className="h-[2px] w-8 bg-emerald-300" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-300">Master data jaringan</p>
          </div>
          <h1 className="text-3xl font-black text-white">Daftar ISP <span className="text-emerald-300 italic">KIMA</span></h1>
          <p className="mt-2 max-w-2xl text-xs font-semibold leading-5 text-white/50">
            Kelola ISP yang dapat dipilih pada hasil survei jalur. Setiap entri ditautkan ke master Pelanggan (ISP); akun login ISP tetap opsional.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/10 disabled:opacity-50">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Segarkan
          </button>
          <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/40 bg-emerald-300/15 px-4 py-2 text-xs font-black text-emerald-200 hover:bg-emerald-300/25">
            <Plus size={16} /> Tambah ISP
          </button>
        </div>
      </div>

      {notice && <p className="rounded-xl border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm text-emerald-200">{notice}</p>}
      {error && !showForm && <p className="rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 shadow-xl">
        {loading ? <div className="flex items-center justify-center gap-2 p-14 text-sm text-white/60"><Loader2 size={18} className="animate-spin" /> Memuat direktori ISP...</div> : rows.length === 0 ? <div className="p-14 text-center text-sm text-white/50">Belum ada ISP di direktori. Tambahkan ISP pertama untuk digunakan pada survei.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-wider text-white/45">
                <tr><th className="px-5 py-3">ISP</th><th className="px-5 py-3">Kontak</th><th className="px-5 py-3">Wilayah</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Akun login</th><th className="px-5 py-3 text-right">Aksi</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((row) => <tr key={row.id} className="hover:bg-white/[0.03]">
                  <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-emerald-300/10 p-2 text-emerald-200"><Building2 size={18} /></span><div><p className="font-bold text-white">{row.nama_isp}</p><p className="text-xs text-white/45">{row.pic_nama || "PIC belum diisi"}</p><p className="mt-1 text-[10px] text-white/30">{row.pelanggan_id ? "Tertaut ke master Pelanggan (ISP)" : "Belum tertaut ke master Pelanggan"}</p></div></div></td>
                  <td className="px-5 py-4 text-xs text-white/65"><p>{row.email || "—"}</p><p>{row.telepon || "—"}</p></td>
                  <td className="px-5 py-4 text-xs text-white/65">{row.wilayah || "—"}</td>
                  <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${row.status === "aktif" ? "bg-emerald-300/15 text-emerald-200" : "bg-white/10 text-white/50"}`}>{row.status}</span></td>
                  <td className="px-5 py-4 text-xs text-white/60">{row.linked_account_email || "Belum ditautkan"}</td>
                  <td className="px-5 py-4 text-right"><button type="button" onClick={() => openEdit(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/10 hover:text-white"><Pencil size={14} /> Ubah</button><p className="mt-1 text-[10px] text-white/30">Diperbarui {formatDate(row.updated_at)}</p></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><button type="button" aria-label="Tutup" onClick={closeForm} className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm" /><form onSubmit={save} className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-300">{editingId ? "Perbarui direktori" : "ISP baru"}</p><h2 className="mt-1 text-xl font-black text-white">{editingId ? "Ubah data ISP" : "Tambah ISP ke KIMA"}</h2></div><button type="button" onClick={closeForm} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"><X size={20} /></button></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2 text-xs font-bold text-white/70">Nama ISP *<input required value={form.nama_isp} onChange={(e) => setForm((old) => ({ ...old, nama_isp: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-300/60" placeholder="Contoh: PT Fiber Nusantara" /></label>
          <label className="text-xs font-bold text-white/70">Nama PIC<input value={form.pic_nama} onChange={(e) => setForm((old) => ({ ...old, pic_nama: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-300/60" /></label>
          <label className="text-xs font-bold text-white/70">Email kontak<input type="email" value={form.email} onChange={(e) => setForm((old) => ({ ...old, email: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-300/60" /></label>
          <label className="text-xs font-bold text-white/70">Telepon<input value={form.telepon} onChange={(e) => setForm((old) => ({ ...old, telepon: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-300/60" /></label>
          <label className="text-xs font-bold text-white/70">Wilayah layanan<input value={form.wilayah} onChange={(e) => setForm((old) => ({ ...old, wilayah: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-300/60" /></label>
          <label className="text-xs font-bold text-white/70">Status<select value={form.status} onChange={(e) => setForm((old) => ({ ...old, status: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-300/60"><option value="aktif">Aktif · tampil di survei</option><option value="nonaktif">Nonaktif · tidak dapat dipilih</option></select></label>
          <label className="sm:col-span-2 text-xs font-bold text-white/70">Catatan<textarea rows={3} value={form.catatan} onChange={(e) => setForm((old) => ({ ...old, catatan: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-300/60" placeholder="Catatan internal KIMA (opsional)" /></label>
        </div>
        {error && <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
        <div className="mt-6 flex justify-end gap-2 border-t border-white/10 pt-4"><button type="button" onClick={closeForm} className="rounded-xl px-4 py-2.5 text-sm font-bold text-white/60 hover:bg-white/10">Batal</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-emerald-200 disabled:opacity-60">{saving && <Loader2 size={16} className="animate-spin" />}{editingId ? "Simpan perubahan" : "Tambahkan ISP"}</button></div>
      </form></div>}
    </div>
  );
}
