import { useState, useEffect, useRef } from "react";
import { X, AlertCircle, CheckCircle, Loader2, CalendarPlus, File, Paperclip } from "lucide-react";
import { extendContract, getNextKontrakCode, uploadDocument } from "../../lib/rust-api";
import { coreInputError, coreInputValue } from "./coreUtils";

const KATEGORI_OPTIONS = ["Kontrak", "BAK-PKS", "Dokumen Lain"];

/**
 * Extend Kontrak Modal
 * Extends an existing contract for a new period without overwriting history
 */
export default function ExtendKontrakModal({ isOpen, onClose, onSuccess, contract, session }) {
  const [loading, setLoading] = useState(false);
  const [fetchingCode, setFetchingCode] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef(null);

  // File upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [namaFile, setNamaFile] = useState("");
  const [kategori, setKategori] = useState("");
  const [folderError, setFolderError] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    kode_kontrak: "",
    no_kontrak: "",
    periode_awal: "",
    periode_berakhir: "",
    durasi_kontrak_bulan: "12",
    nilai_kontrak: "",
    biaya_aktivasi: "0",
    perbulan: "",
    nilai_periode_aktif: "",
    keterangan: "",
    core: "",
    sharing_core: "",
  });

  const [errors, setErrors] = useState({});

  // Helper to calculate next day after date string YYYY-MM-DD
  const getNextDay = (dateStr) => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      date.setDate(date.getDate() + 1);
      return date.toISOString().split("T")[0];
    } catch {
      return "";
    }
  };

  // Calculate end date from start date + duration
  const calculateEndDate = (startDate, months) => {
    if (!startDate || !months) return "";
    try {
      const start = new Date(startDate);
      start.setMonth(start.getMonth() + parseInt(months, 10));
      return start.toISOString().split("T")[0];
    } catch {
      return "";
    }
  };

  // Pre-fill form when contract changes or modal opens
  useEffect(() => {
    if (contract && isOpen) {
      fetchNextCode();
      const nextStart = getNextDay(contract.periode_berakhir) || new Date().toISOString().split("T")[0];
      const defaultDuration = "12";
      const nextEnd = calculateEndDate(nextStart, defaultDuration);

      setFormData({
        kode_kontrak: "",
        no_kontrak: contract.nomor_kontrak || "",
        periode_awal: nextStart,
        periode_berakhir: nextEnd,
        durasi_kontrak_bulan: defaultDuration,
        nilai_kontrak: contract.nilai_kontrak?.toString() || "",
        biaya_aktivasi: "0",
        perbulan: contract.perbulan?.toString() || "",
        nilai_periode_aktif: contract.nilai_periode_aktif?.toString() || "",
        keterangan: `Perpanjangan dari kontrak ${contract.kode_kontrak || ""}`,
        core: coreInputValue(contract.core),
        sharing_core: contract.sharing_core || "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract, isOpen]);

  const fetchNextCode = async () => {
    setFetchingCode(true);
    try {
      const data = await getNextKontrakCode(session.token);
      setFormData((prev) => ({ ...prev, kode_kontrak: data.kode_kontrak || "" }));
    } catch (err) {
      console.error("Failed to fetch next kode_kontrak:", err);
    } finally {
      setFetchingCode(false);
    }
  };

  if (!isOpen || !contract) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const newData = { ...prev, [name]: value };

      if (name === "core" && value.trim() !== "") {
        newData.sharing_core = "";
      } else if (name === "sharing_core" && value !== "") {
        newData.core = "";
      }

      if (name === "durasi_kontrak_bulan" || name === "periode_awal") {
        const startDate = name === "periode_awal" ? value : prev.periode_awal;
        const duration = name === "durasi_kontrak_bulan" ? value : prev.durasi_kontrak_bulan;
        newData.periode_berakhir = calculateEndDate(startDate, duration);
      }

      return newData;
    });

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
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

  const validateForm = () => {
    const newErrors = {};

    if (!formData.kode_kontrak.trim()) {
      newErrors.kode_kontrak = "Kode kontrak wajib diisi";
    }
    if (!formData.periode_awal) {
      newErrors.periode_awal = "Periode awal wajib diisi";
    }
    if (!formData.durasi_kontrak_bulan || parseInt(formData.durasi_kontrak_bulan, 10) <= 0) {
      newErrors.durasi_kontrak_bulan = "Durasi wajib diisi (minimal 1 bulan)";
    }
    if (!formData.periode_berakhir) {
      newErrors.periode_berakhir = "Periode berakhir wajib diisi";
    }
    if (uploadFile && !kategori) {
      setFolderError("Folder tujuan wajib dipilih");
      newErrors.folder = true;
    }
    if (formData.core.trim() && formData.sharing_core) {
      newErrors.core = "Core dan Sharing Core tidak boleh diisi bersamaan";
    }
    if (!formData.sharing_core) {
      const coreError = coreInputError(formData.core);
      if (coreError) newErrors.core = coreError;
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
      Object.keys(payload).forEach((key) => {
        if (payload[key] === "" || payload[key] === null) delete payload[key];
      });

      if (payload.nilai_kontrak) payload.nilai_kontrak = parseFloat(payload.nilai_kontrak);
      if (payload.biaya_aktivasi) payload.biaya_aktivasi = parseFloat(payload.biaya_aktivasi);
      if (payload.perbulan) payload.perbulan = parseFloat(payload.perbulan);
      if (payload.nilai_periode_aktif) payload.nilai_periode_aktif = parseFloat(payload.nilai_periode_aktif);
      if (payload.durasi_kontrak_bulan) payload.durasi_kontrak_bulan = parseInt(payload.durasi_kontrak_bulan, 10);

      const extendedContract = await extendContract(session.token, contract.id, payload);

      if (uploadFile && extendedContract?.id) {
        setUploading(true);
        setUploadProgress(0);

        const formDataUpload = new FormData();
        formDataUpload.append("file", uploadFile);
        formDataUpload.append("kategori", kategori || "Kontrak");
        formDataUpload.append("lokasi_id", extendedContract.id.toString());
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
      setError(err.message || "Gagal memperpanjang kontrak");
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
    setUploadFile(null);
    setNamaFile("");
    setKategori("");
    setFolderError(null);
    setUploading(false);
    setUploadProgress(0);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
              <CalendarPlus size={22} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Perpanjang Kontrak</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {contract.nama_pelanggan} — {contract.nama_lokasi}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors" disabled={loading || uploading}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="p-6 space-y-6">
            {error && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="text-red-400 shrink-0" size={20} />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="text-emerald-400 shrink-0" size={20} />
                <p className="text-sm text-emerald-400">Kontrak berhasil diperpanjang!</p>
              </div>
            )}

            {/* Readonly Summary Card */}
            <div className="p-4 rounded-xl bg-slate-800/60 border border-white/5 space-y-2 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Kontrak Induk / Saat Ini:</span>
                <span className="font-mono text-emerald-400 font-semibold">{contract.kode_kontrak}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Periode Lama:</span>
                <span className="font-semibold text-white">{contract.periode_awal} s.d. {contract.periode_berakhir}</span>
              </div>
            </div>

            {/* Form Fields: Periode Perpanjangan */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">Periode Perpanjangan Baru</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Kode Kontrak Baru *</label>
                  <div className="relative">
                    <input
                      type="text"
                      name="kode_kontrak"
                      value={formData.kode_kontrak}
                      onChange={handleChange}
                      disabled={loading || fetchingCode}
                      className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                    />
                    {fetchingCode && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">No. Kontrak Baru</label>
                  <input
                    type="text"
                    name="no_kontrak"
                    value={formData.no_kontrak}
                    onChange={handleChange}
                    disabled={loading}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Periode Awal Baru *</label>
                  <input
                    type="date"
                    name="periode_awal"
                    value={formData.periode_awal}
                    onChange={handleChange}
                    disabled={loading}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Durasi (Bulan) *</label>
                  <input
                    type="number"
                    name="durasi_kontrak_bulan"
                    value={formData.durasi_kontrak_bulan}
                    onChange={handleChange}
                    min="1"
                    disabled={loading}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Periode Berakhir Baru *</label>
                  <input
                    type="date"
                    name="periode_berakhir"
                    value={formData.periode_berakhir}
                    onChange={handleChange}
                    disabled={loading}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">Detail Kapasitas</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Core (Manual Input)</label>
                  <input
                    type="number"
                    name="core"
                    value={formData.core}
                    onChange={handleChange}
                    disabled={loading || !!formData.sharing_core}
                    min="1"
                    step="1"
                    placeholder="Contoh: 1 atau 4"
                    className={`w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all disabled:opacity-50 ${
                      errors.core ? "border-red-500" : "border-slate-600"
                    }`}
                  />
                  {formData.sharing_core && (
                    <p className="text-xs text-slate-500">Nonaktif (Sharing Core diisi)</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Sharing Core</label>
                  <select
                    name="sharing_core"
                    value={formData.sharing_core}
                    onChange={handleChange}
                    disabled={loading || !!formData.core.trim()}
                    className={`w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all disabled:opacity-50 ${
                      errors.core ? "border-red-500" : "border-slate-600"
                    }`}
                  >
                    <option value="">Tidak Ada (Direct Core)</option>
                    <option value="1/2">1/2</option>
                    <option value="1/4">1/4</option>
                    <option value="1/8">1/8</option>
                    <option value="1/16">1/16</option>
                    <option value="1/32">1/32</option>
                  </select>
                  {formData.core.trim() && (
                    <p className="text-xs text-slate-500">Nonaktif (Core manual diisi)</p>
                  )}
                </div>
              </div>
              {errors.core && <p className="text-xs text-red-400">{errors.core}</p>}
            </div>

            {/* Financial Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">Informasi Keuangan Perpanjangan</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Nilai Kontrak (Rp)</label>
                  <input type="number" name="nilai_kontrak" value={formData.nilai_kontrak} onChange={handleChange} disabled={loading} className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Biaya Per Bulan (Rp)</label>
                  <input type="number" name="perbulan" value={formData.perbulan} onChange={handleChange} disabled={loading} className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white" />
                </div>
              </div>
            </div>

            {/* Upload Document Section */}
            <div className="border-t border-white/10 pt-4 mt-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-3">Upload Dokumen Perpanjangan (Opsional)</h3>
              <div className="space-y-1.5 mb-3">
                <label className="block text-sm font-medium text-slate-400">
                  Folder Tujuan {uploadFile && <span className="text-red-400">*</span>}
                </label>
                <select
                  value={kategori}
                  onChange={(e) => { setKategori(e.target.value); setFolderError(null); }}
                  disabled={loading || uploading}
                  className={`w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border text-white ${folderError ? "border-red-500" : "border-slate-600"}`}
                >
                  <option value="">Pilih Folder Tujuan</option>
                  {KATEGORI_OPTIONS.map((kat) => (
                    <option key={kat} value={kat}>{kat}</option>
                  ))}
                </select>
                {folderError && <p className="text-xs text-red-400">{folderError}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-400">Pilih Berkas Perpanjangan (PDF)</label>
                <div className="relative">
                  <input ref={fileInputRef} type="file" onChange={handleFileChange} disabled={loading || uploading} className="hidden" id="extend-file-upload-input" />
                  <label htmlFor="extend-file-upload-input" className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer ${uploadFile ? "border-emerald-500/50 bg-emerald-500/10" : "border-slate-600 bg-slate-800/30"}`}>
                    {uploadFile ? (
                      <>
                        <File className="text-emerald-400" size={20} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-emerald-400 truncate">{uploadFile.name}</p>
                          <p className="text-xs text-slate-400">{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Paperclip className="text-slate-400" size={20} />
                        <span className="text-sm text-slate-400">Klik untuk pilih berkas perpanjangan PKS</span>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {uploadFile && (
                <div className="space-y-1.5 mt-3">
                  <label className="block text-sm font-medium text-slate-400">Nama File (dapat diedit)</label>
                  <input type="text" value={namaFile} onChange={(e) => setNamaFile(e.target.value)} disabled={loading || uploading} className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white" />
                </div>
              )}

              {uploading && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>Mengunggah berkas ke Google Drive...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-slate-900/50">
            <button type="button" onClick={handleClose} disabled={loading || uploading} className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors">
              Batal
            </button>
            <button type="submit" disabled={loading || uploading || success} className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-sky-600 to-sky-500 text-white hover:from-sky-500 hover:to-sky-400 transition-all shadow-lg shadow-sky-500/25">
              {loading || uploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{uploading ? `Mengunggah... ${uploadProgress}%` : "Memproses..."}</span>
                </>
              ) : success ? (
                <>
                  <CheckCircle size={16} />
                  <span>Berhasil!</span>
                </>
              ) : (
                <span>Perpanjang Kontrak</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
