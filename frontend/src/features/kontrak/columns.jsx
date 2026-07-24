import { ExternalLink } from "lucide-react";

/**
 * Column definitions for Kontrak Lengkap page
 */
const value = (item) => (item == null || item === "" ? "—" : String(item));
const name = (row) => row.nama_pelanggan || row.nama || row.customer_name || row.name || "—";

const formatRupiah = (val) => {
  if (val == null || val === "" || isNaN(Number(val))) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(val));
};

const renderStatusBadge = (row) => {
  const preserved = ["Diperpanjang", "Di-upgrade", "Berhenti"];
  const stored = row.status_kontrak || row.status || row.contract_status || "—";

  let displayStatus = stored;
  if (!preserved.includes(stored)) {
    const now = new Date();
    const start = row.periode_awal ? new Date(row.periode_awal) : null;
    const end = row.periode_berakhir ? new Date(row.periode_berakhir) : null;
    if (start && end) {
      if (now < start) displayStatus = "Belum Beroperasi";
      else if (now <= end) displayStatus = "Beroperasi";
      else displayStatus = "Proses Perpanjangan";
    }
  }

  let badgeStyle = "bg-white/10 text-white/70 border-white/20";

  if (displayStatus === "Beroperasi") {
    badgeStyle = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  } else if (displayStatus === "Belum Beroperasi") {
    badgeStyle = "bg-amber-500/15 text-amber-400 border-amber-500/30";
  } else if (displayStatus === "Proses Perpanjangan") {
    badgeStyle = "bg-rose-500/15 text-rose-400 border-rose-500/30";
  } else if (displayStatus === "Berhenti") {
    badgeStyle = "bg-slate-500/15 text-slate-400 border-slate-500/30";
  } else if (displayStatus === "Diperpanjang") {
    badgeStyle = "bg-sky-500/15 text-sky-400 border-sky-500/30";
  } else if (displayStatus === "Di-upgrade") {
    badgeStyle = "bg-violet-500/15 text-violet-400 border-violet-500/30";
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeStyle}`}>
      {displayStatus}
    </span>
  );
};

const renderCapacity = (row) => {
  if (row.sharing_core && row.sharing_core !== "—") {
    return <span className="text-violet-300 font-semibold">Sharing {row.sharing_core}</span>;
  }
  if (row.core && row.core !== "—") {
    return <span className="text-sky-300 font-semibold">{row.core}</span>;
  }
  return value(row.jalur);
};

const renderSisaWaktu = (row) => {
  if (!row.periode_berakhir) return <span className="text-white/30">—</span>;

  const now = new Date();
  const end = new Date(row.periode_berakhir);
  const diffMs = end - now;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    const months = Math.floor(absDays / 30);
    const days = absDays % 30;
    const label = months > 0 ? `${months} Bln ${days} Hr lewat` : `${absDays} Hari lewat`;
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-rose-500/15 text-rose-400 border-rose-500/30">
        {label}
      </span>
    );
  }

  const months = Math.floor(diffDays / 30);
  const days = diffDays % 30;
  const label = months > 0 ? `${months} Bln ${days} Hr` : `${diffDays} Hari`;

  let colorClass;
  if (diffDays <= 30) {
    colorClass = "bg-rose-500/15 text-rose-400 border-rose-500/30";
  } else if (diffDays <= 90) {
    colorClass = "bg-amber-500/15 text-amber-400 border-amber-500/30";
  } else {
    colorClass = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${colorClass}`}>
      {label}
    </span>
  );
};

export const kontrakColumns = [
  { label: "No", sticky: { left: "0px", width: "50px" }, render: (_row, idx, page = 1, pageSize = 20) => (page - 1) * pageSize + (idx ?? 0) + 1 },
  {
    label: "Pelanggan",
    sticky: { left: "50px", width: "180px" },
    render: (row) => (
      <span className="font-bold text-white block truncate max-w-[170px]" title={name(row)}>
        {name(row)}
      </span>
    ),
  },
  {
    label: "Lokasi",
    sticky: { left: "230px", width: "200px", isLast: true },
    render: (row) => (
      <span className="block truncate max-w-[190px]" title={row.nama_lokasi}>
        {value(row.nama_lokasi)}
      </span>
    ),
  },
  { label: "Sisa Waktu", render: renderSisaWaktu },
  { label: "Status", render: renderStatusBadge },
  { label: "No. Kontrak", render: (row) => value(row.nomor_kontrak) },
  { label: "Periode Awal", render: (row) => value(row.periode_awal) },
  { label: "Periode Berakhir", render: (row) => value(row.periode_berakhir) },
  { label: "Durasi", render: (row) => (row.durasi_kontrak_bulan ? `${row.durasi_kontrak_bulan} Bln` : "—") },
  { label: "Kapasitas Core", render: renderCapacity },
  { label: "Nilai Kontrak", render: (row) => <span className="font-semibold text-emerald-400">{formatRupiah(row.nilai_kontrak)}</span> },
  { label: "Biaya Aktivasi", render: (row) => formatRupiah(row.biaya_aktivasi) },
  { label: "Biaya / Bln", render: (row) => formatRupiah(row.perbulan) },
  { label: "Periode Aktif", render: (row) => formatRupiah(row.nilai_periode_aktif) },
  {
    label: "Folder Berkas",
    render: (row) =>
      row.link_folder_berkas ? (
        <a
          href={row.link_folder_berkas}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 transition-colors"
          title="Buka Folder Berkas di Google Drive"
        >
          <span>Drive</span>
          <ExternalLink size={12} />
        </a>
      ) : (
        "—"
      ),
  },
  {
    label: "Aksi",
    render: (row, _idx, extra = {}) => {
      const { onEdit, onDelete, onExtend, onUpgrade } = extra || {};
      if (!ActionButtons) return "—";
      return (
        <ActionButtons
          row={row}
          onEdit={onEdit}
          onDelete={onDelete}
          onExtend={onExtend}
          onUpgrade={onUpgrade}
        />
      );
    },
  },
];

// ActionButtons is imported dynamically to avoid circular deps
let ActionButtons = null;
export const setActionButtonsComponent = (component) => {
  ActionButtons = component;
};

export default kontrakColumns;
