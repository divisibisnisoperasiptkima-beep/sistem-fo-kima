import { useRef, useState } from "react";
import { CheckCircle2, Eye, RefreshCw } from "lucide-react";
import DataTable from "../../components/DataTable";
import { listServiceChangeRequests } from "../../lib/rust-api";
import Sop2ActionModal from "./Sop2ActionModal";
import { getSop2Owner } from "./workflowResponsibility";

const value = (item) => item == null || item === "" ? "—" : String(item);

const STATUS_STYLES = {
  diajukan: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  diproses: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  selesai: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  rejected: "bg-rose-500/20 text-rose-300 border-rose-500/30",
};

const STATUS_LABELS = {
  diajukan: "Diajukan",
  diproses: "Sedang diproses",
  selesai: "Selesai",
  ditolak: "Ditolak",
};

const STEP_LABELS = {
  2: "Kirim tarif",
  3: "Survei jalur",
  4: "Kirim PO bertarif",
  5: "Verifikasi PO",
  6: "Perjanjian",
  7: "Tanda tangan BAK",
  8: "Aktivasi",
  9: "BAA",
  10: "Terbitkan invoice",
  11: "Kirim tagihan",
  12: "Konfirmasi bayar",
};

function formatType(type) {
  return value(type).replaceAll("_", " ");
}

export default function ServiceChangeRequestsAdmin({ session }) {
  const tableRef = useRef(null);
  const [target, setTarget] = useState(null);

  const columns = [
    { label: "Kode perubahan", width: 150, render: (row) => <span className="font-black text-gold-accent">{value(row.kode_perubahan)}</span> },
    {
      label: "Pelanggan / lokasi",
      width: 240,
      render: (row) => <div><p className="font-bold text-white">{value(row.nama_pelanggan)}</p><p className="mt-0.5 text-[10px] text-white/45">{value(row.lokasi_nama)}</p></div>,
    },
    { label: "Jenis perubahan", width: 190, render: (row) => <span className="capitalize">{formatType(row.jenis_permintaan)}</span> },
    { label: "Tahap aktif", width: 170, render: (row) => <div><p className="font-bold text-white">Tahap {value(row.current_step)} / 12</p><p className="mt-0.5 text-[10px] text-white/45">{STEP_LABELS[row.current_step] || "Menunggu proses berikutnya"}</p></div> },
    { label: "Penanggung jawab", width: 190, render: (row) => { const owner = getSop2Owner(row.current_step); return <div><p className="font-bold text-gold-accent">{owner.label}</p><p className="mt-0.5 text-[10px] text-white/45">{owner.stage}</p></div>; } },
    {
      label: "Status",
      width: 150,
      render: (row) => <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${STATUS_STYLES[row.status] || "border-white/15 bg-white/5 text-white/60"}`}>{STATUS_LABELS[row.status] || value(row.status)}</span>,
    },
    { label: "Dibuat", width: 160, render: (row) => row.created_at ? new Date(row.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—" },
    {
      label: "Aksi",
      width: 170,
      render: (row) => {
        const processable = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(Number(row.current_step));
        return <div className="flex items-center gap-1">{processable ? <button type="button" onClick={() => setTarget(row)} title="Proses tahap SOP 2" className="inline-flex items-center gap-1.5 rounded-lg bg-gold-accent px-2.5 py-1.5 text-[10px] font-black text-slate-950 transition hover:bg-yellow-300"><CheckCircle2 size={14} />Proses tahap</button> : <span className="px-2 text-[10px] font-bold text-white/40">Menunggu alur</span>}<button type="button" onClick={() => processable && setTarget(row)} title={processable ? "Lihat dan proses detail" : "Tahap belum dapat diproses Admin"} className="rounded-lg p-1.5 text-sky-300 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40" disabled={!processable}><Eye size={15} /></button></div>;
      },
    },
  ];

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <span className="h-[2px] w-8 bg-gold-accent" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gold-accent">SOP 2 · Antrean terpisah</p>
          </div>
          <h1 className="text-3xl font-black text-white">Perubahan Layanan <span className="text-gold-accent italic">FO KIMA</span></h1>
          <p className="mt-2 max-w-2xl text-xs font-semibold text-white/50">Kelola permintaan perubahan layanan dari pelanggan yang sudah memiliki kontrak.</p>
        </div>
        <button type="button" onClick={() => tableRef.current?.refresh()} className="inline-flex items-center gap-2 rounded-lg border border-gold-accent/30 bg-gold-accent/10 px-3 py-2 text-xs font-black text-gold-accent transition hover:bg-gold-accent/20"><RefreshCw size={14} />Muat ulang SOP 2</button>
      </div>

      <section className="rounded-2xl border border-gold-accent/20 bg-slate-950/55 p-4 shadow-xl md:p-5">
        <DataTable ref={tableRef} title="Daftar Perubahan Layanan" load={listServiceChangeRequests} columns={columns} session={session} />
      </section>

      <Sop2ActionModal item={target} session={session} onClose={() => setTarget(null)} onSuccess={() => { setTarget(null); tableRef.current?.refresh(); }} />
    </div>
  );
}
