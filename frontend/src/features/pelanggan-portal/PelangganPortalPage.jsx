import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Clock3, Download, Eye, FileText, FileUp, Loader2, MapPin, RefreshCw, Route, Send, ShieldCheck, UserRound, X } from "lucide-react";
import { acceptPortalRegistrationBaa, confirmPortalRegistrationPayment, deleteDocument, fetchDocumentContent, listAllPages, listContracts, listCustomers, listIspDocuments, listMyServiceRequests, listServiceChangeHistory, listServiceChangeNotifications, listServiceChangeRequests, markServiceChangeNotification, respondOffer, rowsFrom, submitPo, uploadDocument } from "../../lib/rust-api";
import CancelRegistrationModal from "../sop/CancelRegistrationModal";
import Sop2ActionModal from "../sop/Sop2ActionModal";
import { getSop1Owner, getSop2Owner } from "../sop/workflowResponsibility";

const value = (item, fallback = "—") => item == null || item === "" ? fallback : String(item);
const formatDate = (raw) => {
  if (!raw) return "—";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(raw)) ? `${raw}T00:00:00` : raw);
  return Number.isNaN(date.getTime()) ? String(raw) : date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};
const formatCurrency = (raw) => {
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? `Rp ${numeric.toLocaleString("id-ID")}` : "Nilai belum tersedia";
};

const STEPS = [
  "Lokasi/Tenant mengirim minat", "Admin menerima kebutuhan", "Lokasi/Tenant konfirmasi kebutuhan", "Teknisi survei jalur", "Admin mengirim penawaran", "Lokasi/Tenant menanggapi penawaran", "Lokasi/Tenant mengirim permintaan sambungan", "Lokasi/Tenant mengirim PO", "Admin memverifikasi dokumen", "KIMA menyiapkan persetujuan", "KIMA/DBO memberi keputusan", "Admin menyusun PKS", "Para pihak menandatangani PKS", "Teknisi mengaktifkan layanan", "Teknisi membuat BAA", "Keuangan menerbitkan invoice", "Keuangan mengirim tagihan", "Lokasi/Tenant membayar dan mengirim bukti",
];
const CUSTOMER_STEPS = [
  { label: "Pengajuan layanan", short: "Data permohonan dikirim", range: [1, 3], owner: "Lokasi/Tenant & KIMA", detail: "Data perusahaan, PIC, lokasi, dan kebutuhan layanan ditinjau bersama sebelum survei." },
  { label: "Survei jalur", short: "Kesiapan jalur diperiksa", range: [4, 4], owner: "Teknisi KIMA", detail: "Teknisi menentukan jadwal dan memeriksa jalur fiber di lokasi tenant." },
  { label: "Penawaran", short: "Penawaran KIMA ditanggapi", range: [5, 7], owner: "KIMA & Lokasi/Tenant", detail: "KIMA mengirim surat penawaran. Lokasi/tenant dapat menyetujui, mengajukan negosiasi, atau menolak." },
  { label: "PO & verifikasi", short: "PO dan legalitas diperiksa", range: [8, 10], owner: "Lokasi/Tenant & KIMA", detail: "Lokasi/tenant mengirim PO, akta, dan izin. KIMA memeriksa kelengkapan sebelum meminta persetujuan." },
  { label: "Persetujuan & kontrak", short: "Keputusan dan BAK/PKS", range: [11, 13], owner: "KIMA/DBO", detail: "Admin KIMA/DBO memberikan keputusan persetujuan; Direksi dapat menjadi pemberi keputusan opsional. Setelah setuju, DBO mengunggah BAK dan/atau PKS final yang sudah lengkap tanda tangannya untuk dilihat pelanggan." },
  { label: "Aktivasi & BAA", short: "Layanan diaktifkan dan BAA dikonfirmasi", range: [14, 15], owner: "Teknisi, DBO & Lokasi/Tenant", detail: "Teknisi mengaktifkan layanan dan mengunggah BAA. DBO KIMA memeriksa serta mengirimkannya, lalu lokasi/tenant mengonfirmasi penerimaan." },
  { label: "Tagihan & pembayaran", short: "Invoice dan bukti pembayaran", range: [16, 18], owner: "Keuangan & Lokasi/Tenant", detail: "Keuangan menerbitkan invoice. Lokasi/tenant membayar dan mengunggah bukti pembayaran untuk diverifikasi." },
];
const customerPhaseForStep = (step) => {
  if (!step) return 1;
  if (step > STEPS.length) return CUSTOMER_STEPS.length + 1;
  const phase = CUSTOMER_STEPS.findIndex((item) => step >= item.range[0] && step <= item.range[1]);
  return phase >= 0 ? phase + 1 : 1;
};
const PO_DOCUMENT_FIELDS = [
  { key: "surat", idKey: "po_dokumen_id", label: "Surat PO / permintaan sambungan" },
  { key: "akte", idKey: "po_akte_dokumen_id", label: "Akte pendirian perusahaan" },
  { key: "izin", idKey: "po_izin_dokumen_id", label: "Izin pelanggan" },
];
const SOP2_STEPS = ["Lokasi/Tenant mengajukan perubahan", "KIMA mengirim tarif kontrak induk", "Teknisi memverifikasi jalur", "KIMA mengirim PO bertarif", "Lokasi/Tenant mengirim PO", "KIMA menyiapkan perjanjian", "KIMA menandatangani BAK", "Teknisi mengaktifkan layanan", "KIMA menerima status & BAA", "Keuangan menerbitkan invoice", "Keuangan mengirim tagihan", "Lokasi/Tenant membayar & kirim bukti"];
function CustomerFlowPhaseDetailModal({ request, currentPhase, phaseNumber, onClose }) {
  if (!request || !phaseNumber) return null;
  const phase = CUSTOMER_STEPS[phaseNumber - 1];
  if (!phase) return null;
  const isDone = phaseNumber < currentPhase;
  const isCurrent = phaseNumber === currentPhase;
  const status = isDone ? "Selesai" : isCurrent ? "Sedang diproses" : "Menunggu tahap sebelumnya";
  const statusTone = isDone ? "border-emerald-400/25 bg-emerald-400/10" : isCurrent ? "border-sky-400/25 bg-sky-400/10" : "border-white/10 bg-white/[0.04]";
  const internalSteps = STEPS.slice(phase.range[0] - 1, phase.range[1]);

  return <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Detail fase ${phaseNumber}`}>
    <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
    <section className="relative max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-sky-300/20 bg-slate-950 shadow-2xl">
      <header className="flex items-start justify-between border-b border-white/10 bg-gradient-to-r from-sky-400/15 to-violet-400/10 p-5">
        <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-200">Detail fase lokasi/tenant</p><h2 className="mt-2 text-lg font-black text-white">Fase {phaseNumber} · {phase.label}</h2><p className="mt-1 text-xs text-white/45">{request.kode_registrasi} · {request.lokasi_nama}</p></div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-white/45 transition hover:bg-white/10 hover:text-white" aria-label="Tutup detail fase"><X size={20} /></button>
      </header>
      <div className="space-y-4 p-5">
        <div className={`rounded-xl border p-4 ${statusTone}`}><p className="text-[10px] font-black uppercase tracking-widest text-white/45">Status fase</p><p className="mt-1 text-base font-black text-white">{status}</p></div>
        <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-white/10 bg-white/[0.035] p-4"><p className="text-[10px] font-black uppercase tracking-widest text-white/40">Pihak terkait</p><p className="mt-2 text-sm font-bold text-sky-100">{phase.owner}</p></div><div className="rounded-xl border border-white/10 bg-white/[0.035] p-4"><p className="text-[10px] font-black uppercase tracking-widest text-white/40">Posisi proses</p><p className="mt-2 text-sm font-bold text-white">{phaseNumber} dari {CUSTOMER_STEPS.length} fase</p></div></div>
        <div className="rounded-xl border border-white/10 bg-black/15 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-white/40">Ringkasan</p><p className="mt-2 text-sm leading-6 text-white/70">{phase.detail}</p></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className="text-[10px] font-black uppercase tracking-widest text-white/40">Cakupan proses</p><ul className="mt-2 space-y-2">{internalSteps.map((step) => <li key={step} className="flex gap-2 text-xs leading-5 text-white/60"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" />{step}</li>)}</ul><p className="mt-3 text-[10px] leading-4 text-white/35">Rincian operasional internal dikelola KIMA dan tidak perlu Anda tindak lanjuti dari portal ini.</p></div>
        <div className="flex justify-end border-t border-white/10 pt-4"><button type="button" onClick={onClose} className="rounded-lg bg-sky-400 px-4 py-2 text-xs font-black text-slate-950 transition hover:bg-sky-300">Tutup detail</button></div>
      </div>
    </section>
  </div>;
}

function OfferResponsePanel({ request, email, offerDocument, onOpenDocument, onSuccess }) {
  const [decision, setDecision] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (request?.penawaran_status !== "dikirim") return null;

  const submit = async (event) => {
    event.preventDefault();
    if (!decision) {
      setError("Pilih respons penawaran terlebih dahulu.");
      return;
    }
    if (decision !== "setuju" && !notes.trim()) {
      setError("Catatan wajib diisi untuk negosiasi atau penolakan.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await respondOffer(request.kode_registrasi, email, decision, notes.trim() || null);
      setDecision("");
      setNotes("");
      await onSuccess();
    } catch (err) {
      setError(err.message || "Respons penawaran gagal dikirim.");
    } finally {
      setSaving(false);
    }
  };

  return <form onSubmit={submit} className="mt-5 rounded-2xl border border-gold-accent/30 bg-gold-accent/[0.08] p-4 md:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold-accent">Tindakan Anda · Tahap 6</p>
        <h3 className="mt-1 text-base font-black text-white">Tanggapi surat penawaran KIMA</h3>
        <p className="mt-1 text-xs leading-5 text-white/55">Tinjau nilai dan surat resmi berikut, lalu pilih keputusan untuk melanjutkan proses.</p>
      </div>
      {offerDocument && <button type="button" onClick={() => void onOpenDocument(offerDocument, "preview")} className="shrink-0 rounded-lg border border-sky-300/30 bg-sky-400/10 px-3 py-2 text-[10px] font-black text-sky-100 transition hover:bg-sky-400/20">Buka surat penawaran</button>}
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-white/40">Nomor penawaran</p><p className="mt-1 text-sm font-bold text-white">{value(request.penawaran_nomor, "Belum tersedia")}</p></div>
      <div className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-white/40">Nilai penawaran</p><p className="mt-1 text-sm font-black text-gold-accent">{formatCurrency(request.penawaran_nilai)}</p></div>
    </div>
    {request.penawaran_catatan && <p className="mt-3 rounded-xl border border-white/10 bg-black/15 p-3 text-xs leading-5 text-white/65">Catatan KIMA: {request.penawaran_catatan}</p>}
    <fieldset className="mt-4">
      <legend className="text-xs font-bold text-white/80">Respons Anda *</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {[['setuju', 'Setujui penawaran', 'Lanjut ke pengiriman PO'], ['negosiasi', 'Ajukan negosiasi', 'Minta penyesuaian'], ['tolak', 'Tolak penawaran', 'Hentikan penawaran']].map(([option, label, hint]) => <label key={option} className={`cursor-pointer rounded-xl border p-3 transition ${decision === option ? "border-gold-accent bg-gold-accent/15" : "border-white/10 bg-black/10 hover:border-white/25"}`}><input type="radio" name={`offer-decision-${request.kode_registrasi}`} value={option} checked={decision === option} onChange={(event) => { setDecision(event.target.value); setError(""); }} className="sr-only" /><span className="block text-xs font-black text-white">{label}</span><span className="mt-1 block text-[10px] leading-4 text-white/45">{hint}</span></label>)}
      </div>
    </fieldset>
    {decision && decision !== "setuju" && <label className="mt-3 block text-xs font-bold text-white/80">Catatan {decision === "negosiasi" ? "negosiasi" : "penolakan"} *<textarea required value={notes} onChange={(event) => { setNotes(event.target.value); setError(""); }} rows={3} placeholder={decision === "negosiasi" ? "Jelaskan bagian yang ingin dinegosiasikan." : "Jelaskan alasan penolakan penawaran."} className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/70 p-3 text-xs font-normal text-white outline-none focus:border-gold-accent" /></label>}
    {error && <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
    <div className="mt-4 flex justify-end"><button type="submit" disabled={saving || !decision} className="rounded-xl bg-gold-accent px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Mengirim respons…" : decision === "setuju" ? "Setujui & lanjut ke PO" : decision === "negosiasi" ? "Kirim permintaan negosiasi" : decision === "tolak" ? "Kirim penolakan" : "Pilih respons"}</button></div>
  </form>;
}

function PoSubmissionPanel({ request, email, token, onSuccess }) {
  const [poNumber, setPoNumber] = useState(request?.po_nomor || "");
  const [notes, setNotes] = useState("");
  const [selectedFiles, setSelectedFiles] = useState({});
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const existingDocumentIds = Object.fromEntries(PO_DOCUMENT_FIELDS.map((field) => [field.key, request?.[field.idKey] || null]));
  const hasCompleteDocuments = PO_DOCUMENT_FIELDS.every((field) => existingDocumentIds[field.key]);
  const needsResubmission = request?.legal_status === "perlu_perbaikan";
  if (request?.status !== "disetujui" || request?.penawaran_status !== "setuju" || (hasCompleteDocuments && !needsResubmission)) return null;
  const hasExistingPoNumber = Boolean(request?.po_nomor);

  const submit = async (event) => {
    event.preventDefault();
    const trimmedNumber = poNumber.trim();
    if (!trimmedNumber) {
      setError("Nomor PO atau permintaan sambungan wajib diisi.");
      return;
    }
    if (!email) {
      setError("Email akun pelanggan belum tersedia. Silakan masuk kembali.");
      return;
    }
    if (!token || !request.id) {
      setError("Data akun Lokasi/Tenant belum siap. Silakan muat ulang halaman atau hubungi Admin KIMA.");
      return;
    }
    for (const field of PO_DOCUMENT_FIELDS) {
      if (existingDocumentIds[field.key] && !needsResubmission) continue;
      const file = selectedFiles[field.key];
      if (!file) {
        setError(`${field.label} wajib diunggah.`);
        return;
      }
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        setError(`${field.label} harus berupa file PDF.`);
        return;
      }
    }
    setSaving(true);
    setError("");
    setUploadProgress(0);
    setUploadLabel("");
    try {
      // Saat Legal meminta perbaikan, ketiga dokumen harus dikirim ulang
      // agar versi baru menggantikan referensi dokumen sebelumnya.
      const documentIds = needsResubmission
        ? Object.fromEntries(PO_DOCUMENT_FIELDS.map((field) => [field.key, null]))
        : { ...existingDocumentIds };
      for (const field of PO_DOCUMENT_FIELDS) {
        if (documentIds[field.key]) continue;
        const file = selectedFiles[field.key];
        setUploadLabel(field.label);
        const formData = new FormData();
        formData.append("file", file);
        const kategori = field.key === "surat" ? "Surat PO" : field.key === "akte" ? "Akte Pendirian" : "Izin Pelanggan";
        formData.append("kategori", kategori);
        formData.append("portal_registration_id", String(request.id));
        const uploaded = await uploadDocument(token, formData, setUploadProgress);
        if (!uploaded?.id) {
          throw new Error(`${field.label} berhasil diunggah tetapi belum mendapatkan ID.`);
        }
        documentIds[field.key] = uploaded.id;
      }
      await submitPo(request.kode_registrasi, email, trimmedNumber, notes.trim() || null, documentIds.surat, documentIds.akte, documentIds.izin);
      setPoNumber("");
      setNotes("");
      setSelectedFiles({});
      setUploadProgress(100);
      setUploadLabel("");
      await onSuccess();
    } catch (err) {
      setError(err.message || "Permintaan sambungan gagal dikirim.");
    } finally {
      setSaving(false);
    }
  };

  return <form onSubmit={submit} className="mt-5 rounded-2xl border border-sky-300/30 bg-sky-400/[0.08] p-4 md:p-5">
    <div className="flex items-start gap-3">
      <div className="rounded-xl bg-sky-400/15 p-2 text-sky-200"><Send size={18} /></div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-200">Tindakan Anda · Tahap 7–8</p>
        <h3 className="mt-1 text-base font-black text-white">{needsResubmission ? "Perbaiki dan unggah ulang dokumen" : hasExistingPoNumber ? "Lengkapi dokumen permintaan sambungan" : "Kirim permintaan sambungan"}</h3>
        <p className="mt-1 text-xs leading-5 text-white/55">{needsResubmission ? "Legal meminta perbaikan dokumen. Unggah ulang ketiga berkas PDF agar permohonan dapat diverifikasi kembali." : hasExistingPoNumber ? "Nomor PO sudah tercatat. Lengkapi tiga dokumen PDF agar Admin KIMA dapat memverifikasi permohonan." : "Penawaran telah disetujui. Kirim nomor PO atau nomor surat permintaan sambungan beserta akte pendirian dan izin pelanggan."}</p>
      </div>
    </div>
    {needsResubmission && <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-400/[0.08] p-3 text-xs leading-5 text-amber-100"><p className="font-black uppercase tracking-widest text-amber-200">Catatan perbaikan Legal</p><p className="mt-1">{request.legal_catatan || "Silakan periksa kembali kelengkapan dan keabsahan dokumen yang diunggah."}</p></div>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-white/40">Penawaran disetujui</p><p className="mt-1 text-sm font-bold text-white">{value(request.penawaran_nomor, "Nomor belum tersedia")}</p><p className="mt-1 text-xs font-black text-gold-accent">{formatCurrency(request.penawaran_nilai)}</p></div>
      <div className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-white/40">Tahap berikutnya</p><p className="mt-1 text-sm font-bold text-sky-100">Admin memverifikasi dokumen</p><p className="mt-1 text-xs text-white/45">Setelah PO dikirim</p></div>
    </div>
    <label className="mt-4 block text-xs font-bold text-white/80">Nomor PO / permintaan sambungan *<input required value={poNumber} onChange={(event) => { setPoNumber(event.target.value); setError(""); }} placeholder="PO-2026-001 atau nomor surat permintaan" className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/70 p-3 text-sm font-normal text-white outline-none focus:border-sky-300" /></label>
    <div className="mt-3 grid gap-3 md:grid-cols-3">{PO_DOCUMENT_FIELDS.map((field) => { const existingId = needsResubmission ? null : existingDocumentIds[field.key]; const file = selectedFiles[field.key]; return <label key={field.key} className="block text-xs font-bold text-white/80">{field.label} (PDF) *<span className={`mt-1.5 flex items-center gap-3 rounded-xl border border-dashed p-3 text-sm font-normal text-white transition ${existingId ? "border-emerald-300/30 bg-emerald-400/[0.06]" : "cursor-pointer border-sky-300/35 bg-slate-950/70 hover:border-sky-200/70 hover:bg-sky-400/[0.06]"}`}><FileUp size={18} className={`shrink-0 ${existingId ? "text-emerald-200" : "text-sky-200"}`} /><span className="min-w-0 flex-1 truncate">{existingId ? "Dokumen sudah tersimpan" : file?.name || "Pilih PDF"}</span>{!existingId && <span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-sky-200">Pilih</span>}<input required={!existingId} disabled={saving || Boolean(existingId)} type="file" accept=".pdf,application/pdf" onChange={(event) => { const selected = event.target.files?.[0] || null; setSelectedFiles((current) => ({ ...current, [field.key]: selected })); setError(""); setUploadProgress(0); }} className="sr-only" /></span>{existingId && <span className="mt-1 block text-[10px] font-medium text-emerald-200">Sudah tertaut pada permohonan</span>}{needsResubmission && <span className="mt-1 block text-[10px] font-medium text-amber-200">Wajib unggah versi perbaikan</span>}</label>; })}</div>
    {saving && uploadLabel && <span className="mt-3 flex items-center gap-1.5 text-[10px] font-medium text-sky-200"><Loader2 size={12} className="animate-spin" />Mengunggah {uploadLabel}… {uploadProgress}%</span>}
    <label className="mt-3 block text-xs font-bold text-white/80">Catatan pengiriman (opsional)<textarea value={notes} onChange={(event) => { setNotes(event.target.value); setError(""); }} rows={3} placeholder="Tambahkan catatan untuk Admin KIMA bila diperlukan." className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/70 p-3 text-sm font-normal text-white outline-none focus:border-sky-300" /></label>
    {error && <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
    <div className="mt-4 flex justify-end"><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-sky-300 px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Mengunggah & mengirim…" : needsResubmission ? "Unggah ulang & kirim" : "Unggah & kirim permintaan"}<Send size={14} /></button></div>
  </form>;
}

function PaymentSubmissionPanel({ request, email, token, documents, onOpenDocument, documentAction, onSuccess }) {
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (request?.invoice_status !== "dikirim" || request?.pembayaran_status !== "menunggu_pembayaran") return null;
  const invoiceDocuments = [
    { id: request.invoice_dokumen_id, label: "Invoice" },
    { id: request.faktur_pajak_dokumen_id, label: "Faktur Pajak" },
  ].map(({ id, label }) => {
    const document = (documents || []).find((item) => String(item.id) === String(id));
    return document ? { ...document, label } : null;
  }).filter(Boolean);

  const submit = async (event) => {
    event.preventDefault();
    if (!file) return setError("Bukti pembayaran wajib diunggah.");
    if (!request.id || !token || !email) return setError("Akun Lokasi/Tenant belum siap untuk mengunggah bukti pembayaran.");
    setSaving(true); setError(""); setProgress(0);
    let documentId = null;
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kategori", "Bukti Pembayaran");
      formData.append("portal_registration_id", String(request.id));
      const uploaded = await uploadDocument(token, formData, setProgress);
      documentId = uploaded?.id;
      if (!documentId) throw new Error("Bukti pembayaran berhasil diunggah tetapi belum memiliki ID.");
      await confirmPortalRegistrationPayment(request.kode_registrasi, email, notes.trim() || null, documentId);
      setFile(null); setNotes(""); await onSuccess();
    } catch (err) {
      if (documentId) {
        try { await deleteDocument(token, documentId); } catch { /* Upload akan dibersihkan pada pemeriksaan arsip bila penghapusan gagal. */ }
      }
      setError(err.message || "Bukti pembayaran gagal dikirim.");
    } finally { setSaving(false); }
  };

  return <form onSubmit={submit} className="mt-5 rounded-2xl border border-emerald-300/30 bg-emerald-400/[0.08] p-4 md:p-5">
    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Tindakan Anda · Tahap 18</p>
    <h3 className="mt-1 text-base font-black text-white">Kirim bukti pembayaran</h3>
    <p className="mt-1 text-xs leading-5 text-white/55">Unggah bukti transfer atau pembayaran untuk diverifikasi Keuangan KIMA.</p>

    <div className="mt-4 rounded-xl border border-gold-accent/25 bg-gold-accent/[0.08] p-3.5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-gold-accent">Dokumen tagihan</p>
          <p className="mt-1 text-sm font-black text-white">{value(request.invoice_nomor, "Invoice tersedia")}</p>
        </div>
        {request.invoice_nilai && <p className="shrink-0 text-sm font-black text-gold-accent">{formatCurrency(request.invoice_nilai)}</p>}
      </div>
      {invoiceDocuments.length > 0 ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{invoiceDocuments.map((document) => <div key={document.id} className="flex flex-col gap-2 rounded-lg border border-white/10 bg-slate-950/45 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-xs font-black text-white">{document.label}</p><p className="mt-1 truncate text-[10px] text-white/45">{document.nama_file || "Berkas tersedia"}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => void onOpenDocument(document, "preview")} disabled={Boolean(documentAction)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-300/30 bg-sky-400/10 px-2.5 py-1.5 text-[10px] font-black text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-50"><Eye size={12} />Buka</button><button type="button" onClick={() => void onOpenDocument(document, "download")} disabled={Boolean(documentAction)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1.5 text-[10px] font-black text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"><Download size={12} />Unduh</button></div></div>)}</div> : <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-400/10 p-2.5 text-[10px] leading-4 text-amber-100">Dokumen invoice belum tersedia untuk dibuka. Silakan hubungi Keuangan KIMA.</p>}
      <p className="mt-2 text-[10px] leading-4 text-white/45">Periksa invoice dan faktur pajak sebelum mengunggah bukti pembayaran.</p>
    </div>

    <label className="mt-4 block text-xs font-bold text-white/80">Bukti pembayaran (PDF/JPG/PNG) *<span className="mt-1.5 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-emerald-300/35 bg-slate-950/70 p-3 text-sm font-normal text-white"><FileUp size={18} className="shrink-0 text-emerald-200"/><span className="min-w-0 flex-1 truncate">{file?.name || "Pilih bukti pembayaran"}</span><span className="shrink-0 text-[10px] font-black text-emerald-200">Pilih</span><input required type="file" accept=".pdf,image/*" onChange={(event) => { setFile(event.target.files?.[0] || null); setProgress(0); }} className="sr-only"/></span></label>
    <label className="mt-3 block text-xs font-bold text-white/80">Catatan <span className="font-normal text-white/40">(opsional)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Nomor referensi transfer atau catatan pembayaran" className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/70 p-3 text-xs font-normal text-white outline-none focus:border-emerald-300"/></label>
    {saving && progress > 0 && <p className="mt-2 text-xs text-emerald-100">Mengunggah bukti… {progress}%</p>}
    {error && <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 p-2.5 text-xs text-rose-100">{error}</p>}
    <div className="mt-4 flex justify-end"><button disabled={saving} className="w-full rounded-xl bg-emerald-300 px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">{saving ? "Mengirim…" : "Kirim bukti pembayaran"}</button></div>
  </form>;
}

function PksSignaturePanel({ request, draftDocuments, onOpenDocument }) {
  const hasBak = Boolean(request?.bak_dokumen_id);
  const hasPks = Boolean(request?.pks_dokumen_id);
  const complete = request?.pks_status === "lengkap";
  const legacyWaiting = ["menunggu_tanda_tangan", "menunggu_tanda_tangan_pelanggan", "menunggu_verifikasi_dokumen_pelanggan", "menunggu_dokumen_final"].includes(request?.pks_status);
  if (!complete && !legacyWaiting && !hasBak && !hasPks) return null;
  const documents = (draftDocuments || []).filter(Boolean);

  return <section className="mt-5 rounded-2xl border border-emerald-300/30 bg-emerald-400/[0.08] p-4 md:p-5">
    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Informasi lokasi/tenant · Fase 5</p>
    <h3 className="mt-1 text-base font-black text-white">BAK/PKS dari KIMA</h3>
    {complete ? <p className="mt-1 text-xs leading-5 text-white/65">Dokumen final sudah lengkap dengan tanda tangan para pihak. Silakan buka atau unduh untuk arsip Anda. Tidak perlu mengunggah ulang; proses berikutnya adalah aktivasi oleh Teknisi KIMA.</p> : <p className="mt-1 text-xs leading-5 text-white/65">KIMA sedang menyiapkan dokumen final BAK/PKS. Tombol unggah pelanggan tidak diperlukan pada alur ini.</p>}
    {documents.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2">{documents.map((document) => <div key={document.id} className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="truncate text-xs font-bold text-white">{document.label}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => void onOpenDocument(document, "preview")} className="inline-flex items-center gap-2 rounded-lg border border-sky-300/30 bg-sky-400/10 px-3 py-2 text-xs font-black text-sky-100 hover:bg-sky-400/20"><Eye size={14} />Buka</button><button type="button" onClick={() => void onOpenDocument(document, "download")} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-100 hover:bg-emerald-400/20"><Download size={14} />Unduh</button></div></div>)}</div>}
  {complete && documents.length === 0 && <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-400/10 p-3 text-xs text-amber-100">Dokumen sudah berstatus lengkap, tetapi berkas belum tertaut pada portal. Hubungi Admin KIMA.</p>}
  </section>;
}

function BaaAcceptancePanel({ request, email, document, onOpenDocument, onSuccess }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const status = request?.baa_status;
  if (!["menunggu_verifikasi_dbo", "menunggu_konfirmasi_lokasi", "diterima_lokasi"].includes(status)) return null;

  const accept = async () => {
    if (!email) {
      setError("Email akun pelanggan belum tersedia. Silakan masuk kembali.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await acceptPortalRegistrationBaa(request.kode_registrasi, email);
      await onSuccess?.();
    } catch (err) {
      setError(err.message || "Konfirmasi penerimaan BAA gagal.");
    } finally {
      setSaving(false);
    }
  };

  const waitingDbo = status === "menunggu_verifikasi_dbo";
  const accepted = status === "diterima_lokasi";
  const visibleDocument = waitingDbo ? null : document;
  const canAccept = !waitingDbo && !accepted && Boolean(visibleDocument);
  return <section className="mt-5 rounded-2xl border border-emerald-300/30 bg-emerald-400/[0.08] p-4 md:p-5"><div className="flex items-start gap-3"><span className="rounded-xl bg-emerald-400/15 p-2 text-emerald-200"><FileText size={18} /></span><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Tindakan Anda · BAA</p><h3 className="mt-1 text-base font-black text-white">{accepted ? "BAA sudah dikonfirmasi" : waitingDbo ? "BAA sedang diperiksa KIMA" : "Konfirmasi penerimaan BAA"}</h3><p className="mt-1 text-xs leading-5 text-white/60">{accepted ? "Penerimaan BAA tercatat. Keuangan dapat melanjutkan penerbitan invoice." : waitingDbo ? "Teknisi telah mengunggah BAA. DBO KIMA sedang memeriksa dokumen; berkas akan tersedia setelah dikirim kepada Anda." : "Buka atau unduh BAA yang dikirim KIMA, lalu konfirmasikan penerimaannya agar proses invoice dapat dilanjutkan."}</p></div></div>{visibleDocument ? <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-950/35 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-xs font-bold text-white">{visibleDocument.nama_file || `BAA ${request.baa_nomor || request.kode_registrasi}`}</p><p className="mt-1 text-[10px] text-white/40">Berita Acara Aktivasi · PDF</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => void onOpenDocument(visibleDocument, "preview")} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300/30 bg-sky-400/10 px-3 py-2 text-[10px] font-black text-sky-100 hover:bg-sky-400/20"><Eye size={13} />Buka</button><button type="button" onClick={() => void onOpenDocument(visibleDocument, "download")} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-[10px] font-black text-emerald-100 hover:bg-emerald-400/20"><Download size={13} />Unduh</button></div></div> : <p className="mt-4 rounded-lg border border-amber-300/20 bg-amber-400/10 p-3 text-xs text-amber-100">{waitingDbo ? "Dokumen BAA belum dikirim kepada Anda. Tombol buka dan unduh akan muncul setelah verifikasi DBO KIMA." : "BAA sudah tercatat, tetapi dokumen belum tersedia untuk dibuka. Hubungi Admin KIMA."}</p>}{canAccept && <button type="button" disabled={saving} onClick={() => void accept()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Saya sudah menerima BAA</button>}{error && <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 p-2.5 text-xs text-rose-100">{error}</p>}</section>;
}

function StatusBadge({ status }) {
  const normalized = String(status || "").toLowerCase();
  const tone = normalized.includes("selesai") || normalized.includes("completed") || normalized.includes("beroperasi")
    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
    : normalized.includes("tolak") || normalized.includes("reject") || normalized.includes("batal")
      ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
      : "border-sky-400/30 bg-sky-400/10 text-sky-200";
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black ${tone}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{value(status, "Sedang diproses")}</span>;
}

function Empty({ icon, title, children }) {
  const IconComponent = icon || FileText;
  return <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.035] px-6 py-12 text-center">{createElement(IconComponent, { className: "mx-auto text-white/25", size: 30 })}<p className="mt-3 text-sm font-bold text-white/75">{title}</p><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-white/40">{children}</p></div>;
}

const CUSTOMER_DOCUMENT_GROUPS = [
  { id: "permohonan", title: "Permohonan & legalitas", description: "Berkas yang dikirim saat permohonan layanan.", match: (category) => /surat\s*po|po|akte|akta|izin|legal/.test(category) },
  { id: "kerja-sama", title: "Penawaran & kerja sama", description: "Penawaran KIMA serta dokumen BAK/PKS.", match: (category) => /penawaran|nota|bak|pks/.test(category) },
  { id: "aktivasi", title: "Aktivasi layanan", description: "Berita acara setelah layanan diaktifkan.", match: (category) => /baa|aktivasi/.test(category) },
  { id: "tagihan", title: "Tagihan & pembayaran", description: "Invoice, faktur pajak, dan bukti pembayaran.", match: (category) => /invoice|faktur|tagihan|pembayaran/.test(category) },
];
const CUSTOMER_DOCUMENT_ORDER = ["Surat PO / permintaan sambungan", "Akte pendirian perusahaan", "Izin pelanggan", "Surat Penawaran", "Nota Dinas", "BAK final bertanda tangan", "PKS final bertanda tangan", "BAK-PKS", "BAA", "Invoice", "Faktur Pajak", "Bukti Pembayaran"];
const customerDocumentOrder = (document) => {
  const label = String(document.label || document.kategori || "").toLowerCase();
  const index = CUSTOMER_DOCUMENT_ORDER.findIndex((item) => label.includes(item.toLowerCase()));
  return index < 0 ? CUSTOMER_DOCUMENT_ORDER.length : index;
};

function CustomerDocumentCard({ document, onOpenDocument, documentAction }) {
  const title = document.label || document.kategori || "Dokumen";
  const filename = document.nama_file || "Nama file belum tersedia";
  const busy = Boolean(documentAction);
  return <article className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/45 p-3.5 sm:flex-row sm:items-center"><div className="flex min-w-0 items-start gap-3"><span className="shrink-0 rounded-lg bg-sky-400/10 p-2 text-sky-200"><FileText size={16} /></span><div className="min-w-0"><p className="truncate text-xs font-black text-white">{title}</p><p className="mt-1 truncate text-[10px] text-white/45">{filename}</p></div></div><div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => void onOpenDocument(document, "preview")} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-[10px] font-black text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-50"><Eye size={13} />Buka</button><button type="button" onClick={() => void onOpenDocument(document, "download")} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-[10px] font-black text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"><Download size={13} />Unduh</button></div></article>;
}

function CustomerDocumentLibrary({ documents, onOpenDocument, documentAction }) {
  const grouped = CUSTOMER_DOCUMENT_GROUPS.map((group) => ({ ...group, documents: documents.filter((document) => group.match(String(document.kategori || "").toLowerCase())).sort((left, right) => customerDocumentOrder(left) - customerDocumentOrder(right)) }));
  const groupedIds = new Set(grouped.flatMap((group) => group.documents.map((document) => String(document.id))));
  const otherDocuments = documents.filter((document) => !groupedIds.has(String(document.id)));
  return <div className="mt-4 space-y-4">{grouped.filter((group) => group.documents.length > 0).map((group) => <section key={group.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-3.5 sm:p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="text-[11px] font-black uppercase tracking-[0.16em] text-white/75">{group.title}</h4><p className="mt-1 text-[10px] leading-4 text-white/40">{group.description}</p></div><span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-white/55">{group.documents.length} berkas</span></div><div className="mt-3 grid gap-2">{group.documents.map((document) => <CustomerDocumentCard key={document.id} document={document} onOpenDocument={onOpenDocument} documentAction={documentAction} />)}</div></section>)}{otherDocuments.length > 0 && <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-3.5 sm:p-4"><div className="flex items-start justify-between gap-2"><div><h4 className="text-[11px] font-black uppercase tracking-[0.16em] text-white/75">Dokumen lainnya</h4><p className="mt-1 text-[10px] leading-4 text-white/40">Berkas tambahan yang terkait dengan permohonan ini.</p></div><span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-white/55">{otherDocuments.length} berkas</span></div><div className="mt-3 grid gap-2">{otherDocuments.map((document) => <CustomerDocumentCard key={document.id} document={document} onOpenDocument={onOpenDocument} documentAction={documentAction} />)}</div></section>}</div>;
}

export default function PelangganPortalPage({ session, page, onNavigate }) {
  const [customers, setCustomers] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sop2Requests, setSop2Requests] = useState([]);
  const [sop2History, setSop2History] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [sop2Target, setSop2Target] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [documentAction, setDocumentAction] = useState("");
  const [documentPreview, setDocumentPreview] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [selectedFlowStep, setSelectedFlowStep] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [customerData, contractData, documentData, requestData, sop2Data, notificationData] = await Promise.all([
        listAllPages((currentPage, pageSize) => listCustomers(session.token, currentPage, pageSize)),
        listAllPages((currentPage, pageSize) => listContracts(session.token, currentPage, pageSize)),
        listAllPages((currentPage, pageSize) => listIspDocuments(session.token, currentPage, pageSize)),
        listMyServiceRequests(session.token),
        listServiceChangeRequests(session.token),
        listServiceChangeNotifications(session.token),
      ]);
      setCustomers(rowsFrom(customerData));
      setContracts(rowsFrom(contractData));
      const hiddenBaaIds = new Set(
        (Array.isArray(requestData) ? requestData : [])
          .filter((item) => item.baa_status === "menunggu_verifikasi_dbo" && item.baa_dokumen_id)
          .map((item) => String(item.baa_dokumen_id)),
      );
      setDocuments(rowsFrom(documentData).filter((item) => !hiddenBaaIds.has(String(item.id))));
      // Satu kode registrasi mewakili satu proses layanan. Normalisasi ini
      // menjaga tampilan tetap satu kartu apabila sumber data lama memuat
      // baris riwayat yang sama lebih dari sekali.
      const uniqueRequests = Array.isArray(requestData)
        ? [...new Map(requestData.map((item) => [item.kode_registrasi, item])).values()]
        : [];
      setRequests(uniqueRequests);
      const sop2List = Array.isArray(sop2Data) ? sop2Data : [];
      setSop2Requests(sop2List);
      const historyEntries = await Promise.all(sop2List.map(async (item) => [item.id, await listServiceChangeHistory(session.token, item.id).catch(() => [])]));
      setSop2History(Object.fromEntries(historyEntries));
      setNotifications(Array.isArray(notificationData) ? notificationData : []);
    } catch (err) {
      setError(err.message || "Data portal pelanggan belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => { void load(); }, [load]);

  const activeRequest = useMemo(() => {
    // Tetap tampilkan timeline untuk permohonan yang sudah selesai agar
    // pelanggan dapat membuka detail setiap tahap dari beranda.
    const inProgress = requests.find((item) => !["ditolak", "dibatalkan", "selesai"].includes(String(item.status).toLowerCase()));
    return inProgress || requests[0] || null;
  }, [requests]);
  const requestStep = (request) => {
    if (!request) return 1;
    if (request.pembayaran_status === "terverifikasi") return STEPS.length + 1;
    if (request.status === "ditolak") return request.penawaran_status === "tolak" ? 6 : 1;
    if (request.pembayaran_status === "menunggu_verifikasi" || request.invoice_status === "dikirim") return 18;
    if (request.invoice_status === "draft") return 17;
    if (request.baa_status === "diterima_lokasi") return 16;
    if (request.baa_status === "menunggu_konfirmasi_lokasi") return 15;
    if (request.aktivasi_status === "aktif") return 15;
    if (["terjadwal", "proses"].includes(request.aktivasi_status)) return 14;
    if (request.pks_status === "lengkap") return 14;
    if (request.pks_status === "menunggu_dokumen_final") return 13;
    if (["menunggu_tanda_tangan", "menunggu_tanda_tangan_pelanggan", "menunggu_verifikasi_dokumen_pelanggan"].includes(request.pks_status)) return 13;
    // Penolakan keputusan persetujuan maupun negosiasi pelanggan mengembalikan proses ke
    // tahap penawaran, sehingga Admin KIMA dapat mengirim versi revisi.
    if (request.penawaran_status === "negosiasi") return 5;
    // Prioritaskan status perbaikan agar pelanggan selalu diarahkan kembali
    // ke unggah ulang meskipun ada data tahap lama yang masih tersimpan.
    if (request.legal_status === "perlu_perbaikan") return 8;
    if (request.direksi_status === "setuju") return 12;
    if (request.direksi_status === "menunggu") return 11;
    if (request.legal_status === "terverifikasi") return 10;
    if (request.po_nomor) return 9;
    if (request.penawaran_status === "setuju") return 7;
    if (request.penawaran_status === "dikirim") return 6;
    if (request.survey_status === "selesai") return 5;
    if (request.survey_status === "terjadwal") return 4;
    // Status disetujui berarti Tahap 1 sudah selesai; KIMA kemudian
    // mengonfirmasi kebutuhan sebelum survei jalur dijadwalkan.
    if (request.status === "disetujui") return 2;
    return 1;
  };
  const currentStep = requestStep(activeRequest);
  const currentPhase = customerPhaseForStep(currentStep);
  const activePksDraftDocuments = [
    { id: activeRequest?.bak_dokumen_id, label: "BAK final bertanda tangan" },
    { id: activeRequest?.pks_dokumen_id, label: "PKS final bertanda tangan" },
  ].map(({ id, label }) => {
    const document = documents.find((item) => String(item.id) === String(id));
    return document ? { ...document, label } : null;
  }).filter(Boolean);
  const activeBaaDocument = documents.find((item) => String(item.id) === String(activeRequest?.baa_dokumen_id));
  const operating = contracts.filter((item) => item.status_kontrak === "Beroperasi").length;
  const profile = customers[0] || (activeRequest ? {
    nama_pelanggan: activeRequest.lokasi_nama,
    kode_pelanggan: activeRequest.kode_registrasi,
    pic_nama: session.user?.email,
    pic_telepon: null,
  } : null);
  const tenantCount = customers.length || (requests.length ? 1 : 0);
  const title = {
    "pelanggan-beranda": ["Portal Lokasi/Tenant", "Layanan Anda di KIMA", "Pantau proses, layanan, dan dokumen perusahaan Anda dalam satu tempat."],
    "pelanggan-layanan": ["Layanan Anda", "Lokasi & Kontrak", "Daftar titik layanan yang telah aktif atau sedang diproses KIMA."],
    "pelanggan-dokumen": ["Pusat Dokumen", "Dokumen Layanan", "PKS, invoice, berita acara, dan berkas lain yang tersedia untuk perusahaan Anda."],
    "pelanggan-permohonan": ["Status Permohonan", "Progres Layanan Anda", "Pantau setiap pengajuan layanan dari penerimaan KIMA hingga aktivasi."],
    "pelanggan-profil": ["Profil Perusahaan", "Data Perusahaan", "Informasi perusahaan dan PIC yang terhubung dengan akun ini."],
  }[page] || ["Portal Lokasi/Tenant", "Layanan Anda", ""];

  const openDocument = async (item, mode) => {
    setDocumentAction(`${mode}-${item.id}`);
    try {
      const blob = await fetchDocumentContent(session.token, item.id, mode);
      const url = URL.createObjectURL(blob);
      if (mode === "preview") {
        setDocumentPreview((current) => {
          if (current?.url) URL.revokeObjectURL(current.url);
          return { url, name: item.nama_file || "Dokumen", category: item.kategori || "Dokumen" };
        });
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = item.nama_file || "dokumen";
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (err) {
      setError(err.message || "Dokumen tidak dapat dibuka.");
    } finally { setDocumentAction(""); }
  };
  const closeDocumentPreview = () => {
    setDocumentPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  };

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center"><div className="text-center"><div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" /><p className="mt-3 text-xs font-bold text-white/55">Menyiapkan portal layanan Anda…</p></div></div>;

  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-8">
    <header className="overflow-hidden rounded-3xl border border-sky-300/20 bg-gradient-to-br from-sky-500/20 via-slate-900/70 to-violet-500/15 p-6 shadow-xl backdrop-blur-md md:p-8">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-200">{title[0]}</p><h1 className="mt-2 text-2xl font-black text-white md:text-3xl">{title[1]}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-white/60">{title[2]}</p></div><button type="button" onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-bold text-white/80 transition hover:bg-white/15"><RefreshCw size={15} />Muat ulang</button></div>
    </header>

    {error && <p className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p>}

    {(requests.length > 0 || sop2Requests.length > 0) && <section className="rounded-2xl border border-gold-accent/20 bg-gold-accent/[0.06] p-5 shadow-lg"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-gold-accent">Pembagian tugas SOP</p><h2 className="mt-1 font-black text-white">Siapa yang menangani proses Anda?</h2><p className="mt-1 text-xs leading-5 text-white/50">Penanggung jawab berubah otomatis setiap kali tahap selesai dan diteruskan ke role berikutnya.</p></div><ShieldCheck size={20} className="shrink-0 text-gold-accent" /></div><div className="mt-4 grid gap-3 md:grid-cols-2">{requests.slice(0, 3).map((request) => { const owner = getSop1Owner(request); return <div key={`owner-sop1-${request.kode_registrasi}`} className="rounded-xl border border-white/10 bg-black/15 p-3"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-wider text-sky-200">SOP 1 · {request.kode_registrasi}</p><span className="rounded-full bg-sky-400/10 px-2 py-1 text-[10px] font-bold text-sky-100">{owner.label}</span></div><p className="mt-2 text-sm font-bold text-white">{request.lokasi_nama}</p><p className="mt-1 text-xs text-white/55">Tahap berikutnya: {owner.stage}</p></div>; })}{sop2Requests.slice(0, 3).map((request) => { const owner = getSop2Owner(request.current_step); return <div key={`owner-sop2-${request.id}`} className="rounded-xl border border-white/10 bg-black/15 p-3"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-wider text-gold-accent">SOP 2 · {request.kode_perubahan}</p><span className="rounded-full bg-gold-accent/10 px-2 py-1 text-[10px] font-bold text-gold-accent">{owner.label}</span></div><p className="mt-2 text-sm font-bold text-white">{request.lokasi_nama}</p><p className="mt-1 text-xs text-white/55">Tahap {request.current_step} dari 12: {owner.stage}</p></div>; })}</div></section>}

    {notifications.length > 0 && <section className="rounded-2xl border border-gold-accent/20 bg-gold-accent/[0.06] p-5"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-gold-accent">Notifikasi SOP2</p><h2 className="mt-1 font-black text-white">Pembaruan proses terbaru</h2></div><span className="rounded-full bg-gold-accent/15 px-2.5 py-1 text-xs font-bold text-gold-accent">{notifications.filter((item) => !item.read_at).length} belum dibaca</span></div><div className="mt-4 space-y-2">{notifications.slice(0, 4).map((item) => <button type="button" key={item.id} onClick={async () => { if (!item.read_at) { await markServiceChangeNotification(session.token, item.id).catch(() => {}); setNotifications((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry)); } }} className={`block w-full rounded-xl border p-3 text-left transition ${item.read_at ? "border-white/10 bg-white/[0.025]" : "border-gold-accent/30 bg-gold-accent/10"}`}><p className="text-xs font-bold text-white">{item.title}</p><p className="mt-1 text-xs leading-5 text-white/60">{item.message}</p><p className="mt-1 text-[10px] text-white/35">{item.kode_perubahan} · {formatDate(item.created_at)}</p></button>)}</div></section>}

    {page === "pelanggan-beranda" && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[[Building2, "Lokasi/Tenant", tenantCount, "terhubung ke akun ini"], [MapPin, "Lokasi layanan", contracts.length, `${operating} telah beroperasi`], [FileText, "Dokumen", documents.length, "berkas dapat dibuka"], [Clock3, "Permohonan", requests.length + sop2Requests.length, activeRequest || sop2Requests.length ? "ada proses yang dipantau" : "belum ada pengajuan"]].map(([Icon, label, total, hint]) => <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4"><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</p><p className="mt-2 text-2xl font-black text-white">{total}</p><p className="mt-1 text-[11px] text-white/45">{hint}</p></div><span className="rounded-xl bg-sky-400/10 p-2 text-sky-200">{createElement(Icon, { size: 18 })}</span></div></article>)}
      </div>
      <section className="rounded-3xl border border-white/10 bg-slate-950/35 p-5 shadow-xl backdrop-blur-md md:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-200">Status permohonan</p><h2 className="mt-1 text-xl font-black text-white">{activeRequest?.lokasi_nama || "Belum ada permohonan aktif"}</h2><p className="mt-1 text-sm text-white/50">{activeRequest ? `Kode permohonan: ${value(activeRequest.kode_registrasi)}` : "Ajukan layanan baru jika perusahaan Anda memerlukan titik sambungan fiber optic."}</p></div>{activeRequest ? <StatusBadge status={activeRequest.status} /> : <button type="button" onClick={() => onNavigate("pelanggan-ajukan")} className="inline-flex items-center gap-2 rounded-xl bg-sky-400 px-4 py-2.5 text-xs font-black text-slate-950"><Send size={15} />Ajukan layanan</button>}</div>
        {activeRequest && <div className="mt-7"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Perjalanan layanan Anda</p><p className="mt-1 text-[10px] text-white/35">Ringkasan 7 fase · klik fase untuk melihat detail</p></div><span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 text-[10px] font-bold text-sky-100">{currentPhase > CUSTOMER_STEPS.length ? "Selesai" : `Fase ${currentPhase} dari ${CUSTOMER_STEPS.length}`}</span></div><div className="overflow-x-auto pb-3"><div className="relative w-[976px] px-1 pb-1"><div aria-hidden="true" className="absolute left-[68px] right-[68px] top-4 h-px bg-white/10" /><ol className="relative flex items-start gap-3">{CUSTOMER_STEPS.map((phase, index) => { const number = index + 1; const done = number < currentPhase; const current = number === currentPhase; return <li key={phase.label} className="w-[128px] shrink-0"><button type="button" onClick={() => setSelectedFlowStep(number)} aria-label={`Lihat detail fase ${number}: ${phase.label}`} className="group flex w-full flex-col items-center text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"><span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border text-xs font-black transition-transform group-hover:scale-105 ${done ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200" : current ? "border-sky-300 bg-sky-300 text-slate-950 shadow-[0_0_0_5px_rgba(125,211,252,0.12)]" : "border-white/15 bg-slate-900 text-white/35"}`}>{done ? <CheckCircle2 size={15} /> : number}</span><p className={`mt-3 min-h-[32px] px-1 text-[10px] font-bold leading-4 ${current ? "text-sky-100" : done ? "text-emerald-100" : "text-white/40"}`}>{phase.label}</p><p className={`mt-1 min-h-[30px] px-1 text-[9px] font-medium leading-4 ${current ? "text-sky-200/70" : "text-white/30"}`}>{done ? "Selesai · detail" : current ? "Sedang diproses · detail" : "Berikutnya · detail"}</p></button></li>; })}</ol></div></div><PksSignaturePanel request={activeRequest} draftDocuments={activePksDraftDocuments} onOpenDocument={openDocument} /><BaaAcceptancePanel request={activeRequest} email={session.user?.email || ""} document={activeBaaDocument} onOpenDocument={openDocument} onSuccess={load} /></div>}
        <div className="mt-6 flex justify-end"><button type="button" onClick={() => onNavigate("pelanggan-permohonan")} className="text-xs font-bold text-sky-200 hover:text-white">Lihat rincian permohonan →</button></div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[0.045] p-5"><div className="flex items-center gap-2"><Route size={18} className="text-sky-200" /><h2 className="font-bold text-white">Layanan & lokasi</h2></div>{contracts.length ? <div className="mt-4 space-y-3">{contracts.slice(0, 3).map((item) => <div key={item.id} className="rounded-xl border border-white/10 bg-black/10 p-3"><div className="flex justify-between gap-3"><div><p className="font-bold text-white">{value(item.nama_lokasi)}</p><p className="mt-1 text-xs text-white/45">{value(item.kode_kontrak)} · {value(item.jalur, "Jalur belum ditetapkan")}</p></div><StatusBadge status={item.status_kontrak} /></div></div>)}</div> : <Empty icon={MapPin} title="Belum ada layanan aktif">Kontrak akan tampil di sini setelah proses layanan diselesaikan KIMA.</Empty>}</div><div className="rounded-2xl border border-white/10 bg-white/[0.045] p-5"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-violet-200" /><h2 className="font-bold text-white">Yang perlu Anda lakukan</h2></div><div className="mt-4 space-y-3 text-sm text-white/60"><p className="rounded-xl bg-white/5 p-3">Pantau status permohonan dan jadwal survei dari menu <b className="text-white">Permohonan</b>.</p><p className="rounded-xl bg-white/5 p-3">KIMA akan memilih ISP yang sesuai setelah survei dan penentuan jalur bersama lokasi Anda.</p></div></div></section>
      <CustomerFlowPhaseDetailModal request={activeRequest} currentPhase={currentPhase} phaseNumber={selectedFlowStep} onClose={() => setSelectedFlowStep(null)} />
    </>}

    {page === "pelanggan-layanan" && <section className="space-y-3">{contracts.length ? contracts.map((item) => <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-sky-200">{value(item.kode_kontrak)}</p><h2 className="mt-1 text-lg font-black text-white">{value(item.nama_lokasi)}</h2><p className="mt-2 flex items-center gap-1.5 text-sm text-white/55"><MapPin size={14} />{value(item.alamat_lokasi, "Alamat lokasi belum tersedia")}</p></div><StatusBadge status={item.status_kontrak} /></div><div className="mt-5 grid gap-3 border-t border-white/10 pt-4 text-xs sm:grid-cols-3"><p className="text-white/45">Periode<br /><b className="text-white/85">{formatDate(item.periode_awal)} – {formatDate(item.periode_berakhir)}</b></p><p className="text-white/45">Jalur<br /><b className="text-white/85">{value(item.jalur, "Dalam penentuan")}</b></p><p className="text-white/45">Layanan<br /><b className="text-white/85">{value(item.core || item.sharing_core, "Menunggu aktivasi")}</b></p></div></article>) : <Empty icon={MapPin} title="Belum ada kontrak atau lokasi">Setelah pembayaran terverifikasi, Admin KIMA mencatat kontrak secara manual. Setelah itu lokasi Anda tampil di sini.</Empty>}</section>}

    {page === "pelanggan-permohonan" && <section className="space-y-5">{requests.length ? requests.map((request) => {
      const step = requestStep(request);
      const phase = customerPhaseForStep(step);
      const isComplete = step > STEPS.length;
      const isCancelled = request.status === "dibatalkan";
      const isRejected = request.status === "ditolak";
      const isDireksiRejection = request.penawaran_status === "negosiasi" && request.direksi_status === "tolak";
      const activeLabel = isCancelled ? "Permohonan dibatalkan" : isRejected ? "Penawaran ditolak" : isComplete ? "Pembayaran telah diverifikasi" : isDireksiRejection ? "KIMA menyiapkan penawaran revisi" : CUSTOMER_STEPS[phase - 1]?.label;
      const detail = isCancelled
        ? `Dibatalkan ${formatDate(request.cancelled_at)}`
        : isRejected
        ? `Alasan: ${value(request.rejection_reason, "Pelanggan menolak penawaran.")}`
        : isDireksiRejection
        ? `Keputusan KIMA/DBO menolak pengajuan. KIMA sedang menyiapkan penawaran revisi${request.direksi_catatan ? ` · Catatan: ${request.direksi_catatan}` : "."}`
        : request.baa_status === "menunggu_verifikasi_dbo"
        ? "Teknisi sudah mengunggah BAA; DBO KIMA sedang memeriksa dan mengirimkannya."
        : request.baa_status === "menunggu_konfirmasi_lokasi"
        ? "BAA sudah dikirim KIMA; pelanggan perlu mengonfirmasi penerimaannya."
        : request.survey_status === "terjadwal"
        ? `Survei dijadwalkan ${formatDate(request.survey_jadwal_at)}`
        : isComplete ? "Pembayaran telah diverifikasi. Admin KIMA akan mencatat kontrak secara manual sebelum layanan tampil sebagai kontrak aktif." : "KIMA sedang menyiapkan proses berikutnya.";
      const poDocumentIds = PO_DOCUMENT_FIELDS.map((field) => request[field.idKey]).filter(Boolean).map(String);
      const linkedDocumentIds = [request.penawaran_dokumen_id, request.bak_dokumen_id, request.pks_dokumen_id, request.bak_pelanggan_signed_dokumen_id, request.pks_pelanggan_signed_dokumen_id, request.pks_signed_dokumen_id, request.baa_dokumen_id, request.invoice_dokumen_id, request.faktur_pajak_dokumen_id, request.pembayaran_dokumen_id, ...poDocumentIds].filter(Boolean).map(String);
      const documentLabels = new Map([
        [request.penawaran_dokumen_id, "Surat Penawaran"],
        [request.po_dokumen_id, "Surat PO / permintaan sambungan"],
        [request.po_akte_dokumen_id, "Akte pendirian perusahaan"],
        [request.po_izin_dokumen_id, "Izin pelanggan"],
        [request.bak_dokumen_id, "BAK final bertanda tangan"],
        [request.pks_dokumen_id, "PKS final bertanda tangan"],
        [request.baa_dokumen_id, "BAA"],
        [request.invoice_dokumen_id, "Invoice"],
        [request.faktur_pajak_dokumen_id, "Faktur Pajak"],
        [request.pembayaran_dokumen_id, "Bukti Pembayaran"],
      ].filter(([id]) => id).map(([id, label]) => [String(id), label]));
      const relatedDocuments = documents
        .filter((item) => item.nama_lokasi === request.lokasi_nama || linkedDocumentIds.includes(String(item.id)))
        .map((item) => ({ ...item, label: documentLabels.get(String(item.id)) || item.label || item.kategori }));
      const offerDocument = documents.find((item) => String(item.id) === String(request.penawaran_dokumen_id));
      const pksDraftDocuments = [
        { id: request.bak_dokumen_id, label: "BAK final bertanda tangan" },
        { id: request.pks_dokumen_id, label: "PKS final bertanda tangan" },
      ].map(({ id, label }) => {
        const document = documents.find((item) => String(item.id) === String(id));
        return document ? { ...document, label } : null;
      }).filter(Boolean);
      return <article key={request.kode_registrasi} className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/40 shadow-xl backdrop-blur-md">
        <div className="border-b border-white/10 bg-gradient-to-r from-sky-400/10 via-transparent to-violet-400/10 p-5 md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-200">{request.kode_registrasi}</p><h2 className="mt-2 text-xl font-black text-white">{request.lokasi_nama}</h2><p className="mt-2 text-sm text-white/55">{detail}</p></div>
            <div className="flex shrink-0 flex-col items-end gap-2"><StatusBadge status={isComplete ? "Selesai" : request.status} />{request.status === "menunggu" && <button type="button" onClick={() => setCancelTarget(request)} className="rounded-lg border border-rose-300/35 bg-rose-500/10 px-3 py-1.5 text-[10px] font-black text-rose-100 transition hover:bg-rose-500/20">Batalkan permohonan</button>}</div>
          </div>
          <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-black/15 p-4 sm:grid-cols-[auto_1fr] sm:items-center"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isComplete ? "bg-emerald-400/15 text-emerald-200" : "bg-sky-400/15 text-sky-100"}`}>{isComplete ? <CheckCircle2 size={22} /> : <Clock3 size={21} />}</div><div><p className="text-[10px] font-black uppercase tracking-widest text-white/40">Tahap saat ini</p><p className="mt-1 text-sm font-bold text-white">{activeLabel}</p></div></div>
        </div>
        <OfferResponsePanel request={request} email={session.user?.email || ""} offerDocument={offerDocument} onOpenDocument={openDocument} onSuccess={load} />
        <PoSubmissionPanel request={request} email={session.user?.email || ""} token={session.token} onSuccess={load} />
        <PksSignaturePanel request={request} draftDocuments={pksDraftDocuments} onOpenDocument={openDocument} />
        <BaaAcceptancePanel request={request} email={session.user?.email || ""} document={documents.find((item) => String(item.id) === String(request.baa_dokumen_id))} onOpenDocument={openDocument} onSuccess={load} />
        <PaymentSubmissionPanel request={request} email={session.user?.email || ""} token={session.token} documents={documents} onOpenDocument={openDocument} documentAction={documentAction} onSuccess={load} />
        <div className="p-5 md:p-6"><div className="mb-5 flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Perjalanan layanan Anda</p><p className="mt-1 text-[10px] text-white/35">Ringkasan 7 fase agar status lebih mudah dipahami</p></div><span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 text-[10px] font-bold text-sky-100">{isComplete ? "Selesai" : `Fase ${phase} dari ${CUSTOMER_STEPS.length}`}</span></div><div className="overflow-x-auto"><ol className="relative ml-3 border-l border-white/10 pl-7 lg:ml-0 lg:flex lg:min-w-[980px] lg:gap-2 lg:border-l-0 lg:pl-0 lg:pt-0">{CUSTOMER_STEPS.map((item, index) => { const number = index + 1; const done = number < phase || isComplete; const current = number === phase && !isComplete; return <li key={item.label} className="relative pb-6 last:pb-0 lg:w-[128px] lg:shrink-0 lg:pb-0 lg:before:absolute lg:before:left-4 lg:before:right-[-12px] lg:before:top-4 lg:before:h-px lg:before:bg-white/10 lg:last:before:hidden"><span className={`absolute -left-[43px] top-0 flex h-8 w-8 items-center justify-center rounded-full border text-xs font-black lg:static lg:relative lg:z-10 ${done ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-100" : current ? "border-sky-200 bg-sky-300 text-slate-950 shadow-[0_0_0_5px_rgba(125,211,252,0.12)]" : "border-white/15 bg-slate-950 text-white/35"}`}>{done ? <CheckCircle2 size={15} /> : number}</span><div className="pt-1 lg:pt-3"><p className={`text-sm font-bold leading-5 ${done || current ? "text-white" : "text-white/35"}`}>{item.label}</p><p className={`mt-1 text-xs leading-5 ${current ? "text-sky-100/75" : "text-white/40"}`}>{done ? "Selesai" : current ? "Sedang diproses" : "Menunggu tahap sebelumnya"}</p></div></li>; })}</ol></div></div>
        <div className="border-t border-white/10 p-5 md:p-6"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Dokumen & pembayaran</p><p className="mt-1 text-sm text-white/55">Semua berkas dan tagihan untuk pengajuan ini akan tampil di sini.</p></div><div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/65"><span className="text-white/40">Invoice: </span><b className="text-white">{value(request.invoice_nomor, "Belum diterbitkan")}</b><span className="mx-2 text-white/20">•</span><span className="text-white/40">Pembayaran: </span><b className="text-white">{value(request.pembayaran_status, "Belum ada")}</b></div></div>{relatedDocuments.length > 0 && <CustomerDocumentLibrary documents={relatedDocuments} onOpenDocument={openDocument} documentAction={documentAction} />}</div>
        {request.rejection_reason && <p className="mx-5 mb-5 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-xs text-rose-100 md:mx-6">{request.penawaran_status === "tolak" ? "Alasan penolakan penawaran" : "Catatan KIMA"}: {request.rejection_reason}</p>}
        {request.status === "dibatalkan" && <p className="mx-5 mb-5 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-xs text-rose-100 md:mx-6">Alasan pembatalan: {value(request.cancellation_reason, "Permohonan dibatalkan oleh pemohon.")}{request.cancelled_at ? ` · ${formatDate(request.cancelled_at)}` : ""}</p>}
      </article>;
    }) : !sop2Requests.length ? <Empty icon={Clock3} title="Belum ada permohonan">Ajukan layanan baru untuk memulai proses penyediaan fiber optic.</Empty> : null}
      {sop2Requests.map((request) => <article key={`sop2-${request.id}`} className="overflow-hidden rounded-3xl border border-gold-accent/20 bg-slate-950/40 shadow-xl backdrop-blur-md"><div className="border-b border-white/10 bg-gradient-to-r from-gold-accent/10 via-transparent to-sky-400/10 p-5 md:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-accent">{request.kode_perubahan} · SOP 2</p><h2 className="mt-2 text-xl font-black text-white">{request.lokasi_nama}</h2><p className="mt-2 text-sm capitalize text-white/55">{request.jenis_permintaan.replaceAll("_", " ")} · kontrak induk #{request.kontrak_induk_id}</p></div><StatusBadge status={request.status} /></div></div><div className="p-5 md:p-6"><p className="mb-5 text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Alur perubahan layanan</p><div className="overflow-x-auto"><ol className="relative ml-3 border-l border-white/10 pl-7 lg:ml-0 lg:flex lg:min-w-[1560px] lg:gap-2 lg:border-l-0 lg:pl-0">{SOP2_STEPS.map((label, index) => { const number = index + 1; const done = number < request.current_step; const current = number === request.current_step; return <li key={label} className="relative pb-6 last:pb-0 lg:w-[118px] lg:shrink-0 lg:pb-0 lg:before:absolute lg:before:left-4 lg:before:right-[-12px] lg:before:top-4 lg:before:h-px lg:before:bg-white/10 lg:last:before:hidden"><span className={`absolute -left-[43px] top-0 flex h-8 w-8 items-center justify-center rounded-full border text-xs font-black lg:static lg:relative lg:z-10 ${done ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-100" : current ? "border-gold-accent bg-gold-accent text-slate-950" : "border-white/15 bg-slate-950 text-white/35"}`}>{done ? <CheckCircle2 size={15} /> : number}</span><div className="pt-1 lg:pt-3"><p className={`text-sm font-bold leading-5 ${done || current ? "text-white" : "text-white/35"}`}>{label}</p><p className={`mt-1 text-xs leading-5 ${current ? "text-gold-accent/80" : "text-white/40"}`}>{done ? "Selesai" : current ? "Sedang diproses KIMA" : "Menunggu tahap sebelumnya"}</p></div></li>; })}</ol></div></div></article>)}
      {sop2Requests.map((request) => (sop2History[request.id]?.length ? <div key={`sop2-history-${request.id}`} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="text-[10px] font-black uppercase tracking-widest text-white/40">Riwayat aktivitas terbaru</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{sop2History[request.id].slice(-4).reverse().map((entry) => <div key={entry.id} className="rounded-xl border border-white/10 bg-black/10 px-3 py-2"><p className="text-xs font-bold text-white">Tahap {entry.step_nomor} · {entry.action_type.replaceAll("_", " ")}</p><p className="mt-1 text-[10px] text-white/45">{entry.actor_role} · {formatDate(entry.created_at)}</p></div>)}</div></div> : null))}
      {sop2Requests.filter((request) => [5, 12].includes(request.current_step)).map((request) => <div key={`sop2-action-${request.id}`} className="flex justify-end"><button type="button" onClick={() => setSop2Target(request)} className="rounded-xl bg-gold-accent px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-yellow-300">Proses tindakan pelanggan · Tahap {request.current_step}</button></div>)}
    </section>}

    {page === "pelanggan-dokumen" && <section className="rounded-2xl border border-white/10 bg-slate-950/35 p-5 shadow-xl md:p-6"><div className="border-b border-white/10 pb-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-200">Arsip layanan</p><h2 className="mt-1 font-bold text-white">Berkas perusahaan Anda</h2><p className="mt-1 text-xs leading-5 text-white/45">Dokumen dikelompokkan berdasarkan tahap proses agar mudah ditemukan.</p></div>{documents.length ? <CustomerDocumentLibrary documents={documents} onOpenDocument={openDocument} documentAction={documentAction} /> : <div className="mt-4"><Empty title="Belum ada dokumen tersedia">Dokumen seperti PKS, invoice, atau berita acara akan muncul setelah dibuat oleh KIMA.</Empty></div>}</section>}

    {page === "pelanggan-profil" && <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]"><div className="rounded-2xl border border-white/10 bg-white/[0.05] p-6"><div className="flex items-center gap-3"><span className="rounded-2xl bg-violet-400/10 p-3 text-violet-200"><Building2 size={22} /></span><div><p className="text-[10px] font-black uppercase tracking-widest text-violet-200">Lokasi/Tenant</p><h2 className="text-xl font-black text-white">{value(profile?.nama_pelanggan, "Data lokasi belum tersedia")}</h2></div></div><dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-white/40">Kode permohonan/lokasi</dt><dd className="mt-1 font-bold text-white">{value(profile?.kode_pelanggan)}</dd></div><div><dt className="text-white/40">Email akun</dt><dd className="mt-1 font-bold text-white">{value(session.user?.email)}</dd></div><div><dt className="text-white/40">PIC lokasi</dt><dd className="mt-1 font-bold text-white">{value(profile?.pic_nama)}</dd></div><div><dt className="text-white/40">Telepon PIC</dt><dd className="mt-1 font-bold text-white">{value(profile?.pic_telepon)}</dd></div></dl></div><div className="rounded-2xl border border-sky-300/20 bg-sky-400/10 p-6"><UserRound size={23} className="text-sky-100" /><h2 className="mt-4 font-black text-white">Butuh perubahan data?</h2><p className="mt-2 text-sm leading-6 text-white/60">Hubungi KIMA untuk memperbarui data lokasi, PIC, atau kebutuhan layanan Anda.</p></div></section>}
    {documentPreview && <div className="fixed inset-0 z-[80] flex items-end justify-center p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Pratinjau ${documentPreview.category}`}><div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeDocumentPreview} /><section className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-sky-300/20 bg-slate-950 shadow-2xl sm:max-h-[calc(100vh-2rem)]"><header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-slate-900/95 p-4 sm:p-5"><div className="flex min-w-0 items-center gap-3"><span className="shrink-0 rounded-lg bg-sky-400/15 p-2 text-sky-200"><FileText size={19} /></span><div className="min-w-0"><h2 className="truncate text-sm font-black text-white sm:text-base">{documentPreview.category}</h2><p className="truncate text-xs text-white/45">{documentPreview.name}</p></div></div><button type="button" onClick={closeDocumentPreview} aria-label="Tutup pratinjau dokumen" className="shrink-0 rounded-lg p-1 text-white/50 transition hover:bg-white/10 hover:text-white"><X size={20} /></button></header><div className="min-h-0 flex-1 overflow-auto bg-slate-900/60 p-2 sm:p-4"><iframe src={documentPreview.url} title={`Pratinjau ${documentPreview.category}`} className="h-[min(72vh,720px)] min-h-[360px] w-full rounded-lg bg-white" /></div><footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-white/10 bg-slate-900/95 px-4 py-3 sm:flex-row sm:justify-end sm:px-5"><button type="button" onClick={closeDocumentPreview} className="w-full rounded-lg px-4 py-2.5 text-xs font-bold text-white/60 transition hover:bg-white/10 hover:text-white sm:w-auto">Tutup</button><a href={documentPreview.url} download={documentPreview.name} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-300 px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-emerald-200 sm:w-auto"><Download size={14} />Unduh dokumen</a></footer></section></div>}
    <Sop2ActionModal item={sop2Target} session={session} onClose={() => setSop2Target(null)} onSuccess={() => { setSop2Target(null); void load(); }} />
    <CancelRegistrationModal registration={cancelTarget} email={session.user?.email || ""} onClose={() => setCancelTarget(null)} onSuccess={() => { setCancelTarget(null); void load(); }} />
  </div>;
}
