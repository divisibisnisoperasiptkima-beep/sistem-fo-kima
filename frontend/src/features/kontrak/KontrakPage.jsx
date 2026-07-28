import { useState, useRef, useCallback, forwardRef, useImperativeHandle, useEffect } from "react";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import DataTable from "../../components/DataTable";
import StatusFilterBar from "../../components/StatusFilterBar";
import AddKontrakModal from "./AddKontrakModal";
import EditKontrakModal from "./EditKontrakModal";
import DeleteKontrakModal from "./DeleteKontrakModal";
import ExtendKontrakModal from "./ExtendKontrakModal";
import UpgradeKontrakModal from "./UpgradeKontrakModal";
import ActionButtons from "./ActionButtons";
import { getCurrentDriveSyncStatus, getDriveSyncStatus, listContracts, syncDriveDocuments } from "../../lib/rust-api";
import { kontrakColumns, setActionButtonsComponent } from "./columns.jsx";

const DRIVE_SYNC_JOB_KEY = "kima-drive-sync-job";

/**
 * Kontrak page component
 */
const KontrakPage = forwardRef(function KontrakPage({ session }, ref) {
  const tableRef = useRef(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingContract, setDeletingContract] = useState(null);
  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const [extendingContract, setExtendingContract] = useState(null);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradingContract, setUpgradingContract] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState([]);
  const [syncJobId, setSyncJobId] = useState(() => localStorage.getItem(DRIVE_SYNC_JOB_KEY) || "");
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncingDrive, setSyncingDrive] = useState(() => Boolean(localStorage.getItem(DRIVE_SYNC_JOB_KEY)));
  const [syncMessage, setSyncMessage] = useState("");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Set ActionButtons component for columns
  useEffect(() => {
    setActionButtonsComponent(ActionButtons);
  }, []);

  // Expose refresh method to parent
  useImperativeHandle(ref, () => ({
    refresh: () => {
      if (tableRef.current?.refresh) {
        tableRef.current.refresh();
      }
    },
  }));

  // Handler to refresh table after successful create/edit
  const handleSuccess = useCallback(() => {
    if (tableRef.current?.refresh) {
      tableRef.current.refresh();
    }
  }, []);

  const handleDriveSync = useCallback(async () => {
    if (syncingDrive) return;
    setSyncingDrive(true);
    setSyncMessage("");
    try {
      const result = await syncDriveDocuments(session.token);
      const jobId = String(result.job_id);
      localStorage.setItem(DRIVE_SYNC_JOB_KEY, jobId);
      setSyncJobId(jobId);
      setSyncProgress(result);
    } catch (error) {
      setSyncingDrive(false);
      setSyncMessage(error.message || "Sinkronisasi Drive gagal.");
    }
  }, [session.token, syncingDrive]);

  useEffect(() => {
    let cancelled = false;
    let timerId;

    if (!syncJobId) {
      getCurrentDriveSyncStatus(session.token)
        .then((progress) => {
          if (cancelled) return;
          const jobId = String(progress.job_id);
          localStorage.setItem(DRIVE_SYNC_JOB_KEY, jobId);
          setSyncJobId(jobId);
          setSyncProgress(progress);
          setSyncingDrive(true);
        })
        .catch((error) => {
          if (!cancelled && error?.status !== 404) {
            setSyncMessage(error.message || "Status sinkronisasi gagal dimuat.");
          }
        });
      return () => {
        cancelled = true;
      };
    }

    const poll = async () => {
      try {
        const progress = await getDriveSyncStatus(session.token, syncJobId);
        if (cancelled) return;
        setSyncProgress(progress);
        if (progress.status === "running") {
          timerId = window.setTimeout(poll, 1200);
          return;
        }

        setSyncingDrive(false);
        localStorage.removeItem(DRIVE_SYNC_JOB_KEY);
        setSyncJobId("");
        setSyncMessage(
          `${progress.new_documents || 0} dokumen baru ditemukan dari ${progress.files_scanned || 0} file Drive${progress.errors ? `; ${progress.errors} bagian gagal dibaca` : ""}.`,
        );
        handleSuccess();
      } catch (error) {
        if (cancelled) return;
        if (error?.status === 404) {
          setSyncingDrive(false);
          localStorage.removeItem(DRIVE_SYNC_JOB_KEY);
          setSyncJobId("");
          setSyncMessage("Status sinkronisasi tidak tersedia. Silakan mulai ulang.");
          return;
        }
        // Gangguan jaringan sementara tidak membatalkan job di backend.
        timerId = window.setTimeout(poll, 2000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timerId) window.clearTimeout(timerId);
    };
  }, [handleSuccess, session.token, syncJobId]);

  // Edit handler
  const handleEdit = useCallback((row) => {
    setEditingContract(row);
    setIsEditModalOpen(true);
  }, []);

  // Delete handler
  const handleDelete = useCallback((row) => {
    setDeletingContract(row);
    setIsDeleteModalOpen(true);
  }, []);

  // Extend handler
  const handleExtend = useCallback((row) => {
    setExtendingContract(row);
    setIsExtendModalOpen(true);
  }, []);

  // Upgrade handler
  const handleUpgrade = useCallback((row) => {
    setUpgradingContract(row);
    setIsUpgradeModalOpen(true);
  }, []);

  // Create columns with handlers
  const columns = kontrakColumns.map((col) => {
    if (col.label === "Aksi") {
      return {
        ...col,
        render: (row) => (
          <ActionButtons
            row={row}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onExtend={handleExtend}
            onUpgrade={handleUpgrade}
          />
        ),
      };
    }
    return col;
  });

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header with Eyebrow, Title, Search & Filter & Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="h-[2px] w-8 bg-gold-accent" />
            <p className="text-[10px] font-black text-gold-accent uppercase tracking-[0.4em]">
              Manajemen Kontrak
            </p>
          </div>
          <h1 className="text-3xl font-black text-white">
            Daftar Kontrak <span className="text-gold-accent italic">FO KIMA</span>
          </h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" size={16} />
            <input
              type="text"
              placeholder="Cari kontrak..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 text-xs font-semibold rounded-xl bg-white/5 border border-white/15 text-white placeholder-white/40 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-gold-accent/50 focus:border-gold-accent/50 transition-all w-64"
            />
          </div>

          {/* Status Dropdown Filter */}
          <StatusFilterBar
            selected={statusFilter}
            onChange={setStatusFilter}
          />

          <button
            type="button"
            onClick={() => void handleDriveSync()}
            disabled={syncingDrive}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-sky-400/10 border border-sky-400/30 text-sky-200 hover:bg-sky-400/20 transition-all backdrop-blur-md disabled:opacity-50 shrink-0"
            title="Baca file baru dari folder Google Drive yang terdaftar"
          >
            <RefreshCw size={16} className={syncingDrive ? "animate-spin" : ""} />
            <span>{syncingDrive ? "Menyinkronkan…" : "Sinkronkan Drive"}</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-gold-accent/20 border border-gold-accent/40 text-gold-accent hover:bg-gold-accent/30 hover:border-gold-accent/60 transition-all backdrop-blur-md shadow-lg shrink-0"
          >
            <Plus size={16} />
            <span>Tambah Kontrak</span>
          </button>
        </div>
      </div>

      {syncMessage && (
        <p className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-3.5 py-2 text-xs font-semibold text-sky-100">
          {syncMessage}
        </p>
      )}

      {syncingDrive && syncProgress && (
        <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-3.5 py-3 text-xs text-sky-100">
          <div className="flex items-center justify-between gap-3 font-semibold">
            <span>Membaca folder {syncProgress.processed_targets || 0} dari {syncProgress.total_targets || 0}</span>
            <span>{syncProgress.new_documents || 0} dokumen baru</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-950/50">
            <div
              className="h-full rounded-full bg-sky-300 transition-all duration-300"
              style={{ width: `${syncProgress.total_targets ? Math.min(100, Math.round((syncProgress.processed_targets * 100) / syncProgress.total_targets)) : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Active Filter Chips Bar (rendered when filters applied) */}
      {statusFilter.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 backdrop-blur-md">
          <span className="text-[10px] font-black text-white/40 uppercase tracking-wider">
            Filter Aktif:
          </span>
          {statusFilter.map((st) => (
            <span
              key={st}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-gold-accent/15 border border-gold-accent/30 text-gold-accent"
            >
              {st}
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter.filter((s) => s !== st))}
                className="hover:text-white transition-colors cursor-pointer"
                title={`Hapus filter ${st}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setStatusFilter([])}
            className="text-[10px] font-black uppercase tracking-wider text-rose-400 hover:text-rose-300 ml-auto transition-colors cursor-pointer"
          >
            Hapus Semua
          </button>
        </div>
      )}

      {/* Data Table */}
      <div className="flex-1 overflow-hidden">
        <DataTable
          ref={tableRef}
          load={listContracts}
          columns={columns}
          session={session}
          focus={false}
          search={debouncedSearch}
          status={statusFilter.join(",")}
        />
      </div>

      {/* Add Modal */}
      <AddKontrakModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleSuccess}
        session={session}
      />

      {/* Edit Modal */}
      <EditKontrakModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingContract(null);
        }}
        onSuccess={handleSuccess}
        contract={editingContract}
        session={session}
      />

      {/* Delete Modal */}
      <DeleteKontrakModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletingContract(null);
        }}
        onSuccess={handleSuccess}
        contract={deletingContract}
        session={session}
      />

      {/* Extend Modal */}
      <ExtendKontrakModal
        isOpen={isExtendModalOpen}
        onClose={() => {
          setIsExtendModalOpen(false);
          setExtendingContract(null);
        }}
        onSuccess={handleSuccess}
        contract={extendingContract}
        session={session}
      />

      {/* Upgrade Modal */}
      <UpgradeKontrakModal
        isOpen={isUpgradeModalOpen}
        onClose={() => {
          setIsUpgradeModalOpen(false);
          setUpgradingContract(null);
        }}
        onSuccess={handleSuccess}
        contract={upgradingContract}
        session={session}
      />
    </div>
  );
});

export default KontrakPage;
