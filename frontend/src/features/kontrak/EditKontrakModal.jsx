import { useState, useEffect, useCallback, useRef } from "react";
import { X, AlertCircle, CheckCircle, Loader2, File, Paperclip, Download, Eye, Trash2 } from "lucide-react";
import { updateContract, listCustomers, uploadDocument, listDocuments, deleteDocument, fetchDocumentContent } from "../../lib/rust-api";
import { coreInputError, coreInputValue } from "./coreUtils";

const STATUS_OPTIONS = [
  "Beroperasi",
  "Belum Beroperasi",
  "Proses Perpanjangan",
  "Diperpanjang",
  "Di-upgrade",
  "Berhenti",
];

const SHARING_CORE_OPTIONS = ["1/2", "1/4", "1/8", "1/16", "1/32"];
const KATEGORI_OPTIONS = ["Kontrak", "BAK-PKS", "Dokumen Lain"];

/**
 * Edit Kontrak Modal
 * Pre-fills form with existing contract data
 */
export default function EditKontrakModal({ isOpen, onClose, onSuccess, contract, session }) {
  const [pelangganList, setPelangganList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pelangganLoading, setPelangganLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [endDateManual, setEndDateManual] = useState(false);
  const fileInputRef = useRef(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [namaFile, setNamaFile] = useState("");
  const [kategori, setKategori] = useState("");
  const [folderError, setFolderError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [documentAction, setDocumentAction] = useState("");

  // Form state - initialized from contract prop
  const [formData, setFormData] = useState({
    pelanggan_id: "",
    kode_kontrak: "",
    nama_lokasi: "",
    periode_awal: "",
    periode_berakhir: "",
    durasi_kontrak_bulan: "",
    status_kontrak: "Belum Beroperasi",
    kategori: "",
    core: "",
    sharing_core: "",
    no_kontrak: "",
    nilai_kontrak: "",
    biaya_aktivasi: "",
    perbulan: "",
    nilai_periode_aktif: "",
    keterangan: "",
  });

  const [errors, setErrors] = useState({});

  // Initialize form data when contract changes
  useEffect(() => {
    if (contract && isOpen) {
      // Calculate duration from dates
      let duration = "";
      if (contract.periode_awal && contract.periode_berakhir) {
        const start = new Date(contract.periode_awal);
        const end = new Date(contract.periode_berakhir);
        const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        duration = months > 0 ? months.toString() : "";
      }

      setFormData({
        pelanggan_id: contract.pelanggan_id?.toString() || "",
        kode_kontrak: contract.kode_kontrak || "",
        nama_lokasi: contract.nama_lokasi || "",
        periode_awal: contract.periode_awal || "",
        periode_berakhir: contract.periode_berakhir || "",
        durasi_kontrak_bulan: duration,
        status_kontrak: contract.status_kontrak || "Belum Beroperasi",
        kategori: contract.jalur || "",
        core: coreInputValue(contract.core),
        sharing_core: contract.sharing_core || "",
        no_kontrak: contract.nomor_kontrak || "",
        nilai_kontrak: contract.nilai_kontrak?.toString() || "",
        biaya_aktivasi: contract.biaya_aktivasi?.toString() || "",
        perbulan: contract.perbulan?.toString() || "",
        nilai_periode_aktif: contract.nilai_periode_aktif?.toString() || "",
        keterangan: contract.keterangan || "",
      });
      setErrors({});
      setError(null);
      setSuccess(false);
      setEndDateManual(false);
      setUploadFile(null);
      setNamaFile("");
      setKategori("");
      setFolderError(null);
      setUploading(false);
      setUploadProgress(0);
      setDeleteConfirm(null);
    }
  }, [contract, isOpen]);

  // Fetch existing documents for this contract
  useEffect(() => {
    if (contract?.id && isOpen) {
      fetchDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract?.id, isOpen]);

  // Fetch pelanggan list on mount
  useEffect(() => {
    if (isOpen) {
      fetchPelanggan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const fetchPelanggan = async () => {
    setPelangganLoading(true);
    try {
      const data = await listCustomers(session.token);
      const rows = Array.isArray(data) ? data : data?.data || data?.items || [];
      setPelangganList(rows);
    } catch (err) {
      console.error("Failed to fetch pelanggan:", err);
      setError("Gagal memuat daftar pelanggan");
    } finally {
      setPelangganLoading(false);
    }
  };

  const fetchDocuments = async () => {
    if (!contract?.id) return;
    setDocsLoading(true);
    try {
      const data = await listDocuments(session.token, contract.id);
      const rows = Array.isArray(data) ? data : data?.data || data?.items || [];
      setDocuments(rows);
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    } finally {
      setDocsLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setNamaFile(file.name);
      setFolderError(null);
    }
  };

  const handleDeleteDocument = async (docId) => {
    try {
      await deleteDocument(session.token, docId);
      setDeleteConfirm(null);
      fetchDocuments();
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  const handleDocumentAction = async (doc, mode) => {
    const previewWindow = mode === "preview" ? window.open("", "_blank") : null;
    if (previewWindow) previewWindow.opener = null;
    setDocumentAction(`${mode}-${doc.id}`);
    try {
      if (mode === "preview" && !previewWindow) throw new Error("Izinkan pop-up browser untuk membuka preview dokumen.");
      const blob = await fetchDocumentContent(session.token, doc.id, mode);
      const url = URL.createObjectURL(blob);
      if (mode === "preview") {
        previewWindow.location.href = url;
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = doc.nama_file || "dokumen";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      if (previewWindow) previewWindow.close();
      setError(err.message || "Dokumen gagal dibuka.");
    } finally {
      setDocumentAction("");
    }
  };

  // Calculate end date from start date + duration
  const calculateEndDate = useCallback((startDate, months) => {
    if (!startDate || !months) return "";
    const start = new Date(startDate);
    start.setMonth(start.getMonth() + parseInt(months, 10));
    return start.toISOString().split("T")[0];
  }, []);

  // Calculate duration from start date to end date
  const calculateDuration = useCallback((startDate, endDate) => {
    if (!startDate || !endDate) return "";
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) return "";
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    return months > 0 ? months.toString() : "";
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const newData = { ...prev, [name]: value };

      // Two-way binding & mutual exclusivity logic
      if (name === "core" && value.trim() !== "") {
        newData.sharing_core = "";
      } else if (name === "sharing_core" && value !== "") {
        newData.core = "";
      }

      if (name === "durasi_kontrak_bulan" && !endDateManual) {
        newData.periode_berakhir = calculateEndDate(newData.periode_awal, value);
      } else if (name === "periode_berakhir") {
        setEndDateManual(true);
        newData.durasi_kontrak_bulan = calculateDuration(formData.periode_awal, value);
      } else if (name === "periode_awal" && prev.periode_awal && prev.durasi_kontrak_bulan && !endDateManual) {
        newData.periode_berakhir = calculateEndDate(value, prev.durasi_kontrak_bulan);
      }

      return newData;
    });

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.pelanggan_id) {
      newErrors.pelanggan_id = "Pelanggan wajib dipilih";
    }
    if (!formData.nama_lokasi.trim()) {
      newErrors.nama_lokasi = "Nama lokasi wajib diisi";
    }
    if (!formData.periode_awal) {
      newErrors.periode_awal = "Periode awal wajib diisi";
    }
    if (!formData.durasi_kontrak_bulan || parseInt(formData.durasi_kontrak_bulan, 10) <= 0) {
      newErrors.durasi_kontrak_bulan = "Durasi kontrak wajib diisi (minimal 1 bulan)";
    }
    if (!formData.periode_berakhir) {
      newErrors.periode_berakhir = "Periode berakhir wajib diisi";
    }
    if (formData.periode_awal && formData.periode_berakhir) {
      const start = new Date(formData.periode_awal);
      const end = new Date(formData.periode_berakhir);
      if (end <= start) {
        newErrors.periode_berakhir = "Periode berakhir harus setelah periode awal";
      }
    }
    if (!formData.sharing_core) {
      const coreError = coreInputError(formData.core);
      if (coreError) newErrors.core = coreError;
    }
    if (uploadFile && !kategori) {
      setFolderError("Folder tujuan wajib dipilih");
      newErrors.folder = true;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      const payload = { ...formData };

      // Remove empty optional fields
      Object.keys(payload).forEach((key) => {
        if (payload[key] === "" || payload[key] === null) {
          if (key === "core" || key === "sharing_core") return;
          delete payload[key];
        }
      });

      // Parse numeric fields
      if (payload.pelanggan_id) payload.pelanggan_id = parseInt(payload.pelanggan_id, 10);
      if (payload.nilai_kontrak) payload.nilai_kontrak = parseFloat(payload.nilai_kontrak);
      if (payload.biaya_aktivasi) payload.biaya_aktivasi = parseFloat(payload.biaya_aktivasi);
      if (payload.perbulan) payload.perbulan = parseFloat(payload.perbulan);
      if (payload.nilai_periode_aktif) payload.nilai_periode_aktif = parseFloat(payload.nilai_periode_aktif);
      if (payload.durasi_kontrak_bulan) payload.durasi_kontrak_bulan = parseInt(payload.durasi_kontrak_bulan, 10);

      await updateContract(session.token, contract.id, payload);

      if (uploadFile) {
        setUploading(true);
        setUploadProgress(0);

        const formDataUpload = new FormData();
        formDataUpload.append("file", uploadFile);
        formDataUpload.append("kategori", kategori || "Kontrak");
        formDataUpload.append("lokasi_id", contract.id.toString());
        if (namaFile && namaFile !== uploadFile.name) {
          const blob = uploadFile.slice(0, uploadFile.size, uploadFile.type);
          const renamedFile = new File([blob], namaFile, { type: uploadFile.type });
          formDataUpload.set("file", renamedFile);
        }

        await uploadDocument(session.token, formDataUpload, (progress) => {
          setUploadProgress(progress);
        });
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err.message || "Gagal mengubah kontrak");
    } finally {
      setLoading(false);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleClose = () => {
    setErrors({});
    setError(null);
    setSuccess(false);
    setEndDateManual(false);
    setUploadFile(null);
    setNamaFile("");
    setKategori("");
    setFolderError(null);
    setUploading(false);
    setUploadProgress(0);
    setDeleteConfirm(null);
    setDocuments([]);
    onClose();
  };

  if (!isOpen || !contract) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-xl font-semibold text-white">Edit Kontrak</h2>
            <p className="text-sm text-slate-400 mt-0.5">Ubah informasi kontrak</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            disabled={loading}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="p-6 space-y-6">
            {/* Error/Success Messages */}
            {error && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="text-red-400 shrink-0" size={20} />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="text-emerald-400 shrink-0" size={20} />
                <p className="text-sm text-emerald-400">Kontrak berhasil diubah!</p>
              </div>
            )}

            {/* Section: Informasi Utama */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
                Informasi Utama
              </h3>

              {/* Kode Kontrak (Readonly) */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">
                  Kode Kontrak
                </label>
                <input
                  type="text"
                  value={formData.kode_kontrak}
                  readOnly
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-slate-300 cursor-not-allowed"
                />
              </div>

              {/* Pelanggan Dropdown */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">
                  Pelanggan <span className="text-red-400">*</span>
                </label>
                <select
                  name="pelanggan_id"
                  value={formData.pelanggan_id}
                  onChange={handleChange}
                  disabled={pelangganLoading || loading}
                  className={`w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50 ${
                    errors.pelanggan_id ? "border-red-500" : "border-slate-600"
                  }`}
                >
                  <option value="">Pilih Pelanggan</option>
                  {pelangganList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nama_perusahaan || p.nama_pelanggan || p.nama}
                    </option>
                  ))}
                </select>
                {errors.pelanggan_id && (
                  <p className="text-xs text-red-400">{errors.pelanggan_id}</p>
                )}
              </div>

              {/* Nama Lokasi */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">
                  Nama Lokasi <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="nama_lokasi"
                  value={formData.nama_lokasi}
                  onChange={handleChange}
                  disabled={loading}
                  placeholder="Contoh: Tower Jakarta Selatan"
                  className={`w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50 ${
                    errors.nama_lokasi ? "border-red-500" : "border-slate-600"
                  }`}
                />
                {errors.nama_lokasi && (
                  <p className="text-xs text-red-400">{errors.nama_lokasi}</p>
                )}
              </div>

              {/* Periode & Durasi */}
              <div className="grid grid-cols-3 gap-4">
                {/* Periode Awal */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">
                    Periode Awal <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    name="periode_awal"
                    value={formData.periode_awal}
                    onChange={handleChange}
                    disabled={loading}
                    className={`w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50 ${
                      errors.periode_awal ? "border-red-500" : "border-slate-600"
                    }`}
                  />
                  {errors.periode_awal && (
                    <p className="text-xs text-red-400">{errors.periode_awal}</p>
                  )}
                </div>

                {/* Durasi */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">
                    Durasi (Bulan) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    name="durasi_kontrak_bulan"
                    value={formData.durasi_kontrak_bulan}
                    onChange={handleChange}
                    disabled={loading}
                    placeholder="12"
                    min="1"
                    className={`w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50 ${
                      errors.durasi_kontrak_bulan ? "border-red-500" : "border-slate-600"
                    }`}
                  />
                  {errors.durasi_kontrak_bulan && (
                    <p className="text-xs text-red-400">{errors.durasi_kontrak_bulan}</p>
                  )}
                </div>

                {/* Periode Berakhir */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">
                    Periode Berakhir
                    {endDateManual && (
                      <span className="ml-1 text-xs text-slate-500 italic">(manual)</span>
                    )}
                  </label>
                  <input
                    type="date"
                    name="periode_berakhir"
                    value={formData.periode_berakhir}
                    onChange={handleChange}
                    disabled={loading}
                    className={`w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50 ${
                      errors.periode_berakhir ? "border-red-500" : "border-slate-600"
                    }`}
                  />
                  {errors.periode_berakhir && (
                    <p className="text-xs text-red-400">{errors.periode_berakhir}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Section: Detail Kontrak */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
                Detail Kontrak
              </h3>

              <div className="grid grid-cols-2 gap-4">
                {/* Status */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Status</label>
                  <select
                    name="status_kontrak"
                    value={formData.status_kontrak}
                    onChange={handleChange}
                    disabled={loading}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Kategori */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Kategori</label>
                  <input
                    type="text"
                    name="kategori"
                    value={formData.kategori}
                    onChange={handleChange}
                    disabled={loading}
                    placeholder="Contoh: Premium"
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50"
                  />
                </div>

                {/* Core (Manual Input) */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">
                    Core <span className="text-xs text-slate-400 font-normal">(Manual Input)</span>
                  </label>
                  <input
                    type="number"
                    name="core"
                    value={formData.core}
                    onChange={handleChange}
                    disabled={loading || !!formData.sharing_core}
                    min="1"
                    step="1"
                    placeholder="Contoh: 1 atau 4"
                    className={`w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all ${
                      formData.sharing_core ? "opacity-50 cursor-not-allowed bg-slate-900/50 border-slate-700" : "border-slate-600"
                    }`}
                  />
                  {errors.core && <p className="text-xs text-red-400">{errors.core}</p>}
                  {formData.sharing_core && (
                    <p className="text-[10px] text-amber-400 font-medium">Nonaktif (Sharing Core dipilih)</p>
                  )}
                </div>

                {/* Sharing Core */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Sharing Core</label>
                  <select
                    name="sharing_core"
                    value={formData.sharing_core}
                    onChange={handleChange}
                    disabled={loading || (!!formData.core && formData.core.trim() !== "")}
                    className={`w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all ${
                      formData.core && formData.core.trim() !== "" ? "opacity-50 cursor-not-allowed bg-slate-900/50 border-slate-700" : "border-slate-600"
                    }`}
                  >
                    <option value="">Tidak Ada (Direct Core)</option>
                    {SHARING_CORE_OPTIONS.map((share) => (
                      <option key={share} value={share}>
                        {share}
                      </option>
                    ))}
                  </select>
                  {formData.core && formData.core.trim() !== "" && (
                    <p className="text-[10px] text-amber-400 font-medium">Nonaktif (Core manual diisi)</p>
                  )}
                </div>
              </div>

              {/* No Kontrak */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">No. Kontrak</label>
                <input
                  type="text"
                  name="no_kontrak"
                  value={formData.no_kontrak}
                  onChange={handleChange}
                  disabled={loading}
                  placeholder="Contoh: 001/SPK/VI/2024"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50"
                />
              </div>
            </div>

            {/* Section: Keuangan */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
                Informasi Keuangan
              </h3>

              <div className="grid grid-cols-2 gap-4">
                {/* Nilai Kontrak */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Nilai Kontrak</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">Rp</span>
                    <input
                      type="number"
                      name="nilai_kontrak"
                      value={formData.nilai_kontrak}
                      onChange={handleChange}
                      disabled={loading}
                      placeholder="0"
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Biaya Aktivasi */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Biaya Aktivasi</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">Rp</span>
                    <input
                      type="number"
                      name="biaya_aktivasi"
                      value={formData.biaya_aktivasi}
                      onChange={handleChange}
                      disabled={loading}
                      placeholder="0"
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Per Bulan */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Per Bulan</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">Rp</span>
                    <input
                      type="number"
                      name="perbulan"
                      value={formData.perbulan}
                      onChange={handleChange}
                      disabled={loading}
                      placeholder="0"
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Nilai Periode Aktif */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Nilai Periode Aktif</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">Rp</span>
                    <input
                      type="number"
                      name="nilai_periode_aktif"
                      value={formData.nilai_periode_aktif}
                      onChange={handleChange}
                      disabled={loading}
                      placeholder="0"
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Keterangan */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">Keterangan</h3>
              <div className="space-y-1.5">
                <textarea
                  name="keterangan"
                  value={formData.keterangan}
                  onChange={handleChange}
                  disabled={loading}
                  rows={3}
                  placeholder="Tambahkan keterangan jika diperlukan..."
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all resize-none disabled:opacity-50"
                />
              </div>
            </div>

            {/* Section: Dokumen Terunggah */}
            <div className="space-y-3 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
                  Dokumen Terunggah
                </h3>
                {!docsLoading && documents.length > 0 && (
                  <span className="text-xs text-slate-500">{documents.length} berkas</span>
                )}
              </div>

              {docsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={20} className="animate-spin text-slate-500" />
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-4 rounded-lg border border-dashed border-slate-700/50">
                  <p className="text-sm text-slate-500">Belum ada dokumen terunggah</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/40 border border-slate-700/50"
                    >
                      <File size={18} className="text-slate-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 truncate">{doc.nama_file}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
                            {doc.kategori}
                          </span>
                          {doc.ukuran_byte != null && (
                            <span className="text-[10px] text-slate-500">
                              {(doc.ukuran_byte / 1024).toFixed(0)} KB
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500">
                            {doc.created_at?.slice(0, 10)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleDocumentAction(doc, "preview")}
                          disabled={documentAction !== ""}
                          className="p-1.5 rounded-md text-slate-400 hover:text-indigo-400 hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                          title="Preview dokumen"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDocumentAction(doc, "download")}
                          disabled={documentAction !== ""}
                          className="p-1.5 rounded-md text-slate-400 hover:text-emerald-400 hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                          title="Download dokumen"
                        >
                          <Download size={14} />
                        </button>
                        {deleteConfirm === doc.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteDocument(doc.id)}
                              className="px-2 py-1 rounded text-[10px] font-medium bg-red-600/80 text-white hover:bg-red-600 transition-colors"
                            >
                              Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm(null)}
                              className="px-2 py-1 rounded text-[10px] text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm(doc.id)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-700/50 transition-colors"
                            title="Hapus dokumen"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section: Upload Dokumen Baru */}
            <div className="border-t border-white/10 pt-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-3">
                Upload Dokumen Baru (Opsional)
              </h3>

              {/* Kategori Dropdown */}
              <div className="space-y-1.5 mb-3">
                <label className="block text-sm font-medium text-slate-400">
                  Folder Tujuan {uploadFile && <span className="text-red-400">*</span>}
                </label>
                <select
                  value={kategori}
                  onChange={(e) => {
                    setKategori(e.target.value);
                    setFolderError(null);
                  }}
                  disabled={loading || uploading}
                  className={`w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50 ${
                    folderError ? "border-red-500" : "border-slate-600"
                  }`}
                >
                  <option value="">Pilih Folder Tujuan</option>
                  {KATEGORI_OPTIONS.map((kat) => (
                    <option key={kat} value={kat}>
                      {kat}
                    </option>
                  ))}
                </select>
                {folderError && (
                  <p className="text-xs text-red-400">{folderError}</p>
                )}
              </div>

              {/* File Input */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-400">Pilih File</label>
                <div className="relative">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileChange}
                    disabled={loading || uploading}
                    className="hidden"
                    id="edit-contract-file-upload-input"
                  />
                  <label
                    htmlFor="edit-contract-file-upload-input"
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                      uploadFile
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-slate-600 hover:border-slate-500 bg-slate-800/30"
                    } ${loading || uploading ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {uploadFile ? (
                      <>
                        <File className="text-emerald-400" size={20} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-emerald-400 truncate">{uploadFile.name}</p>
                          <p className="text-xs text-slate-400">
                            {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Paperclip className="text-slate-400" size={20} />
                        <span className="text-sm text-slate-400">
                          Klik untuk pilih berkas atau drag & drop
                        </span>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {/* Custom File Name */}
              {uploadFile && (
                <div className="space-y-1.5 mt-3">
                  <label className="block text-sm font-medium text-slate-400">
                    Nama File (dapat diedit)
                  </label>
                  <input
                    type="text"
                    value={namaFile}
                    onChange={(e) => setNamaFile(e.target.value)}
                    disabled={loading || uploading}
                    placeholder="Nama file"
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50"
                  />
                </div>
              )}

              {/* Upload Progress */}
              {uploading && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>Mengunggah berkas ke Google Drive...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-slate-900/50">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading || uploading}
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || uploading || success}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-amber-600 to-amber-500 text-white hover:from-amber-500 hover:to-amber-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/25"
            >
              {loading || uploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{uploading ? `Mengunggah... ${uploadProgress}%` : "Menyimpan..."}</span>
                </>
              ) : success ? (
                <>
                  <CheckCircle size={16} />
                  <span>Berhasil!</span>
                </>
              ) : (
                <span>Simpan Perubahan</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
