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
import MapView from "../titik-peta/MapView";
import BaaFormModal from "../titik-peta/BaaFormModal";
import {
  createLocationPoint,
  deleteIspPoint,
  deleteLocationPoint,
  getCurrentDriveSyncStatus,
    getDriveSyncStatus,
    fetchDocumentContent,
    listContracts,
    listIspPoints,
    listMapPoints,
  listLocationPoints,
  rowsFrom,
  syncDriveDocuments,
  updateLocationPoint,
  upsertIspPoint,
} from "../../lib/rust-api";
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
  const [mapContract, setMapContract] = useState(null);
  const [mapLocationPoints, setMapLocationPoints] = useState([]);
  const [mapIspPoints, setMapIspPoints] = useState([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState("");
  const [baaRow, setBaaRow] = useState(null);
  const [baaAction, setBaaAction] = useState(null);

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

  // The BAA metadata is owned by the existing Titik Peta endpoint. Merge it
  // into contract rows so both Admin pages expose the same document actions
  // without creating a second BAA record or a second Drive location.
  const loadContractsWithBaa = useCallback(async (token, page, pageSize, search, status, activeOnly) => {
    const [contracts, mapPage] = await Promise.all([
      listContracts(token, page, pageSize, search, status, activeOnly),
      listMapPoints(token, 1, 100).catch((error) => {
        // BAA is an enrichment for this table. Keep the contract list usable
        // if an older backend has not exposed the Titik Peta endpoint yet.
        console.warn("Metadata BAA kontrak gagal dimuat:", error);
        return null;
      }),
    ]);
    const baaByLocation = new Map(
      rowsFrom(mapPage).map((point) => [String(point.lokasi_id), point]),
    );
    const rows = rowsFrom(contracts).map((contract) => {
      const mapRow = baaByLocation.get(String(contract.id));
      return mapRow ? { ...contract, ...mapRow } : { ...contract, lokasi_id: contract.id };
    });
    return { ...contracts, data: rows, rows };
  }, []);

  const openBaaDocument = useCallback(async (row, mode = "preview") => {
    if (!row?.baa_document_id) return;
    const documentWindow = mode === "preview" ? window.open("about:blank", "_blank") : null;
    setBaaAction(row.baa_document_id);
    try {
      if (mode === "preview" && !documentWindow) {
        throw new Error("Izinkan pop-up browser untuk membuka PDF BAA.");
      }
      if (documentWindow) {
        documentWindow.opener = null;
        documentWindow.document.title = "Memuat dokumen BAA";
        documentWindow.document.body.innerHTML = "<main style=\"display:grid;min-height:100vh;place-items:center;margin:0;background:#0f172a;color:#e2e8f0;font:600 16px system-ui,sans-serif\">Memuat dokumen BAA…</main>";
      }
      const blob = await fetchDocumentContent(session.token, row.baa_document_id, mode);
      const url = URL.createObjectURL(blob);
      if (mode === "preview") {
        documentWindow.location.href = url;
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = row.baa_document_name || "Dokumen-BAA.pdf";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      documentWindow?.close();
      window.alert(error?.message || "Dokumen BAA gagal dibuka.");
    } finally {
      setBaaAction(null);
    }
  }, [session.token]);

  const openBaaForm = useCallback((row) => {
    setBaaRow({ ...row, lokasi_id: row.lokasi_id || row.id });
  }, []);

  const loadMapData = useCallback(async (contract) => {
    if (!contract) return;
    setMapLoading(true);
    setMapError("");
    try {
      const [locationData, ispData] = await Promise.all([
        listLocationPoints(session.token, contract.id),
        listIspPoints(session.token, 1, 1000),
      ]);
      const locationRows = rowsFrom(locationData);
      const fallbackPoint = !locationRows.length && contract.latitude != null && contract.longitude != null
        ? [{
          id: null,
          lokasi_id: contract.id,
          label: contract.nama_lokasi || "Titik kontrak",
          latitude: Number(contract.latitude),
          longitude: Number(contract.longitude),
        }]
        : [];
      setMapLocationPoints(locationRows.length ? locationRows : fallbackPoint);
      setMapIspPoints(rowsFrom(ispData).filter((point) => point.pelanggan_id === contract.pelanggan_id));
    } catch (error) {
      setMapError(error instanceof Error ? error.message : "Gagal memuat titik peta kontrak.");
    } finally {
      setMapLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    if (!mapContract) {
      setMapLocationPoints([]);
      setMapIspPoints([]);
      setMapError("");
      return undefined;
    }
    void loadMapData(mapContract);
    return undefined;
  }, [loadMapData, mapContract]);

  const handleMap = useCallback((row) => {
    // Contract rows are backed by the `lokasi` table, so its id is the exact
    // lokasi_id expected by the existing Titik Peta module.
    setMapContract({ ...row, lokasi_id: row.id });
  }, []);

  const handleMapSaveLocationPoint = useCallback(async (data) => {
    if (data.id) await updateLocationPoint(session.token, data.id, data);
    else await createLocationPoint(session.token, data);
    await loadMapData(mapContract);
    await tableRef.current?.refresh();
  }, [loadMapData, mapContract, session.token]);

  const handleMapDeleteLocationPoint = useCallback(async (id) => {
    if (!id) return;
    await deleteLocationPoint(session.token, id);
    await loadMapData(mapContract);
    await tableRef.current?.refresh();
  }, [loadMapData, mapContract, session.token]);

  const handleMapSaveIspPoint = useCallback(async (data) => {
    await upsertIspPoint(session.token, data);
    await loadMapData(mapContract);
  }, [loadMapData, mapContract, session.token]);

  const handleMapDeleteIspPoint = useCallback(async (id) => {
    await deleteIspPoint(session.token, id);
    await loadMapData(mapContract);
  }, [loadMapData, mapContract, session.token]);

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
            onMap={handleMap}
            showBaaActions
            onBaaEdit={openBaaForm}
            onBaaPreview={(row) => void openBaaDocument(row, "preview")}
            onBaaDownload={(row) => void openBaaDocument(row, "download")}
            baaAction={baaAction}
          />
        ),
      };
    }
    return col;
  });

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header with Eyebrow, Title, Search & Filter & Add Button */}
      <div className="min-w-0 space-y-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <span className="h-[2px] w-8 bg-gold-accent" />
            <p className="text-[10px] font-black text-gold-accent uppercase tracking-[0.4em]">
              Manajemen Kontrak
            </p>
          </div>
          <h1 className="text-3xl font-black text-white">
            Daftar Kontrak <span className="text-gold-accent italic">FO KIMA</span>
          </h1>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-white/50">
            Kontrak dicatat manual setelah pembayaran permohonan terverifikasi. Tidak ada kontrak yang dibuat otomatis dari SOP.
          </p>
        </div>

        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:gap-3">
          <div className="relative min-w-0 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" size={16} />
            <input
              type="text"
              placeholder="Cari kontrak..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full min-w-0 rounded-xl border border-white/15 bg-white/5 py-2 pl-10 pr-4 text-xs font-semibold text-white placeholder-white/40 backdrop-blur-md transition-all focus:border-gold-accent/50 focus:outline-none focus:ring-2 focus:ring-gold-accent/50"
            />
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end lg:flex-nowrap">
            {/* Status Dropdown Filter */}
            <StatusFilterBar
              selected={statusFilter}
              onChange={setStatusFilter}
            />

            <button
              type="button"
              onClick={() => void handleDriveSync()}
              disabled={syncingDrive}
              className="flex min-w-0 items-center justify-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs font-black uppercase tracking-wider text-sky-200 backdrop-blur-md transition-all hover:bg-sky-400/20 disabled:opacity-50 sm:px-4"
              title="Baca file baru dari folder Google Drive yang terdaftar"
            >
              <RefreshCw size={16} className={syncingDrive ? "animate-spin" : ""} />
              <span className="truncate">{syncingDrive ? "Menyinkronkan…" : "Sinkronkan Drive"}</span>
            </button>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="col-span-2 flex min-w-0 items-center justify-center gap-2 rounded-xl border border-gold-accent/40 bg-gold-accent/20 px-3 py-2 text-xs font-black uppercase tracking-wider text-gold-accent shadow-lg backdrop-blur-md transition-all hover:border-gold-accent/60 hover:bg-gold-accent/30 sm:col-span-2 sm:px-4 lg:col-span-1"
            >
              <Plus size={16} />
              <span>Tambah Kontrak</span>
            </button>
          </div>
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
          load={loadContractsWithBaa}
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

      <BaaFormModal
        isOpen={Boolean(baaRow)}
        row={baaRow}
        session={session}
        onClose={() => setBaaRow(null)}
        onSuccess={() => {
          setBaaRow(null);
          void tableRef.current?.refresh();
        }}
      />

      {mapContract && (
        <div className="fixed inset-0 z-[10000] bg-slate-950">
          <MapView
            selectedRow={mapContract}
            locationPoints={mapLocationPoints}
            ispPoints={mapIspPoints}
            onClose={() => setMapContract(null)}
            onSaveLocationPoint={handleMapSaveLocationPoint}
            onDeleteLocationPoint={handleMapDeleteLocationPoint}
            onSaveIspPoint={handleMapSaveIspPoint}
            onDeleteIspPoint={handleMapDeleteIspPoint}
          />
          {mapLoading && (
            <div className="pointer-events-none absolute inset-0 z-[12000] flex items-center justify-center bg-slate-950/45">
              <div className="rounded-xl border border-white/15 bg-slate-900/95 px-4 py-3 text-xs font-bold text-white shadow-xl">
                Memuat titik peta kontrak…
              </div>
            </div>
          )}
          {mapError && (
            <div className="absolute bottom-4 left-4 right-4 z-[12000] rounded-xl border border-rose-400/40 bg-rose-950/95 px-4 py-3 text-xs font-bold text-rose-100 shadow-xl sm:left-auto sm:max-w-md">
              {mapError}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default KontrakPage;
