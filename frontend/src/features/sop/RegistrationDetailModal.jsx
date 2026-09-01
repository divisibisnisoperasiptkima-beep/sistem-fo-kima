import { useEffect, useState } from "react";
import { Building2, ClipboardList, Download, Eye, Loader2, MapPinned, X } from "lucide-react";
import { fetchDocumentContent, getPortalRegistration } from "../../lib/rust-api";
import { getSop1Owner } from "./workflowResponsibility";

const EMPTY_VALUE = "—";

function display(value) {
  return value == null || String(value).trim() === "" ? EMPTY_VALUE : String(value);
}

function formatDate(value) {
  if (!value) return EMPTY_VALUE;
  const date = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(date.getTime())
    ? display(value)
    : date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(value) {
  if (!value) return "Belum diproses";
  return String(value).replaceAll("_", " ");
}

function statusClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (["selesai", "setuju", "disetujui", "lengkap", "aktif", "diterima_lokasi", "terverifikasi"].includes(normalized)) {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  }
  if (["ditolak", "tolak", "rejected", "perlu_perbaikan"].includes(normalized)) {
    return "border-rose-400/30 bg-rose-500/10 text-rose-200";
  }
  if (["dibatalkan", "cancelled", "canceled"].includes(normalized)) {
    return "border-rose-400/30 bg-rose-500/10 text-rose-200";
  }
  if (["menunggu", "terjadwal", "dikirim", "menunggu_verifikasi", "menunggu_verifikasi_dbo", "menunggu_tanda_tangan", "menunggu_tanda_tangan_pelanggan", "menunggu_verifikasi_dokumen_pelanggan", "menunggu_dokumen_final"].includes(normalized)) {
    return "border-amber-400/30 bg-amber-500/10 text-amber-200";
  }
  return "border-white/10 bg-white/[0.04] text-white/60";
}

const PO_DOCUMENT_FIELDS = [
  { idKey: "po_dokumen_id", label: "Surat PO / permintaan sambungan", slug: "surat-po" },
  { idKey: "po_akte_dokumen_id", label: "Akte pendirian perusahaan", slug: "akte-pendirian" },
  { idKey: "po_izin_dokumen_id", label: "Izin pelanggan", slug: "izin-pelanggan" },
];

function Field({ label, value, wide = false }) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-white/85">{display(value)}</p>
    </div>
  );
}

function StatusField({ label, value, detail }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
        <p className="text-xs font-bold text-white/75">{label}</p>
        <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${statusClass(value)}`}>
          {statusLabel(value)}
        </span>
      </div>
      {detail && <p className="mt-2 text-[11px] leading-relaxed text-white/50">{detail}</p>}
    </div>
  );
}

export default function RegistrationDetailModal({ isOpen, registration, session, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [documentAction, setDocumentAction] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !registration) return undefined;
    let cancelled = false;
    const loadDetail = async () => {
      setLoading(true);
      setError("");
      setDetail(null);
      try {
        const data = await getPortalRegistration(session.token, registration.id);
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) setError(err.message || "Gagal memuat detail permohonan.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadDetail();
    return () => { cancelled = true; };
  }, [isOpen, registration, session.token]);

  if (!isOpen || !registration) return null;
  const item = detail || registration;
  const status = item.status;
  const owner = getSop1Owner(item);
  const openPoDocument = async (documentId, mode = "preview", slug = "dokumen-po") => {
    if (!documentId || documentAction) return;
    const popup = mode === "preview" ? window.open("", "_blank") : null;
    setDocumentAction(mode);
    setError("");
    try {
      const blob = await fetchDocumentContent(session.token, documentId, mode);
      const url = URL.createObjectURL(blob);
      if (popup) {
        popup.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${slug}-${item.kode_registrasi}.pdf`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch (err) {
      popup?.close();
      setError(err.message || "Dokumen gagal dibuka.");
    } finally {
      setDocumentAction("");
    }
  };
  const poDocuments = PO_DOCUMENT_FIELDS.map((field) => ({ ...field, id: item[field.idKey] })).filter((field) => field.id);
  const formalDocuments = [
    { id: item.survey_dokumen_id, label: "Dokumentasi survei", slug: "survey" },
    { id: item.penawaran_dokumen_id, label: "Surat penawaran", slug: "penawaran" },
    { id: item.nota_dinas_dokumen_id, label: "Nota dinas", slug: "nota-dinas" },
    { id: item.bak_dokumen_id, label: "BAK · ditandatangani internal", slug: "bak-internal" },
    { id: item.pks_dokumen_id, label: "PKS · ditandatangani internal", slug: "pks-internal" },
    { id: item.bak_pelanggan_signed_dokumen_id, label: "BAK bertanda tangan pelanggan", slug: "bak-pelanggan-signed" },
    { id: item.pks_pelanggan_signed_dokumen_id, label: "PKS bertanda tangan pelanggan", slug: "pks-pelanggan-signed" },
    { id: item.pks_signed_dokumen_id, label: "BAK/PKS final", slug: "bak-pks-final" },
    { id: item.baa_dokumen_id, label: "Berita Acara Aktivasi", slug: "baa" },
    { id: item.invoice_dokumen_id, label: "Invoice", slug: "invoice" },
    { id: item.faktur_pajak_dokumen_id, label: "Faktur pajak", slug: "faktur-pajak" },
    { id: item.pembayaran_dokumen_id, label: "Bukti pembayaran", slug: "bukti-pembayaran" },
  ].filter((document) => document.id);
  const digitalRecords = [
    { label: "Permohonan / surat minat digital", detail: `Tercatat saat pelanggan mengirim permohonan pada ${formatDate(item.created_at)}.` },
    { label: "Nota internal digital", detail: item.po_nomor ? "Terbentuk dari data PO dan kelengkapan legal yang diterima KIMA." : "Terbentuk setelah pelanggan mengirim PO dan kelengkapan legal." },
    { label: "Checklist legal digital", detail: item.legal_status ? `Status verifikasi: ${statusLabel(item.legal_status)}.` : "Menunggu dokumen PO dan legalitas pelanggan." },
    { label: "Keputusan persetujuan KIMA/DBO digital", detail: item.direksi_status ? `Status keputusan: ${statusLabel(item.direksi_status)}.` : "Menunggu verifikasi legal dan pengajuan ke Admin KIMA/DBO." },
    { label: "Tanda terima tagihan digital", detail: item.invoice_status === "dikirim" ? "Tagihan telah dikirim kepada pelanggan dan tercatat pada sistem." : "Akan tercatat saat Keuangan mengirim invoice." },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-2 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <section className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-white/15 bg-gradient-to-br from-slate-950 to-slate-900 shadow-2xl sm:max-h-[92vh] sm:rounded-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-sky-500/15 p-2.5 text-sky-300"><ClipboardList size={20} /></div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white sm:text-base md:text-lg">Detail Permohonan Layanan</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-black tracking-wider text-gold-accent">{display(item.kode_registrasi)}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${statusClass(status)}`}>{statusLabel(status)}</span>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/45 transition hover:bg-white/10 hover:text-white" aria-label="Tutup detail">
            <X size={20} />
          </button>
        </header>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-gold-accent" size={24} /></div>
        ) : error ? (
          <div className="m-6 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>
        ) : (
          <div className="space-y-4 overflow-y-auto overscroll-contain p-4 sm:space-y-5 sm:p-5 md:p-6">
            <section className="rounded-xl border border-gold-accent/25 bg-gold-accent/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gold-accent">Penanggung jawab tahap aktif</p>
                  <p className="mt-1 text-base font-black text-white">{owner.label}</p>
                  <p className="mt-1 text-xs text-white/65">{owner.stage}</p>
                </div>
                <span className="w-fit max-w-full rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-bold text-white/70">Update berdasarkan status terbaru</span>
              </div>
              <p className="mt-3 text-xs leading-5 text-white/55">Gunakan informasi ini untuk meneruskan permohonan ke role yang tepat. Setelah tahap disimpan, penanggung jawab akan berubah otomatis.</p>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-4 flex items-center gap-2"><Building2 size={16} className="text-gold-accent" /><h2 className="text-xs font-black uppercase tracking-wider text-white/80">Identitas pemohon</h2></div>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Nama pengaju layanan" value={item.nama_perusahaan} />
                <Field label="Nama PIC" value={item.pic_nama} />
                <Field label="Jabatan PIC" value={item.pic_jabatan} />
                <Field label="Email PIC" value={item.pic_email} />
                <Field label="Telepon PIC" value={item.pic_telepon} />
                <Field label="Diajukan pada" value={formatDate(item.created_at)} />
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h2 className="text-xs font-black uppercase tracking-wider text-white/80">Rekam digital SOP 1</h2>
              <p className="mt-1 text-xs leading-5 text-white/50">Bagian ini menggantikan surat atau formulir internal yang tidak perlu diunggah manual. Bukti formal tetap tercantum pada dokumen SOP.</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {digitalRecords.map((record) => <div key={record.label} className="rounded-lg border border-white/10 bg-slate-950/40 p-3"><p className="text-[11px] font-bold text-white/80">{record.label}</p><p className="mt-1 text-[10px] leading-4 text-white/50">{record.detail}</p></div>)}
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-4 flex items-center gap-2"><MapPinned size={16} className="text-sky-300" /><h2 className="text-xs font-black uppercase tracking-wider text-white/80">Lokasi dan kebutuhan layanan</h2></div>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Nama lokasi" value={item.lokasi_nama} />
                <Field label="Kota" value={item.lokasi_kota} />
                <Field label="Provinsi" value={item.lokasi_provinsi} />
                <Field label="Kode pos" value={item.lokasi_kode_pos} />
                <Field label="Core dedicated" value={item.core_dedicated > 0 ? `${item.core_dedicated} Core` : null} />
                <Field label="Sharing core" value={item.sharing_core} />
                <Field label="Alamat lokasi" value={item.lokasi_alamat} wide />
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h2 className="mb-4 text-xs font-black uppercase tracking-wider text-white/80">Progres SOP dan keputusan</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <StatusField label="1. Penerimaan Admin" value={status} detail={item.rejection_reason ? `Alasan penolakan: ${item.rejection_reason}` : item.cancellation_reason ? `Alasan pembatalan: ${item.cancellation_reason}${item.cancelled_at ? ` · ${formatDate(item.cancelled_at)}` : ""}` : null} />
                <StatusField label="2. Konfirmasi & survei" value={item.survey_status} detail={item.survey_jadwal_at ? `Jadwal: ${formatDate(item.survey_jadwal_at)}${item.survey_dokumen_id ? " · Dokumentasi terunggah" : ""}` : item.survey_hasil} />
                <StatusField label="3. Penawaran" value={item.penawaran_status} detail={item.penawaran_nomor ? `${item.penawaran_nomor}${item.penawaran_nilai ? ` · Nilai ${item.penawaran_nilai}` : ""}${item.penawaran_dokumen_id ? " · Surat penawaran terunggah" : ""}` : item.penawaran_dokumen_id ? "Surat penawaran terunggah" : item.penawaran_catatan} />
                <StatusField label="4. PO dan legal" value={item.legal_status} detail={item.po_nomor ? `PO: ${item.po_nomor} · Dokumen pendukung ${poDocuments.length}/3 terunggah` : poDocuments.length ? `Dokumen pendukung ${poDocuments.length}/3 terunggah` : item.po_catatan} />
                <StatusField label="5. Persetujuan KIMA/DBO" value={item.direksi_status} detail={item.direksi_catatan} />
                <StatusField label="6. BAK/PKS" value={item.pks_status} detail={item.pks_nomor ? `${item.pks_nomor}${item.pks_status === "lengkap" && (item.bak_dokumen_id || item.pks_dokumen_id) ? ` · Dokumen final bertanda tangan tersedia (${[item.bak_dokumen_id && "BAK", item.pks_dokumen_id && "PKS"].filter(Boolean).join(" & ")})` : item.bak_dokumen_id || item.pks_dokumen_id ? ` · Dokumen BAK/PKS tersedia (${[item.bak_dokumen_id && "BAK", item.pks_dokumen_id && "PKS"].filter(Boolean).join(" & ")})` : " · Dokumen belum diunggah"}` : item.bak_dokumen_id || item.pks_dokumen_id ? "Dokumen BAK/PKS tersedia" : null} />
                <StatusField label="7. Aktivasi" value={item.aktivasi_status} detail={item.aktivasi_jadwal_at ? `Jadwal: ${formatDate(item.aktivasi_jadwal_at)}` : item.aktivasi_catatan} />
                <StatusField label="8. BAA" value={item.baa_status} detail={item.baa_nomor ? `${item.baa_nomor}${item.baa_dokumen_id ? " · Dokumen terunggah" : ""}${item.baa_dbo_verified_at ? ` · Diverifikasi DBO ${formatDate(item.baa_dbo_verified_at)}` : ""}${item.baa_dikirim_at ? ` · Dikirim ke pelanggan ${formatDate(item.baa_dikirim_at)}` : ""}` : item.baa_dbo_verified_at ? `Diverifikasi DBO ${formatDate(item.baa_dbo_verified_at)}` : null} />
                <StatusField label="9. Invoice" value={item.invoice_status} detail={item.invoice_nomor ? `${item.invoice_nomor}${item.invoice_nilai ? ` · Nilai ${item.invoice_nilai}` : ""}${item.invoice_dokumen_id && item.faktur_pajak_dokumen_id ? " · Invoice dan faktur terunggah" : ""}` : null} />
                <StatusField label="10. Pembayaran" value={item.pembayaran_status} detail={`${item.pembayaran_catatan || ""}${item.pembayaran_dokumen_id ? " · Bukti terunggah" : ""}`} />
              </div>
              {item.penawaran_status === "negosiasi" && <div className="mt-4 rounded-xl border border-gold-accent/30 bg-gold-accent/10 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-gold-accent">Catatan negosiasi pelanggan</p><p className="mt-1 text-xs leading-5 text-white/75">{display(item.respons_pemohon_catatan)}</p></div>}
              {item.legal_status === "perlu_perbaikan" && item.legal_catatan && <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-400/[0.08] p-3"><p className="text-[10px] font-black uppercase tracking-widest text-amber-200">Catatan perbaikan Legal</p><p className="mt-1 text-xs leading-5 text-amber-100/80">{item.legal_catatan}</p></div>}
            </section>

            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h2 className="mb-3 text-xs font-black uppercase tracking-wider text-white/80">Penetapan teknis</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="ISP yang ditetapkan KIMA" value={item.isp_nama} />
                <Field label="Status survei" value={item.survey_status} />
                <Field label="Hasil survei jalur" value={item.survey_hasil} wide />
              </div>
              {poDocuments.length > 0 && <div className="mt-4 rounded-xl border border-sky-300/20 bg-sky-400/[0.06] p-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-sky-200">Dokumen PO pelanggan</p><p className="mt-1 text-xs text-white/55">Berkas yang dikirim pelanggan dapat diperiksa satu per satu.</p></div><div className="mt-3 grid gap-2 md:grid-cols-3">{poDocuments.map((document) => <div key={document.idKey} className="flex min-w-0 flex-col gap-2 rounded-lg border border-white/10 bg-slate-950/40 p-2.5"><p className="min-h-8 text-[10px] font-bold leading-4 text-white/80">{document.label}</p><div className="flex gap-2"><button type="button" onClick={() => void openPoDocument(document.id, "preview", document.slug)} disabled={Boolean(documentAction)} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300/30 bg-sky-400/10 px-2.5 py-1.5 text-[10px] font-black text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-50">{documentAction === "preview" ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}Buka</button><button type="button" onClick={() => void openPoDocument(document.id, "download", document.slug)} disabled={Boolean(documentAction)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1.5 text-[10px] font-black text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-wait disabled:opacity-50">{documentAction === "download" ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}Unduh</button></div></div>)}</div></div>}
              {item.nota_dinas_dokumen_id && <div className="mt-4 rounded-xl border border-violet-300/20 bg-violet-400/[0.06] p-3"><p className="text-[10px] font-black uppercase tracking-widest text-violet-200">Nota dinas KIMA</p><p className="mt-1 text-xs text-white/55">Surat internal sebagai dasar keputusan persetujuan KIMA/DBO.</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/40 p-2.5"><span className="text-xs font-bold text-white/80">Nota dinas {item.kode_registrasi}.pdf</span><div className="flex gap-2"><button type="button" onClick={() => void openPoDocument(item.nota_dinas_dokumen_id, "preview", "nota-dinas")} disabled={Boolean(documentAction)} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300/30 bg-sky-400/10 px-2.5 py-1.5 text-[10px] font-black text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-50"><Eye size={12} />Buka</button><button type="button" onClick={() => void openPoDocument(item.nota_dinas_dokumen_id, "download", "nota-dinas")} disabled={Boolean(documentAction)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1.5 text-[10px] font-black text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-wait disabled:opacity-50"><Download size={12} />Unduh</button></div></div></div>}
              {(item.bak_dokumen_id || item.pks_dokumen_id) && <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-400/[0.06] p-3"><p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Dokumen BAK/PKS</p><p className="mt-1 text-xs text-white/55">Minimal satu dokumen wajib tersedia. Jika keduanya ada, masing-masing ditampilkan untuk pemeriksaan.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{[[item.bak_dokumen_id, "Dokumen BAK", "bak"], [item.pks_dokumen_id, "Dokumen PKS", "pks"]].filter(([id]) => id).map(([id, label, slug]) => <div key={slug} className="rounded-lg border border-white/10 bg-slate-950/40 p-2.5"><p className="truncate text-xs font-bold text-white/80">{label}</p><div className="mt-2 flex gap-2"><button type="button" onClick={() => void openPoDocument(id, "preview", slug)} disabled={Boolean(documentAction)} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300/30 bg-sky-400/10 px-2.5 py-1.5 text-[10px] font-black text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-50"><Eye size={12} />Buka</button><button type="button" onClick={() => void openPoDocument(id, "download", slug)} disabled={Boolean(documentAction)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1.5 text-[10px] font-black text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-wait disabled:opacity-50"><Download size={12} />Unduh</button></div></div>)}</div></div>}
              {formalDocuments.length > 0 && <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-white/50">Dokumen formal SOP 1</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{formalDocuments.map((document) => <div key={document.slug} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/40 p-2.5"><span className="truncate text-xs font-bold text-white/80">{document.label}</span><button type="button" onClick={() => void openPoDocument(document.id, "preview", document.slug)} disabled={Boolean(documentAction)} className="shrink-0 text-[10px] font-black text-sky-200 hover:text-white disabled:opacity-50"><Eye size={12} /> Buka</button></div>)}</div></div>}
            </section>

            <div className="flex justify-end border-t border-white/10 pt-4">
              <button type="button" onClick={onClose} className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-black text-white/75 transition hover:bg-white/10 hover:text-white">Tutup</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
