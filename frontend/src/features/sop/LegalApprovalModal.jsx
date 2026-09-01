import { useEffect, useState } from "react";
import { Building2, Download, Eye, FileText, FileUp, Loader2, Scale, X } from "lucide-react";
import { decidePortalRegistrationApproval, deleteDocument, fetchDocumentContent, getPortalRegistration, reviewPortalRegistrationLegal, uploadDocument } from "../../lib/rust-api";

const CUSTOMER_DOCUMENT_FIELDS = [
  { idKey: "po_dokumen_id", label: "Surat PO / permintaan sambungan", slug: "surat-po" },
  { idKey: "po_akte_dokumen_id", label: "Akte pendirian perusahaan", slug: "akte-pendirian" },
  { idKey: "po_izin_dokumen_id", label: "Izin pelanggan", slug: "izin-pelanggan" },
];

export default function LegalApprovalModal({ isOpen, registration, stage, session, onClose, onSuccess }) {
  const isApprovalStage = stage === "direksi" || stage === "decision";
  const [decision, setDecision] = useState(isApprovalStage ? "setuju" : "terverifikasi");
  const [notes, setNotes] = useState("");
  const [notaDinas, setNotaDinas] = useState("");
  const [notaDinasFile, setNotaDinasFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [documentAction, setDocumentAction] = useState("");
  useEffect(() => { if (isOpen) { setDecision(stage === "direksi" || stage === "decision" ? "setuju" : "terverifikasi"); setNotes(""); setNotaDinas(""); setNotaDinasFile(null); setUploadProgress(0); setError(""); } }, [isOpen, stage, registration?.id]);
  useEffect(() => {
    // Antrean Direksi sudah memuat ringkasan dan ID dokumen yang dibutuhkan;
    // endpoint detail dipakai oleh antrean internal (Admin KIMA/DBO atau
    // teknisi); antrean Direksi lama sudah membawa ringkasan yang diperlukan.
    if (!isOpen || !registration?.id || stage === "direksi") {
      setDetail(null);
      setDetailError("");
      setDetailLoading(false);
      return undefined;
    }
    let cancelled = false;
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    getPortalRegistration(session.token, registration.id)
      .then((data) => { if (!cancelled) setDetail(data); })
      .catch((err) => { if (!cancelled) setDetailError(err.message || "Detail dokumen belum dapat dimuat."); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, registration?.id, session.token, stage]);
  if (!isOpen || !registration) return null;
  const isDireksi = stage === "direksi";
  const isDecision = stage === "decision";
  const isApproval = isDireksi || isDecision;
  const approvalTitle = isDecision ? "Keputusan Persetujuan KIMA/DBO" : "Keputusan Direksi (opsional)";
  const notesRequired = (isApproval && decision === "tolak") || (!isApproval && decision === "perlu_perbaikan");
  const item = detail || registration;
  const customerDocuments = CUSTOMER_DOCUMENT_FIELDS.map((field) => ({ ...field, id: item[field.idKey] })).filter((field) => field.id);
  const close = () => { if (!saving) { setError(""); onClose(); } };
  const openDocument = async (doc, mode) => {
    if (!doc?.id || documentAction) return;
    const popup = mode === "preview" ? window.open("", "_blank") : null;
    setDocumentAction(`${mode}-${doc.id}`);
    setError("");
    try {
      const blob = await fetchDocumentContent(session.token, doc.id, mode);
      const url = URL.createObjectURL(blob);
      if (popup) {
        popup.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${doc.slug}-${item.kode_registrasi}.pdf`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch (err) {
      popup?.close();
      setError(err.message || "Dokumen pelanggan gagal dibuka.");
    } finally {
      setDocumentAction("");
    }
  };
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    let uploadedNotaDinasId = null;
    try {
      if (isApproval) await decidePortalRegistrationApproval(session.token, registration.id, { keputusan: decision, catatan: notes.trim() || null });
      else {
        let notaDinasDocumentId = null;
        if (decision === "terverifikasi") {
          if (!notaDinasFile) throw new Error("Nota dinas PDF wajib diunggah untuk pengajuan persetujuan KIMA.");
          const isPdf = notaDinasFile.type === "application/pdf" || notaDinasFile.name.toLowerCase().endsWith(".pdf");
          if (!isPdf) throw new Error("Nota dinas harus berupa file PDF.");
          const formData = new FormData();
          formData.append("file", notaDinasFile);
          formData.append("kategori", "Nota Dinas");
          formData.append("portal_registration_id", String(registration.id));
          const uploaded = await uploadDocument(session.token, formData, setUploadProgress);
          uploadedNotaDinasId = uploaded?.id;
          if (!uploadedNotaDinasId) throw new Error("Nota dinas berhasil diunggah tetapi ID dokumen tidak diterima.");
          notaDinasDocumentId = uploadedNotaDinasId;
        }
        await reviewPortalRegistrationLegal(session.token, registration.id, { keputusan: decision, legal_catatan: notes.trim() || null, nota_dinas: decision === "terverifikasi" ? (notaDinas.trim() || null) : null, nota_dinas_dokumen_id: notaDinasDocumentId });
      }
      setNotaDinasFile(null); setUploadProgress(0);
      onSuccess?.(); close();
    } catch (err) {
      if (uploadedNotaDinasId) await deleteDocument(session.token, uploadedNotaDinasId).catch(() => {});
      setError(err.message || "Gagal menyimpan keputusan.");
    } finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />
    <form onSubmit={submit} className="relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
      <div className="mb-5 flex items-center justify-between"><div className="flex items-center gap-3"><div className="rounded-lg bg-violet-500/15 p-2">{isApproval ? <Building2 className="text-violet-300" /> : <Scale className="text-violet-300" />}</div><div><h2 className="font-semibold text-white">{isApproval ? approvalTitle : "Verifikasi Legal & Nota Dinas"}</h2><p className="text-xs text-slate-400">{registration.kode_registrasi} · {registration.lokasi_nama}</p></div></div><button type="button" onClick={close} className="text-slate-400 hover:text-white"><X /></button></div>
      <div className="space-y-4">
        <section className="rounded-xl border border-sky-300/20 bg-sky-400/[0.07] p-3">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-sky-200">Dokumen pelanggan</p><p className="mt-1 text-xs leading-5 text-white/55">Periksa dokumen PO dan legalitas sebelum memberikan keputusan.</p></div><span className="shrink-0 rounded-full border border-sky-300/25 bg-sky-400/10 px-2 py-1 text-[10px] font-black text-sky-100">{detailLoading ? "Memuat…" : `${customerDocuments.length}/3`}</span></div>
          {customerDocuments.length > 0 ? <div className="mt-3 grid gap-2">{customerDocuments.map((document) => <div key={document.idKey} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/45 p-2.5"><div className="flex min-w-0 items-center gap-2"><FileText size={16} className="shrink-0 text-sky-200" /><span className="truncate text-xs font-bold text-white/85">{document.label}</span></div><div className="flex shrink-0 gap-1.5"><button type="button" onClick={() => void openDocument(document, "preview")} disabled={Boolean(documentAction)} className="inline-flex items-center gap-1 rounded-md border border-sky-300/30 bg-sky-400/10 px-2 py-1.5 text-[10px] font-black text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-50"><Eye size={12} />Buka</button><button type="button" onClick={() => void openDocument(document, "download")} disabled={Boolean(documentAction)} className="inline-flex items-center gap-1 rounded-md border border-emerald-300/30 bg-emerald-400/10 px-2 py-1.5 text-[10px] font-black text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-wait disabled:opacity-50"><Download size={12} />Unduh</button></div></div>)}</div> : <p className="mt-3 rounded-lg border border-amber-300/25 bg-amber-400/[0.08] px-3 py-2 text-xs text-amber-100">{detailError || "Belum ada dokumen pelanggan yang tertaut pada permohonan ini."}</p>}
        </section>
        {(isApproval || item.nota_dinas_dokumen_id) && <section className="rounded-xl border border-violet-300/20 bg-violet-400/[0.07] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-violet-200">Nota dinas KIMA</p><p className="mt-1 text-xs leading-5 text-white/55">Surat internal sebagai dasar keputusan persetujuan KIMA/DBO.</p></div><FileText size={18} className="shrink-0 text-violet-200" /></div>{item.nota_dinas_dokumen_id ? <div className="mt-3 flex min-w-0 items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/45 p-2.5"><div className="flex min-w-0 items-center gap-2"><FileText size={16} className="shrink-0 text-violet-200" /><span className="truncate text-xs font-bold text-white/85">Nota dinas {item.kode_registrasi}.pdf</span></div><div className="flex shrink-0 gap-1.5"><button type="button" onClick={() => void openDocument({ id: item.nota_dinas_dokumen_id, slug: "nota-dinas" }, "preview")} disabled={Boolean(documentAction)} className="inline-flex items-center gap-1 rounded-md border border-sky-300/30 bg-sky-400/10 px-2 py-1.5 text-[10px] font-black text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-50"><Eye size={12} />Buka</button><button type="button" onClick={() => void openDocument({ id: item.nota_dinas_dokumen_id, slug: "nota-dinas" }, "download")} disabled={Boolean(documentAction)} className="inline-flex items-center gap-1 rounded-md border border-emerald-300/30 bg-emerald-400/10 px-2 py-1.5 text-[10px] font-black text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-wait disabled:opacity-50"><Download size={12} />Unduh</button></div></div> : <p className="mt-3 rounded-lg border border-amber-300/25 bg-amber-400/[0.08] px-3 py-2 text-xs text-amber-100">Nota dinas belum tersedia pada permohonan ini.</p>}{item.nota_dinas && <p className="mt-3 whitespace-pre-wrap rounded-lg border border-white/10 bg-slate-950/30 p-2.5 text-xs leading-5 text-white/70">{item.nota_dinas}</p>}</section>}
        <label className="block text-sm text-slate-200">Keputusan *<select value={decision} onChange={(e) => setDecision(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white focus:outline-none">{isApproval ? <><option value="setuju">Setujui persetujuan</option><option value="tolak">Tolak — kembali ke negosiasi</option></> : <><option value="terverifikasi">Terverifikasi — ajukan ke persetujuan</option><option value="perlu_perbaikan">Perlu perbaikan</option></>}</select></label>
        {(!isApproval && decision === "terverifikasi") && <section className="rounded-xl border border-violet-300/20 bg-violet-400/[0.07] p-3"><div><p className="text-sm font-bold text-violet-100">Nota dinas untuk persetujuan KIMA *</p><p className="mt-1 text-xs leading-5 text-white/55">Unggah surat nota dinas resmi dalam format PDF. Dokumen ini menjadi dasar keputusan persetujuan KIMA/DBO.</p></div><label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-violet-300/35 bg-slate-950/60 p-3 text-sm text-slate-300 hover:border-violet-200/70"><FileUp size={18} className="shrink-0 text-violet-200" /><span className="min-w-0 flex-1 truncate">{notaDinasFile?.name || "Pilih file nota dinas (PDF)"}</span><input required type="file" accept=".pdf,application/pdf" onChange={(e) => setNotaDinasFile(e.target.files?.[0] || null)} className="sr-only" /></label>{saving && uploadProgress > 0 && <p className="mt-1 text-[11px] text-slate-400">Mengunggah nota dinas… {uploadProgress}%</p>}<label className="mt-3 block text-sm text-slate-200">Ringkasan nota dinas <span className="text-white/40">(opsional)</span><textarea value={notaDinas} onChange={(e) => setNotaDinas(e.target.value)} rows={3} placeholder="Ringkasan pengajuan dan dasar persetujuan." className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white focus:outline-none" /></label></section>}
        <label className="block text-sm text-slate-200">Catatan{isApproval && decision === "tolak" ? " penolakan *" : !isApproval && decision === "perlu_perbaikan" ? " perbaikan *" : ""}<textarea required={notesRequired} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder={isApproval && decision === "tolak" ? "Jelaskan alasan persetujuan ditolak agar KIMA dapat menyiapkan negosiasi." : !isApproval && decision === "perlu_perbaikan" ? "Jelaskan dokumen atau bagian yang harus diperbaiki pelanggan." : ""} className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white focus:outline-none" /></label>
        {error && <p className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
        <div className="flex justify-end gap-3"><button type="button" onClick={close} className="px-4 py-2 text-sm text-slate-300">Batal</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-violet-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-60">{saving && <Loader2 size={16} className="animate-spin" />} Simpan Keputusan</button></div>
      </div>
    </form>
  </div>;
}
