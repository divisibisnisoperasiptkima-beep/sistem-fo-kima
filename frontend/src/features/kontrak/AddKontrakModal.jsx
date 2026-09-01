import { useState, useEffect, useCallback, useRef } from "react";
import { X, AlertCircle, CheckCircle, Loader2, RefreshCw, File, Paperclip, Upload } from "lucide-react";
import { createContract, getNextKontrakCode, listCustomers, listPortalRegistrations, uploadDocument } from "../../lib/rust-api";
import { coreInputError, SHARING_CORE_OPTIONS } from "./coreUtils";

const STATUS_OPTIONS = [
  "Beroperasi",
  "Belum Beroperasi",
  "Proses Perpanjangan",
  "Diperpanjang",
  "Di-upgrade",
  "Berhenti",
];

const KATEGORI_OPTIONS = ["Kontrak", "BAK-PKS", "Dokumen Lain"];

export default function AddKontrakModal({ isOpen, onClose, onSuccess, session }) {
  const [pelangganList, setPelangganList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pelangganLoading, setPelangganLoading] = useState(true);
  const [registrationList, setRegistrationList] = useState([]);
  const [registrationLoading, setRegistrationLoading] = useState(true);
  const [fetchingCode, setFetchingCode] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [endDateManual, setEndDateManual] = useState(false);
  const fileInputRef = useRef(null);

  // File upload state - default placeholder: "Pilih Folder Tujuan"
  const [uploadFile, setUploadFile] = useState(null);
  const [namaFile, setNamaFile] = useState("");
  const [kategori, setKategori] = useState("");
  const [folderError, setFolderError] = useState(null);

  const [formData, setFormData] = useState({
    pelanggan_id: "",
    portal_registration_id: "",
    kode_kontrak: "",
    nama_lokasi: "",
    periode_awal: "",
    periode_berakhir: "",
    tanggal_aktivasi: "",
    latitude: "",
    longitude: "",
    power: "",
    vlan_id: "",
    mac_modem: "",
    alamat_user: "",
    durasi_kontrak_bulan: "",
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

  // Fetch pelanggan list and next kode_kontrak on mount
  useEffect(() => {
    if (isOpen) {
      fetchPelanggan();
      fetchReadyRegistrations();
      fetchNextCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const fetchPelanggan = async () => {
    setPelangganLoading(true);
    try {
      const data = await listCustomers(session.token, 1, 200);
      const rows = Array.isArray(data) ? data : data?.data || data?.items || [];
      setPelangganList(rows);
    } catch (err) {
      console.error("Failed to fetch pelanggan:", err);
      setError("Gagal memuat daftar pelanggan");
    } finally {
      setPelangganLoading(false);
    }
  };

  const fetchReadyRegistrations = async () => {
    setRegistrationLoading(true);
    try {
      const data = await listPortalRegistrations(session.token, 1, 200);
      const rows = Array.isArray(data) ? data : data?.data || data?.items || [];
      setRegistrationList(rows.filter((row) => (
        row.status === "disetujui"
        && row.pembayaran_status === "terverifikasi"
        && !row.lokasi_id
        && row.pelanggan_id
      )));
    } catch (err) {
      console.error("Failed to fetch completed service requests:", err);
      setRegistrationList([]);
    } finally {
      setRegistrationLoading(false);
    }
  };

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

      if (name === "portal_registration_id") {
        const registration = registrationList.find((row) => String(row.id) === value);
        if (registration) {
          newData.pelanggan_id = String(registration.pelanggan_id);
          newData.nama_lokasi = registration.lokasi_nama || "";
          newData.core = registration.core_dedicated > 0 ? String(registration.core_dedicated) : "";
          newData.sharing_core = registration.core_dedicated > 0 ? "" : (registration.sharing_core || "");
        }
      }

      // Two-way binding & mutual exclusivity logic
      if (name === "core" && value.trim() !== "") {
        newData.sharing_core = "";
      } else if (name === "sharing_core" && value !== "") {
        newData.core = "";
      }

      if (name === "durasi_kontrak_bulan" && !endDateManual) {
        // User edited duration → recalculate end date
        newData.periode_berakhir = calculateEndDate(newData.periode_awal, value);
      } else if (name === "periode_berakhir") {
        // User edited end date → mark as manual, recalculate duration
        setEndDateManual(true);
        newData.durasi_kontrak_bulan = calculateDuration(formData.periode_awal, value);
      } else if (name === "periode_awal" && prev.periode_awal && prev.durasi_kontrak_bulan && !endDateManual) {
        // Start date changed → recalculate end date if duration mode
        newData.periode_berakhir = calculateEndDate(value, prev.durasi_kontrak_bulan);
      }

      return newData;
    });

    // Clear error for this field
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

    if (!formData.pelanggan_id) {
      newErrors.pelanggan_id = "Pelanggan wajib dipilih";
    }
    if (!formData.kode_kontrak.trim()) {
      newErrors.kode_kontrak = "Kode kontrak wajib diisi";
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
    if (formData.latitude !== "" && (Number.isNaN(Number(formData.latitude)) || Number(formData.latitude) < -90 || Number(formData.latitude) > 90)) {
      newErrors.latitude = "Latitude harus berada di antara -90 dan 90";
    }
    if (formData.longitude !== "" && (Number.isNaN(Number(formData.longitude)) || Number(formData.longitude) < -180 || Number(formData.longitude) > 180)) {
      newErrors.longitude = "Longitude harus berada di antara -180 dan 180";
    }
    if (formData.power !== "" && (Number.isNaN(Number(formData.power)) || Number(formData.power) < -200 || Number(formData.power) > 200)) {
      newErrors.power = "Power harus berada di antara -200 dan 200 dBm";
    }
    if (formData.vlan_id !== "" && (!/^\d+$/.test(formData.vlan_id) || Number(formData.vlan_id) < 1 || Number(formData.vlan_id) > 4094)) {
      newErrors.vlan_id = "VLAN ID harus berada di antara 1 dan 4094";
    }
    if (formData.mac_modem.trim() !== "" && !/^(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$/.test(formData.mac_modem.trim()) && !/^[0-9a-fA-F]{12}$/.test(formData.mac_modem.trim())) {
      newErrors.mac_modem = "Gunakan format AA:BB:CC:DD:EE:FF";
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
      // Prepare payload - remove empty optional fields
      const payload = { ...formData };

      // Remove empty optional fields
      Object.keys(payload).forEach((key) => {
        if (payload[key] === "" || payload[key] === null) {
          delete payload[key];
        }
      });

      // Parse numeric fields
      if (payload.pelanggan_id) payload.pelanggan_id = parseInt(payload.pelanggan_id, 10);
      if (payload.portal_registration_id) payload.portal_registration_id = parseInt(payload.portal_registration_id, 10);
      if (payload.nilai_kontrak) payload.nilai_kontrak = parseFloat(payload.nilai_kontrak);
      if (payload.biaya_aktivasi) payload.biaya_aktivasi = parseFloat(payload.biaya_aktivasi);
      if (payload.perbulan) payload.perbulan = parseFloat(payload.perbulan);
      if (payload.nilai_periode_aktif) payload.nilai_periode_aktif = parseFloat(payload.nilai_periode_aktif);
      if (payload.durasi_kontrak_bulan) payload.durasi_kontrak_bulan = parseInt(payload.durasi_kontrak_bulan, 10);
      if (payload.latitude) payload.latitude = parseFloat(payload.latitude);
      if (payload.longitude) payload.longitude = parseFloat(payload.longitude);
      if (payload.power) payload.power = parseFloat(payload.power);
      if (payload.vlan_id) payload.vlan_id = parseInt(payload.vlan_id, 10);

      const contractResult = await createContract(session.token, payload);

      // If file is selected, upload it to the newly created contract's Drive folder
      if (uploadFile && contractResult?.id) {
        setUploading(true);
        setUploadProgress(0);

        const formDataUpload = new FormData();
        formDataUpload.append("file", uploadFile);
        formDataUpload.append("kategori", kategori || "Kontrak");
        formDataUpload.append("lokasi_id", contractResult.id.toString());
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
      setError(err.message || "Gagal membuat kontrak");
    } finally {
      setLoading(false);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleClose = () => {
    // Reset form
    setFormData({
      pelanggan_id: "",
      portal_registration_id: "",
      kode_kontrak: "",
      nama_lokasi: "",
      periode_awal: "",
      periode_berakhir: "",
      tanggal_aktivasi: "",
      latitude: "",
      longitude: "",
      power: "",
      vlan_id: "",
      mac_modem: "",
      alamat_user: "",
      durasi_kontrak_bulan: "",
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
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-xl font-semibold text-white">Tambah Kontrak Baru</h2>
            <p className="text-sm text-slate-400 mt-0.5">Lengkapi informasi kontrak</p>
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
                <p className="text-sm text-emerald-400">Kontrak berhasil dibuat!</p>
              </div>
            )}

            {/* Section: Informasi Utama */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
                Informasi Utama
              </h3>

              {/* Optional link to a completed portal request */}
              <div className="space-y-1.5 rounded-xl border border-sky-400/20 bg-sky-400/5 p-4">
                <label className="block text-sm font-medium text-sky-100">
                  Tautkan permohonan selesai <span className="text-xs font-normal text-white/45">(opsional)</span>
                </label>
                <select
                  name="portal_registration_id"
                  value={formData.portal_registration_id}
                  onChange={handleChange}
                  disabled={registrationLoading || loading}
                  className="w-full rounded-lg border border-sky-300/25 bg-slate-900/70 px-4 py-2.5 text-white focus:border-sky-300/60 focus:outline-none focus:ring-2 focus:ring-sky-300/30 disabled:opacity-50"
                >
                  <option value="">Kontrak manual tanpa permohonan portal</option>
                  {registrationList.map((registration) => (
                    <option key={registration.id} value={registration.id}>
                      {registration.kode_registrasi} · {registration.lokasi_nama} · {registration.nama_perusahaan}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] leading-5 text-white/50">
                  Hanya permohonan dengan pembayaran terverifikasi yang dapat ditautkan. Data ISP, lokasi, dan core akan diisi sebagai titik awal dan tetap dapat dikonfirmasi sebelum disimpan.
                </p>
                {!registrationLoading && registrationList.length === 0 && (
                  <p className="text-[11px] font-semibold text-amber-200/80">Belum ada permohonan selesai yang menunggu pencatatan kontrak.</p>
                )}
              </div>

              {/* Kode Kontrak (Readonly) */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">
                  Kode Kontrak <span className="text-red-400">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    name="kode_kontrak"
                    value={formData.kode_kontrak}
                    readOnly
                    className="flex-1 px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-slate-300 cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={fetchNextCode}
                    disabled={fetchingCode}
                    className="p-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-slate-400 hover:text-white hover:bg-slate-600/50 transition-colors disabled:opacity-50"
                    title="Generate kode baru"
                  >
                    <RefreshCw size={18} className={fetchingCode ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              {/* Pelanggan Dropdown */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">
                  Pelanggan (ISP) <span className="text-red-400">*</span>
                </label>
                <select
                  name="pelanggan_id"
                  value={formData.pelanggan_id}
                  onChange={handleChange}
                  disabled={pelangganLoading || loading || Boolean(formData.portal_registration_id)}
                  className={`w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50 ${
                    errors.pelanggan_id ? "border-red-500" : "border-slate-600"
                  }`}
                >
                  <option value="">Pilih Pelanggan (ISP)</option>
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

            {/* Section: Detail Teknis */}
            <div className="space-y-4 rounded-xl border border-sky-400/15 bg-sky-400/[0.03] p-4">
              <div>
                <h3 className="text-sm font-medium uppercase tracking-wide text-slate-300">
                  Detail Teknis & Lokasi
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Opsional. Lengkapi saat data aktivasi dan instalasi sudah tersedia.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Tanggal Aktivasi</label>
                  <input
                    type="date"
                    name="tanggal_aktivasi"
                    value={formData.tanggal_aktivasi}
                    onChange={handleChange}
                    disabled={loading}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-white transition-all focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/30 disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Power <span className="text-xs font-normal text-slate-500">(dBm)</span></label>
                  <input
                    type="number"
                    name="power"
                    value={formData.power}
                    onChange={handleChange}
                    disabled={loading}
                    min="-200"
                    max="200"
                    step="0.01"
                    placeholder="Contoh: -18.50"
                    className="w-full rounded-lg border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-white placeholder-slate-500 transition-all focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/30 disabled:opacity-50"
                  />
                  {errors.power && <p className="text-xs text-red-400">{errors.power}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Latitude</label>
                  <input
                    type="number"
                    name="latitude"
                    value={formData.latitude}
                    onChange={handleChange}
                    disabled={loading}
                    min="-90"
                    max="90"
                    step="0.0000001"
                    placeholder="Contoh: -5.1234567"
                    className="w-full rounded-lg border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-white placeholder-slate-500 transition-all focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/30 disabled:opacity-50"
                  />
                  {errors.latitude && <p className="text-xs text-red-400">{errors.latitude}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Longitude</label>
                  <input
                    type="number"
                    name="longitude"
                    value={formData.longitude}
                    onChange={handleChange}
                    disabled={loading}
                    min="-180"
                    max="180"
                    step="0.0000001"
                    placeholder="Contoh: 119.4123456"
                    className="w-full rounded-lg border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-white placeholder-slate-500 transition-all focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/30 disabled:opacity-50"
                  />
                  {errors.longitude && <p className="text-xs text-red-400">{errors.longitude}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">VLAN ID</label>
                  <input
                    type="number"
                    name="vlan_id"
                    value={formData.vlan_id}
                    onChange={handleChange}
                    disabled={loading}
                    min="1"
                    max="4094"
                    step="1"
                    placeholder="1–4094"
                    className="w-full rounded-lg border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-white placeholder-slate-500 transition-all focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/30 disabled:opacity-50"
                  />
                  {errors.vlan_id && <p className="text-xs text-red-400">{errors.vlan_id}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">MAC Modem</label>
                  <input
                    type="text"
                    name="mac_modem"
                    value={formData.mac_modem}
                    onChange={handleChange}
                    disabled={loading}
                    maxLength={17}
                    placeholder="AA:BB:CC:DD:EE:FF"
                    className="w-full rounded-lg border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-white placeholder-slate-500 transition-all focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/30 disabled:opacity-50"
                  />
                  {errors.mac_modem && <p className="text-xs text-red-400">{errors.mac_modem}</p>}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-300">Alamat User</label>
                  <textarea
                    name="alamat_user"
                    value={formData.alamat_user}
                    onChange={handleChange}
                    disabled={loading}
                    rows={2}
                    placeholder="Alamat titik pemasangan/perangkat user"
                    className="w-full resize-y rounded-lg border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-white placeholder-slate-500 transition-all focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/30 disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            {/* Section: Detail Kontrak */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
                Detail Kontrak
              </h3>

              <div className="grid grid-cols-2 gap-4">
                {/* Kategori */}
                <div className="space-y-1.5 col-span-2">
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
                  disabled={loading || uploading}
                  rows={3}
                  placeholder="Tambahkan keterangan jika diperlukan..."
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all resize-none disabled:opacity-50"
                />
              </div>
            </div>

            {/* File Upload Section */}
            <div className="border-t border-white/10 pt-4 mt-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-3">
                Upload Dokumen Kontrak (Opsional)
              </h3>

              {/* Kategori Dropdown (Default placeholder: "Pilih Folder Tujuan") */}
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
                    id="contract-file-upload-input"
                  />
                  <label
                    htmlFor="contract-file-upload-input"
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
                          Klik untuk pilih berkas kontrak atau drag & drop
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
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-indigo-600 to-indigo-500 text-white hover:from-indigo-500 hover:to-indigo-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/25"
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
                <span>Simpan Kontrak</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
