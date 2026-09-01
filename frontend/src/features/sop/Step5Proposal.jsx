import { useState } from 'react';
import { getSession, submitStep } from '../../lib/rust-api';

const inputClass = "w-full px-3 py-2 text-sm rounded-xl bg-white/5 border border-white/15 text-white placeholder-white/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-gold-accent/50 focus:border-gold-accent/50 transition-all";
const labelClass = "block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5";

const Step5Proposal = ({ workflowId, workflow, onDone, onBack }) => {
  const [formData, setFormData] = useState({
    judul_proposal: '',
    nomor_proposal: '',
    tanggal_proposal: '',
    nilai_penawaran: 0,
    biaya_instalasi: 0,
    biaya_bulanan: 0,
    durasi_kontrak_bulan: 12,
    garansi_sla: '',
    terms_conditions: '',
    proposal_file_id: null,
    catatan_dbo: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [proposalFile, setProposalFile] = useState(null);

  const generateNomorProposal = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `PROP-${year}${month}${day}-${String(workflowId).padStart(3, '0')}`;
  };

  // Integrasi upload Google Drive nyata belum tersedia (lihat known issues).
  // Sementara file proposal menghasilkan placeholder drive_file_id lokal.
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setProposalFile(file);
    setFormData((prev) => ({
      ...prev,
      proposal_file_id: `local-proposal-${Math.random().toString(36).slice(2, 10)}`,
    }));
  };

  const calculateTotal = () => {
    const total =
      formData.nilai_penawaran +
      formData.biaya_instalasi +
      formData.biaya_bulanan * formData.durasi_kontrak_bulan;
    return total.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' });
  };

  const isFormValid = () =>
    formData.judul_proposal.trim() &&
    formData.nomor_proposal.trim() &&
    formData.tanggal_proposal &&
    formData.nilai_penawaran > 0 &&
    formData.biaya_instalasi > 0 &&
    formData.biaya_bulanan > 0 &&
    formData.durasi_kontrak_bulan > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isFormValid()) {
      setError('Lengkapi semua field wajib (judul, nomor, tanggal, dan biaya).');
      return;
    }

    const session = getSession();
    if (!session?.token) {
      setError('Sesi tidak valid. Silakan login ulang.');
      return;
    }

    setLoading(true);
    try {
      await submitStep(session.token, workflowId, 5, formData);
      onDone?.();
    } catch (err) {
      setError(err?.message || 'Gagal menyimpan proposal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl glass-card p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="h-[2px] w-8 bg-gold-accent" />
            <p className="text-[10px] font-black text-gold-accent uppercase tracking-[0.4em]">SOP Step 5</p>
          </div>
          <h2 className="text-2xl font-black text-white">Penyusunan <span className="text-gold-accent italic">Proposal</span></h2>
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
            <h3 className="text-sm font-black text-white uppercase tracking-wider mb-4">Informasi Proposal</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelClass}>Judul Proposal *</label>
                <input
                  type="text"
                  value={formData.judul_proposal}
                  onChange={(e) => setFormData({ ...formData, judul_proposal: e.target.value })}
                  placeholder="Contoh: Penawaran Layanan Fiber Optic untuk PT XYZ"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Nomor Proposal *</label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={formData.nomor_proposal}
                    onChange={(e) => setFormData({ ...formData, nomor_proposal: e.target.value })}
                    placeholder="PROP-2025-001"
                    className={`flex-1 ${inputClass}`}
                  />
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, nomor_proposal: generateNomorProposal() })}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-white/10 border border-white/15 text-white hover:bg-white/15 transition-colors whitespace-nowrap"
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div>
                <label className={labelClass}>Tanggal Proposal *</label>
                <input
                  type="date"
                  value={formData.tanggal_proposal}
                  onChange={(e) => setFormData({ ...formData, tanggal_proposal: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="border-b border-white/10 pb-6">
            <h3 className="text-sm font-black text-white uppercase tracking-wider mb-4">Struktur Biaya</h3>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelClass}>Nilai Penawaran (Total) *</label>
                <input
                  type="number"
                  value={formData.nilai_penawaran}
                  onChange={(e) => setFormData({ ...formData, nilai_penawaran: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Biaya Instalasi *</label>
                <input
                  type="number"
                  value={formData.biaya_instalasi}
                  onChange={(e) => setFormData({ ...formData, biaya_instalasi: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Biaya Bulanan *</label>
                <input
                  type="number"
                  value={formData.biaya_bulanan}
                  onChange={(e) => setFormData({ ...formData, biaya_bulanan: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Durasi Kontrak (bulan) *</label>
                <input
                  type="number"
                  value={formData.durasi_kontrak_bulan}
                  onChange={(e) => setFormData({ ...formData, durasi_kontrak_bulan: parseInt(e.target.value, 10) || 0 })}
                  placeholder="12"
                  className={inputClass}
                />
              </div>

              <div className="col-span-2">
                <label className={labelClass}>Garansi SLA</label>
                <input
                  type="text"
                  value={formData.garansi_sla}
                  onChange={(e) => setFormData({ ...formData, garansi_sla: e.target.value })}
                  placeholder="Contoh: 99.5% uptime"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="rounded-xl bg-gold-accent/10 border border-gold-accent/30 p-4">
              <div className="flex justify-between items-center">
                <span className="font-bold text-sm text-slate-300">Total Nilai Kontrak:</span>
                <span className="text-2xl font-black text-gold-accent">{calculateTotal()}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Termasuk instalasi +{' '}
                {(formData.durasi_kontrak_bulan * formData.biaya_bulanan).toLocaleString('id-ID', {
                  style: 'currency',
                  currency: 'IDR',
                })}
              </p>
            </div>
          </div>

          <div>
            <label className={labelClass}>Terms & Conditions</label>
            <textarea
              value={formData.terms_conditions}
              onChange={(e) => setFormData({ ...formData, terms_conditions: e.target.value })}
              rows={4}
              placeholder="Syarat dan ketentuan kontrak, jadwal pembayaran, klausul penting lainnya..."
              className={inputClass}
            />
          </div>

          <div className="border-b border-white/10 pb-6">
            <label className={labelClass}>Upload File Proposal (PDF)</label>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileChange}
              className={inputClass}
            />
            {proposalFile && (
              <p className="text-xs text-emerald-400 mt-2">
                File dipilih: {proposalFile.name} ({(proposalFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Catatan Internal DBO</label>
            <textarea
              value={formData.catatan_dbo}
              onChange={(e) => setFormData({ ...formData, catatan_dbo: e.target.value })}
              rows={3}
              placeholder="Catatan untuk tim internal (tidak ditampilkan ke customer)..."
              className={inputClass}
            />
          </div>

          <div className="flex space-x-4 pt-4 border-t border-white/10">
            <button
              type="submit"
              disabled={loading || !isFormValid()}
              className={`flex-1 py-3 px-6 rounded-xl text-xs font-black uppercase tracking-wider transition-all backdrop-blur-md ${
                loading || !isFormValid()
                  ? 'bg-white/5 border border-white/10 text-slate-500 cursor-not-allowed'
                  : 'bg-gold-accent/20 border border-gold-accent/40 text-gold-accent hover:bg-gold-accent/30'
              }`}
            >
              {loading ? 'Menyimpan...' : 'Simpan & Lanjut ke Presentasi'}
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

export default Step5Proposal;
