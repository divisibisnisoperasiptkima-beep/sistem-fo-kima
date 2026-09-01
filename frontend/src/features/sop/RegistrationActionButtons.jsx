import { Ban, Building2, ClipboardCheck, Eye, FileSignature, FileText, MessageCircle, Scale, ShieldCheck, XCircle } from "lucide-react";

export default function RegistrationActionButtons({
  row,
  onApprove,
  onReject,
  onCancel,
  onOffer,
  onLegal,
  onDecision,
  onPks,
  onBaa,
  onDetail,
}) {
  const detailButton = (
    <button
      type="button"
      onClick={() => onDetail(row)}
      title="Lihat detail permohonan"
      aria-label="Lihat detail permohonan"
      className="rounded-lg p-1.5 text-sky-300 transition-colors hover:bg-sky-500/20"
    >
      <Eye size={16} />
    </button>
  );
  const offerActionable = row.survey_status === "selesai" && ["belum_dibuat", "negosiasi"].includes(row.penawaran_status);
  const isNegotiation = row.penawaran_status === "negosiasi";
  const offerTitle = isNegotiation
    ? (row.direksi_status === "tolak" ? "Buat penawaran revisi berdasarkan keputusan KIMA/DBO" : "Tindak lanjuti negosiasi pelanggan")
    : "Buat atau kirim penawaran";

  if (row.status === "disetujui") {
    return (
      <div className="flex items-center gap-1">
        {detailButton}
        {offerActionable && (
          <button
            type="button"
            onClick={() => onOffer(row)}
            title={offerTitle}
            aria-label={offerTitle}
            className={`rounded-lg p-1.5 transition-colors hover:bg-gold-accent/20 ${isNegotiation ? "bg-gold-accent/15 text-gold-accent" : "text-gold-accent"}`}
          >
            {isNegotiation ? <MessageCircle size={16} /> : <FileText size={16} />}
          </button>
        )}
        {row.legal_status === "menunggu_verifikasi" && (
          <button
            type="button"
            onClick={() => onLegal(row, "legal")}
            title="Verifikasi PO dan buat nota dinas"
            aria-label="Verifikasi PO dan buat nota dinas"
            className="rounded-lg p-1.5 text-violet-300 transition-colors hover:bg-violet-500/20"
          >
            <Scale size={16} />
          </button>
        )}
        {row.direksi_status === "menunggu" && (
          <button
            type="button"
            onClick={() => onDecision(row)}
            title="Beri keputusan persetujuan KIMA/DBO"
            aria-label="Beri keputusan persetujuan KIMA/DBO"
            className="rounded-lg p-1.5 text-violet-200 transition-colors hover:bg-violet-500/20"
          >
            <Building2 size={16} />
          </button>
        )}
        {row.direksi_status === "setuju" && (row.pks_status !== "lengkap" || (!row.bak_dokumen_id && !row.pks_dokumen_id)) && (
          <button
            type="button"
            onClick={() => onPks(row)}
            title="BAK/PKS final bertanda tangan"
            aria-label="BAK/PKS final bertanda tangan"
            className="rounded-lg p-1.5 text-emerald-300 transition-colors hover:bg-emerald-500/20"
          >
            <FileSignature size={16} />
          </button>
        )}
        {row.baa_status === "menunggu_verifikasi_dbo" && (
          <button
            type="button"
            onClick={() => onBaa(row)}
            title="Verifikasi BAA dan kirim ke pelanggan"
            aria-label="Verifikasi BAA dan kirim ke pelanggan"
            className="rounded-lg p-1.5 text-sky-300 transition-colors hover:bg-sky-500/20"
          >
            <ClipboardCheck size={16} />
          </button>
        )}
        {row.aktivasi_status !== "aktif" && (
          <button
            type="button"
            onClick={() => onCancel(row)}
            title="Batalkan permohonan dari KIMA"
            aria-label="Batalkan permohonan dari KIMA"
            className="rounded-lg p-1.5 text-rose-300 transition-colors hover:bg-rose-500/20"
          >
            <Ban size={16} />
          </button>
        )}
      </div>
    );
  }

  if (row.status !== "menunggu") {
    return <div className="flex items-center gap-1">{detailButton}<span className="text-[10px] uppercase tracking-wider text-slate-500">—</span></div>;
  }

  return (
    <div className="flex items-center gap-1">
      {detailButton}
      <button
        type="button"
        onClick={() => onApprove(row)}
        title="Terima untuk survei"
        aria-label="Terima untuk survei"
        className="rounded-lg p-1.5 text-emerald-400 transition-colors hover:bg-emerald-500/20"
      >
        <ShieldCheck size={16} />
      </button>
      <button
        type="button"
        onClick={() => onReject(row)}
        title="Tolak permohonan"
        aria-label="Tolak permohonan"
        className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-500/20"
      >
        <XCircle size={16} />
      </button>
      <button
        type="button"
        onClick={() => onCancel(row)}
        title="Batalkan permohonan dari KIMA"
        aria-label="Batalkan permohonan dari KIMA"
        className="rounded-lg p-1.5 text-rose-300 transition-colors hover:bg-rose-500/20"
      >
        <Ban size={16} />
      </button>
    </div>
  );
}
