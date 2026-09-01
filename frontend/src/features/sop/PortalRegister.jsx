import { useEffect, useState } from 'react';
import { portalRegister } from '../../lib/rust-api';
import { SHARING_CORE_OPTIONS } from '../kontrak/coreUtils';

const DRAFT_KEY = "kima-portal-register-draft";

function loadDraft() {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraft(formData, step) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ formData, step }));
  } catch {
    // localStorage tidak tersedia (mode privat dsb) — draft tidak persisten, tidak fatal.
  }
}

function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // no-op
  }
}

const inputClass = "w-full px-3.5 py-2.5 text-xs rounded-xl bg-white/[0.06] border border-white/15 text-white placeholder-white/30 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-gold-accent/50 focus:border-gold-accent transition-all duration-200 shadow-inner";
const labelClass = "block text-[10px] font-extrabold uppercase tracking-wider text-slate-300 mb-1.5";
const primaryBtn = "inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-gold-accent/20 border border-gold-accent/40 text-gold-accent hover:bg-gold-accent/30 hover:border-gold-accent/70 hover:shadow-[0_0_16px_rgba(212,169,55,0.25)] transition-all duration-200 backdrop-blur-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const secondaryBtn = "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-white rounded-xl border border-transparent hover:border-white/10 hover:bg-white/5 transition-all duration-200 cursor-pointer";

const STEPS = [
  { num: 1, label: "Pemohon", desc: "Identitas lokasi/pemohon" },
  { num: 2, label: "PIC", desc: "Kontak penanggung jawab" },
  { num: 3, label: "Layanan", desc: "Titik pasang & kebutuhan" },
  { num: 4, label: "Konfirmasi", desc: "Verifikasi & pengajuan" },
];

const emptyForm = {
  nama_pemohon: '',

  // PIC
  pic_nama: '',
  pic_email: '',
  pic_telepon: '',
  pic_jabatan: '',

  // Lokasi
  lokasi_nama: '',
  lokasi_alamat: '',
  lokasi_kota: 'Makassar',
  lokasi_provinsi: 'Sulawesi Selatan',
  lokasi_kode_pos: '',
  core_dedicated: 0,
  sharing_core: 'Tidak',
};

const PortalRegister = ({ onDone, onBackToLogin }) => {
  const draft = loadDraft();
  const [step, setStep] = useState(draft?.step && draft.step >= 1 && draft.step <= 4 ? draft.step : 1);
  const [formData, setFormData] = useState({ ...emptyForm, ...(draft?.formData || {}) });

  useEffect(() => {
    saveDraft(formData, step);
  }, [formData, step]);

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [coreMode, setCoreMode] = useState(() =>
    formData.sharing_core && formData.sharing_core !== 'Tidak' ? 'sharing' : 'direct'
  );

  const handleCoreModeChange = (mode) => {
    setCoreMode(mode);
    if (mode === 'direct') {
      setFormData((prev) => ({ ...prev, sharing_core: 'Tidak', core_dedicated: Number(prev.core_dedicated) > 0 ? prev.core_dedicated : 1 }));
    } else {
      setFormData((prev) => ({ ...prev, core_dedicated: 0, sharing_core: SHARING_CORE_OPTIONS[0] }));
    }
  };

  const handleNext = () => {
    const newErrors = validateStep(step, formData);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setErrors({});
    setStep(step - 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setErrors({});

    try {
      const result = await portalRegister({
        ...formData,
        lokasi_kota: String(formData.lokasi_kota || '').trim() || 'Makassar',
        lokasi_provinsi: String(formData.lokasi_provinsi || '').trim() || 'Sulawesi Selatan',
        core_dedicated: formData.core_dedicated === '' ? 0 : Number(formData.core_dedicated),
      });
      clearDraft();
      onDone?.(result);
    } catch (error) {
      setErrors({ general: error?.message || 'Registrasi gagal. Silakan periksa kembali data Anda.' });
    } finally {
      setLoading(false);
    }
  };

  const validateStep = (currentStep, data) => {
    const errs = {};

    switch(currentStep) {
      case 1:
        if (!data.nama_pemohon.trim()) errs.nama_pemohon = 'Nama pemohon wajib diisi';
        break;
      case 2:
        if (!data.pic_nama.trim()) errs.pic_nama = 'Nama PIC wajib diisi';
        if (!data.pic_email.includes('@')) errs.pic_email = 'Format email PIC tidak valid';
        if (data.pic_telepon.length < 10) errs.pic_telepon = 'Nomor telepon PIC minimal 10 digit';
        break;
      case 3:
        if (!data.lokasi_nama.trim()) errs.lokasi_nama = 'Nama lokasi pemasangan wajib diisi';
        if (!data.lokasi_alamat.trim()) errs.lokasi_alamat = 'Alamat lengkap wajib diisi';
        if (data.sharing_core === 'Tidak' && (!Number.isInteger(Number(data.core_dedicated)) || Number(data.core_dedicated) < 1)) {
          errs.core_dedicated = 'Jumlah core dedicated minimal 1';
        } else if (Number(data.core_dedicated) < 0) {
          errs.core_dedicated = 'Jumlah core tidak boleh kurang dari 0';
        }
        break;
    }

    return errs;
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-x-hidden overflow-y-auto bg-[#0a0c12] font-['Inter'] text-white">
      {/* Background Layers matching Login screen aesthetic */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center"
        style={{
          backgroundImage: "url(/kima2.jpeg)",
          filter: "brightness(0.55) saturate(0.85) contrast(1.05)",
        }}
      />
      <div className="fixed inset-0 z-[1] bg-[#0a0c12]/80 pointer-events-none" />
      <div
        className="fixed inset-0 z-[2] pointer-events-none"
        style={{
          background: "radial-gradient(circle at 80% 15%, rgba(212,169,55,0.12) 0%, transparent 50%), radial-gradient(circle at 15% 85%, rgba(0,104,123,0.15) 0%, transparent 50%)",
        }}
      />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 py-8 md:py-12 flex-1 flex flex-col justify-center">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center gap-2 mb-3">
            <img alt="Logo PT KIMA" className="h-8 w-auto filter brightness-0 invert opacity-90 drop-shadow" src="/logo-kima.png" />
            <div className="h-4 w-[1px] bg-white/20 mx-1" />
            <span className="text-xs font-black tracking-widest text-gold-accent uppercase">Fiber Optic Portal</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            Permohonan Layanan <span className="text-gold-accent italic">Fiber Optic KIMA</span>
          </h1>
          <p className="text-slate-400 text-xs md:text-sm mt-1.5 max-w-lg mx-auto">
            Ajukan kebutuhan penyambungan FO untuk lokasi Anda. KIMA akan mengonfirmasi kebutuhan, melakukan survei jalur, lalu menetapkan ISP yang sesuai.
          </p>
        </div>

        {/* Stepper Card */}
        <div className="relative rounded-2xl glass-premium border border-white/15 p-4 md:p-6 mb-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
          {/* Stepper Navigation with Connected Step Lines */}
          <div className="relative pb-6 border-b border-white/10">
            {/* Background Track Line */}
            <div className="absolute top-4 left-[10%] right-[10%] h-[2px] bg-white/10 -translate-y-1/2 z-0 hidden sm:block" />
            {/* Active Progress Line */}
            <div
              className="absolute top-4 left-[10%] h-[2px] bg-gradient-to-r from-emerald-400 via-gold-accent to-gold-accent -translate-y-1/2 z-0 transition-all duration-500 hidden sm:block"
              style={{
                width: `${((step - 1) / (STEPS.length - 1)) * 80}%`,
              }}
            />

            <div className="grid grid-cols-4 gap-1 md:gap-3 relative z-10">
              {STEPS.map((s, idx) => {
                const isPassed = s.num < step;
                const isCurrent = s.num === step;
                return (
                  <div key={s.num} className="flex flex-col items-center text-center group">
                    <div className="flex items-center w-full justify-center relative mb-2">
                      {/* Mobile connector line segment */}
                      {idx > 0 && (
                        <div
                          className={`absolute right-1/2 top-1/2 -translate-y-1/2 w-full h-[2px] sm:hidden -z-10 ${
                            isPassed || isCurrent ? 'bg-emerald-500/60' : 'bg-white/10'
                          }`}
                        />
                      )}
                      <div
                        className={`w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center font-black text-xs transition-all duration-300 relative bg-[#0f141e] ${
                          isPassed
                            ? 'border border-emerald-500/60 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)] !bg-emerald-950/60'
                            : isCurrent
                            ? 'bg-gold-accent text-slate-950 font-extrabold shadow-[0_0_18px_rgba(212,169,55,0.6)] scale-110 ring-4 ring-gold-accent/20'
                            : 'border border-white/15 text-slate-400'
                        }`}
                      >
                        {isPassed ? '✓' : s.num}
                      </div>
                    </div>
                    <span className={`text-[10px] md:text-[11px] font-black uppercase tracking-wider transition-colors duration-200 truncate max-w-full ${
                      isCurrent ? 'text-gold-accent' : isPassed ? 'text-emerald-400' : 'text-slate-400'
                    }`}>
                      {s.label}
                    </span>
                    <span className="hidden md:block text-[9px] text-slate-400 truncate max-w-full mt-0.5">
                      {s.desc}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Form Content */}
          <div className="pt-6">
            {/* Step 1: Identitas pemohon minimal — legalitas diminta pada tahap SOP berikutnya. */}
            {step === 1 && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-4 bg-gold-accent rounded-full" />
                  <h2 className="text-sm font-black text-white uppercase tracking-wider">Langkah 1: Identitas Pemohon</h2>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className={labelClass}>Nama Pemohon / Perusahaan di Lokasi *</label>
                    <input
                      type="text"
                      value={formData.nama_pemohon}
                      onChange={(e) => setFormData({...formData, nama_pemohon: e.target.value})}
                      className={inputClass}
                      placeholder="Contoh: PT Nusantara atau nama pengelola lokasi"
                    />
                    {errors.nama_pemohon && <p className="text-rose-400 text-[11px] font-medium mt-1">⚠ {errors.nama_pemohon}</p>}
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400">Dokumen dan legalitas perusahaan belum diperlukan sekarang. KIMA akan memintanya bila pengajuan telah lanjut ke tahapan PO dan legal.</p>
                </div>

                <div className="flex items-center justify-between pt-6 mt-6 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => onBackToLogin?.()}
                    className={secondaryBtn}
                  >
                    ← Kembali ke Login
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className={primaryBtn}
                  >
                    Lanjut: Data PIC →
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Informasi PIC */}
            {step === 2 && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-4 bg-gold-accent rounded-full" />
                  <h2 className="text-sm font-black text-white uppercase tracking-wider">Langkah 2: Person In Charge (PIC)</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Nama Lengkap PIC *</label>
                    <input
                      type="text"
                      value={formData.pic_nama}
                      onChange={(e) => setFormData({...formData, pic_nama: e.target.value})}
                      className={inputClass}
                      placeholder="Nama lengkap penanggung jawab"
                    />
                    {errors.pic_nama && <p className="text-rose-400 text-[11px] font-medium mt-1">⚠ {errors.pic_nama}</p>}
                  </div>

                  <div>
                    <label className={labelClass}>Jabatan / Divisi</label>
                    <input
                      type="text"
                      value={formData.pic_jabatan}
                      onChange={(e) => setFormData({...formData, pic_jabatan: e.target.value})}
                      className={inputClass}
                      placeholder="Contoh: IT Network Manager"
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Email PIC *</label>
                    <input
                      type="email"
                      value={formData.pic_email}
                      onChange={(e) => setFormData({...formData, pic_email: e.target.value})}
                      className={inputClass}
                      placeholder="pic.name@perusahaan.co.id"
                    />
                    {errors.pic_email && <p className="text-rose-400 text-[11px] font-medium mt-1">⚠ {errors.pic_email}</p>}
                  </div>

                  <div>
                    <label className={labelClass}>Nomor WhatsApp / HP PIC *</label>
                    <input
                      type="tel"
                      value={formData.pic_telepon}
                      onChange={(e) => setFormData({...formData, pic_telepon: e.target.value})}
                      className={inputClass}
                      placeholder="0812XXXXXXXX"
                    />
                    {errors.pic_telepon && <p className="text-rose-400 text-[11px] font-medium mt-1">⚠ {errors.pic_telepon}</p>}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-6 mt-6 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleBack}
                    className={secondaryBtn}
                  >
                    ← Kembali
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className={primaryBtn}
                  >
                    Lanjut: Data Lokasi →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Informasi Lokasi & Layanan */}
            {step === 3 && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-4 bg-gold-accent rounded-full" />
                  <h2 className="text-sm font-black text-white uppercase tracking-wider">Langkah 3: Titik Pemasangan & Kebutuhan Layanan</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Nama Lokasi / Site *</label>
                    <input
                      type="text"
                      value={formData.lokasi_nama}
                      onChange={(e) => setFormData({...formData, lokasi_nama: e.target.value})}
                      className={inputClass}
                      placeholder="Contoh: Site Plant KIMA Kav. 12"
                    />
                    {errors.lokasi_nama && <p className="text-rose-400 text-[11px] font-medium mt-1">⚠ {errors.lokasi_nama}</p>}
                  </div>

                  <div>
                    <label className={labelClass}>Alamat Detail di Area KIMA *</label>
                    <textarea
                      value={formData.lokasi_alamat}
                      onChange={(e) => setFormData({...formData, lokasi_alamat: e.target.value})}
                      rows={2}
                      className={inputClass}
                      placeholder="Jl. KIMA Raya Kavling No. ..., Blok ..."
                    />
                    {errors.lokasi_alamat && <p className="text-rose-400 text-[11px] font-medium mt-1">⚠ {errors.lokasi_alamat}</p>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className={labelClass}>Kota</label>
                      <input
                        type="text"
                        value={formData.lokasi_kota || 'Makassar'}
                        onChange={(e) => setFormData({...formData, lokasi_kota: e.target.value})}
                        className={inputClass}
                        placeholder="Makassar"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Provinsi</label>
                      <input
                        type="text"
                        value={formData.lokasi_provinsi || 'Sulawesi Selatan'}
                        onChange={(e) => setFormData({...formData, lokasi_provinsi: e.target.value})}
                        className={inputClass}
                        placeholder="Sulawesi Selatan"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Kode Pos</label>
                      <input
                        type="text"
                        value={formData.lokasi_kode_pos}
                        onChange={(e) => setFormData({...formData, lokasi_kode_pos: e.target.value})}
                        className={inputClass}
                        placeholder="90241"
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-4">
                    <div>
                      <label className={labelClass}>Jenis Kebutuhan Core *</label>
                      <div className="grid grid-cols-2 gap-3 mt-1.5">
                        <button
                          type="button"
                          onClick={() => handleCoreModeChange('direct')}
                          className={`px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all duration-200 cursor-pointer ${
                            coreMode === 'direct'
                              ? 'bg-gold-accent/20 border-gold-accent/50 text-gold-accent'
                              : 'bg-white/[0.04] border-white/15 text-slate-300 hover:border-white/30'
                          }`}
                        >
                          Direct Core
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCoreModeChange('sharing')}
                          className={`px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all duration-200 cursor-pointer ${
                            coreMode === 'sharing'
                              ? 'bg-gold-accent/20 border-gold-accent/50 text-gold-accent'
                              : 'bg-white/[0.04] border-white/15 text-slate-300 hover:border-white/30'
                          }`}
                        >
                          Sharing Core
                        </button>
                      </div>
                    </div>

                    {coreMode === 'direct' ? (
                      <div>
                        <label className={labelClass}>Jumlah Core Dedicated</label>
                        <input
                          type="number"
                          min="1"
                          value={formData.core_dedicated}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => setFormData({...formData, core_dedicated: e.target.value})}
                          className={inputClass}
                        />
                        {errors.core_dedicated && <p className="text-rose-400 text-[11px] font-medium mt-1">⚠ {errors.core_dedicated}</p>}
                      </div>
                    ) : (
                      <div>
                        <label className={labelClass}>Pilih Rasio Sharing Core</label>
                        <select
                          value={formData.sharing_core}
                          onChange={(e) => setFormData({...formData, sharing_core: e.target.value})}
                          className={inputClass}
                        >
                          {SHARING_CORE_OPTIONS.map((share) => (
                            <option key={share} value={share} className="bg-[#0f141e] text-white">{share}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-6 mt-6 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleBack}
                    className={secondaryBtn}
                  >
                    ← Kembali
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className={primaryBtn}
                  >
                    Lanjut: Review Data →
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Review & Submit */}
            {step === 4 && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-4 bg-gold-accent rounded-full" />
                  <h2 className="text-sm font-black text-white uppercase tracking-wider">Langkah 4: Konfirmasi & Kirim Permohonan</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10">
                    <span className="text-[9px] font-black uppercase tracking-wider text-gold-accent block mb-1">Pemohon</span>
                    <p className="text-xs font-bold text-white truncate">{formData.nama_pemohon}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Legalitas diminta pada tahap berikutnya</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10">
                    <span className="text-[9px] font-black uppercase tracking-wider text-gold-accent block mb-1">PIC Terdaftar</span>
                    <p className="text-xs font-bold text-white truncate">{formData.pic_nama}</p>
                    <p className="text-[11px] text-slate-300 mt-0.5 truncate">{formData.pic_jabatan || 'Penanggung Jawab'}</p>
                    <p className="text-[11px] text-slate-400">{formData.pic_telepon}</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10">
                    <span className="text-[9px] font-black uppercase tracking-wider text-gold-accent block mb-1">Titik Awal</span>
                    <p className="text-xs font-bold text-white truncate">{formData.lokasi_nama}</p>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      {formData.sharing_core && formData.sharing_core !== 'Tidak'
                        ? `Sharing Core ${formData.sharing_core}`
                        : `${formData.core_dedicated} Core (Dedicated)`}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">{formData.lokasi_kota || 'Makassar'}</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-3 mt-4">
                  <span className="text-emerald-400 text-lg leading-none">✓</span>
                  <div className="text-xs text-slate-200">
                    <p className="font-bold text-emerald-300 mb-0.5">Proses Peninjauan Permohonan</p>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Dengan menekan tombol kirim, data lokasi dan kebutuhan layanan diteruskan ke Tim KIMA untuk ditinjau. KIMA akan menghubungi PIC untuk konfirmasi kebutuhan dan penjadwalan survei jalur. ISP belum dipilih pada tahap ini.
                    </p>
                  </div>
                </div>

                {errors.general && (
                  <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium">
                    ⚠ {errors.general}
                  </div>
                )}

                <div className="flex items-center justify-between pt-6 mt-6 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleBack}
                    className={secondaryBtn}
                  >
                    ← Koreksi Data
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-500/25 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/40 hover:border-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all duration-200 backdrop-blur-md cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                        Memproses Permohonan...
                      </>
                    ) : (
                      'Kirim Permohonan Layanan ✓'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            © 2026 PT Kawasan Industri Makassar • Sistem Informasi Fiber Optic
          </p>
        </div>
      </div>
    </div>
  );
};

export default PortalRegister;
