import { useState } from "react";
import { ArrowLeft, ClipboardList, Loader2, MapPin } from "lucide-react";
import { acceptPortalRegistrationBaa, respondOffer, submitPo, trackServiceRequest } from "../../lib/rust-api";
import CancelRegistrationModal from "./CancelRegistrationModal";
import { getSop1Owner } from "./workflowResponsibility";

const labels = {
  menunggu: "Menunggu Tinjauan KIMA",
  disetujui: "Diproses KIMA",
  ditolak: "Permohonan Ditolak",
  dibatalkan: "Permohonan Dibatalkan",
};
const surveyLabels = {
  belum_dijadwalkan: "Menunggu Teknisi menentukan jadwal",
  terjadwal: "Survei jalur telah dijadwalkan",
  selesai: "Survei jalur selesai",
};

export default function TrackServiceRequestPage({ onBack }) {
  const [kode, setKode] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [offerDecision, setOfferDecision] = useState("");
  const [offerNotes, setOfferNotes] = useState("");
  const [offerSaving, setOfferSaving] = useState(false);
  const [poNomor, setPoNomor] = useState("");
  const [poNotes, setPoNotes] = useState("");
  const [poSaving, setPoSaving] = useState(false);
  const [baaSaving, setBaaSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const submit = async (event) => {
    event.preventDefault(); setLoading(true); setError(""); setResult(null);
    try { setResult(await trackServiceRequest(kode.trim(), email.trim())); }
    catch (err) { setError(err.message || "Permohonan tidak dapat ditemukan."); }
    finally { setLoading(false); }
  };
  const submitOfferResponse = async (event) => {
    event.preventDefault(); setOfferSaving(true); setError("");
    try {
      await respondOffer(kode.trim(), email.trim(), offerDecision, offerNotes.trim() || null);
      setOfferDecision(""); setOfferNotes("");
      setResult(await trackServiceRequest(kode.trim(), email.trim()));
    } catch (err) { setError(err.message || "Respons penawaran gagal dikirim."); }
    finally { setOfferSaving(false); }
  };
  const submitPoData = async (event) => {
    event.preventDefault(); setPoSaving(true); setError("");
    try {
      await submitPo(kode.trim(), email.trim(), poNomor.trim(), poNotes.trim() || null);
      setResult(await trackServiceRequest(kode.trim(), email.trim()));
    } catch (err) { setError(err.message || "Data PO gagal dikirim."); }
    finally { setPoSaving(false); }
  };
  const acceptBaa = async () => { setBaaSaving(true); setError(""); try { await acceptPortalRegistrationBaa(kode.trim(), email.trim()); setResult(await trackServiceRequest(kode.trim(), email.trim())); } catch (err) { setError(err.message || "Konfirmasi BAA gagal."); } finally { setBaaSaving(false); } };
  return <main className="min-h-screen bg-[#0a0c12] px-4 py-10 text-white" style={{ backgroundImage: "linear-gradient(rgba(10,12,18,.86),rgba(10,12,18,.94)), url(/kima2.jpeg)", backgroundSize: "cover", backgroundPosition: "center" }}>
    <section className="mx-auto w-full max-w-lg rounded-2xl border border-white/15 bg-slate-950/80 p-6 shadow-2xl backdrop-blur-xl md:p-8">
      <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white"><ArrowLeft size={15} /> Kembali ke Sign In</button>
      <div className="mb-6 flex items-start gap-3"><div className="rounded-xl bg-sky-500/15 p-3"><ClipboardList className="text-sky-300" /></div><div><h1 className="text-xl font-black">Lacak Permohonan Layanan</h1><p className="mt-1 text-sm text-slate-400">Masukkan kode permohonan dan email PIC yang digunakan saat mengajukan.</p></div></div>
      <form onSubmit={submit} className="space-y-4"><label className="block text-sm font-medium text-slate-200">Kode Permohonan<input value={kode} onChange={(e) => setKode(e.target.value)} placeholder="REG-2026-001" required className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-900/80 p-3 text-white uppercase focus:border-sky-400 focus:outline-none" /></label><label className="block text-sm font-medium text-slate-200">Email PIC<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pic@perusahaan.com" required className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-900/80 p-3 text-white focus:border-sky-400 focus:outline-none" /></label><button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-sky-300 disabled:opacity-60">{loading && <Loader2 size={16} className="animate-spin" />} Lacak Status</button></form>
      {error && <p className="mt-5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      {result && <div className="mt-6 space-y-4 rounded-xl border border-sky-400/25 bg-sky-500/10 p-5"><div className="flex items-start gap-3"><MapPin className="mt-0.5 text-sky-300" size={18} /><div><p className="text-xs font-bold uppercase tracking-wider text-sky-200">{result.kode_registrasi}</p><p className="mt-1 font-semibold text-white">{result.lokasi_nama}</p></div></div><div className="border-t border-white/10 pt-4"><p className="text-xs text-slate-400">Status permohonan</p><p className="mt-1 font-bold text-white">{labels[result.status] || result.status}</p><div className="mt-4 rounded-xl border border-gold-accent/25 bg-gold-accent/10 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-gold-accent">Penanggung jawab tahap aktif</p><p className="mt-1 text-base font-black text-white">{getSop1Owner(result).label}</p><p className="mt-1 text-xs text-slate-200">{getSop1Owner(result).stage}</p><p className="mt-2 text-[11px] leading-5 text-white/55">Informasi ini menunjukkan pihak yang perlu melakukan tindakan berikutnya. Anda akan melihat perubahan setelah proses diperbarui.</p></div>{result.status === "disetujui" && <><p className="mt-4 text-xs text-slate-400">Tahap berjalan</p><p className="mt-1 font-bold text-sky-200">{surveyLabels[result.survey_status] || "Diproses KIMA"}</p>{result.survey_jadwal_at && <p className="mt-1 text-sm text-slate-200">Jadwal survei: {new Date(result.survey_jadwal_at.replace(" ", "T")).toLocaleString("id-ID")}</p>}</>}{result.status === "ditolak" && result.rejection_reason && <p className="mt-3 text-sm text-rose-200">Alasan: {result.rejection_reason}</p>}{result.status === "dibatalkan" && <p className="mt-3 text-sm text-rose-200">{result.cancellation_reason ? `Alasan: ${result.cancellation_reason}` : "Permohonan dibatalkan oleh pemohon."}{result.cancelled_at ? ` · ${new Date(result.cancelled_at.replace(" ", "T")).toLocaleString("id-ID")}` : ""}</p>}{result.status === "menunggu" && <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 p-4"><p className="text-xs leading-5 text-rose-100/80">Belum diproses KIMA? Anda masih dapat membatalkan permohonan ini.</p><button type="button" onClick={() => setCancelTarget(result)} className="mt-3 rounded-lg border border-rose-300/40 px-3 py-2 text-xs font-black text-rose-100 transition hover:bg-rose-400/20">Batalkan permohonan</button></div>}</div>{result.penawaran_status === "dikirim" && <form onSubmit={submitOfferResponse} className="space-y-3 border-t border-white/10 pt-4"><p className="font-bold text-gold-accent">Penawaran dari KIMA</p><p className="text-sm text-white">{result.penawaran_nomor} · Rp {Number(result.penawaran_nilai).toLocaleString("id-ID")}</p>{result.penawaran_catatan && <p className="text-sm text-slate-300">{result.penawaran_catatan}</p>}<select required value={offerDecision} onChange={e=>setOfferDecision(e.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-sm text-white"><option value="">Pilih respons penawaran</option><option value="setuju">Setuju</option><option value="negosiasi">Ajukan negosiasi</option><option value="tolak">Tolak</option></select>{offerDecision && offerDecision !== "setuju" && <textarea required value={offerNotes} onChange={e=>setOfferNotes(e.target.value)} rows={3} placeholder="Jelaskan kebutuhan negosiasi atau alasan penolakan." className="w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-sm text-white"/>}<button disabled={offerSaving} className="w-full rounded-lg bg-gold-accent px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60">{offerSaving ? "Mengirim..." : "Kirim Respons"}</button></form>}{["setuju", "negosiasi", "tolak"].includes(result.penawaran_status) && <div className="border-t border-white/10 pt-4"><p className="text-xs text-slate-400">Respons penawaran</p><p className="mt-1 font-bold text-white">{result.penawaran_status === "setuju" ? "Anda menyetujui penawaran" : result.penawaran_status === "negosiasi" ? "Negosiasi diajukan ke KIMA" : "Penawaran ditolak"}</p>{result.respons_pemohon_catatan && <p className="mt-1 text-sm text-slate-300">{result.respons_pemohon_catatan}</p>}</div>}</div>}
      {result?.penawaran_status === "setuju" && !result.po_nomor && <form onSubmit={submitPoData} className="mt-4 space-y-3 rounded-xl border border-gold-accent/30 bg-gold-accent/10 p-5"><p className="font-bold text-gold-accent">Tahap berikutnya: kirim PO</p><input required value={poNomor} onChange={(e) => setPoNomor(e.target.value)} placeholder="Nomor PO / permintaan penyambungan" className="w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-sm text-white"/><textarea value={poNotes} onChange={(e) => setPoNotes(e.target.value)} rows={3} placeholder="Catatan dan legalitas yang akan diserahkan" className="w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-sm text-white"/><button disabled={poSaving} className="w-full rounded-lg bg-gold-accent px-4 py-2.5 text-sm font-bold text-slate-950">{poSaving ? "Mengirim..." : "Kirim Data PO"}</button></form>}
      {result?.po_nomor && <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm"><p className="font-bold text-white">PO {result.po_nomor}</p><p className="mt-1 text-slate-300">Status legal: {result.legal_status}</p>{result.legal_catatan && <p className="mt-1 text-slate-300">{result.legal_catatan}</p>}{result.direksi_status === "setuju" && <p className="mt-2 font-bold text-emerald-300">Disetujui KIMA/DBO. Lanjut ke BAK/PKS.</p>}</div>}
      {["menunggu_tanda_tangan", "menunggu_tanda_tangan_pelanggan"].includes(result?.pks_status) && <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-5"><p className="font-bold text-emerald-200">BAK/PKS {result.pks_nomor}</p><p className="mt-1 text-sm leading-6 text-slate-300">KIMA sedang menyiapkan dokumen final. Pelanggan tidak perlu mengunggah ulang dokumen pada tahap ini.</p></div>}
      {["menunggu_verifikasi_dokumen_pelanggan", "menunggu_dokumen_final"].includes(result?.pks_status) && <div className="mt-4 rounded-xl border border-sky-400/30 bg-sky-500/10 p-4 text-sm text-sky-100">KIMA sedang menyesuaikan dokumen BAK/PKS ke format final. Pelanggan tidak perlu mengunggah ulang; pantau kembali setelah Admin KIMA menyimpan dokumen final.</div>}
      {result?.pks_status === "lengkap" && <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-200">BAK/PKS {result.pks_nomor} telah ditandatangani lengkap. Siap masuk tahap aktivasi.</div>}
      {result?.baa_status === "menunggu_verifikasi_dbo" && <div className="mt-4 rounded-xl border border-sky-400/30 bg-sky-500/10 p-5"><p className="font-bold text-sky-200">BAA {result.baa_nomor}</p><p className="mt-1 text-sm leading-6 text-slate-300">Teknisi telah mengunggah BAA. DBO KIMA sedang memeriksa dokumen sebelum mengirimkannya kepada pelanggan.</p></div>}
      {result?.baa_status === "menunggu_konfirmasi_lokasi" && <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-5"><p className="font-bold text-emerald-200">BAA {result.baa_nomor}</p><p className="mt-1 text-sm text-slate-300">Layanan telah aktif. Silakan konfirmasikan penerimaan BAA.</p><button type="button" disabled={baaSaving} onClick={acceptBaa} className="mt-3 w-full rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60">{baaSaving ? "Menyimpan..." : "Konfirmasi penerimaan BAA"}</button></div>}
      {result?.baa_status === "diterima_lokasi" && result.invoice_status === "dikirim" && <div className="mt-4 rounded-xl border border-gold-accent/30 bg-gold-accent/10 p-5"><p className="font-bold text-gold-accent">Invoice {result.invoice_nomor}</p><p className="mt-1 text-sm text-white">Rp {Number(result.invoice_nilai).toLocaleString("id-ID")}</p>{result.pembayaran_status === "menunggu_pembayaran" ? <p className="mt-3 text-sm leading-6 text-slate-200">Untuk keamanan arsip, unggah bukti pembayaran melalui <b>akun pelanggan</b>. Halaman lacak ini hanya menampilkan status.</p> : <p className="mt-3 text-sm font-bold text-emerald-300">{result.pembayaran_status === "terverifikasi" ? "Pembayaran telah diverifikasi KIMA. Proses layanan selesai." : result.pembayaran_status === "ditolak" ? "Pembayaran perlu diklarifikasi dengan KIMA." : "Bukti pembayaran telah dikirim ke KIMA."}</p>}</div>}
      <CancelRegistrationModal registration={cancelTarget} email={email.trim()} onClose={() => setCancelTarget(null)} onSuccess={async () => { setCancelTarget(null); setResult(await trackServiceRequest(kode.trim(), email.trim())); }} />
    </section>
  </main>;
}
