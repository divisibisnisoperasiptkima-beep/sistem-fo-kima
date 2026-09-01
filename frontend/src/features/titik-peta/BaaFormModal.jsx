import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, FileCheck2, Loader2, Save, X } from "lucide-react";
import { createLocationBaa, getLocationBaa } from "../../lib/rust-api";

const empty = {
  nomor_baa: "",
  nama_pic: "",
  alamat_pic: "",
  phone: "",
  tanggal_aktivasi: "",
  nama_pelanggan: "",
  alamat_pelanggan: "",
  paket: "",
  ont_onu: "",
  mac_address: "",
  switch_media_converter: "",
  serial_number_ip_switch: "",
  fiber_outlet_otb: "",
  patch_core: "",
  kabel_drop_wire_fo: "",
  koordinat: "",
  signal_input_cpe: "",
  vlan: "",
  core: "",
};

function Field({ label, name, value, onChange, type = "text", placeholder = "" }) {
  const dateFieldClass = type === "date" ? "date-field pr-10 [color-scheme:dark]" : "";
  const inputRef = useRef(null);
  const openDatePicker = () => {
    const inputElement = inputRef.current;
    if (!inputElement) return;
    inputElement.focus();
    if (typeof inputElement.showPicker === "function") {
      try {
        inputElement.showPicker();
        return;
      } catch {
        // Some browsers only allow showPicker from a direct user gesture.
      }
    }
    inputElement.focus();
  };
  const input = <input ref={inputRef} name={name} type={type} value={value} onChange={(event) => onChange(name, event.target.value)} placeholder={placeholder} className={`mt-1.5 w-full min-w-0 rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2.5 text-sm font-medium text-white outline-none transition placeholder:text-white/30 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/20 ${dateFieldClass}`} />;
  return <label className="block min-w-0 text-xs font-semibold text-slate-200">
    <span>{label}</span>
    {type === "date" ? <span className="relative block"><button type="button" onClick={openDatePicker} className="absolute right-2 top-1/2 z-10 mt-[3px] -translate-y-1/2 rounded-md p-1 text-sky-300 transition hover:bg-sky-300/10 hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-300/40" aria-label={`Pilih ${label}`}><CalendarDays size={18} strokeWidth={2.25} /></button>{input}</span> : input}
  </label>;
}

export default function BaaFormModal({ isOpen, row, session, onClose, onSuccess }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState("");
  const [loadingExisting, setLoadingExisting] = useState(false);
  const coordinates = useMemo(() => row?.latitude != null && row?.longitude != null ? `${Number(row.latitude).toFixed(6)}, ${Number(row.longitude).toFixed(6)}` : "", [row]);

  useEffect(() => {
    if (!isOpen || !row) return;
    let active = true;
    const defaults = {
      ...empty,
      nomor_baa: `BAA-${new Date().getFullYear()}-${String(row.lokasi_id).padStart(3, "0")}`,
      tanggal_aktivasi: row.tanggal_aktivasi || "",
      nama_pic: row.pic || row.nama_pelanggan || "",
      phone: row.telepon || "",
      nama_pelanggan: row.nama_lokasi || "",
      alamat_pelanggan: row.alamat_user || "",
      paket: row.core || "",
      mac_address: row.mac_modem || "",
      koordinat: coordinates,
      signal_input_cpe: row.power == null ? "" : `${row.power} dBm`,
      vlan: row.vlan_id == null ? "" : String(row.vlan_id),
      core: row.core || "",
    };
    setForm(defaults);
    setError("");
    setProgress(0);
    setProgressLabel("");
    if (!row.baa_document_id) {
      setLoadingExisting(false);
      return () => { active = false; };
    }
    setLoadingExisting(true);
    getLocationBaa(session.token, row.lokasi_id)
      .then((result) => {
        if (!active || !result?.form) return;
        const saved = Object.fromEntries(Object.entries(result.form).filter(([, value]) => value != null));
        setForm((current) => ({ ...current, ...saved }));
      })
      .catch((requestError) => {
        if (active) setError(requestError?.message || "Data BAA terakhir gagal dimuat.");
      })
      .finally(() => { if (active) setLoadingExisting(false); });
    return () => { active = false; };
  }, [coordinates, isOpen, row, session.token]);

  if (!isOpen || !row) return null;

  const change = (name, value) => setForm((current) => {
    if (name === "paket" || name === "core") return { ...current, paket: value, core: value };
    return { ...current, [name]: value };
  });
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError(""); setProgress(12); setProgressLabel("Menyiapkan data BAA...");
    const progressTimer = window.setInterval(() => {
      setProgress((current) => current < 88 ? Math.min(current + 4, 88) : current);
    }, 450);
    const progressLabelTimer = window.setTimeout(() => setProgressLabel("Membuat PDF dan mengunggah ke Drive..."), 700);
    const clearProgressTimers = () => {
      window.clearInterval(progressTimer);
      window.clearTimeout(progressLabelTimer);
    };
    try {
      const result = await createLocationBaa(session.token, row.lokasi_id, form);
      clearProgressTimers();
      setProgress(100); setProgressLabel("Dokumen BAA berhasil dibuat.");
      await new Promise((resolve) => window.setTimeout(resolve, 280));
      onSuccess?.(result);
      onClose();
    } catch (requestError) {
      clearProgressTimers();
      setProgress(0); setProgressLabel("");
      setError(requestError?.message || "Dokumen BAA gagal dibuat.");
    } finally { clearProgressTimers(); setSaving(false); }
  };

  const editing = Boolean(row.baa_document_id);
  return <div className="fixed inset-0 z-[12000] flex items-end justify-center bg-slate-950/80 p-2 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={editing ? "Edit Data BAA" : "Isi Form BAA"}>
    <form onSubmit={submit} className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><span className="rounded-xl bg-emerald-400/15 p-2.5 text-emerald-300"><FileCheck2 size={21} /></span><div className="min-w-0"><h2 className="truncate text-lg font-black text-white">{editing ? "Edit Data BAA" : "Isi Form BAA"}</h2><p className="truncate text-xs text-white/55">{row.nama_lokasi} · {row.nama_pelanggan}</p></div></div>
        <button type="button" onClick={onClose} disabled={saving} className="rounded-xl p-2 text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-50" aria-label="Tutup"><X size={21} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        <div className="mb-4 rounded-xl border border-sky-300/20 bg-sky-400/[0.07] p-3 text-xs leading-5 text-sky-100">{editing ? "Perbarui data BAA melalui form ini. Setelah disimpan, PDF BAA akan dibuat ulang di folder BAA lokasi." : "Form ini membuat dokumen BAA dalam format PDF dan menyimpannya ke folder BAA lokasi. Tidak mengubah status SOP."}{loadingExisting && <span className="ml-2 text-sky-200">Memuat data terakhir…</span>}</div>
        <section className="space-y-3"><h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">Identitas berita acara</h3><div className="grid gap-3 sm:grid-cols-2"><Field label="Nomor BAA" name="nomor_baa" value={form.nomor_baa} onChange={change} /><Field label="Tanggal aktivasi" name="tanggal_aktivasi" type="date" value={form.tanggal_aktivasi} onChange={change} /><Field label="Nama PIC / provider" name="nama_pic" value={form.nama_pic} onChange={change} /><Field label="Telepon PIC" name="phone" value={form.phone} onChange={change} placeholder="08xxxxxxxxxx" /><Field label="Alamat PIC" name="alamat_pic" value={form.alamat_pic} onChange={change} /><Field label="Nama pelanggan / lokasi" name="nama_pelanggan" value={form.nama_pelanggan} onChange={change} /><Field label="Alamat pelanggan / lokasi" name="alamat_pelanggan" value={form.alamat_pelanggan} onChange={change} /></div></section>
        <section className="mt-5 space-y-3"><h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">Service & perangkat</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="Paket (mengikuti Core)" name="paket" value={form.paket} onChange={change} /><Field label="ONT / ONU" name="ont_onu" value={form.ont_onu} onChange={change} /><Field label="MAC address" name="mac_address" value={form.mac_address} onChange={change} /><Field label="Switch / media converter" name="switch_media_converter" value={form.switch_media_converter} onChange={change} /><Field label="Serial number / IP switch" name="serial_number_ip_switch" value={form.serial_number_ip_switch} onChange={change} /><Field label="Fiber outlet / OTB" name="fiber_outlet_otb" value={form.fiber_outlet_otb} onChange={change} /><Field label="Patch core" name="patch_core" value={form.patch_core} onChange={change} /><Field label="Kabel / drop wire FO" name="kabel_drop_wire_fo" value={form.kabel_drop_wire_fo} onChange={change} /></div></section>
        <section className="mt-5 space-y-3"><h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">Data teknis aktivasi</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Koordinat" name="koordinat" value={form.koordinat} onChange={change} placeholder="-5.123456, 119.123456" /><Field label="Signal input CPE" name="signal_input_cpe" value={form.signal_input_cpe} onChange={change} placeholder="-18 dBm" /><Field label="VLAN" name="vlan" value={form.vlan} onChange={change} /><Field label="Core" name="core" value={form.core} onChange={change} /></div></section>
        {error && <p className="mt-4 rounded-xl border border-rose-300/25 bg-rose-400/10 px-3 py-2.5 text-sm font-semibold text-rose-100" role="alert">{error}</p>}
      </div>
      <footer className="flex shrink-0 flex-col gap-3 border-t border-white/10 bg-slate-900/95 px-4 py-3 sm:px-6">
        {saving && <div className="space-y-1.5" role="status" aria-live="polite"><div className="flex items-center justify-between gap-3 text-[11px] font-bold text-sky-100"><span>{progressLabel}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress} aria-label="Progress pembuatan dokumen BAA"><div className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 transition-[width] duration-300" style={{ width: `${progress}%` }} /></div><p className="text-[10px] text-white/45">Jangan tutup modal sampai proses selesai.</p></div>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} disabled={saving} className="w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white/55 transition hover:bg-white/10 hover:text-white sm:w-auto">Batal</button><button type="submit" disabled={saving || loadingExisting} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60 sm:w-auto">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{saving ? "Menyimpan PDF..." : editing ? "Simpan Perubahan BAA" : "Simpan & Buat PDF BAA"}</button></div>
      </footer>
    </form>
  </div>;
}
