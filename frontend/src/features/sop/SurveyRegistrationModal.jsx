import { useEffect, useState } from "react";
import { CalendarDays, ClipboardCheck, Loader2, MapPinned, X } from "lucide-react";
import { deleteDocument, getPortalRegistration, listIspCandidates, updatePortalRegistrationSurvey, uploadDocument } from "../../lib/rust-api";

const emptyForm = {
  survey_status: "belum_dijadwalkan",
  survey_jadwal_at: "",
  survey_hasil: "",
  isp_id: "",
};

export default function SurveyRegistrationModal({ isOpen, registration, session, onClose, onSuccess }) {
  const isTechnician = session.user?.role === "teknisi";
  const [detail, setDetail] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [surveyFile, setSurveyFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    if (!isOpen || !registration) return undefined;
    let cancelled = false;
    setLoading(true); setError("");
    setSurveyFile(null); setUploadProgress(0);
    Promise.all([getPortalRegistration(session.token, registration.id), listIspCandidates(session.token)])
      .then(([data, isps]) => {
        if (cancelled) return;
        setDetail(data); setCandidates(isps);
        setForm({
          survey_status: isTechnician && data.survey_status === "belum_dijadwalkan" ? "terjadwal" : (data.survey_status || "belum_dijadwalkan"),
          survey_jadwal_at: data.survey_jadwal_at ? data.survey_jadwal_at.slice(0, 16).replace(" ", "T") : "",
          survey_hasil: data.survey_hasil || "",
          isp_id: data.isp_directory_id ? String(data.isp_directory_id) : "",
        });
      })
      .catch((err) => !cancelled && setError(err.message || "Gagal memuat data permohonan."))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [isOpen, registration, session.token, isTechnician]);

  if (!isOpen || !registration) return null;
  const close = () => { if (!saving) onClose(); };
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const canComplete = isTechnician && detail?.survey_status === "terjadwal";
  const isNewSchedule = detail?.survey_status === "belum_dijadwalkan" && form.survey_status === "terjadwal";
  const isCompleting = detail?.survey_status === "terjadwal" && form.survey_status === "selesai";
  const actionLabel = isCompleting ? "Konfirmasi hasil survei" : isNewSchedule ? "Konfirmasi & simpan jadwal" : "Perbarui jadwal survei";
  const save = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    let uploadedDocumentId = null;
    try {
      if (isCompleting) {
        if (!surveyFile) throw new Error("Dokumen hasil survei wajib diunggah.");
        const formData = new FormData();
        formData.append("file", surveyFile);
        formData.append("kategori", "Dokumen Survey");
        // Folder final ditentukan oleh ISP yang dipilih KIMA dan permohonan
        // ini, bukan oleh folder pelanggan legacy.
        formData.append("portal_registration_id", String(registration.id));
        formData.append("isp_directory_id", String(form.isp_id));
        const uploaded = await uploadDocument(session.token, formData, setUploadProgress);
        uploadedDocumentId = uploaded?.id;
        if (!uploadedDocumentId) throw new Error("Dokumen survei berhasil diunggah tetapi belum memiliki ID.");
      }
      await updatePortalRegistrationSurvey(session.token, registration.id, {
        survey_status: form.survey_status,
        survey_jadwal_at: form.survey_jadwal_at || null,
        survey_hasil: form.survey_hasil || null,
        survey_dokumen_id: uploadedDocumentId,
        isp_id: form.isp_id ? Number(form.isp_id) : null,
      });
      onSuccess?.(); onClose();
    } catch (err) {
      if (uploadedDocumentId) await deleteDocument(session.token, uploadedDocumentId).catch(() => {});
      setError(err.message || "Gagal menyimpan tahap survei.");
    }
    finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />
    <form onSubmit={save} className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-slate-900/95 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-3"><div className="rounded-lg bg-sky-500/15 p-2"><MapPinned className="text-sky-300" size={20} /></div><div><h2 className="font-semibold text-white">Tahap 2: Penjadwalan & Survei Jalur</h2><p className="text-xs text-slate-400">{registration.kode_registrasi}</p></div></div>
        <button type="button" onClick={close} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X size={20} /></button>
      </header>
      {loading ? <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gold-accent" /></div> : <div className="space-y-5 p-6">
        {detail && <div className="grid gap-3 rounded-xl border border-white/10 bg-black/15 p-4 text-sm md:grid-cols-2"><div><p className="text-xs text-slate-400">Lokasi</p><p className="font-medium text-white">{detail.lokasi_nama}</p><p className="text-xs text-slate-300">{detail.lokasi_alamat}</p></div><div><p className="text-xs text-slate-400">PIC lokasi</p><p className="font-medium text-white">{detail.pic_nama}</p><p className="text-xs text-slate-300">{detail.pic_email} · {detail.pic_telepon}</p></div></div>}
        <div className="rounded-lg border border-sky-400/15 bg-sky-400/5 p-3 text-xs leading-5 text-sky-100/75">Teknisi menentukan tanggal dan waktu survei sesuai ketersediaan tim lapangan. Klik <b>{isCompleting ? "Konfirmasi hasil survei" : "Konfirmasi & simpan jadwal"}</b> untuk meneruskan status kepada Admin KIMA dan pelanggan. Setelah kunjungan selesai, teknisi mengisi hasil survei dan menetapkan ISP yang dipilih KIMA.</div>
        <div className="grid gap-4 md:grid-cols-2"><label className="block text-sm text-slate-200">Status survei<select value={form.survey_status} onChange={(e) => set("survey_status", e.target.value)} disabled={!isTechnician} className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-950/50 p-3 text-sm text-white disabled:opacity-70"><option value="belum_dijadwalkan">Belum dijadwalkan</option><option value="terjadwal">Terjadwal</option>{canComplete && <option value="selesai">Selesai</option>}</select></label><label className="block text-sm text-slate-200">Jadwal survei {form.survey_status === "terjadwal" && "*"}<input type="datetime-local" required={form.survey_status === "terjadwal"} step="60" value={form.survey_jadwal_at} onChange={(e) => set("survey_jadwal_at", e.currentTarget.value)} onInput={(e) => set("survey_jadwal_at", e.currentTarget.value)} disabled={!isTechnician} className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-950/50 p-3 text-sm text-white disabled:opacity-70" /></label></div>
        {form.survey_status === "selesai" && <><label className="block text-sm text-slate-200">Hasil survei jalur *<textarea required value={form.survey_hasil} onChange={(e) => set("survey_hasil", e.target.value)} rows={3} placeholder="Ketersediaan jalur, catatan teknis, pekerjaan yang diperlukan." className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-950/50 p-3 text-sm text-white focus:border-sky-400 focus:outline-none" /></label><label className="block text-sm text-slate-200">Dokumentasi survei *<span className="mt-1.5 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-sky-300/35 bg-slate-950/50 p-3 text-xs text-slate-300"><span className="min-w-0 flex-1 truncate">{surveyFile?.name || "Pilih peta jalur, foto, atau laporan survei"}</span><span className="shrink-0 font-black text-sky-200">Pilih</span><input required type="file" accept=".pdf,image/*" onChange={(e) => { setSurveyFile(e.target.files?.[0] || null); setUploadProgress(0); }} className="sr-only" /></span>{saving && uploadProgress > 0 && <span className="mt-1 block text-[11px] text-slate-400">Mengunggah dokumentasi… {uploadProgress}%</span>}</label><label className="block text-sm text-slate-200">ISP yang ditetapkan KIMA *<select required value={form.isp_id} onChange={(e) => set("isp_id", e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-950/50 p-3 text-sm text-white"><option value="">Pilih ISP setelah jalur ditentukan</option>{candidates.map((isp) => <option key={isp.id} value={isp.id}>{isp.nama_isp}{isp.email ? ` · ${isp.email}` : ""}</option>)}</select>{!candidates.length && <p className="mt-1 text-xs text-amber-300">Belum ada ISP aktif. Tambahkan melalui menu Daftar ISP terlebih dahulu.</p>}<p className="mt-1 text-xs text-slate-400">ISP dipilih dari master data KIMA dan tidak harus sudah memiliki akun login.</p></label></>}
        {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-white/10 pt-5"><button type="button" onClick={close} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/10">Batal</button><button disabled={!isTechnician || saving} className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60">{saving ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />} {actionLabel}</button></div>
      </div>}
    </form>
  </div>;
}
