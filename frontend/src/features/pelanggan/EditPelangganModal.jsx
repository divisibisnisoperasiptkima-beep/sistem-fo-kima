import { useState, useEffect, useRef } from "react";
import { X, AlertCircle, CheckCircle, Loader2, Upload, File, Paperclip } from "lucide-react";
import { updateCustomer, uploadDocument } from "../../lib/rust-api";

const KATEGORI_OPTIONS = ["Kontrak", "BAK-PKS", "Dokumen Lain"];

/**
 * Edit Pelanggan Modal
 */
export default function EditPelangganModal({ isOpen, onClose, onSuccess, customer, session }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    nama_pelanggan: "",
    pic: "",
    telepon: "",
    email: "",
    keterangan: "",
  });

  const [errors, setErrors] = useState({});

  const [uploadFile, setUploadFile] = useState(null);
  const [namaFile, setNamaFile] = useState("");
  const [kategori, setKategori] = useState("");
  const [folderError, setFolderError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (customer && isOpen) {
      setFormData({
        nama_pelanggan: customer.nama_pelanggan || "",
        pic: customer.pic || "",
        telepon: customer.telepon || "",
        email: customer.email || "",
        keterangan: customer.keterangan || "",
      });
      setErrors({});
      setError(null);
      setSuccess(false);
    }
  }, [customer, isOpen]);

  if (!isOpen || !customer) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
    if (!formData.nama_pelanggan.trim()) {
      newErrors.nama_pelanggan = "Nama pelanggan wajib diisi";
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
      const payload = {};
      if (formData.nama_pelanggan !== customer.nama_pelanggan) payload.nama_pelanggan = formData.nama_pelanggan;
      if (formData.pic !== (customer.pic || "")) payload.pic = formData.pic || null;
      if (formData.telepon !== (customer.telepon || "")) payload.telepon = formData.telepon || null;
      if (formData.email !== (customer.email || "")) payload.email = formData.email || null;
      if (formData.keterangan !== (customer.keterangan || "")) payload.keterangan = formData.keterangan || null;

      if (Object.keys(payload).length > 0) {
        await updateCustomer(session.token, customer.id, payload);
      }

      if (uploadFile) {
        setUploading(true);
        setUploadProgress(0);
        const formDataUpload = new FormData();
        formDataUpload.append("file", uploadFile);
        formDataUpload.append("kategori", kategori);
        formDataUpload.append("pelanggan_id", customer.id.toString());
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
      setError(err.message || "Gagal mengubah pelanggan");
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
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onClose();
  };

  const isProcessing = loading || uploading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-xl font-semibold text-white">Edit Pelanggan</h2>
            <p className="text-sm text-slate-400 mt-0.5">Ubah informasi pelanggan (ISP)</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            disabled={isProcessing}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="p-6 space-y-4">
            {error && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="text-red-400 shrink-0" size={20} />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="text-emerald-400 shrink-0" size={20} />
                <p className="text-sm text-emerald-400">Pelanggan berhasil diubah!</p>
              </div>
            )}

            {customer.kode_pelanggan && (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">Kode Pelanggan (ISP)</label>
                <input
                  type="text"
                  value={customer.kode_pelanggan}
                  readOnly
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-slate-300 cursor-not-allowed"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">
                Nama Pelanggan (ISP) <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="nama_pelanggan"
                value={formData.nama_pelanggan}
                onChange={handleChange}
                disabled={isProcessing}
                className={`w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50 ${
                  errors.nama_pelanggan ? "border-red-500" : "border-slate-600"
                }`}
              />
              {errors.nama_pelanggan && (
                <p className="text-xs text-red-400">{errors.nama_pelanggan}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">PIC</label>
                <input
                  type="text"
                  name="pic"
                  value={formData.pic}
                  onChange={handleChange}
                  disabled={isProcessing}
                  placeholder="Nama PIC"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">Telepon</label>
                <input
                  type="text"
                  name="telepon"
                  value={formData.telepon}
                  onChange={handleChange}
                  disabled={isProcessing}
                  placeholder="08xxxxxxxxxx"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                disabled={isProcessing}
                placeholder="email@contoh.com"
                className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">Keterangan</label>
              <textarea
                name="keterangan"
                value={formData.keterangan}
                onChange={handleChange}
                disabled={isProcessing}
                rows={3}
                placeholder="Tambahkan keterangan jika diperlukan..."
                className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none disabled:opacity-50"
              />
            </div>

            {/* File Upload Section */}
            <div className="border-t border-white/10 pt-4 mt-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-3">
                Upload Dokumen (Opsional)
              </h3>

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
                  disabled={isProcessing}
                  className={`w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50 ${
                    folderError ? "border-red-500" : "border-slate-600"
                  }`}
                >
                  <option value="">Pilih folder</option>
                  {KATEGORI_OPTIONS.map((kat) => (
                    <option key={kat} value={kat}>{kat}</option>
                  ))}
                </select>
                {folderError && (
                  <p className="text-xs text-red-400">{folderError}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-400">Pilih File</label>
                <div className="relative">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileChange}
                    disabled={isProcessing}
                    className="hidden"
                    id="edit-file-upload-input"
                  />
                  <label
                    htmlFor="edit-file-upload-input"
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                      uploadFile
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-slate-600 hover:border-slate-500 bg-slate-800/30"
                    } ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
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
                          Klik untuk pilih file atau drag & drop
                        </span>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {uploadFile && (
                <div className="space-y-1.5 mt-3">
                  <label className="block text-sm font-medium text-slate-400">
                    Nama File (dapat diedit)
                  </label>
                  <input
                    type="text"
                    value={namaFile}
                    onChange={(e) => setNamaFile(e.target.value)}
                    disabled={isProcessing}
                    placeholder="Nama file"
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50"
                  />
                </div>
              )}

              {uploading && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>Mengunggah...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 transition-all duration-300"
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
              disabled={isProcessing}
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isProcessing || success}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-amber-600 to-amber-500 text-white hover:from-amber-500 hover:to-amber-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/25"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{uploading ? `Mengunggah... ${uploadProgress}%` : "Menyimpan..."}</span>
                </>
              ) : success ? (
                <>
                  <CheckCircle size={16} />
                  <span>Berhasil!</span>
                </>
              ) : uploadFile ? (
                <>
                  <Upload size={16} />
                  <span>Simpan & Upload</span>
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
