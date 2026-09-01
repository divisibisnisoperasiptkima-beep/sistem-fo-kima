import { useState } from "react";
import { BadgeCheck, CheckCircle2, Download, Eye, FileText, Loader2, X } from "lucide-react";
import { fetchDocumentContent, verifyPortalRegistrationPayment } from "../../lib/rust-api";

export default function PaymentVerificationModal({ isOpen, registration, session, onClose, onSuccess }) {
  const [keputusan, setKeputusan] = useState("terverifikasi");
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);
  const [documentAction, setDocumentAction] = useState("");
  const [error, setError] = useState("");

  if (!isOpen || !registration) return null;

  const documentId = registration.pembayaran_dokumen_id;
  const openDocument = async (mode) => {
    if (!documentId || documentAction) return;
    setDocumentAction(mode);
    setError("");
    const popup = mode === "open" ? window.open("", "_blank") : null;
    try {
      const blob = await fetchDocumentContent(session.token, documentId, mode);
      const url = URL.createObjectURL(blob);
      if (mode === "open") {
        if (!popup) throw new Error("Tab baru diblokir browser. Gunakan tombol Unduh untuk membuka file.");
        popup.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `bukti-pembayaran-${registration.kode_registrasi}.pdf`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (err) {
      popup?.close();
      setError(err.message || "Dokumen bukti pembayaran gagal dibuka.");
    } finally {
      setDocumentAction("");
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await verifyPortalRegistrationPayment(session.token, registration.id, {
        keputusan,
        catatan: catatan.trim() || null,
      });
      setCatatan("");
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || "Gagal memverifikasi pembayaran.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <form onSubmit={submit} className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-amber-300/20 bg-slate-900 shadow-2xl sm:max-h-[calc(100vh-2rem)]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-amber-400/15 to-emerald-400/10 p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-xl bg-amber-400/15 p-3 text-amber-200"><BadgeCheck size={22} /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-200">Tahap pembayaran</p>
              <h2 className="mt-1 truncate text-lg font-black text-white">Verifikasi pembayaran</h2>
              <p className="mt-1 truncate text-xs text-white/50">{registration.kode_registrasi} · {registration.lokasi_nama}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-white/45 transition hover:bg-white/10 hover:text-white" aria-label="Tutup"><X size={22} /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <div className="rounded-xl border border-amber-300/20 bg-amber-400/[0.08] p-4 text-sm leading-6 text-amber-100">Periksa bukti pembayaran pelanggan sebelum menetapkan keputusan. Dokumen dan catatan verifikasi tersimpan pada riwayat permohonan.</div>

          <section className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-sky-400/15 p-2 text-sky-200"><FileText size={19} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-200">Dokumen bukti pembayaran</p>
                <p className="mt-1 truncate text-sm font-bold text-white">{documentId ? `Bukti pembayaran pelanggan · ${registration.kode_registrasi}` : "Belum ada dokumen tertaut"}</p>
                {registration.pembayaran_catatan && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-white/60">Catatan pelanggan: {registration.pembayaran_catatan}</p>}
              </div>
            </div>
            {documentId ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void openDocument("open")} disabled={Boolean(documentAction)} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300/30 bg-sky-400/10 px-3 py-2 text-xs font-black text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-50"><Eye size={14} />{documentAction === "open" ? "Membuka…" : "Buka di tab baru"}</button>
                <button type="button" onClick={() => void openDocument("download")} disabled={Boolean(documentAction)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-wait disabled:opacity-50"><Download size={14} />{documentAction === "download" ? "Mengunduh…" : "Unduh"}</button>
              </div>
            ) : <p className="mt-3 rounded-lg border border-rose-300/25 bg-rose-400/10 px-3 py-2 text-xs leading-5 text-rose-100">Bukti pembayaran belum tertaut. Minta pelanggan mengirim ulang bukti sebelum memverifikasi.</p>}
          </section>

          <label className="block text-sm text-slate-200">Keputusan <span className="text-rose-300">*</span><select value={keputusan} onChange={(event) => setKeputusan(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950 p-3 text-sm text-white outline-none focus:border-amber-300"><option value="terverifikasi">Pembayaran terverifikasi</option><option value="ditolak">Tolak / perlu klarifikasi</option></select></label>
          <label className="block text-sm text-slate-200">Catatan {keputusan === "ditolak" ? <span className="text-rose-300">*</span> : <span className="font-normal text-white/40">(opsional)</span>}<textarea required={keputusan === "ditolak"} value={catatan} onChange={(event) => setCatatan(event.target.value)} rows={3} placeholder="Catatan pemeriksaan atau alasan penolakan" className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950 p-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300" /></label>
          {error && <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
          <div className="sticky bottom-0 flex shrink-0 flex-col-reverse gap-2 border-t border-white/10 bg-slate-900/95 pt-4 backdrop-blur sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="w-full rounded-xl px-4 py-2.5 text-xs font-bold text-white/55 transition hover:bg-white/10 hover:text-white sm:w-auto">Batal</button><button type="submit" disabled={saving || !documentId} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Simpan verifikasi</button></div>
        </div>
      </form>
    </div>
  );
}
