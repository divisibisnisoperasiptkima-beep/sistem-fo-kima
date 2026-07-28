import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  FileUp,
  Mail,
  MapPin,
  RefreshCw,
  Search,
  UserRound,
  WalletCards,
} from "lucide-react";
import { fetchDocumentContent, listAllPages, listContracts, listCustomers, listIspDocuments, rowsFrom, uploadDocument } from "../../lib/rust-api";
import { coreDisplayValue } from "../kontrak/coreUtils";

const CATEGORIES = ["Kontrak", "BAK-PKS", "Dokumen Lain"];
const value = (item) => item == null || item === "" ? "—" : String(item);

const formatDate = (dateValue) => {
  if (!dateValue) return "—";
  const raw = String(dateValue);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};

const formatCurrency = (amount) => {
  if (amount == null || amount === "") return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(amount));
};

const statusTone = (status) => {
  if (status === "Beroperasi") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (status === "Belum Beroperasi") return "border-sky-400/30 bg-sky-400/10 text-sky-200";
  if (status === "Berhenti") return "border-rose-400/30 bg-rose-400/10 text-rose-200";
  return "border-amber-400/30 bg-amber-400/10 text-amber-200";
};

const serviceLabel = (item) => {
  if (item.sharing_core) return `Sharing ${item.sharing_core}`;
  if (item.core) return coreDisplayValue(item.core);
  return "Layanan belum diisi";
};

function StatCard({ icon, label, value: statValue, hint, tone = "gold" }) {
  const tones = {
    gold: "border-gold-accent/25 bg-gold-accent/10 text-gold-accent",
    blue: "border-sky-400/25 bg-sky-400/10 text-sky-300",
    green: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    violet: "border-violet-400/25 bg-violet-400/10 text-violet-300",
  };
  return (
    <article className={`rounded-2xl border p-4 backdrop-blur-md ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/50">{label}</p>
          <p className="mt-2 text-2xl font-black text-white">{statValue}</p>
          <p className="mt-1 text-[11px] text-white/45">{hint}</p>
        </div>
        <span className="rounded-xl border border-current/20 bg-black/10 p-2">{icon}</span>
      </div>
    </article>
  );
}

function EmptyState({ title, children }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center">
      <Building2 size={28} className="text-white/25" />
      <p className="mt-3 text-sm font-bold text-white/70">{title}</p>
      <p className="mt-1 max-w-md text-xs text-white/40">{children}</p>
    </div>
  );
}

export default function IspPortalPage({ session, page }) {
  const [customers, setCustomers] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contractSearch, setContractSearch] = useState("");
  const [contractStatus, setContractStatus] = useState("all");
  const [documentSearch, setDocumentSearch] = useState("");
  const [file, setFile] = useState(null);
  const [ownerType, setOwnerType] = useState("lokasi");
  const [ownerId, setOwnerId] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [documentAction, setDocumentAction] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
      setError("");
      try {
        const [customerData, contractData, documentData] = await Promise.all([
        listAllPages((page, pageSize) => listCustomers(session.token, page, pageSize)),
        listAllPages((page, pageSize) => listContracts(session.token, page, pageSize)),
        listAllPages((page, pageSize) => listIspDocuments(session.token, page, pageSize, documentSearch)),
      ]);
      setCustomers(rowsFrom(customerData));
      setContracts(rowsFrom(contractData));
      setDocuments(rowsFrom(documentData));
    } catch (err) {
      setError(err.message || "Gagal memuat portal ISP.");
    } finally {
      setLoading(false);
    }
  }, [documentSearch, session.token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!ownerId && contracts.length) setOwnerId(String(contracts[0].id));
  }, [contracts, ownerId]);

  const ownerOptions = useMemo(() => ownerType === "pelanggan" ? customers : contracts, [ownerType, customers, contracts]);
  const isDocuments = page === "isp-dokumen";
  const isContracts = page === "isp-kontrak";

  const contractStatuses = useMemo(() => {
    const statuses = [...new Set(contracts.map((item) => item.status_kontrak).filter(Boolean))];
    return statuses.sort((a, b) => a.localeCompare(b, "id"));
  }, [contracts]);

  const visibleContracts = useMemo(() => {
    const term = contractSearch.trim().toLowerCase();
    return contracts.filter((item) => {
      const searchable = [item.nama_pelanggan, item.nama_lokasi, item.kode_kontrak, item.nomor_kontrak, item.status_kontrak, item.jalur, item.core, item.sharing_core].filter(Boolean).join(" ").toLowerCase();
      const matchesSearch = !term || searchable.includes(term);
      const matchesStatus = contractStatus === "all" || item.status_kontrak === contractStatus;
      return matchesSearch && matchesStatus;
    });
  }, [contractSearch, contractStatus, contracts]);

  const metrics = useMemo(() => ({
    customers: customers.length,
    contracts: contracts.length,
    operating: contracts.filter((item) => item.status_kontrak === "Beroperasi").length,
    documents: documents.length,
    monthly: contracts.reduce((total, item) => total + (Number(item.perbulan) || 0), 0),
  }), [customers, contracts, documents]);

  const pageCopy = {
    "isp-ringkasan": { eyebrow: "Ruang kerja mitra", title: "Ringkasan Pelanggan", description: "Gambaran pelanggan, kontak, layanan, dan aktivitas yang ditugaskan ke akun Anda." },
    "isp-kontrak": { eyebrow: "Layanan berlangganan", title: "Kontrak & Lokasi", description: "Informasi lengkap kontrak dan lokasi pelanggan dalam cakupan akun Anda." },
    "isp-dokumen": { eyebrow: "Pusat berkas", title: "Dokumen", description: "Unggah dan buka dokumen individual yang terkait dengan pelanggan atau kontrak Anda." },
  }[page] || { eyebrow: "Portal pelanggan", title: "Portal ISP", description: "Data untuk pelanggan yang ditugaskan pada akun Anda." };

  const handleUpload = async (event) => {
    event.preventDefault();
    setNotice("");
    if (!file || !ownerId) {
      setNotice("Pilih dokumen dan pelanggan atau kontrak tujuan.");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("kategori", category);
    form.append(`${ownerType}_id`, ownerId);
    setUploading(true);
    try {
      await uploadDocument(session.token, form);
      setFile(null);
      setNotice("Dokumen berhasil diunggah.");
      await load();
    } catch (err) {
      setNotice(err.message || "Upload dokumen gagal.");
    } finally {
      setUploading(false);
    }
  };

  const handleDocumentAction = async (item, mode) => {
    const actionKey = `${mode}-${item.id}`;
    const previewWindow = mode === "preview" ? window.open("", "_blank") : null;
    if (previewWindow) previewWindow.opener = null;
    setDocumentAction(actionKey);
    setNotice("");
    try {
      if (mode === "preview" && !previewWindow) throw new Error("Izinkan pop-up browser untuk membuka preview dokumen.");
      const blob = await fetchDocumentContent(session.token, item.id, mode);
      const url = URL.createObjectURL(blob);
      if (mode === "preview") {
        previewWindow.location.href = url;
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = item.nama_file || "dokumen";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      if (previewWindow) previewWindow.close();
      setNotice(err.message || "Dokumen gagal dibuka.");
    } finally {
      setDocumentAction("");
    }
  };

  if (loading) return <div className="p-8 text-sm text-white/60">Memuat data ISP…</div>;

  return (
    <div className="flex flex-col gap-5 pb-8">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/80 via-slate-900/55 to-gold-accent/10 p-6 shadow-2xl backdrop-blur-md md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-gold-accent/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3"><span className="h-[2px] w-8 bg-gold-accent" /><p className="text-[10px] font-black uppercase tracking-[0.4em] text-gold-accent">{pageCopy.eyebrow}</p></div>
          <div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div><h1 className="text-3xl font-black text-white md:text-4xl">{pageCopy.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">{pageCopy.description}</p></div>
            <button type="button" onClick={() => void load()} className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white/75 transition hover:bg-white/15 hover:text-white"><RefreshCw size={15} /> Muat ulang</button>
          </div>
        </div>
      </section>

      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Building2 size={18} />} label="Pelanggan" value={metrics.customers} hint="pelanggan ditugaskan" tone="gold" />
        <StatCard icon={<FileCheck2 size={18} />} label="Kontrak" value={metrics.contracts} hint={`${metrics.operating} sedang beroperasi`} tone="blue" />
        <StatCard icon={<CheckCircle2 size={18} />} label="Dokumen" value={metrics.documents} hint="dokumen dapat dibuka" tone="green" />
        <StatCard icon={<WalletCards size={18} />} label="Nilai bulanan" value={formatCurrency(metrics.monthly)} hint="berdasarkan data kontrak" tone="violet" />
      </section>

      {page === "isp-ringkasan" && (
        <section>
          {customers.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{customers.map((customer) => (
            <article key={customer.id} className="group rounded-2xl border border-white/10 bg-white/[0.055] p-5 backdrop-blur-md transition hover:-translate-y-0.5 hover:border-gold-accent/40 hover:bg-white/[0.08]">
              <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-gold-accent">{value(customer.kode_pelanggan)}</p><h2 className="mt-2 text-lg font-bold text-white">{customer.nama_pelanggan}</h2></div><span className="rounded-xl border border-gold-accent/20 bg-gold-accent/10 p-2 text-gold-accent"><Building2 size={18} /></span></div>
              <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-xs text-white/60"><p className="flex items-center gap-2"><UserRound size={14} className="text-white/35" />{value(customer.pic)}</p><p className="flex items-center gap-2"><Mail size={14} className="text-white/35" />{value(customer.email)}</p><p className="flex items-center gap-2"><MapPin size={14} className="text-white/35" />{value(customer.telepon)}</p></div>
              <p className="mt-4 line-clamp-2 text-xs leading-5 text-white/45">{customer.keterangan || "Data pelanggan FO KIMA"}</p>
              <div className="mt-5 grid grid-cols-1 gap-2 border-t border-white/10 pt-4 sm:grid-cols-3"><div className="rounded-xl bg-emerald-400/10 p-3"><p className="text-xl font-black text-emerald-200">{customer.lokasi_beroperasi}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-emerald-200/60">Beroperasi</p></div><div className="rounded-xl bg-sky-400/10 p-3"><p className="text-xl font-black text-sky-200">{customer.lokasi_belum_beroperasi}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-sky-200/60">Belum aktif</p></div><div className="rounded-xl bg-rose-400/10 p-3"><p className="text-xl font-black text-rose-200">{customer.lokasi_proses_perpanjangan ?? 0}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-rose-200/60">Perpanjangan</p></div></div>
            </article>
          ))}</div> : <EmptyState title="Belum ada pelanggan ditugaskan">Hubungi administrator untuk menambahkan pelanggan ke akun ISP Anda.</EmptyState>}
        </section>
      )}

      {isContracts && (
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 shadow-xl backdrop-blur-md">
          <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-lg font-bold text-white">Daftar Kontrak & Lokasi</h2><p className="mt-1 text-xs text-white/45">Menampilkan {visibleContracts.length} dari {contracts.length} kontrak dalam cakupan Anda.</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search size={15} className="absolute left-3 top-2.5 text-white/35" /><input value={contractSearch} onChange={(event) => setContractSearch(event.target.value)} placeholder="Cari kontrak, pelanggan, lokasi…" className="w-full rounded-xl border border-white/15 bg-white/5 py-2 pl-9 pr-3 text-xs text-white outline-none transition placeholder:text-white/30 focus:border-gold-accent/50 sm:w-64" /></div><select value={contractStatus} onChange={(event) => setContractStatus(event.target.value)} className="rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-xs font-semibold text-white outline-none focus:border-gold-accent/50"><option value="all">Semua status</option>{contractStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div></div>
          {visibleContracts.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-left text-xs"><thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.16em] text-white/45"><tr><th className="px-5 py-4">Kontrak</th><th className="px-4 py-4">Pelanggan & lokasi</th><th className="px-4 py-4">Status</th><th className="px-4 py-4">Periode</th><th className="px-4 py-4">Layanan</th><th className="px-4 py-4">Nilai kontrak</th><th className="px-4 py-4">Bulanan</th></tr></thead><tbody className="divide-y divide-white/[0.07]">{visibleContracts.map((item) => <tr key={item.id} className="group transition hover:bg-gold-accent/[0.055]"><td className="px-5 py-4 align-top"><p className="font-black text-white">{value(item.kode_kontrak)}</p><p className="mt-1 text-[11px] text-white/45">No. {value(item.nomor_kontrak)}</p><p className="mt-2 inline-flex items-center gap-1 text-[10px] text-white/35"><Clock3 size={12} /> {value(item.durasi_kontrak_bulan)} bulan</p></td><td className="px-4 py-4 align-top"><p className="font-bold text-white">{value(item.nama_pelanggan)}</p><p className="mt-1 inline-flex items-center gap-1 text-white/55"><MapPin size={13} className="text-gold-accent/75" /> {value(item.nama_lokasi)}</p><p className="mt-2 text-[10px] uppercase tracking-wider text-white/30">{value(item.jalur)}</p></td><td className="px-4 py-4 align-top"><span className={`inline-flex whitespace-nowrap items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black ${statusTone(item.status_kontrak)}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{value(item.status_kontrak)}</span></td><td className="px-4 py-4 align-top"><div className="flex items-start gap-2 text-white/70"><CalendarDays size={14} className="mt-0.5 shrink-0 text-white/35" /><div><p>{formatDate(item.periode_awal)}</p><p className="my-1 text-[10px] text-white/30">sampai</p><p>{formatDate(item.periode_berakhir)}</p></div></div></td><td className="px-4 py-4 align-top"><p className="font-bold text-white/85">{serviceLabel(item)}</p><p className="mt-1 text-[10px] text-white/40">Kategori: {value(item.jalur)}</p></td><td className="px-4 py-4 align-top font-semibold text-white/80">{formatCurrency(item.nilai_kontrak)}<p className="mt-1 text-[10px] font-normal text-white/35">Aktif: {formatCurrency(item.nilai_periode_aktif)}</p></td><td className="px-4 py-4 align-top font-semibold text-gold-accent">{formatCurrency(item.perbulan)}<p className="mt-1 text-[10px] font-normal text-white/35">Aktivasi: {formatCurrency(item.biaya_aktivasi)}</p></td></tr>)}</tbody></table></div> : <div className="p-5"><EmptyState title="Kontrak tidak ditemukan">Coba ubah kata kunci atau filter status yang dipilih.</EmptyState></div>}
        </section>
      )}

      {isDocuments && <>
        <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 backdrop-blur-md"><div className="flex items-start gap-3"><span className="rounded-xl border border-gold-accent/20 bg-gold-accent/10 p-2 text-gold-accent"><FileUp size={18} /></span><div><h2 className="text-lg font-bold text-white">Upload Dokumen</h2><p className="mt-1 text-sm text-white/50">Simpan berkas pada pelanggan atau kontrak yang ditugaskan. Folder Drive tidak ditampilkan di portal ISP.</p></div></div><form onSubmit={handleUpload} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><select value={ownerType} onChange={(event) => { setOwnerType(event.target.value); setOwnerId(""); }} className="rounded-xl border border-white/15 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-gold-accent/50"><option value="lokasi">Kontrak / lokasi</option><option value="pelanggan">Pelanggan</option></select><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} className="rounded-xl border border-white/15 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-gold-accent/50"><option value="">Pilih tujuan</option>{ownerOptions.map((item) => <option key={item.id} value={item.id}>{ownerType === "pelanggan" ? item.nama_pelanggan : `${item.nama_pelanggan} — ${item.nama_lokasi}`}</option>)}</select><select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-white/15 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-gold-accent/50">{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select><input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} className="rounded-xl border border-white/15 bg-slate-900 px-3 py-2.5 text-sm text-white file:mr-3 file:border-0 file:bg-transparent file:font-bold file:text-gold-accent" /><button disabled={uploading} className="inline-flex w-fit items-center gap-2 rounded-xl border border-gold-accent/40 bg-gold-accent/20 px-4 py-2.5 text-sm font-bold text-gold-accent transition hover:bg-gold-accent/30 disabled:opacity-50"><FileUp size={16} />{uploading ? "Mengunggah…" : "Upload dokumen"}</button></form>{notice && <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75">{notice}</p>}</section>
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 shadow-xl backdrop-blur-md"><div className="flex flex-col gap-3 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-white">Daftar Dokumen</h2><p className="mt-1 text-xs text-white/45">Dokumen dibuka melalui backend sesuai hak akses akun ISP.</p></div><div className="flex items-center gap-2"><div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-white/35" /><input value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder="Cari dokumen" className="w-48 rounded-xl border border-white/15 bg-white/5 py-2 pl-9 pr-3 text-xs text-white outline-none placeholder:text-white/30 focus:border-gold-accent/50" /></div><button type="button" onClick={() => void load()} className="rounded-xl border border-white/15 bg-white/5 p-2 text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Muat ulang dokumen"><RefreshCw size={16} /></button></div></div>{documents.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.16em] text-white/45"><tr><th className="px-5 py-4">Nama file</th><th className="px-4 py-4">Kategori</th><th className="px-4 py-4">Pelanggan / lokasi</th><th className="px-4 py-4">Diunggah</th><th className="px-4 py-4">Aksi</th></tr></thead><tbody className="divide-y divide-white/[0.07]">{documents.map((item) => <tr key={item.id} className="transition hover:bg-gold-accent/[0.055]"><td className="px-5 py-4 font-bold text-white">{value(item.nama_file)}<p className="mt-1 text-[10px] font-normal text-white/35">{value(item.mime_type)} · {item.ukuran_byte ? `${Math.ceil(item.ukuran_byte / 1024)} KB` : "ukuran tidak tersedia"}</p></td><td className="px-4 py-4"><span className="rounded-full border border-violet-400/25 bg-violet-400/10 px-2.5 py-1 text-[10px] font-bold text-violet-200">{value(item.kategori)}</span></td><td className="px-4 py-4 text-white/70">{value(item.nama_pelanggan)}{item.nama_lokasi ? <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-white/35"><MapPin size={12} />{item.nama_lokasi}</p> : null}</td><td className="px-4 py-4 whitespace-nowrap text-white/55">{formatDate(item.created_at)}</td><td className="px-4 py-4"><div className="flex items-center gap-2"><button type="button" onClick={() => void handleDocumentAction(item, "preview")} disabled={documentAction !== ""} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/25 bg-sky-400/10 px-2.5 py-1.5 font-bold text-sky-200 transition hover:bg-sky-400/20 disabled:opacity-50" title="Preview dokumen"><Eye size={13} />Preview</button><button type="button" onClick={() => void handleDocumentAction(item, "download")} disabled={documentAction !== ""} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1.5 font-bold text-emerald-200 transition hover:bg-emerald-400/20 disabled:opacity-50" title="Download dokumen"><Download size={13} />Download</button></div></td></tr>)}</tbody></table></div> : <div className="p-5"><EmptyState title="Belum ada dokumen">Upload dokumen pertama untuk pelanggan atau kontrak yang ditugaskan.</EmptyState></div>}</section>
      </>}
    </div>
  );
}
