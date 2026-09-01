import { useState } from "react";
import { CheckCircle2, Download, Eye, FileCheck2, Loader2, X } from "lucide-react";
import { fetchDocumentContent, verifyPortalRegistrationBaa } from "../../lib/rust-api";

export default function BaaVerificationModal({ isOpen, registration, session, onClose, onSuccess }) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [documentAction, setDocumentAction] = useState("");
  const [error, setError] = useState("");

  if (!isOpen || !registration) return null;

  const openDocument = async (mode) => {
    if (!registration.baa_dokumen_id || documentAction) return;
    const popup = mode === "preview" ? window.open("", "_blank") : null;
    setDocumentAction(mode);
    setError("");
    try {
      const blob = await fetchDocumentContent(session.token, registration.baa_dokumen_id, mode);
      const url = URL.createObjectURL(blob);
      if (popup) {
        popup.location.href = url;
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = `baa-${registration.kode_registrasi}.pdf`;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      popup?.close();
      setError(err.message || "Dokumen BAA gagal dibuka.");
    } finally {
      setDocumentAction("");
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await verifyPortalRegistrationBaa(session.token, registration.id, { catatan: notes.trim() || null });
      setNotes("");
      onSuccess?.();
    } catch (err) {
      setError(err.message || "Verifikasi BAA gagal.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={submit} className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-sky-300/20 bg-slate-900 shadow-2xl sm:max-h-[calc(100vh-2rem)]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-sky-400/15 to-emerald-400/10 p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-xl bg-sky-400/15 p-3 text-sky-200"><FileCheck2 size={22} /></span>
            <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-widest text-sky-200">Handoff DBO</p><h2 className="mt-1 truncate text-lg font-black text-white">Verifikasi & kirim BAA</h2><p className="mt-1 truncate text-xs text-white/50">{registration.kode_registrasi} · {registration.lokasi_nama}</p></div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-white/45 transition hover:bg-white/10 hover:text-white" aria-label="Tutup"><X size={22} /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <div className="rounded-xl border border-sky-300/20 bg-sky-400/[0.08] p-4 text-sm leading-6 text-sky-100">Periksa dokumen BAA yang dibuat Teknisi. Setelah disetujui, BAA akan diteruskan ke pelanggan dan tahap invoice baru terbuka setelah pelanggan mengonfirmasi penerimaan.</div>
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/45">Dokumen BAA</p>
            <p className="mt-1 truncate text-sm font-bold text-white">Berita Acara Aktivasi · {registration.kode_registrasi}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void openDocument("preview")} disabled={!registration.baa_dokumen_id || Boolean(documentAction)} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300/30 bg-sky-400/10 px-3 py-2 text-xs font-black text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-50"><Eye size={14} />{documentAction === "preview" ? "Membuka…" : "Buka"}</button>
              <button type="button" onClick={() => void openDocument("download")} disabled={!registration.baa_dokumen_id || Boolean(documentAction)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"><Download size={14} />Unduh</button>
            </div>
          </div>
          <label className="block text-xs font-bold text-white/80">Catatan verifikasi <span className="font-normal text-white/40">(opsional)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Catatan pemeriksaan DBO untuk arsip internal" className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/70 p-3 text-sm font-normal text-white outline-none focus:border-sky-300" /></label>
          {error && <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
          <div className="sticky bottom-0 flex shrink-0 flex-col-reverse gap-2 border-t border-white/10 bg-slate-900/95 pt-4 backdrop-blur sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="w-full rounded-xl px-4 py-2.5 text-xs font-bold text-white/55 transition hover:bg-white/10 hover:text-white sm:w-auto">Batal</button><button type="submit" disabled={saving || !registration.baa_dokumen_id} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-300 px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Verifikasi & kirim ke pelanggan</button></div>
        </div>
      </form>
    </div>
  );
}
