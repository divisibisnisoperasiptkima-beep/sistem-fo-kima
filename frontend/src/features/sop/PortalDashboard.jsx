import { useState, useEffect } from 'react';
import { getSession, listWorkflows, getWorkflowStatus, submitStep } from '../../lib/rust-api';
import { SHARING_CORE_OPTIONS } from '../kontrak/coreUtils';
import { getStepInfo, roleLabel } from './workflowResponsibility';

const BADGE_MAP = {
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  cancelled: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  default: "bg-sky-500/15 text-sky-400 border-sky-500/30",
};

const inputClass = "w-full px-3 py-2 text-sm rounded-xl bg-white/5 border border-white/15 text-white placeholder-white/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-gold-accent/50 focus:border-gold-accent/50 transition-all";
const labelClass = "block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5";

function StatCard({ label, value, valueClass = "text-white" }) {
  return (
    <div className="rounded-2xl p-4 bg-slate-900/40 border border-white/10">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <h3 className={`text-2xl font-black ${valueClass}`}>{value}</h3>
    </div>
  );
}

const PortalDashboard = ({ onRegister }) => {
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentStepData, setCurrentStepData] = useState({});
  const [coreMode, setCoreMode] = useState('direct');

  const handleCoreModeChange = (mode) => {
    setCoreMode(mode);
    if (mode === 'direct') {
      setCurrentStepData((prev) => ({ ...prev, sharing_core: 'Tidak', core_dedicated: Number(prev.core_dedicated) > 0 ? prev.core_dedicated : 1 }));
    } else {
      setCurrentStepData((prev) => ({ ...prev, core_dedicated: 0, sharing_core: SHARING_CORE_OPTIONS[0] }));
    }
  };

  // Fetch workflows from API
  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const session = getSession();
      if (!session || !session.token) {
        setLoading(false);
        return;
      }

      // ACL backend sudah membatasi hasil ke workflow milik pelanggan ini,
      // jadi tidak perlu (dan tidak boleh) memfilter assigned_to_role di sini —
      // pelanggan harus melihat semua permohonannya di step/role mana pun.
      const data = await listWorkflows(session.token);

      // Transform API response
      const transformed = data.map(wf => ({
        id: wf.id,
        kode_lokasi: wf.kode_lokasi || wf.lokasi_code || '',
        nama_lokasi: wf.nama_lokasi_diajukan || wf.nama_lokasi || '',
        pelanggan_nama: wf.nama_pelanggan || '',
        current_step: wf.current_step || 1,
        total_steps: 18,
        status: wf.status || 'in_progress',
        assigned_to_role: wf.assigned_to_role || 'customer',
        created_at: wf.started_at,
        updated_at: wf.updated_at,
        back_to_step: wf.back_to_step || null,
        rejection_reason: wf.rejection_reason || null,
        step_history: [], // Will be fetched separately when clicking on workflow
        documents: [], // Will be fetched separately
      }));

      setWorkflows(transformed);
    } catch (error) {
      console.error('Error fetching workflows:', error);
      alert('Gagal memuat daftar workflow Anda. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleWorkflowClick = async (workflow) => {
    try {
      const session = getSession();
      if (!session || !session.token) return;

      const data = await getWorkflowStatus(session.token, workflow.id);

      setSelectedWorkflow({
        ...workflow,
        ...data,
        step_history: data.step_history || [],
        documents: data.documents || [],
      });
    } catch (error) {
      console.error('Error fetching workflow details:', error);
      alert('Gagal memuat detail workflow. Silakan coba lagi.');
    }
  };

  const handleStepSubmit = async (stepNumber) => {
    if (!selectedWorkflow) return;

    if (stepNumber === 3 && coreMode === 'direct' && (!Number.isInteger(Number(currentStepData.core_dedicated)) || Number(currentStepData.core_dedicated) < 1)) {
      alert('Jumlah core dedicated minimal 1.');
      return;
    }

    try {
      const session = getSession();
      if (!session || !session.token) return;

      await submitStep(session.token, selectedWorkflow.id, stepNumber, {
        ...currentStepData,
        core_dedicated: currentStepData.core_dedicated === '' ? 0 : Number(currentStepData.core_dedicated),
      });

      alert(`Step ${stepNumber} berhasil disubmit!`);

      // Refresh workflow data
      fetchWorkflows();
      setCurrentStepData({});
      setSelectedWorkflow(null);
    } catch (error) {
      alert(`Error: ${error?.message || 'Gagal submit step.'}`);
    }
  };

  const getStatusBadge = (status) => {
    const key = status?.toLowerCase();
    const cls = BADGE_MAP[key] || BADGE_MAP.default;
    const labelMap = {
      completed: '✅ Selesai',
      rejected: '❌ Ditolak',
      cancelled: '⚠️ Dibatalkan',
    };
    const label = labelMap[key] || '🟢 Sedang Berjalan';
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${cls}`}>{label}</span>;
  };

  const getSLAIndicator = (createdAt) => {
    if (!createdAt) return null;

    const createdAtDate = new Date(createdAt);
    const now = new Date();
    const diffDays = Math.floor((now - createdAtDate) / (1000 * 60 * 60 * 24));

    let cls, label;
    if (diffDays <= 5) {
      cls = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      label = `${diffDays}d`;
    } else if (diffDays <= 10) {
      cls = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      label = `${diffDays}d ⚠️`;
    } else {
      cls = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      label = `${diffDays}d 🔴`;
    }

    return (
      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold ${cls}`} title={`Aktif selama ${diffDays} hari`}>
        {label}
      </div>
    );
  };

  const getStepStatus = (stepNum, currentStep) => {
    if (stepNum < currentStep) return 'completed';
    if (stepNum === currentStep) return 'current';
    return 'pending';
  };

  const getStepColor = (status) => {
    switch(status) {
      case 'completed': return 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400';
      case 'current': return 'bg-gold-accent text-black';
      case 'pending': return 'bg-white/5 border border-white/10 text-slate-500';
      default: return 'bg-white/5 text-slate-500';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gold-accent border-t-transparent" />
          <p className="text-xs font-bold text-slate-400">Memuat data workflow Anda...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <header>
        <div className="flex items-center gap-3 mb-2">
          <span className="h-[2px] w-8 bg-gold-accent" />
          <p className="text-[10px] font-black text-gold-accent uppercase tracking-[0.4em]">Portal Layanan Pelanggan</p>
        </div>
        <h1 className="text-3xl font-black text-white">
          Selamat Datang, <span className="text-gold-accent italic">{workflows[0]?.pelanggan_nama || 'Pelanggan'}</span>
        </h1>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Permohonan" value={workflows.length} />
        <StatCard label="Sedang Berjalan" value={workflows.filter(w => w.status === 'in_progress').length} valueClass="text-sky-400" />
        <StatCard label="Selesai" value={workflows.filter(w => w.status === 'completed').length} valueClass="text-emerald-400" />
      </div>

      {/* Workflow List */}
      <div className="rounded-2xl glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-sm font-black text-white uppercase tracking-wider">Daftar Permohonan Anda ({workflows.length})</h2>
        </div>

        {workflows.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="mx-auto h-12 w-12 text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-slate-400 text-sm">Anda belum memiliki permohonan yang sedang berjalan.</p>
            <button
              type="button"
              onClick={() => onRegister?.()}
              className="mt-3 inline-block text-gold-accent hover:text-gold-accent/80 font-bold text-sm"
            >
              + Ajukan Permohonan Baru
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                onClick={() => handleWorkflowClick(workflow)}
                className={`px-6 py-4 hover:bg-white/5 cursor-pointer transition-colors ${
                  selectedWorkflow?.id === workflow.id ? 'bg-gold-accent/5' : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 pr-4">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-sm font-bold text-white">{workflow.kode_lokasi}</h3>
                      {getStatusBadge(workflow.status)}
                      {getSLAIndicator(workflow.created_at)}
                    </div>

                    <p className="text-sm text-slate-300 mt-1">{workflow.nama_lokasi}</p>
                    <p className="text-xs text-slate-500">Kode: {workflow.kode_lokasi}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="font-bold">Langkah:</span>
                      <span className="bg-sky-500/15 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-md font-bold">
                        {workflow.current_step}/18
                      </span>
                      <span>•</span>
                      <span className="text-emerald-400 font-bold">
                        {workflow.status?.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>

                    <div className="mt-3 inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-xs">
                      <span className="font-bold text-sky-200">Penanggung jawab saat ini:</span>
                      <span className="font-black text-white">{roleLabel(workflow.assigned_to_role)}</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-3 h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-950/50">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          workflow.status === 'rejected' ? 'bg-rose-500' :
                          workflow.status === 'completed' ? 'bg-emerald-500' : 'bg-sky-400'
                        }`}
                        style={{ width: `${(workflow.current_step / 18) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Status Column */}
                  <div className="text-right">
                    <div className="text-[11px] text-slate-500 mb-1">
                      Dimulai: {new Date(workflow.created_at).toLocaleDateString('id-ID')}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Update terakhir: {new Date(workflow.updated_at).toLocaleDateString('id-ID')}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Workflow Detail View (when clicked) */}
      {selectedWorkflow && (
        <div className="rounded-2xl glass-card p-6 border-l-4 border-l-gold-accent">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-xl font-black text-white">{selectedWorkflow.nama_lokasi}</h2>
            {getStatusBadge(selectedWorkflow.status)}
          </div>

          <p className="text-sm text-slate-400 mb-4">Kode: {selectedWorkflow.kode_lokasi} | Langkah {selectedWorkflow.current_step}/18</p>

          <div className="mb-5 rounded-xl border border-gold-accent/25 bg-gold-accent/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gold-accent">Penanggung jawab tahap aktif</p>
                <p className="mt-1 text-base font-black text-white">{roleLabel(selectedWorkflow.assigned_to_role)}</p>
                <p className="mt-1 text-xs text-slate-300">{getStepInfo(selectedWorkflow.current_step)?.name || 'Tahap proses berjalan'}</p>
              </div>
              <span className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-bold text-white/70">Langkah {selectedWorkflow.current_step} dari 18</span>
            </div>
            <p className="mt-3 text-xs leading-5 text-white/60">Setiap tahap akan berpindah ke penanggung jawab berikutnya setelah tindakan pada tahap ini diselesaikan.</p>
          </div>

          {/* Current Step Form (for Step 3 - Customer Confirmation) */}
          {selectedWorkflow.current_step === 3 && selectedWorkflow.assigned_to_role === 'customer' && (
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 mb-4">
              <h3 className="text-sm font-black text-white mb-3">Langkah 3: Konfirmasi Kebutuhan</h3>

              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Jenis Kebutuhan Core *</label>
                  <div className="grid grid-cols-2 gap-3 mt-1.5">
                    <button
                      type="button"
                      onClick={() => handleCoreModeChange('direct')}
                      className={`px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all duration-200 cursor-pointer ${
                        coreMode === 'direct'
                          ? 'bg-gold-accent/20 border-gold-accent/50 text-gold-accent'
                          : 'bg-white/5 border-white/15 text-slate-300 hover:border-white/30'
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
                          : 'bg-white/5 border-white/15 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      Sharing Core
                    </button>
                  </div>
                </div>

                {coreMode === 'direct' ? (
                  <div>
                    <label className={labelClass}>Jumlah Core Dedicated *</label>
                    <input
                      type="number"
                      min="1"
                      value={currentStepData.core_dedicated || ''}
                      onChange={(e) => setCurrentStepData({...currentStepData, core_dedicated: e.target.value})}
                      className={inputClass}
                      placeholder="Masukkan jumlah core yang dibutuhkan"
                    />
                  </div>
                ) : (
                  <div>
                    <label className={labelClass}>Pilih Rasio Sharing Core *</label>
                    <select
                      value={currentStepData.sharing_core || SHARING_CORE_OPTIONS[0]}
                      onChange={(e) => setCurrentStepData({...currentStepData, sharing_core: e.target.value})}
                      className={inputClass}
                    >
                      {SHARING_CORE_OPTIONS.map((share) => (
                        <option key={share} value={share} className="bg-slate-900">{share}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className={labelClass}>Catatan Tambahan</label>
                  <textarea
                    value={currentStepData.keterangan || ''}
                    onChange={(e) => setCurrentStepData({...currentStepData, keterangan: e.target.value})}
                    rows={3}
                    className={inputClass}
                    placeholder="Jelaskan kebutuhan khusus atau catatan tambahan..."
                  />
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => handleStepSubmit(3)}
                    className="flex-1 rounded-xl bg-gold-accent/20 border border-gold-accent/40 text-gold-accent hover:bg-gold-accent/30 py-2 px-4 text-sm font-bold transition-all"
                  >
                    Konfirmasi & Lanjut ke Survey
                  </button>
                  <button
                    onClick={() => setSelectedWorkflow(null)}
                    className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white border border-white/15 rounded-xl transition-colors"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step History */}
          <div className="mt-6">
            <h3 className="text-sm font-black text-white mb-3">Riwayat Langkah</h3>
            <div className="space-y-2">
              {selectedWorkflow.step_history.map((step, index) => (
                <div key={index} className="flex items-start">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${getStepColor(getStepStatus(step.step_nomor, selectedWorkflow.current_step))}`}>
                    {step.step_nomor}
                  </div>
                  <div className="ml-4 flex-1">
                    <p className="font-bold text-white text-sm">{getStepInfo(step.step_nomor)?.name || `Step ${step.step_nomor}`}</p>
                    <p className="text-sm text-slate-400">Pelaksana: {roleLabel(step.actor_role)}</p>
                    <p className="text-[11px] text-slate-500">{new Date(step.created_at).toLocaleString('id-ID')}</p>
                    {step.description && <p className="text-sm text-slate-300 mt-1">{step.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Documents */}
          {selectedWorkflow.documents && selectedWorkflow.documents.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-black text-white mb-3">Dokumen</h3>
              <div className="space-y-2">
                {selectedWorkflow.documents.map((doc, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div>
                        <p className="text-sm font-bold text-white">{doc.nama_file}</p>
                        <p className="text-xs text-slate-500">{doc.kategori}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 text-[11px] font-bold rounded-md border ${
                      doc.upload_status === 'verified' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                      doc.upload_status === 'uploaded' ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' :
                      'bg-slate-500/15 text-slate-400 border-slate-500/30'
                    }`}>
                      {doc.upload_status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Action Button */}
      {workflows.length > 0 && workflows.some(w => w.assigned_to_role === 'customer') && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onRegister?.()}
            className="px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider bg-gold-accent/20 border border-gold-accent/40 text-gold-accent hover:bg-gold-accent/30 hover:border-gold-accent/60 transition-all backdrop-blur-md shadow-lg flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajukan Permohonan Baru
          </button>
        </div>
      )}
    </div>
  );
};

export default PortalDashboard;
