import { createElement, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, FilePlus2, MapPin, RefreshCw, Router, Send, Share2 } from "lucide-react";
import { listAllPages, listContracts, rowsFrom, submitServiceChangeRequest } from "../../lib/rust-api";

const inputClass = "w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-gold-accent/70 focus:ring-2 focus:ring-gold-accent/20";
const labelClass = "mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-300";
const primaryClass = "inline-flex items-center justify-center gap-2 rounded-xl bg-gold-accent px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-950 transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-300 transition hover:border-white/30 hover:bg-white/5";

const TYPES = [
  { id: "tambah_sharing_core", title: "Tambah Sharing Core", text: "Tambah kapasitas berbagi pada lokasi yang sudah memiliki layanan.", icon: Share2 },
  { id: "tambah_dedicated_core", title: "Tambah Dedicated Core", text: "Tambah core dedicated pada lokasi layanan yang aktif.", icon: Router },
  { id: "lokasi_baru", title: "Lokasi Baru", text: "Ajukan titik layanan baru di bawah kontrak induk perusahaan.", icon: MapPin },
];

const initialForm = { jenis_permintaan: "tambah_sharing_core", kontrak_induk_id: "", lokasi_id: "", lokasi_nama: "", lokasi_alamat: "", lokasi_kota: "Makassar", lokasi_provinsi: "Sulawesi Selatan", lokasi_kode_pos: "", core_dedicated: 0, sharing_core: "1:1", catatan_pelanggan: "" };

export default function ServiceChangeRequestPage({ session, onDone, onBack }) {
  const [form, setForm] = useState(initialForm);
  const [contracts, setContracts] = useState([]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    let mounted = true;
    listAllPages((page, pageSize) => listContracts(session.token, page, pageSize), 100)
      .then((data) => { if (mounted) setContracts(rowsFrom(data)); })
      .catch((err) => { if (mounted) setError(err.message || "Kontrak pelanggan belum dapat dimuat."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [session.token]);

  const selectedContract = useMemo(() => contracts.find((item) => String(item.id) === String(form.kontrak_induk_id)), [contracts, form.kontrak_induk_id]);
  const selectedLocation = useMemo(() => contracts.find((item) => String(item.id) === String(form.lokasi_id)), [contracts, form.lokasi_id]);
  const isNewLocation = form.jenis_permintaan === "lokasi_baru";

  const update = (patch) => setForm((current) => ({ ...current, ...patch }));
  const chooseType = (jenis_permintaan) => update({ jenis_permintaan, lokasi_id: "", core_dedicated: jenis_permintaan === "tambah_dedicated_core" ? 1 : 0, sharing_core: jenis_permintaan === "tambah_sharing_core" ? "1:1" : null });
  const chooseLocation = (id) => {
    const location = contracts.find((item) => String(item.id) === String(id));
    update({ lokasi_id: id, lokasi_nama: location?.nama_lokasi || "", lokasi_alamat: "Lokasi existing", lokasi_kota: "Makassar", lokasi_provinsi: "Sulawesi Selatan" });
  };
  const validate = () => {
    if (!form.kontrak_induk_id) return "Pilih kontrak induk terlebih dahulu.";
    if (!isNewLocation && !form.lokasi_id) return "Pilih lokasi layanan existing yang akan ditambah kapasitasnya.";
    if (!form.lokasi_nama.trim() || !form.lokasi_alamat.trim()) return "Nama dan alamat lokasi wajib diisi.";
    if (form.jenis_permintaan === "tambah_dedicated_core" && Number(form.core_dedicated) < 1) return "Jumlah dedicated core minimal 1.";
    if (form.jenis_permintaan === "tambah_sharing_core" && !form.sharing_core) return "Pilih kapasitas sharing core.";
    return "";
  };
  const next = () => { const message = validate(); if (message) { setError(message); return; } setError(""); setStep(2); };
  const submit = async () => {
    const message = validate(); if (message) { setError(message); setStep(1); return; }
    setSaving(true); setError("");
    try {
      const result = await submitServiceChangeRequest(session.token, { ...form, kontrak_induk_id: Number(form.kontrak_induk_id), lokasi_id: isNewLocation ? null : Number(form.lokasi_id), core_dedicated: Number(form.core_dedicated), sharing_core: form.jenis_permintaan === "tambah_sharing_core" ? form.sharing_core : null, lokasi_kode_pos: form.lokasi_kode_pos || null });
      setSuccess(result); onDone?.(result);
    } catch (err) { setError(err.message || "Pengajuan belum berhasil dikirim."); } finally { setSaving(false); }
  };

  if (success) return <div className="min-h-screen bg-[#0a0c12] px-4 py-12 text-white"><div className="mx-auto max-w-xl rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.06] p-8 text-center"><CheckCircle2 className="mx-auto text-emerald-300" size={48} /><h1 className="mt-4 text-2xl font-black">Pengajuan terkirim</h1><p className="mt-2 text-sm text-slate-300">Permintaan <b className="text-white">{success.kode_perubahan}</b> sudah masuk ke antrean KIMA.</p><button className={`${primaryClass} mt-7`} onClick={() => onDone?.(success)}>Lihat Permohonan <ArrowRight size={16} /></button></div></div>;

  return <div className="min-h-screen bg-[#0a0c12] px-4 py-8 text-white md:px-8"><div className="mx-auto max-w-5xl">
    <button className="mb-6 inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white" onClick={onBack}><ArrowLeft size={16} /> Kembali ke permohonan</button>
    <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="mb-3 flex items-center gap-2 text-gold-accent"><FilePlus2 size={18} /><span className="text-[10px] font-black uppercase tracking-[0.2em]">SOP 2 · Perubahan Layanan</span></div><h1 className="text-3xl font-black tracking-tight">Tambah layanan pada kontrak Anda</h1><p className="mt-2 max-w-2xl text-sm text-slate-400">Ajukan sharing core, dedicated core, atau lokasi baru. KIMA akan memverifikasi jalur dan menyiapkan addendum/kontrak turunannya.</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-slate-300"><span className="font-black text-gold-accent">Langkah {step} dari 2</span><br />{step === 1 ? "Detail permintaan" : "Tinjau & kirim"}</div></div>
    {error && <div className="mb-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl md:p-8">
      {loading ? <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400"><RefreshCw className="animate-spin" size={18} /> Memuat kontrak...</div> : step === 1 ? <div className="space-y-7">
        <div><label className={labelClass}>Jenis permintaan *</label><div className="grid gap-3 md:grid-cols-3">{TYPES.map(({ id, title, text, icon }) => <button type="button" key={id} onClick={() => chooseType(id)} className={`rounded-2xl border p-4 text-left transition ${form.jenis_permintaan === id ? "border-gold-accent/70 bg-gold-accent/10" : "border-white/10 bg-white/[0.025] hover:border-white/25"}`}>{createElement(icon, { className: form.jenis_permintaan === id ? "text-gold-accent" : "text-slate-400", size: 21 })}<p className="mt-3 text-sm font-black">{title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{text}</p></button>)}</div></div>
        <div className="grid gap-5 md:grid-cols-2"><div><label className={labelClass}>Kontrak induk *</label><select className={inputClass} value={form.kontrak_induk_id} onChange={(e) => update({ kontrak_induk_id: e.target.value })}><option value="">Pilih kontrak induk</option>{contracts.map((item) => <option key={item.id} value={item.id}>{item.kode_kontrak} · {item.nama_lokasi}</option>)}</select>{selectedContract && <p className="mt-2 text-xs text-slate-400">Status: {selectedContract.status_kontrak} · Layanan: {selectedContract.core || selectedContract.sharing_core || "Belum diisi"}</p>}</div>{!isNewLocation && <div><label className={labelClass}>Lokasi layanan existing *</label><select className={inputClass} value={form.lokasi_id} onChange={(e) => chooseLocation(e.target.value)}><option value="">Pilih lokasi</option>{contracts.filter((item) => !form.kontrak_induk_id || String(item.pelanggan_id) === String(selectedContract?.pelanggan_id)).map((item) => <option key={item.id} value={item.id}>{item.kode_kontrak} · {item.nama_lokasi}</option>)}</select>{selectedLocation && <p className="mt-2 text-xs text-slate-400">Permintaan akan menjadi addendum pada lokasi ini.</p>}</div>}</div>
        <div className="grid gap-5 md:grid-cols-2"><div><label className={labelClass}>Nama lokasi {isNewLocation ? "baru" : "existing"} *</label><input className={inputClass} value={form.lokasi_nama} onChange={(e) => update({ lokasi_nama: e.target.value })} placeholder="Contoh: Gudang Blok C" /></div><div><label className={labelClass}>Kode pos</label><input className={inputClass} value={form.lokasi_kode_pos} onChange={(e) => update({ lokasi_kode_pos: e.target.value })} placeholder="90241" /></div></div>
        <div><label className={labelClass}>Alamat lokasi *</label><textarea rows={2} className={inputClass} value={form.lokasi_alamat} onChange={(e) => update({ lokasi_alamat: e.target.value })} placeholder="Alamat lengkap titik layanan" /></div>
        <div className="grid gap-5 md:grid-cols-2"><div><label className={labelClass}>Kota *</label><input className={inputClass} value={form.lokasi_kota} onChange={(e) => update({ lokasi_kota: e.target.value })} /></div><div><label className={labelClass}>Provinsi *</label><input className={inputClass} value={form.lokasi_provinsi} onChange={(e) => update({ lokasi_provinsi: e.target.value })} /></div></div>
        <div className="grid gap-5 md:grid-cols-2"><div>{form.jenis_permintaan === "tambah_dedicated_core" ? <><label className={labelClass}>Tambahan dedicated core *</label><input type="number" min="1" className={inputClass} value={form.core_dedicated} onChange={(e) => update({ core_dedicated: e.target.value })} /></> : form.jenis_permintaan === "tambah_sharing_core" ? <><label className={labelClass}>Tambahan sharing core *</label><select className={inputClass} value={form.sharing_core || ""} onChange={(e) => update({ sharing_core: e.target.value })}><option value="">Pilih kapasitas</option><option value="1:1">1:1</option><option value="1:2">1:2</option><option value="1:4">1:4</option><option value="1:8">1:8</option></select></> : <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.06] p-3 text-xs leading-5 text-sky-100">Kebutuhan core akan dikonfirmasi bersama Tim IT saat verifikasi jalur.</div>}</div><div><label className={labelClass}>Catatan untuk KIMA</label><textarea rows={2} className={inputClass} value={form.catatan_pelanggan} onChange={(e) => update({ catatan_pelanggan: e.target.value })} placeholder="Keterangan tambahan (opsional)" /></div></div>
        <div className="flex justify-end border-t border-white/10 pt-6"><button className={primaryClass} onClick={next}>Lanjut tinjau <ArrowRight size={16} /></button></div>
      </div> : <div className="space-y-6"><div className="rounded-2xl border border-white/10 bg-[#0e1420] p-5"><h2 className="text-base font-black">Tinjau permintaan</h2><div className="mt-4 grid gap-4 text-sm md:grid-cols-2"><div><span className="text-xs text-slate-500">Jenis</span><p className="font-bold">{TYPES.find((item) => item.id === form.jenis_permintaan)?.title}</p></div><div><span className="text-xs text-slate-500">Kontrak induk</span><p className="font-bold">{selectedContract?.kode_kontrak || "—"}</p></div><div><span className="text-xs text-slate-500">Lokasi</span><p className="font-bold">{form.lokasi_nama}</p><p className="text-xs text-slate-400">{form.lokasi_alamat}, {form.lokasi_kota}</p></div><div><span className="text-xs text-slate-500">Kebutuhan</span><p className="font-bold">{form.jenis_permintaan === "tambah_dedicated_core" ? `${form.core_dedicated} dedicated core` : form.jenis_permintaan === "tambah_sharing_core" ? `Sharing ${form.sharing_core}` : "Dikonfirmasi saat survei"}</p></div></div></div><div className="rounded-xl border border-gold-accent/20 bg-gold-accent/[0.06] p-4 text-xs leading-5 text-slate-300">Setelah dikirim, KIMA akan memproses verifikasi jalur, tarif kontrak induk, dokumen addendum, aktivasi, hingga invoice sesuai SOP kedua.</div><div className="flex justify-between border-t border-white/10 pt-6"><button className={secondaryClass} onClick={() => setStep(1)}><ArrowLeft size={16} /> Ubah data</button><button className={primaryClass} disabled={saving} onClick={submit}>{saving ? "Mengirim..." : "Kirim pengajuan"} {saving ? <RefreshCw className="animate-spin" size={16} /> : <Send size={16} />}</button></div></div>}
    </div>
  </div></div>;
}
