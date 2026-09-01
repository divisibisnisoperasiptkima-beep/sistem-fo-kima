import { useEffect, useState } from "react";
import { FileText, FileUp, Loader2, X } from "lucide-react";
import {
  createPortalRegistrationOffer,
  deleteDocument,
  getPortalRegistration,
  uploadDocument,
} from "../../lib/rust-api";

const parseRupiah = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? Number(digits) : 0;
};

const formatRupiahInput = (value) => {
  const amount = parseRupiah(value);
  return amount > 0 ? new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount) : "";
};

export default function OfferRegistrationModal({ isOpen, registration, session, onClose, onSuccess }) {
  const [nomor, setNomor] = useState("");
  const [nilai, setNilai] = useState("");
  const [catatan, setCatatan] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fullRegistration, setFullRegistration] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !registration?.id) {
      setFullRegistration(null);
      setDetailLoading(false);
      return undefined;
    }

    let cancelled = false;
    setFullRegistration(null);
    setDetailLoading(true);
    getPortalRegistration(session.token, registration.id)
      .then((data) => {
        if (!cancelled) setFullRegistration(data);
      })
      .catch(() => {
        // Data ringkas dari tabel tetap dapat dipakai sebagai fallback.
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, registration?.id, session.token]);

  if (!isOpen || !registration) return null;
  const item = fullRegistration || registration;
  const isNegotiation = item.penawaran_status === "negosiasi";
  const isDireksiRejection = isNegotiation && item.direksi_status === "tolak";

  const close = () => {
    if (!loading) {
      setError("");
      setSelectedFile(null);
      setUploadProgress(0);
      onClose();
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setUploadProgress(0);

    let uploadedDocumentId = null;
    try {
      const nilaiPenawaran = parseRupiah(nilai);
      if (!nomor.trim() || nilaiPenawaran <= 0) {
        throw new Error("Nomor dan nilai penawaran yang valid wajib diisi.");
      }
      if (!selectedFile) {
        throw new Error("Surat penawaran wajib diunggah.");
      }
      const isPdf = selectedFile.type === "application/pdf" || selectedFile.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        throw new Error("Surat penawaran harus berupa file PDF.");
      }

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("kategori", "Surat Penawaran");
      formData.append("portal_registration_id", String(registration.id));
      const uploaded = await uploadDocument(session.token, formData, setUploadProgress);
      uploadedDocumentId = uploaded?.id;
      if (!uploadedDocumentId) {
        throw new Error("Surat berhasil diunggah tetapi ID dokumen tidak diterima.");
      }

      await createPortalRegistrationOffer(session.token, registration.id, {
        penawaran_nomor: nomor.trim(),
        penawaran_nilai: nilaiPenawaran,
        penawaran_catatan: catatan.trim() || null,
        penawaran_dokumen_id: uploadedDocumentId,
      });

      setNomor("");
      setNilai("");
      setCatatan("");
      setSelectedFile(null);
      setUploadProgress(0);
      onSuccess?.();
      onClose();
    } catch (err) {
      // Jika penawaran gagal setelah file tersimpan, hapus file yatim agar
      // daftar dokumen pelanggan tidak berisi surat yang tidak terkirim.
      if (uploadedDocumentId) {
        await deleteDocument(session.token, uploadedDocumentId).catch(() => {});
      }
      setError(err.message || "Gagal mengunggah surat dan mengirim penawaran.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />
      <form onSubmit={submit} className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:p-6">
        <div className="mb-4 flex shrink-0 items-center justify-between gap-3 sm:mb-5">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="shrink-0 rounded-lg bg-gold-accent/15 p-1.5 sm:p-2"><FileText className="text-gold-accent" size={20} /></div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-white sm:text-base">{isNegotiation ? "Tindak Lanjuti Negosiasi" : "Kirim Penawaran"}</h2>
              <p className="truncate text-[11px] text-slate-400 sm:text-xs">{item.kode_registrasi} · {item.lokasi_nama}</p>
            </div>
          </div>
          <button type="button" onClick={close} className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Tutup"><X size={20} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
          <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-3 text-xs leading-5 text-sky-100">
            {isNegotiation ? (isDireksiRejection ? "Keputusan KIMA/DBO menolak pengajuan. Perbarui nilai atau ketentuan sesuai catatan keputusan, lalu unggah surat penawaran revisi." : "Pelanggan mengajukan negosiasi. Perbarui nilai atau ketentuan, lalu unggah surat penawaran revisi.") : "Surat penawaran resmi wajib dilampirkan. File akan tersimpan pada dokumen pelanggan dan dapat diakses dari portal pelanggan."}
          </div>
          {isNegotiation && <div className="rounded-xl border border-gold-accent/30 bg-gold-accent/10 p-3 text-xs leading-5 text-white/75"><p className="font-black uppercase tracking-widest text-gold-accent">{isDireksiRejection ? "Catatan keputusan KIMA/DBO" : "Catatan dari pelanggan"}</p><p className="mt-1">{detailLoading ? "Memuat catatan…" : (isDireksiRejection ? (item.direksi_catatan || "KIMA/DBO tidak menambahkan catatan.") : (item.respons_pemohon_catatan || "Pelanggan tidak menambahkan catatan."))}</p></div>}
          <label className="block text-sm text-slate-200">
            Nomor penawaran *
            <input required value={nomor} onChange={(event) => setNomor(event.target.value)} placeholder="PNW-2026-001" className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white focus:outline-none" />
          </label>
          <label className="block text-sm text-slate-200">
            Nilai penawaran (Rp) *
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-bold text-slate-400">Rp</span>
              <input required inputMode="numeric" value={nilai} onChange={(event) => setNilai(formatRupiahInput(event.target.value))} placeholder="10.000.000" className="w-full rounded-lg border border-slate-600 bg-slate-950 p-3 pl-10 text-white focus:outline-none" />
            </div>
          </label>
          <label className="block text-sm text-slate-200">
            Surat penawaran (PDF) *
            <span className="mt-1.5 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-600 bg-slate-950 p-3 text-sm text-slate-300 hover:border-sky-400/60">
              <FileUp size={18} className="shrink-0 text-sky-300" />
              <span className="min-w-0 flex-1 truncate">{selectedFile?.name || "Pilih file surat penawaran"}</span>
              <input required type="file" accept=".pdf,application/pdf" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} className="sr-only" />
            </span>
            {loading && uploadProgress > 0 && <span className="mt-1 block text-[11px] text-slate-400">Mengunggah surat… {uploadProgress}%</span>}
          </label>
          <label className="block text-sm text-slate-200">
            Catatan penawaran
            <textarea value={catatan} onChange={(event) => setCatatan(event.target.value)} rows={3} placeholder="Ruang lingkup, masa berlaku, atau ketentuan penting." className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-white focus:outline-none" />
          </label>
          {error && <p className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
        </div>
        <div className="mt-4 flex shrink-0 flex-col-reverse gap-2 border-t border-white/10 pt-4 sm:flex-row sm:justify-end sm:gap-3">
          <button type="button" onClick={close} className="w-full rounded-lg px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/10 sm:w-auto">Batal</button>
          <button disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gold-accent px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60 sm:w-auto">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "Mengunggah & mengirim…" : "Upload & Kirim Penawaran"}
          </button>
        </div>
      </form>
    </div>
  );
}
