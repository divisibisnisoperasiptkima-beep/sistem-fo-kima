import { useState } from 'react';
import { getSession, submitStep } from '../../lib/rust-api';

// Catatan: integrasi upload Google Drive nyata belum tersedia (lihat known issues).
// Sementara foto menghasilkan placeholder drive_file_id lokal agar alur Step 4
// tetap dapat diuji end-to-end. Ganti generator ini saat upload Drive aktif.
const makePlaceholderDriveId = (type) =>
  `local-${type}-${Math.random().toString(36).slice(2, 10)}`;

const inputClass = "w-full px-3 py-2 text-sm rounded-xl bg-white/5 border border-white/15 text-white placeholder-white/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-gold-accent/50 focus:border-gold-accent/50 transition-all";
const labelClass = "block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5";

const Step4Survey = ({ workflowId, workflow, onDone, onBack }) => {
  const [formData, setFormData] = useState({
    hasil_survey: '',
    foto_lokasi: [],
    foto_jalur: [],
    koordinat_lat: null,
    koordinat_lng: null,
    kesiapan_jalur: 'ready',
    catatan_teknis: '',
    rekomendasi_jalur: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addPhotos = (fileList, type) => {
    const ids = Array.from(fileList).map(() =>
      makePlaceholderDriveId(type === 'location' ? 'lokasi' : 'jalur'),
    );
    setFormData((prev) =>
      type === 'location'
        ? { ...prev, foto_lokasi: [...prev.foto_lokasi, ...ids] }
        : { ...prev, foto_jalur: [...prev.foto_jalur, ...ids] },
    );
  };

  const handleGeoLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation tidak didukung browser ini.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData((prev) => ({
          ...prev,
          koordinat_lat: position.coords.latitude,
          koordinat_lng: position.coords.longitude,
        }));
      },
      () => setError('Gagal mengambil lokasi. Silakan masukkan manual.'),
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.foto_lokasi.length === 0 && formData.foto_jalur.length === 0) {
      setError('Minimal satu foto harus dipilih (foto lokasi atau jalur).');
      return;
    }
    if (!formData.hasil_survey.trim()) {
      setError('Deskripsi hasil survey wajib diisi.');
      return;
    }
    if (formData.kesiapan_jalur === 'not_ready' && !formData.rekomendasi_jalur.trim()) {
      setError('Alasan ketidaksiapan & rekomendasi wajib diisi.');
      return;
    }

    const session = getSession();
    if (!session?.token) {
      setError('Sesi tidak valid. Silakan login ulang.');
      return;
    }

    setLoading(true);
    try {
      await submitStep(session.token, workflowId, 4, formData);
      onDone?.(formData.kesiapan_jalur);
    } catch (err) {
      setError(err?.message || 'Gagal mengirim survey.');
    } finally {
      setLoading(false);
    }
  };

  const kesiapanClass =
    formData.kesiapan_jalur === 'ready'
      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
      : 'bg-rose-500/10 border-rose-500/30 text-rose-300';

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl glass-card p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="h-[2px] w-8 bg-gold-accent" />
            <p className="text-[10px] font-black text-gold-accent uppercase tracking-[0.4em]">SOP Step 4</p>
          </div>
          <h2 className="text-2xl font-black text-white">Survey <span className="text-gold-accent italic">Teknis</span></h2>
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
          <div className="border-b border-white/10 pb-6">
            <h3 className="text-sm font-black text-white uppercase tracking-wider mb-3">Hasil Survey Lapangan</h3>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelClass}>Foto Lokasi *</label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => addPhotos(e.target.files, 'location')}
                  className={inputClass}
                />
                {formData.foto_lokasi.length > 0 && (
                  <p className="text-xs text-emerald-400 mt-1">{formData.foto_lokasi.length} foto dipilih</p>
                )}
              </div>

              <div>
                <label className={labelClass}>Foto Jalur FO *</label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => addPhotos(e.target.files, 'route')}
                  className={inputClass}
                />
                {formData.foto_jalur.length > 0 && (
                  <p className="text-xs text-emerald-400 mt-1">{formData.foto_jalur.length} foto dipilih</p>
                )}
              </div>
            </div>

            <div className="mb-4">
              <label className={labelClass}>Koordinat Lokasi (Auto-detect via GPS)</label>
              <div className="flex space-x-4">
                <input
                  type="number"
                  step="0.000001"
                  value={formData.koordinat_lat ?? ''}
                  onChange={(e) =>
                    setFormData({ ...formData, koordinat_lat: e.target.value ? parseFloat(e.target.value) : null })
                  }
                  placeholder="Latitude"
                  className={`flex-1 ${inputClass}`}
                />
                <input
                  type="number"
                  step="0.000001"
                  value={formData.koordinat_lng ?? ''}
                  onChange={(e) =>
                    setFormData({ ...formData, koordinat_lng: e.target.value ? parseFloat(e.target.value) : null })
                  }
                  placeholder="Longitude"
                  className={`flex-1 ${inputClass}`}
                />
                <button
                  type="button"
                  onClick={handleGeoLocation}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-gold-accent/20 border border-gold-accent/40 text-gold-accent hover:bg-gold-accent/30 transition-all whitespace-nowrap"
                >
                  Auto GPS
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass}>Deskripsi Hasil Survey *</label>
              <textarea
                value={formData.hasil_survey}
                onChange={(e) => setFormData({ ...formData, hasil_survey: e.target.value })}
                rows={4}
                required
                className={inputClass}
                placeholder="Jelaskan kondisi lokasi, jalur FO yang tersedia, aksesibilitas, dan hambatan teknis lainnya..."
              />
            </div>
          </div>

          <div className={`rounded-xl border-l-4 p-4 ${kesiapanClass}`}>
            <h3 className="text-sm font-black uppercase tracking-wider mb-3">Keputusan Kesiapan Jalur</h3>

            <div className="space-y-3 mb-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="kesiapan_jalur"
                  value="ready"
                  checked={formData.kesiapan_jalur === 'ready'}
                  onChange={(e) => setFormData({ ...formData, kesiapan_jalur: e.target.value })}
                  className="w-5 h-5 accent-emerald-500"
                />
                <span className="font-bold text-sm">Jalur Siap - Dapat melanjutkan ke tahap proposal</span>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="kesiapan_jalur"
                  value="not_ready"
                  checked={formData.kesiapan_jalur === 'not_ready'}
                  onChange={(e) => setFormData({ ...formData, kesiapan_jalur: e.target.value })}
                  className="w-5 h-5 accent-rose-500"
                />
                <span className="font-bold text-sm">Jalur Tidak Siap - Perlu revisi lokasi/penyesuaian</span>
              </label>
            </div>

            {formData.kesiapan_jalur === 'not_ready' && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5">Alasan Ketidaksiapan & Rekomendasi *</label>
                <textarea
                  value={formData.rekomendasi_jalur}
                  onChange={(e) => setFormData({ ...formData, rekomendasi_jalur: e.target.value })}
                  rows={3}
                  placeholder="Jelaskan mengapa jalur tidak siap dan berikan rekomendasi perbaikan..."
                  className={inputClass}
                />
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>Catatan Teknis Tambahan</label>
            <textarea
              value={formData.catatan_teknis}
              onChange={(e) => setFormData({ ...formData, catatan_teknis: e.target.value })}
              rows={3}
              className={inputClass}
              placeholder="Catatan lain yang perlu diperhatikan (misal: risiko lingkungan, izin setempat, dll)..."
            />
          </div>

          <div className="flex space-x-4 pt-4 border-t border-white/10">
            <button
              type="submit"
              disabled={loading || !formData.hasil_survey.trim()}
              className={`flex-1 py-3 px-6 rounded-xl text-xs font-black uppercase tracking-wider transition-all backdrop-blur-md ${
                loading || !formData.hasil_survey.trim()
                  ? 'bg-white/5 border border-white/10 text-slate-500 cursor-not-allowed'
                  : formData.kesiapan_jalur === 'ready'
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
                  : 'bg-rose-500/20 border border-rose-500/40 text-rose-400 hover:bg-rose-500/30'
              }`}
            >
              {loading ? 'Menyimpan...' : 'Submit Survey'}
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

export default Step4Survey;
