import { useState, useEffect } from 'react';
import { getSession, listWorkflows } from '../../lib/rust-api';
import { roleLabel } from './workflowResponsibility';

const BADGE_MAP = {
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  cancelled: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  draft: "bg-slate-500/15 text-slate-400 border-slate-500/30",
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

const InternalWorkflowDashboard = ({ onNavigateStep }) => {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: 'all', assigned: 'all' });
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);

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

      const data = await listWorkflows(session.token);

      // Transform API response to match our UI format
      const transformed = data.map(wf => ({
        id: wf.id,
        kode_lokasi: wf.kode_lokasi || wf.lokasi_code || '',
        nama_lokasi: wf.nama_lokasi_diajukan || wf.nama_lokasi || '',
        pelanggan_nama: wf.nama_pelanggan || '',
        current_step: wf.current_step || 1,
        total_steps: 18,
        status: wf.status || 'in_progress',
        assigned_to_role: wf.assigned_to_role || '',
        created_at: wf.started_at,
        updated_at: wf.updated_at,
        back_to_step: wf.back_to_step || null,
        rejection_reason: wf.rejection_reason || null,
      }));

      setWorkflows(transformed);
    } catch (error) {
      console.error('Error fetching workflows:', error);
      alert('Gagal memuat daftar workflow. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const key = status.toLowerCase();
    const cls = BADGE_MAP[key] || BADGE_MAP.default;
    const labelMap = {
      completed: '✅ Completed',
      rejected: '❌ Rejected',
      cancelled: '⚠️ Cancelled',
      draft: '📝 Draft',
    };
    const label = labelMap[key] || '🟢 In Progress';
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
      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold ${cls}`} title={`Active for ${diffDays} days`}>
        {label}
      </div>
    );
  };

  const handleNavigateToStep = (workflowId, stepNumber) => {
    setSelectedWorkflow(workflowId);
    if (onNavigateStep) {
      onNavigateStep(workflowId, stepNumber);
    } else {
      // Fallback: update state and route in parent
      window.dispatchEvent(new CustomEvent('navigate-to-sop-step', {
        detail: { workflowId, step: stepNumber }
      }));
    }
  };

  const handleWorkflowClick = (workflow) => {
    setSelectedWorkflow(workflow);
  };

  const filteredWorkflows = workflows.filter(wf => {
    if (filters.status !== 'all' && wf.status !== filters.status) return false;
    if (filters.assigned !== 'all' && wf.assigned_to_role !== filters.assigned) return false;
    return true;
  });

  const stats = {
    total: workflows.length,
    inProgress: workflows.filter(w => w.status === 'in_progress').length,
    completed: workflows.filter(w => w.status === 'completed').length,
    rejected: workflows.filter(w => w.status === 'rejected').length,
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gold-accent border-t-transparent" />
          <p className="text-xs font-bold text-slate-400">Memuat workflow...</p>
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
          <p className="text-[10px] font-black text-gold-accent uppercase tracking-[0.4em]">Manajemen Workflow</p>
        </div>
        <h1 className="text-3xl font-black text-white">
          SOP Workflow <span className="text-gold-accent italic">Management</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">Kelola dan pantau proses SOP 18 langkah</p>
      </header>

      {/* Filters */}
      <div className="rounded-2xl glass-card p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className={labelClass}>Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({...filters, status: e.target.value})}
              className={inputClass}
            >
              <option value="all" className="bg-slate-900">Semua</option>
              <option value="in_progress" className="bg-slate-900">In Progress</option>
              <option value="completed" className="bg-slate-900">Completed</option>
              <option value="rejected" className="bg-slate-900">Rejected</option>
              <option value="cancelled" className="bg-slate-900">Cancelled</option>
              <option value="draft" className="bg-slate-900">Draft</option>
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className={labelClass}>Assigned To</label>
            <select
              value={filters.assigned}
              onChange={(e) => setFilters({...filters, assigned: e.target.value})}
              className={inputClass}
            >
              <option value="all" className="bg-slate-900">Semua</option>
              <option value="customer" className="bg-slate-900">Customer/Pelanggan</option>
              <option value="dbo" className="bg-slate-900">DBO</option>
              <option value="teknisi" className="bg-slate-900">Teknisi</option>
              <option value="legal" className="bg-slate-900">Legal</option>
              <option value="direksi" className="bg-slate-900">Direksi</option>
              <option value="keuangan" className="bg-slate-900">Keuangan</option>
              <option value="admin" className="bg-slate-900">Admin</option>
            </select>
          </div>

          <div className="flex-1 min-w-[300px]">
            <label className={labelClass}>Search</label>
            <input
              type="text"
              placeholder="Cari kode lokasi atau nama pelanggan..."
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Active" value={stats.total} />
        <StatCard label="In Progress" value={stats.inProgress} valueClass="text-sky-400" />
        <StatCard label="Completed" value={stats.completed} valueClass="text-emerald-400" />
        <StatCard label="Rejected" value={stats.rejected} valueClass="text-rose-400" />
      </div>

      {/* Workflow List */}
      <div className="rounded-2xl glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-sm font-black text-white uppercase tracking-wider">Active Workflows ({filteredWorkflows.length})</h2>
        </div>

        {filteredWorkflows.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="mx-auto h-12 w-12 text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-slate-400 text-sm">Tidak ada workflow ditemukan.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {filteredWorkflows.map((workflow) => (
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
                    <p className="text-xs text-slate-500">{workflow.pelanggan_nama}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="font-bold">Step:</span>
                      <span className="bg-sky-500/15 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-md font-bold">
                        {workflow.current_step}/18
                      </span>
                      <span>•</span>
                      <span className={`font-bold ${workflow.assigned_to_role === 'customer' ? 'text-emerald-400' : workflow.assigned_to_role === 'dbo' ? 'text-sky-400' : 'text-slate-400'}`}>
                        {roleLabel(workflow.assigned_to_role)}
                      </span>
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

                    {/* Quick Actions */}
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNavigateToStep(workflow.id, workflow.current_step);
                        }}
                        className="px-3 py-1 text-xs font-bold rounded-lg bg-gold-accent/20 border border-gold-accent/40 text-gold-accent hover:bg-gold-accent/30 transition-colors"
                      >
                        Kerjakan Step {workflow.current_step} →
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // TODO: Implement view details modal/page
                          alert(`View Details untuk workflow ID: ${workflow.id}\nCurrent Step: ${workflow.current_step}`);
                        }}
                        className="px-3 py-1 text-xs font-bold rounded-lg bg-white/10 border border-white/15 text-white hover:bg-white/15 transition-colors"
                      >
                        View Details
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          alert(`Assign workflow to user\nCurrently assigned to: ${workflow.assigned_to_role || 'Unassigned'}`);
                        }}
                        className="px-3 py-1 text-xs font-bold rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        Assign
                      </button>
                    </div>
                  </div>

                  {/* Status Column */}
                  <div className="text-right">
                    <div className="text-[11px] text-slate-500 mb-1">
                      Created: {new Date(workflow.created_at).toLocaleDateString('id-ID')}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Updated: {new Date(workflow.updated_at).toLocaleDateString('id-ID')}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <button
          onClick={fetchWorkflows}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-white/10 border border-white/15 text-white hover:bg-white/15 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh List
        </button>
      </div>
    </div>
  );
};

export default InternalWorkflowDashboard;
