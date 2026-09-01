import { useState } from "react";
import { FileCheck2, Loader2, ReceiptText, X } from "lucide-react";
import { createPortalRegistrationBaa, createPortalRegistrationInvoice, deleteDocument, uploadDocument } from "../../lib/rust-api";

function UploadField({ label, file, onChange }) {
  return <label className="mt-4 block text-sm text-slate-200">{label} *<span className="mt-1.5 flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed border-slate-600 bg-slate-950 p-3 text-xs text-slate-300"><span className="min-w-0 flex-1 truncate">{file?.name || "Pilih PDF"}</span><span className="font-black text-sky-200">Pilih</span><input required type="file" accept=".pdf,application/pdf" onChange={(event) => onChange(event.target.files?.[0] || null)} className="sr-only" /></span></label>;
}

export default function CompletionModal({ isOpen, registration, stage, session, onClose, onSuccess }) {
  const [nomor, setNomor] = useState(""); const [nilai, setNilai] = useState(""); const [jatuhTempo] = useState(""); const [catatan, setCatatan] = useState(""); const [baaFile, setBaaFile] = useState(null); const [invoiceFile, setInvoiceFile] = useState(null); const [taxFile, setTaxFile] = useState(null); const [progress, setProgress] = useState(0); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  if (!isOpen || !registration) return null;
  const invoice = stage === "invoice";
  const submit = async (e) => { e.preventDefault(); setSaving(true); setError(""); setProgress(0); const formData = new FormData(e.currentTarget); const jatuhTempoForm = String(formData.get("invoice_jatuh_tempo") || jatuhTempo); const uploadedIds = []; try {
    const upload = async (file, kategori) => { if (!file) throw new Error(`${kategori === "BAA" ? "Dokumen BAA" : kategori} wajib diunggah.`); const data = new FormData(); data.append("file", file); data.append("kategori", kategori); data.append("portal_registration_id", String(registration.id)); const result = await uploadDocument(session.token, data, setProgress); if (!result?.id) throw new Error("Dokumen berhasil diunggah tetapi belum memiliki ID."); uploadedIds.push(result.id); return result.id; };
    if (invoice) { const invoiceId = await upload(invoiceFile, "Invoice"); const fakturId = await upload(taxFile, "Faktur Pajak"); await createPortalRegistrationInvoice(session.token, registration.id, { invoice_nomor: nomor.trim(), invoice_nilai: Number(nilai), invoice_jatuh_tempo: jatuhTempoForm, kirim_sekarang: true, invoice_dokumen_id: invoiceId, faktur_pajak_dokumen_id: fakturId }); }
    else { const baaId = await upload(baaFile, "BAA"); await createPortalRegistrationBaa(session.token, registration.id, { baa_nomor: nomor.trim(), baa_catatan: catatan.trim() || null, baa_dokumen_id: baaId }); }
    onSuccess?.(); onClose();
  } catch (err) { await Promise.all(uploadedIds.map((id) => deleteDocument(session.token, id).catch(() => {}))); setError(err.message || "Gagal menyimpan."); } finally { setSaving(false); } };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl sm:max-h-[calc(100vh-2rem)]"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 p-4 sm:p-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className={invoice ? "shrink-0 rounded-lg bg-gold-accent/15 p-2 text-gold-accent" : "shrink-0 rounded-lg bg-emerald-400/15 p-2 text-emerald-300"}>
              {invoice ? <ReceiptText size={20} /> : <FileCheck2 size={20} />}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-white sm:text-lg">
                {invoice ? "Buat & Kirim Invoice" : "Buat BAA"}
              </h2>
              <p className="truncate text-xs text-slate-400">
                {registration.kode_registrasi} · {registration.lokasi_nama}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-1 sm:px-6">
          <label className="block pt-4 text-sm text-slate-200">
            Nomor {invoice ? "invoice" : "BAA"} *
            <input
              required
              value={nomor}
              onChange={(e) => setNomor(e.target.value)}
              className="mt-1.5 w-full min-w-0 rounded-lg border border-slate-600 bg-slate-950 p-3 text-white outline-none transition focus:border-sky-400"
            />
          </label>

          {invoice ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="mt-4 block text-sm text-slate-200">
                  Nilai invoice (Rp) *
                  <input
                    required
                    min="1"
                    type="number"
                    value={nilai}
                    onChange={(e) => setNilai(e.target.value)}
                    className="mt-1.5 w-full min-w-0 rounded-lg border border-slate-600 bg-slate-950 p-3 text-white outline-none transition focus:border-sky-400"
                  />
                </label>
                <label className="mt-4 block text-sm text-slate-200">
                  Jatuh tempo *
                  <input
                    required
                    name="invoice_jatuh_tempo"
                    type="date"
                    defaultValue={jatuhTempo}
                    className="mt-1.5 w-full min-w-0 rounded-lg border border-slate-600 bg-slate-950 p-3 text-white outline-none transition focus:border-sky-400"
                  />
                </label>
              </div>
              <UploadField label="File invoice" file={invoiceFile} onChange={setInvoiceFile} />
              <UploadField label="File faktur pajak" file={taxFile} onChange={setTaxFile} />
            </>
          ) : (
            <UploadField label="Dokumen BAA" file={baaFile} onChange={setBaaFile} />
          )}

          <label className="mt-4 block text-sm text-slate-200">
            Catatan
            <textarea
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              rows={3}
              className="mt-1.5 min-h-24 w-full min-w-0 resize-y rounded-lg border border-slate-600 bg-slate-950 p-3 text-white outline-none transition focus:border-sky-400"
            />
          </label>
          {saving && progress > 0 && (
            <p className="mt-2 text-xs text-sky-200">Mengunggah dokumen… {progress}%</p>
          )}
          {error && <p className="mt-3 text-sm text-rose-200">{error}</p>}
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-white/10 bg-slate-900/95 px-4 py-4 backdrop-blur sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-400 transition hover:bg-white/10 hover:text-white sm:w-auto"
          >
            Batal
          </button>
          <button
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {invoice ? "Upload & Kirim Invoice" : "Upload & Buat BAA"}
          </button>
        </footer>
      </form>
    </div>
  );
}
