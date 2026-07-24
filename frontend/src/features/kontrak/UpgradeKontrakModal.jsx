import { useState, useEffect, useRef, useMemo } from "react";
import { X, AlertCircle, CheckCircle, Loader2, ArrowUp, File, Paperclip, Calculator } from "lucide-react";
import { upgradeContract, getNextKontrakCode, uploadDocument } from "../../lib/rust-api";

const CORE_OPTIONS = ["1 Core", "2 Core", "4 Core", "8 Core", "16 Core", "32 Core", "64 Core"];
const SHARING_CORE_OPTIONS = ["1/2", "1/4", "1/8", "1/16", "1/32"];
const KATEGORI_OPTIONS = ["Kontrak", "BAK-PKS", "Dokumen Lain"];

function nextDateInput(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || "");
  if (!match) return "";

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Upgrade Kontrak Modal
 * Upgrades capacity package of an active contract with live prorated billing preview
 */
export default function UpgradeKontrakModal({ isOpen, onClose, onSuccess, contract, session }) {
  const [loading, setLoading] = useState(false);
  const [fetchingCode, setFetchingCode] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef(null);

  // Core mode: "direct" or "sharing"
  const [coreMode, setCoreMode] = useState("direct");

  // File upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [namaFile, setNamaFile] = useState("");
  const [kategori, setKategori] = useState("");
  const [folderError, setFolderError] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    kode_kontrak: "",
    no_kontrak: "",
    tanggal_mulai_upgrade: new Date().toISOString().split("T")[0],
    core: "4 Core",
    sharing_core: "",
    durasi_kontrak_bulan: "12",
    nilai_kontrak: "",
    biaya_aktivasi: "0",
    perbulan: "",
    nilai_periode_aktif: "",
    keterangan: "",
  });

  const [errors, setErrors] = useState({});
  const minUpgradeDate = useMemo(() => nextDateInput(contract?.periode_awal), [contract?.periode_awal]);

  useEffect(() => {
    if (contract && isOpen) {
      fetchNextCode();
      const isSharing = !!contract.sharing_core;
      setCoreMode(isSharing ? "sharing" : "direct");

      const today = new Date().toISOString().split("T")[0];
      const defaultUpgradeDate = minUpgradeDate && today < minUpgradeDate ? minUpgradeDate : today;
      setFormData({
        kode_kontrak: "",
        no_kontrak: contract.nomor_kontrak || "",
        tanggal_mulai_upgrade: defaultUpgradeDate,
        core: isSharing ? "" : contract.core || "4 Core",
        sharing_core: isSharing ? contract.sharing_core || "1/4" : "",
        durasi_kontrak_bulan: contract.durasi_kontrak_bulan?.toString() || "12",
        nilai_kontrak: contract.nilai_kontrak ? (contract.nilai_kontrak * 1.5).toString() : "",
        biaya_aktivasi: "0",
        perbulan: contract.perbulan ? (contract.perbulan * 1.5).toString() : "",
        nilai_periode_aktif: contract.nilai_periode_aktif ? (contract.nilai_periode_aktif * 1.5).toString() : "",
        keterangan: `Upgrade paket dari ${contract.core || contract.sharing_core || "lama"} (Kontrak Induk: ${contract.kode_kontrak || ""})`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract, isOpen, minUpgradeDate]);

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

  // Live Prorated Billing Calculation
  const prorationCalc = useMemo(() => {
    if (!contract || !formData.tanggal_mulai_upgrade || !formData.perbulan) return null;
    try {
      const upgradeDate = new Date(formData.tanggal_mulai_upgrade);
      const year = upgradeDate.getFullYear();
      const month = upgradeDate.getMonth();

      // Total days in transition month
      const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
      const dayOfMonth = upgradeDate.getDate();

      const oldDays = dayOfMonth - 1; // Days before upgrade
      const newDays = totalDaysInMonth - oldDays; // Days under new package

      const oldMonthlyRate = contract.perbulan || 0;
      const newMonthlyRate = parseFloat(formData.perbulan) || 0;

      const oldProrated = Math.round((oldMonthlyRate / totalDaysInMonth) * oldDays);
      const newProrated = Math.round((newMonthlyRate / totalDaysInMonth) * newDays);
      const totalTransitionBilling = oldProrated + newProrated;

      const monthName = upgradeDate.toLocaleDateString("id-ID", { month: "long", year: "numeric" });

      return {
        monthName,
        totalDaysInMonth,
        oldDays,
        newDays,
        oldProrated,
        newProrated,
        totalTransitionBilling,
      };
    } catch {
      return null;
    }
  }, [contract, formData.tanggal_mulai_upgrade, formData.perbulan]);

  if (!isOpen || !contract) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleCoreModeChange = (mode) => {
    setCoreMode(mode);
    if (mode === "direct") {
      setFormData((prev) => ({ ...prev, core: "4 Core", sharing_core: "" }));
    } else {
      setFormData((prev) => ({ ...prev, core: "", sharing_core: "1/4" }));
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
    if (!formData.tanggal_mulai_upgrade) {
      newErrors.tanggal_mulai_upgrade = "Tanggal mulai upgrade wajib diisi";
    } else if (minUpgradeDate && formData.tanggal_mulai_upgrade < minUpgradeDate) {
      newErrors.tanggal_mulai_upgrade = "Tanggal upgrade harus setelah tanggal mulai kontrak. Gunakan edit kontrak untuk perubahan pada hari pertama.";
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
      Object.keys(payload).forEach((key) => {
        if (payload[key] === "" || payload[key] === null) delete payload[key];
      });

      if (payload.nilai_kontrak) payload.nilai_kontrak = parseFloat(payload.nilai_kontrak);
      if (payload.biaya_aktivasi) payload.biaya_aktivasi = parseFloat(payload.biaya_aktivasi);
      if (payload.perbulan) payload.perbulan = parseFloat(payload.perbulan);
      if (payload.nilai_periode_aktif) payload.nilai_periode_aktif = parseFloat(payload.nilai_periode_aktif);
      if (payload.durasi_kontrak_bulan) payload.durasi_kontrak_bulan = parseInt(payload.durasi_kontrak_bulan, 10);

      const upgradedContract = await upgradeContract(session.token, contract.id, payload);

      if (uploadFile && upgradedContract?.id) {
        setUploading(true);
        setUploadProgress(0);

        const formDataUpload = new FormData();
        formDataUpload.append("file", uploadFile);
        formDataUpload.append("kategori", kategori || "Kontrak");
        formDataUpload.append("lokasi_id", upgradedContract.id.toString());
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
      setError(err.message || "Gagal meng-upgrade paket");
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
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <ArrowUp size={22} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Upgrade Paket Kontrak</h2>
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
                <p className="text-sm text-emerald-400">Paket berhasil di-upgrade!</p>
              </div>
            )}

            {/* Readonly Summary Card */}
            <div className="p-4 rounded-xl bg-slate-800/60 border border-white/5 space-y-2 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Kapasitas Paket Saat Ini:</span>
                <span className="font-semibold text-emerald-400">{contract.core || contract.sharing_core || "1 Core"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tarif Per Bulan Saat Ini:</span>
                <span className="font-mono text-white">Rp {(contract.perbulan || 0).toLocaleString("id-ID")}</span>
              </div>
            </div>

            {/* Tanggal Efektif Upgrade */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">Tanggal Efektif Upgrade</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Tanggal Mulai Upgrade *</label>
                  <input
                    type="date"
                    name="tanggal_mulai_upgrade"
                    value={formData.tanggal_mulai_upgrade}
                    onChange={handleChange}
                    disabled={loading}
                    min={minUpgradeDate || undefined}
                    className={`w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${errors.tanggal_mulai_upgrade ? "border-red-500" : "border-slate-600"}`}
                  />
                  {errors.tanggal_mulai_upgrade && <p className="text-xs text-red-400">{errors.tanggal_mulai_upgrade}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Kode Kontrak Baru *</label>
                  <div className="relative">
                    <input
                      type="text"
                      name="kode_kontrak"
                      value={formData.kode_kontrak}
                      onChange={handleChange}
                      disabled={loading || fetchingCode}
                      className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                    {fetchingCode && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
                  </div>
                </div>
              </div>
            </div>

            {/* Spesifikasi Kapasitas Baru */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">Spesifikasi Kapasitas Baru</h3>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
                  <input type="radio" name="coreMode" checked={coreMode === "direct"} onChange={() => handleCoreModeChange("direct")} className="accent-emerald-500" />
                  <span>Direct Core</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
                  <input type="radio" name="coreMode" checked={coreMode === "sharing"} onChange={() => handleCoreModeChange("sharing")} className="accent-emerald-500" />
                  <span>Sharing Core</span>
                </label>
              </div>

              {coreMode === "direct" ? (
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Kapasitas Core Baru * <span className="text-xs text-slate-400 font-normal">(Manual Input)</span></label>
                  <input
                    type="text"
                    name="core"
                    value={formData.core}
                    onChange={handleChange}
                    disabled={loading}
                    placeholder="Contoh: 1 Core, 4 Core, 16 Core"
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Rasio Sharing Core Baru *</label>
                  <select name="sharing_core" value={formData.sharing_core} onChange={handleChange} disabled={loading} className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white">
                    {SHARING_CORE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>Sharing {opt}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Pricing Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">Informasi Keuangan Paket Baru</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Nilai Kontrak Baru (Rp)</label>
                  <input type="number" name="nilai_kontrak" value={formData.nilai_kontrak} onChange={handleChange} disabled={loading} className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Biaya Per Bulan Baru (Rp)</label>
                  <input type="number" name="perbulan" value={formData.perbulan} onChange={handleChange} disabled={loading} className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white" />
                </div>
              </div>
            </div>

            {/* Prorated Billing Preview Card */}
            {prorationCalc && (
              <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30 space-y-2">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs uppercase tracking-wide">
                  <Calculator size={16} />
                  <span>Estimasi Billing Prorata ({prorationCalc.monthName})</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 pt-1">
                  <div>
                    <p className="text-slate-400">Paket Lama ({prorationCalc.oldDays} hari):</p>
                    <p className="font-mono font-medium text-white">Rp {prorationCalc.oldProrated.toLocaleString("id-ID")}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Paket Baru ({prorationCalc.newDays} hari):</p>
                    <p className="font-mono font-medium text-emerald-400">Rp {prorationCalc.newProrated.toLocaleString("id-ID")}</p>
                  </div>
                </div>
                <div className="border-t border-indigo-500/20 pt-2 flex justify-between items-center text-xs">
                  <span className="font-medium text-slate-300">Total Billing Bulan Transisi:</span>
                  <span className="font-mono font-bold text-base text-indigo-300">
                    Rp {prorationCalc.totalTransitionBilling.toLocaleString("id-ID")}
                  </span>
                </div>
              </div>
            )}

            {/* Upload Document Section */}
            <div className="border-t border-white/10 pt-4 mt-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-3">Upload Dokumen Upgrade (Opsional)</h3>
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
                <label className="block text-sm font-medium text-slate-400">Pilih Berkas Addendum / Upgrade (PDF)</label>
                <div className="relative">
                  <input ref={fileInputRef} type="file" onChange={handleFileChange} disabled={loading || uploading} className="hidden" id="upgrade-file-upload-input" />
                  <label htmlFor="upgrade-file-upload-input" className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer ${uploadFile ? "border-emerald-500/50 bg-emerald-500/10" : "border-slate-600 bg-slate-800/30"}`}>
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
                        <span className="text-sm text-slate-400">Klik untuk pilih berkas addendum upgrade</span>
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
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
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
            <button type="submit" disabled={loading || uploading || success} className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-500 hover:to-emerald-400 transition-all shadow-lg shadow-emerald-500/25">
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
                <span>Upgrade Paket</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
