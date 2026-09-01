import { useState } from 'react';
import { submitAdditionalLocation } from '../../lib/rust-api';
import { SHARING_CORE_OPTIONS } from '../kontrak/coreUtils';

const inputClass = "w-full px-3.5 py-2.5 text-xs rounded-xl bg-white/[0.06] border border-white/15 text-white placeholder-white/30 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-gold-accent/50 focus:border-gold-accent transition-all duration-200 shadow-inner";
const labelClass = "block text-[10px] font-extrabold uppercase tracking-wider text-slate-300 mb-1.5";
const primaryBtn = "inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-gold-accent/20 border border-gold-accent/40 text-gold-accent hover:bg-gold-accent/30 hover:border-gold-accent/70 hover:shadow-[0_0_16px_rgba(212,169,55,0.25)] transition-all duration-200 backdrop-blur-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const secondaryBtn = "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-white rounded-xl border border-transparent hover:border-white/10 hover:bg-white/5 transition-all duration-200 cursor-pointer";

const STEPS = [
  { num: 1, label: "Layanan", desc: "Titik pasang & core" },
  { num: 2, label: "Konfirmasi", desc: "Verifikasi & pengajuan" },
];

const DRAFT_KEY = "kima-add-location-draft";

const emptyForm = {
  lokasi_nama: '',
  lokasi_alamat: '',
  lokasi_kota: 'Makassar',
  lokasi_provinsi: 'Sulawesi Selatan',
  lokasi_kode_pos: '',
  core_dedicated: 0,
  sharing_core: 'Tidak',
};

function loadDraft() {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return { formData: emptyForm, step: 1 };
    const parsed = JSON.parse(raw);
    return {
      formData: { ...emptyForm, ...(parsed.formData || {}) },
      step: parsed.step === 2 ? 2 : 1,
    };
  } catch {
    return { formData: emptyForm, step: 1 };
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

const PortalAddLocation = ({ session, onDone, onBack }) => {
  const initial = loadDraft();
  const [step, setStep] = useState(initial.step);
  const [formData, setFormData] = useState(initial.formData);

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [coreMode, setCoreMode] = useState(() =>
    initial.formData.sharing_core && initial.formData.sharing_core !== 'Tidak' ? 'sharing' : 'direct'
  );

  const updateForm = (patch) => {
    const next = { ...formData, ...patch };
    setFormData(next);
    saveDraft(next, step);
  };

  const handleCoreModeChange = (mode) => {
    setCoreMode(mode);
    if (mode === 'direct') {
      updateForm({ sharing_core: 'Tidak', core_dedicated: Number(formData.core_dedicated) > 0 ? formData.core_dedicated : 1 });
    } else {
      updateForm({ core_dedicated: 0, sharing_core: SHARING_CORE_OPTIONS[0] });
    }
  };

  const validateStep1 = (data) => {
    const errs = {};
    if (!data.lokasi_nama.trim()) errs.lokasi_nama = 'Nama lokasi pemasangan wajib diisi';
    if (!data.lokasi_alamat.trim()) errs.lokasi_alamat = 'Alamat lengkap wajib diisi';
    if (data.sharing_core === 'Tidak' && (!Number.isInteger(Number(data.core_dedicated)) || Number(data.core_dedicated) < 1)) {
      errs.core_dedicated = 'Jumlah core dedicated minimal 1';
    } else if (Number(data.core_dedicated) < 0) {
      errs.core_dedicated = 'Jumlah core tidak boleh kurang dari 0';
    }
    return errs;
  };

  const handleNext = () => {
    const newErrors = validateStep1(formData);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setStep(2);
    saveDraft(formData, 2);
  };

  const handleBack = () => {
    setErrors({});
    setStep(1);
    saveDraft(formData, 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setErrors({});

    try {
      const result = await submitAdditionalLocation(session.token, {
        ...formData,
        core_dedicated: formData.core_dedicated === '' ? 0 : Number(formData.core_dedicated),
      });
      clearDraft();
      onDone?.(result);
    } catch (error) {
      setErrors({ general: error?.message || 'Pengajuan gagal. Silakan periksa kembali data Anda.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-x-hidden overflow-y-auto bg-[#0a0c12] font-['Inter'] text-white">
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

      <div className="relative z-10 w-full max-w-3xl mx-auto px-4 py-8 md:py-12 flex-1 flex flex-col justify-center">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center gap-2 mb-3">
            <img alt="Logo PT KIMA" className="h-8 w-auto filter brightness-0 invert opacity-90 drop-shadow" src="/logo-kima.png" />
            <div className="h-4 w-[1px] bg-white/20 mx-1" />
            <span className="text-xs font-black tracking-widest text-gold-accent uppercase">Fiber Optic Portal</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            Ajukan Titik <span className="text-gold-accent italic">Pemasangan Baru</span>
          </h1>
          <p className="text-slate-400 text-xs md:text-sm mt-1.5 max-w-lg mx-auto">
            Data perusahaan Anda sudah tersimpan pada sistem. Cukup lengkapi data lokasi dan kebutuhan layanan untuk titik pemasangan baru.
          </p>
        </div>

        <div className="relative rounded-2xl glass-premium border border-white/15 p-4 md:p-6 mb-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
          <div className="relative pb-6 border-b border-white/10">
            <div className="absolute top-4 left-[20%] right-[20%] h-[2px] bg-white/10 -translate-y-1/2 z-0 hidden sm:block" />
            <div
              className="absolute top-4 left-[20%] h-[2px] bg-gradient-to-r from-emerald-400 via-gold-accent to-gold-accent -translate-y-1/2 z-0 transition-all duration-500 hidden sm:block"
              style={{ width: `${((step - 1) / (STEPS.length - 1)) * 60}%` }}
            />
            <div className="grid grid-cols-2 gap-1 md:gap-3 relative z-10">
              {STEPS.map((s, idx) => {
                const isPassed = s.num < step;
                const isCurrent = s.num === step;
                return (
                  <div key={s.num} className="flex flex-col items-center text-center group">
                    <div className="flex items-center w-full justify-center relative mb-2">
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

          <div className="pt-6">
            {step === 1 && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-4 bg-gold-accent rounded-full" />
                  <h2 className="text-sm font-black text-white uppercase tracking-wider">Langkah 1: Titik Pemasangan & Kebutuhan Layanan</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Nama Lokasi / Site *</label>
                    <input
                      type="text"
                      value={formData.lokasi_nama}
                      onChange={(e) => updateForm({ lokasi_nama: e.target.value })}
                      className={inputClass}
                      placeholder="Contoh: Site Plant KIMA Kav. 12"
                    />
                    {errors.lokasi_nama && <p className="text-rose-400 text-[11px] font-medium mt-1">⚠ {errors.lokasi_nama}</p>}
                  </div>

                  <div>
                    <label className={labelClass}>Alamat Detail di Area KIMA *</label>
                    <textarea
                      value={formData.lokasi_alamat}
                      onChange={(e) => updateForm({ lokasi_alamat: e.target.value })}
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
                        value={formData.lokasi_kota}
                        onChange={(e) => updateForm({ lokasi_kota: e.target.value })}
                        className={inputClass}
                        placeholder="Makassar"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Provinsi</label>
                      <input
                        type="text"
                        value={formData.lokasi_provinsi}
                        onChange={(e) => updateForm({ lokasi_provinsi: e.target.value })}
                        className={inputClass}
                        placeholder="Sulawesi Selatan"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Kode Pos</label>
                      <input
                        type="text"
                        value={formData.lokasi_kode_pos}
                        onChange={(e) => updateForm({ lokasi_kode_pos: e.target.value })}
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
                          onChange={(e) => updateForm({ core_dedicated: e.target.value })}
                          className={inputClass}
                        />
                        {errors.core_dedicated && <p className="text-rose-400 text-[11px] font-medium mt-1">⚠ {errors.core_dedicated}</p>}
                      </div>
                    ) : (
                      <div>
                        <label className={labelClass}>Pilih Rasio Sharing Core</label>
                        <select
                          value={formData.sharing_core}
                          onChange={(e) => updateForm({ sharing_core: e.target.value })}
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
                  <button type="button" onClick={() => onBack?.()} className={secondaryBtn}>
                    ← Kembali ke Portal
                  </button>
                  <button type="button" onClick={handleNext} className={primaryBtn}>
                    Lanjut: Review Data →
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-4 bg-gold-accent rounded-full" />
                  <h2 className="text-sm font-black text-white uppercase tracking-wider">Langkah 2: Konfirmasi & Kirim Pengajuan</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10">
                    <span className="text-[9px] font-black uppercase tracking-wider text-gold-accent block mb-1">Titik Baru</span>
                    <p className="text-xs font-bold text-white truncate">{formData.lokasi_nama}</p>
                    <p className="text-[11px] text-slate-300 mt-0.5 truncate">{formData.lokasi_alamat}</p>
                    <p className="text-[11px] text-slate-400">{formData.lokasi_kota}, {formData.lokasi_provinsi}</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10">
                    <span className="text-[9px] font-black uppercase tracking-wider text-gold-accent block mb-1">Kebutuhan Layanan</span>
                    <p className="text-xs font-bold text-white">
                      {formData.sharing_core && formData.sharing_core !== 'Tidak'
                        ? `Sharing Core ${formData.sharing_core}`
                        : `${formData.core_dedicated} Core (Dedicated)`}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-3 mt-4">
                  <span className="text-emerald-400 text-lg leading-none">✓</span>
                  <div className="text-xs text-slate-200">
                    <p className="font-bold text-emerald-300 mb-0.5">Langsung Masuk Alur SOP</p>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Karena data perusahaan Anda sudah terdaftar, pengajuan titik baru ini langsung diproses ke alur SOP tanpa perlu persetujuan pendaftaran ulang.
                    </p>
                  </div>
                </div>

                {errors.general && (
                  <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium">
                    ⚠ {errors.general}
                  </div>
                )}

                <div className="flex items-center justify-between pt-6 mt-6 border-t border-white/10">
                  <button type="button" onClick={handleBack} className={secondaryBtn}>
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
                        Memproses Pengajuan...
                      </>
                    ) : (
                      'Kirim Pengajuan Titik Baru ✓'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            © 2026 PT Kawasan Industri Makassar • Sistem Informasi Fiber Optic
          </p>
        </div>
      </div>
    </div>
  );
};

export default PortalAddLocation;
