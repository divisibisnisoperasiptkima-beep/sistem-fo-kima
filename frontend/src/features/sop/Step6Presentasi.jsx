import { useState } from 'react';
import { getSession, submitStep } from '../../lib/rust-api';

const inputClass = "w-full px-3 py-2 text-sm rounded-xl bg-white/5 border border-white/15 text-white placeholder-white/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-gold-accent/50 focus:border-gold-accent/50 transition-all";
const labelClass = "block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5";

const Step6Presentasi = ({ workflowId, workflow, userRole, onDone, onBack }) => {
  const [formData, setFormData] = useState({
    tanggal_presentasi: '',
    metode_presentasi: 'online', // 'online', 'offline', 'hybrid'
    peserta_presentasi: '',
    hasil_presentasi: '',
    keputusan_pelanggan: 'setuju', // 'setuju', 'negosiasi', 'tolak'
    alasan_negosiasi: '',
    permintaan_revisi: '',
    notulen_file_id: null,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notulenFile, setNotulenFile] = useState(null);

  // User role: 'dbo' (presenter) atau 'customer' (decision maker)
  const isDBO = userRole === 'dbo' || userRole === 'admin';
  const isCustomer = userRole === 'pelanggan' || userRole === 'isp';

  // Integrasi upload Google Drive nyata belum tersedia (lihat known issues).
  // Sementara notulen menghasilkan placeholder drive_file_id lokal.
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setNotulenFile(file);
      setFormData({ ...formData, notulen_file_id: `local-notulen-${Math.random().toString(36).slice(2, 10)}` });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isCustomer && formData.keputusan_pelanggan === 'negosiasi' && !formData.permintaan_revisi.trim()) {
      setError('Jelaskan apa yang perlu direvisi.');
      return;
    }
    if (isCustomer && formData.keputusan_pelanggan === 'tolak' && !formData.alasan_negosiasi.trim()) {
      setError('Alasan penolakan wajib diisi.');
      return;
    }

    const session = getSession();
    if (!session?.token) {
      setError('Sesi tidak valid. Silakan login ulang.');
      return;
    }

    setLoading(true);
    try {
      await submitStep(session.token, workflowId, 6, formData);
      onDone?.(formData.keputusan_pelanggan);
    } catch (err) {
      setError(err?.message || 'Gagal mengirim presentasi.');
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () => {
    const baseValid = formData.tanggal_presentasi &&
                      formData.hasil_presentasi.trim();

    if (isCustomer) {
      // Customer juga harus pilih keputusan
      return baseValid && formData.keputusan_pelanggan;
    }

    return baseValid;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl glass-card p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="h-[2px] w-8 bg-gold-accent" />
            <p className="text-[10px] font-black text-gold-accent uppercase tracking-[0.4em]">SOP Step 6</p>
          </div>
          <h2 className="text-2xl font-black text-white">Presentasi <span className="text-gold-accent italic">Proposal</span></h2>
          <p className="text-sm text-slate-400 mt-1">
            Workflow: {workflow?.nama_lokasi || `#${workflowId}`}
            {workflow?.kode_lokasi ? ` | Kode: ${workflow.kode_lokasi}` : ''}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Info Presentasi */}
          <div className="border-b border-white/10 pb-6">
            <h3 className="text-sm font-black text-white uppercase tracking-wider mb-4">
              {isDBO ? '📊 Detail Presentasi' : '📋 Ringkasan Presentasi'}
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Tanggal Presentasi *</label>
                <input
                  type="date"
                  value={formData.tanggal_presentasi}
                  onChange={(e) => setFormData({ ...formData, tanggal_presentasi: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Metode Presentasi *</label>
                <select
                  value={formData.metode_presentasi}
                  onChange={(e) => setFormData({ ...formData, metode_presentasi: e.target.value })}
                  className={inputClass}
                >
                  <option value="online" className="bg-slate-900">Online (Zoom/Meet/Teams)</option>
                  <option value="offline" className="bg-slate-900">Offline (Tatap Muka)</option>
                  <option value="hybrid" className="bg-slate-900">Hybrid (Kombinasi)</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className={labelClass}>Peserta Presentasi</label>
                <textarea
                  value={formData.peserta_presentasi}
                  onChange={(e) => setFormData({ ...formData, peserta_presentasi: e.target.value })}
                  rows={2}
                  placeholder="Daftar nama peserta dari kedua belah pihak..."
                  className={inputClass}
                />
              </div>

              <div className="col-span-2">
                <label className={labelClass}>Hasil Presentasi / Ringkasan Diskusi *</label>
                <textarea
                  value={formData.hasil_presentasi}
                  onChange={(e) => setFormData({ ...formData, hasil_presentasi: e.target.value })}
                  rows={4}
                  placeholder="Jelaskan poin-poin penting yang dibahas, feedback dari customer, dan kesimpulan diskusi..."
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Keputusan Pelanggan (Only visible to customer) */}
          {isCustomer && (
            <div className="border-b border-white/10 pb-6">
              <h3 className="text-sm font-black text-white uppercase tracking-wider mb-4">🤝 Keputusan Anda</h3>

              <div className="space-y-3 mb-4">
                <label className="flex items-start space-x-3 cursor-pointer p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors">
                  <input
                    type="radio"
                    name="keputusan"
                    value="setuju"
                    checked={formData.keputusan_pelanggan === 'setuju'}
                    onChange={(e) => setFormData({ ...formData, keputusan_pelanggan: e.target.value })}
                    className="mt-1 w-5 h-5 accent-emerald-500"
                  />
                  <div className="flex-1">
                    <span className="font-bold text-sm text-emerald-400">✅ Setuju</span>
                    <p className="text-sm text-slate-400">Terima proposal dan lanjut ke tahap selanjutnya (Upload PO & Dokumen Legalitas)</p>
                  </div>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-colors">
                  <input
                    type="radio"
                    name="keputusan"
                    value="negosiasi"
                    checked={formData.keputusan_pelanggan === 'negosiasi'}
                    onChange={(e) => setFormData({ ...formData, keputusan_pelanggan: e.target.value })}
                    className="mt-1 w-5 h-5 accent-amber-500"
                  />
                  <div className="flex-1">
                    <span className="font-bold text-sm text-amber-400">💬 Negosiasi</span>
                    <p className="text-sm text-slate-400">Perlu revisi proposal (harga, terms, atau fitur layanan)</p>
                  </div>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 transition-colors">
                  <input
                    type="radio"
                    name="keputusan"
                    value="tolak"
                    checked={formData.keputusan_pelanggan === 'tolak'}
                    onChange={(e) => setFormData({ ...formData, keputusan_pelanggan: e.target.value })}
                    className="mt-1 w-5 h-5 accent-rose-500"
                  />
                  <div className="flex-1">
                    <span className="font-bold text-sm text-rose-400">❌ Tolak</span>
                    <p className="text-sm text-slate-400">Batalkan permohonan (workflow berhenti)</p>
                  </div>
                </label>
              </div>

              {formData.keputusan_pelanggan === 'negosiasi' && (
                <div>
                  <label className={labelClass}>Apa yang perlu direvisi? *</label>
                  <textarea
                    value={formData.permintaan_revisi}
                    onChange={(e) => setFormData({ ...formData, permintaan_revisi: e.target.value })}
                    rows={3}
                    placeholder="Jelaskan apa yang perlu direvisi dalam proposal (misal: harga terlalu tinggi, durasi kontrak terlalu pendek, dll)..."
                    className={inputClass}
                  />
                </div>
              )}

              {formData.keputusan_pelanggan === 'tolak' && (
                <div>
                  <label className={labelClass}>Alasan Penolakan *</label>
                  <textarea
                    value={formData.alasan_negosiasi}
                    onChange={(e) => setFormData({ ...formData, alasan_negosiasi: e.target.value })}
                    rows={3}
                    placeholder="Jelaskan alasan penolakan untuk dokumentasi..."
                    className={inputClass}
                  />
                </div>
              )}
            </div>
          )}

          {/* Upload Notulen */}
          <div className="border-b border-white/10 pb-6">
            <label className={labelClass}>Upload Notulen Meeting (PDF/Image)</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange}
              className={inputClass}
            />
            {notulenFile && (
              <p className="text-xs text-emerald-400 mt-1">✓ File ter-upload: {notulenFile.name}</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4 pt-4 border-t border-white/10">
            <button
              type="submit"
              disabled={loading || !isFormValid()}
              className={`flex-1 py-3 px-6 rounded-xl text-xs font-black uppercase tracking-wider transition-all backdrop-blur-md ${
                loading || !isFormValid()
                  ? 'bg-white/5 border border-white/10 text-slate-500 cursor-not-allowed'
                  : isDBO
                  ? 'bg-gold-accent/20 border border-gold-accent/40 text-gold-accent hover:bg-gold-accent/30'
                  : formData.keputusan_pelanggan === 'setuju'
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
                  : formData.keputusan_pelanggan === 'negosiasi'
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30'
                  : 'bg-rose-500/20 border border-rose-500/40 text-rose-400 hover:bg-rose-500/30'
              }`}
            >
              {loading ? 'Menyimpan...' : 'Submit Presentasi'}
            </button>
            <button
              type="button"
              onClick={() => onBack?.()}
              className="px-6 py-3 text-xs font-bold text-slate-400 hover:text-white border border-white/15 rounded-xl transition-colors"
            >
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Step6Presentasi;
