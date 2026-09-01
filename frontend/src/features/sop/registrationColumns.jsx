import { getSop1Owner } from "./workflowResponsibility";

const value = (item) => item == null || item === "" ? "—" : String(item);

const STATUS_STYLES = {
  menunggu: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  disetujui: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  ditolak: "bg-red-500/20 text-red-400 border-red-500/30",
  dibatalkan: "bg-rose-500/20 text-rose-300 border-rose-500/30",
};

const STATUS_LABELS = {
  menunggu: "Menunggu",
  disetujui: "Diterima untuk Survei",
  ditolak: "Ditolak",
  dibatalkan: "Dibatalkan pemohon",
};

const OFFER_STATUS_STYLES = {
  dikirim: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  negosiasi: "bg-gold-accent/15 text-gold-accent border-gold-accent/30",
  setuju: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  tolak: "bg-rose-500/15 text-rose-300 border-rose-500/25",
};

const OFFER_STATUS_LABELS = {
  dikirim: "Menunggu respons penawaran",
  negosiasi: "Negosiasi pelanggan",
  setuju: "Penawaran disetujui",
  tolak: "Penawaran ditolak",
};

const APPROVAL_STATUS_LABELS = {
  menunggu: "Persetujuan KIMA/DBO menunggu",
  setuju: "Disetujui KIMA/DBO",
  tolak: "Ditolak KIMA/DBO",
};

const BAA_STATUS_LABELS = {
  belum_dibuat: "BAA belum dibuat",
  menunggu_verifikasi_dbo: "BAA menunggu DBO",
  menunggu_konfirmasi_lokasi: "BAA menunggu pelanggan",
  diterima_lokasi: "BAA diterima pelanggan",
};

export const registrationColumns = [
  { label: "Kode", render: (row) => value(row.kode_registrasi), width: 140 },
  { label: "Pengaju Layanan", render: (row) => value(row.nama_perusahaan), width: 200 },
  {
    label: "PIC",
    render: (row) => (
      <div>
        <p>{value(row.pic_nama)}</p>
        <p className="mt-0.5 text-[9px] text-white/40">{value(row.pic_jabatan)}</p>
      </div>
    ),
    width: 170,
  },
  {
    label: "Kontak PIC",
    render: (row) => (
      <div>
        <p>{value(row.pic_email || row.email_perusahaan)}</p>
        <p className="mt-0.5 text-[9px] text-white/45">{value(row.pic_telepon || row.telepon_perusahaan)}</p>
      </div>
    ),
    width: 210,
  },
  {
    label: "Lokasi Diajukan",
    render: (row) => (
      <div>
        <p>{value(row.lokasi_nama)}</p>
        <p className="mt-0.5 max-w-[240px] truncate text-[9px] text-white/40" title={row.lokasi_alamat || ""}>{value(row.lokasi_alamat)}</p>
      </div>
    ),
    width: 240,
  },
  {
    label: "Wilayah",
    render: (row) => <span>{value(row.lokasi_kota)}{row.lokasi_provinsi ? ` · ${row.lokasi_provinsi}` : ""}</span>,
    width: 160,
  },
  {
    label: "Kebutuhan",
    render: (row) => value(row.core_dedicated > 0 ? `${row.core_dedicated} Core dedicated` : row.sharing_core),
    width: 150,
  },
  {
    label: "Status",
    width: 110,
    render: (row) => (
      <div className="flex min-w-[150px] flex-col items-start gap-1">
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${STATUS_STYLES[row.status] || "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"}`}>
          {STATUS_LABELS[row.status] || row.status}
        </span>
        {OFFER_STATUS_LABELS[row.penawaran_status] && <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[9px] font-black tracking-wide ${OFFER_STATUS_STYLES[row.penawaran_status] || "bg-white/5 text-white/50 border-white/10"}`}>
          {OFFER_STATUS_LABELS[row.penawaran_status]}
        </span>}
        {APPROVAL_STATUS_LABELS[row.direksi_status] && <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[9px] font-black tracking-wide ${row.direksi_status === "menunggu" ? "border-violet-400/25 bg-violet-400/10 text-violet-200" : row.direksi_status === "setuju" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-rose-400/25 bg-rose-400/10 text-rose-200"}`}>
          {APPROVAL_STATUS_LABELS[row.direksi_status]}
        </span>}
        {BAA_STATUS_LABELS[row.baa_status] && row.baa_status !== "belum_dibuat" && <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[9px] font-black tracking-wide ${row.baa_status === "diterima_lokasi" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : row.baa_status === "menunggu_verifikasi_dbo" ? "border-sky-400/25 bg-sky-400/10 text-sky-200" : "border-amber-400/25 bg-amber-400/10 text-amber-200"}`}>
          {BAA_STATUS_LABELS[row.baa_status]}
        </span>}
      </div>
    ),
  },
  {
    label: "Penanggung jawab",
    width: 190,
    render: (row) => {
      const owner = getSop1Owner(row);
      return (
        <div>
          <p className="font-bold text-sky-200">{owner.label}</p>
          <p className="mt-0.5 text-[9px] text-white/45">{owner.stage}</p>
        </div>
      );
    },
  },
  {
    label: "Tanggal",
    width: 160,
    render: (row) => {
      if (!row.created_at) return <span className="text-slate-500 text-xs">--</span>;
      const d = new Date(row.created_at);
      return <span className="text-slate-300 text-xs">{d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" })} {d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>;
    },
  },
  { label: "Aksi", width: 180 },
];
