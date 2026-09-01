import { useEffect, useState } from "react";
import { Download, Eye, FileSignature, FileText, FileUp, Loader2, X } from "lucide-react";
import { deleteDocument, fetchDocumentContent, preparePortalRegistrationPks, uploadDocument } from "../../lib/rust-api";

export default function PksRegistrationModal({ isOpen, registration, session, onClose, onSuccess }) {
  const [nomor, setNomor] = useState("");
  const [catatan, setCatatan] = useState("");
  const [selectedBakFile, setSelectedBakFile] = useState(null);
  const [selectedPksFile, setSelectedPksFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [documentAction, setDocumentAction] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setNomor(registration?.pks_nomor || "");
    setCatatan(registration?.pks_catatan || "");
    setSelectedBakFile(null);
    setSelectedPksFile(null);
    setUploadProgress(0);
    setDocumentAction("");
    setError("");
  }, [isOpen, registration?.id, registration?.pks_nomor, registration?.pks_catatan]);

  if (!isOpen || !registration) return null;

  const complete = registration.pks_status === "lengkap";
  const documentId = registration.pks_dokumen_id;
  const bakDocumentId = registration.bak_dokumen_id;
  const hasDocument = Boolean(documentId || bakDocumentId);
  const showPrepareForm = !complete || !hasDocument;

  const close = () => {
    if (!saving && !documentAction) {
      setError("");
      onClose();
    }
  };

  const openDocument = async (mode, targetId, suffix = "BAK-PKS") => {
    if (!targetId || documentAction) return;
    const popup = mode === "preview" ? window.open("", "_blank") : null;
    setDocumentAction(`${mode}-${targetId}`);
    setError("");
    try {
      const blob = await fetchDocumentContent(session.token, targetId, mode);
      const url = URL.createObjectURL(blob);
      if (popup) {
        popup.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${suffix}-${registration.kode_registrasi}.pdf`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch (err) {
      popup?.close();
      setError(err.message || "Dokumen BAK/PKS gagal dibuka.");
    } finally {
      setDocumentAction("");
    }
  };

  const prepare = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setUploadProgress(0);
    const uploadedDocumentIds = [];
    try {
      if (!nomor.trim()) throw new Error("Nomor BAK/PKS wajib diisi.");
      if (!selectedBakFile && !selectedPksFile && !bakDocumentId && !documentId) {
        throw new Error("Unggah minimal satu dokumen: BAK atau PKS.");
      }
      const upload = async (file, label) => {
        if (!file) return null;
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) throw new Error(`${label} harus berupa file PDF.`);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("kategori", "BAK-PKS");
        formData.append("portal_registration_id", String(registration.id));
        const uploaded = await uploadDocument(session.token, formData, setUploadProgress);
        if (!uploaded?.id) throw new Error(`${label} berhasil diunggah tetapi ID dokumen tidak diterima.`);
        uploadedDocumentIds.push(uploaded.id);
        return uploaded.id;
      };

      const uploadedBakDocumentId = await upload(selectedBakFile, "Dokumen BAK");
      const uploadedPksDocumentId = await upload(selectedPksFile, "Dokumen PKS");
      await preparePortalRegistrationPks(session.token, registration.id, {
        pks_nomor: nomor.trim(),
        pks_catatan: catatan.trim() || null,
        bak_dokumen_id: uploadedBakDocumentId || bakDocumentId || null,
        pks_dokumen_id: uploadedPksDocumentId || documentId || null,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      await Promise.all(uploadedDocumentIds.map((id) => deleteDocument(session.token, id).catch(() => {})));
      setError(err.message || "Gagal menyiapkan BAK/PKS.");
    } finally {
      setSaving(false);
    }
  };

  const docs = [[bakDocumentId, "BAK · dokumen final KIMA", "bak"], [documentId, "PKS · dokumen final KIMA", "pks"]].filter(([id]) => id);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />
      <section className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex shrink-0 items-center justify-between gap-3 sm:mb-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-lg bg-emerald-500/15 p-2"><FileSignature className="text-emerald-300" size={21} /></div>
            <div className="min-w-0"><h2 className="truncate font-semibold text-white">BAK/PKS & Dokumen Final</h2><p className="truncate text-xs text-slate-400">{registration.kode_registrasi} · {registration.lokasi_nama}</p></div>
          </div>
          <button type="button" onClick={close} className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Tutup"><X size={21} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
          {complete && hasDocument && <div className="rounded-xl border border-emerald-300/25 bg-emerald-400/[0.08] p-4 text-sm text-emerald-100"><p className="font-bold">BAK/PKS sudah lengkap.</p><p className="mt-1 text-xs leading-5 text-white/60">Dokumen yang tersimpan adalah berkas final dengan tanda tangan lengkap. Pelanggan dapat melihat atau mengunduhnya dari portal. Tahap berikutnya adalah aktivasi oleh Teknisi.</p></div>}
          {showPrepareForm && <form id="pks-prepare-form" onSubmit={prepare} className="space-y-4">
            <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/[0.07] p-3 text-xs leading-5 text-emerald-100">Unggah berkas BAK dan/atau PKS final yang sudah lengkap tanda tangannya sebelum diunggah ke sistem. Minimal satu dokumen wajib tersedia; bila keduanya ada, BAK ditandatangani Direktur Bidang dan PKS ditandatangani Direktur Utama. Setelah disimpan, pelanggan hanya melihat dan mengunduh dokumen tanpa mengunggah ulang.</div>
            <label className="block text-sm text-slate-200">Nomor BAK/PKS *<input required value={nomor} onChange={(event) => setNomor(event.target.value)} placeholder="PKS-2026-001" className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white outline-none focus:border-emerald-300" /></label>
            <div className="space-y-3">
              <p className="text-sm text-slate-200">Dokumen final (PDF) <span className="text-xs font-normal text-white/45">· minimal salah satu wajib, keduanya boleh</span></p>
              <label className="block text-xs text-slate-300">Dokumen BAK <span className="text-white/40">(opsional)</span><span className="mt-1.5 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-600 bg-slate-950 p-3 text-sm transition hover:border-emerald-300/60"><FileUp size={18} className="shrink-0 text-emerald-300" /><span className="min-w-0 flex-1 truncate">{selectedBakFile?.name || (bakDocumentId ? "Dokumen BAK tertaut" : "Pilih file BAK final")}</span><span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-emerald-200">Pilih</span><input type="file" accept=".pdf,application/pdf" onChange={(event) => { setSelectedBakFile(event.target.files?.[0] || null); setError(""); setUploadProgress(0); }} className="sr-only" /></span></label>
              <label className="block text-xs text-slate-300">Dokumen PKS <span className="text-white/40">(opsional)</span><span className="mt-1.5 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-600 bg-slate-950 p-3 text-sm transition hover:border-emerald-300/60"><FileUp size={18} className="shrink-0 text-emerald-300" /><span className="min-w-0 flex-1 truncate">{selectedPksFile?.name || (documentId ? "Dokumen PKS tertaut" : "Pilih file PKS final")}</span><span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-emerald-200">Pilih</span><input type="file" accept=".pdf,application/pdf" onChange={(event) => { setSelectedPksFile(event.target.files?.[0] || null); setError(""); setUploadProgress(0); }} className="sr-only" /></span></label>
              {saving && uploadProgress > 0 && <span className="flex items-center gap-1.5 text-[11px] text-slate-400"><Loader2 size={12} className="animate-spin" />Mengunggah dokumen… {uploadProgress}%</span>}
            </div>
            <label className="block text-sm text-slate-200">Catatan dokumen<textarea value={catatan} onChange={(event) => setCatatan(event.target.value)} rows={3} placeholder="Catatan atau keterangan BAK/PKS (opsional)" className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white outline-none focus:border-emerald-300" /></label>
          </form>}

          {(docs.length > 0 || complete) && <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="flex items-start gap-2"><FileText size={17} className="mt-0.5 shrink-0 text-emerald-200" /><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Dokumen final yang terlihat pelanggan</p><p className="mt-1 truncate text-sm font-bold text-white">{registration.pks_nomor || "BAK/PKS"}</p></div></div>{docs.length > 0 ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{docs.map(([id, label, suffix]) => <div key={`${suffix}-${id}`} className="rounded-lg border border-white/10 bg-slate-950/40 p-2.5"><p className="truncate text-xs font-bold text-white/80">{label}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => void openDocument("preview", id, suffix)} disabled={Boolean(documentAction)} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300/30 bg-sky-400/10 px-2.5 py-1.5 text-[10px] font-bold text-sky-100 disabled:opacity-50"><Eye size={13} />Buka</button><button type="button" onClick={() => void openDocument("download", id, suffix)} disabled={Boolean(documentAction)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1.5 text-[10px] font-bold text-emerald-100 disabled:opacity-50"><Download size={13} />Unduh</button></div></div>)}</div> : <p className="mt-2 text-xs text-amber-200">Belum ada dokumen tertaut. Unggah minimal satu dokumen final.</p>}</div>}
          {error && <p className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
        </div>

        <div className="mt-4 flex shrink-0 flex-col-reverse gap-2 border-t border-white/10 pt-4 sm:flex-row sm:justify-end sm:gap-3">
          <button type="button" onClick={close} className="w-full rounded-lg px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/10 sm:w-auto">Batal</button>
          {showPrepareForm && <button type="submit" form="pks-prepare-form" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60 sm:w-auto">{saving && <Loader2 size={16} className="animate-spin" />}{saving ? "Mengunggah & menyimpan…" : complete ? "Perbarui dokumen final" : "Unggah dokumen final"}</button>}
        </div>
      </section>
    </div>
  );
}
