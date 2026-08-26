import { useState } from 'react';
import { portalRegister } from '../../lib/rust-api';

const PortalRegister = ({ onDone, onBackToLogin }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    // Company
    nama_perusahaan: '',
    email_perusahaan: '',
    telepon_perusahaan: '',
    npwp: '',

    // PIC
    pic_nama: '',
    pic_email: '',
    pic_telepon: '',
    pic_jabatan: '',

    // Lokasi
    lokasi_nama: '',
    lokasi_alamat: '',
    lokasi_kota: '',
    lokasi_provinsi: '',
    lokasi_kode_pos: '',
    core_dedicated: 0,
    sharing_core: 'Tidak',

    // Password
    password: '',
    confirm_password: '',
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const handleNext = () => {
    const newErrors = validateStep(step, formData);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => setStep(step - 1);

  const handleSubmit = async () => {
    setLoading(true);
    setErrors({});

    try {
      const result = await portalRegister(formData);
      onDone?.(result);
    } catch (error) {
      setErrors({ general: error?.message || 'Registrasi gagal.' });
    } finally {
      setLoading(false);
    }
  };

  const validateStep = (step, data) => {
    const errors = {};

    switch(step) {
      case 1:
        if (!data.nama_perusahaan.trim()) errors.nama_perusahaan = 'Nama perusahaan wajib diisi';
        if (!data.email_perusahaan.includes('@')) errors.email_perusahaan = 'Email tidak valid';
        if (data.telepon_perusahaan.length < 10) errors.telepon_perusahaan = 'Nomor telepon minimal 10 digit';
        break;
      case 2:
        if (!data.pic_nama.trim()) errors.pic_nama = 'Nama PIC wajib diisi';
        if (!data.pic_email.includes('@')) errors.pic_email = 'Email tidak valid';
        break;
      case 3:
        if (!data.lokasi_nama.trim()) errors.lokasi_nama = 'Nama lokasi wajib diisi';
        if (!data.lokasi_alamat.trim()) errors.lokasi_alamat = 'Alamat wajib diisi';
        if (data.core_dedicated < 0) errors.core_dedicated = 'Jumlah core tidak boleh negatif';
        break;
      case 4:
        if (data.password.length < 8) errors.password = 'Password minimal 8 karakter';
        if (data.password !== data.confirm_password) errors.confirm_password = 'Password tidak cocok';
        break;
    }

    return errors;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Daftar Akun Mitra</h1>
          <p className="text-gray-600">Hubungkan lokasi Anda ke jaringan fiber KIMA</p>
        </div>

        {/* Progress Indicator */}
        <div className="flex justify-center mb-8">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                s < step ? 'bg-green-500 text-white' :
                s === step ? 'bg-blue-600 text-white' :
                'bg-gray-200 text-gray-600'
              }`}>
                {s}
              </div>
              {s < 5 && <div className="w-16 h-1 mx-2 bg-gray-200"></div>}
            </div>
          ))}
        </div>

        {/* Step 1: Company Info */}
        {step === 1 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-6">Informasi Perusahaan</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Perusahaan *
                </label>
                <input
                  type="text"
                  value={formData.nama_perusahaan}
                  onChange={(e) => setFormData({...formData, nama_perusahaan: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="PT XYZ"
                />
                {errors.nama_perusahaan && <p className="text-red-500 text-sm mt-1">{errors.nama_perusahaan}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Perusahaan *
                </label>
                <input
                  type="email"
                  value={formData.email_perusahaan}
                  onChange={(e) => setFormData({...formData, email_perusahaan: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="pt.xyz@domain.com"
                />
                {errors.email_perusahaan && <p className="text-red-500 text-sm mt-1">{errors.email_perusahaan}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  No. Telepon Perusahaan *
                </label>
                <input
                  type="tel"
                  value={formData.telepon_perusahaan}
                  onChange={(e) => setFormData({...formData, telepon_perusahaan: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="081234567890"
                />
                {errors.telepon_perusahaan && <p className="text-red-500 text-sm mt-1">{errors.telepon_perusahaan}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  NPWP (Opsional)
                </label>
                <input
                  type="text"
                  value={formData.npwp}
                  onChange={(e) => setFormData({...formData, npwp: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="123456789012345"
                />
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <button
                onClick={() => onBackToLogin?.()}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                ← Kembali ke Login
              </button>
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Lanjut →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: PIC Info */}
        {step === 2 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-6">Informasi PIC (Person In Charge)</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama PIC *
                </label>
                <input
                  type="text"
                  value={formData.pic_nama}
                  onChange={(e) => setFormData({...formData, pic_nama: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="John Doe"
                />
                {errors.pic_nama && <p className="text-red-500 text-sm mt-1">{errors.pic_nama}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email PIC *
                </label>
                <input
                  type="email"
                  value={formData.pic_email}
                  onChange={(e) => setFormData({...formData, pic_email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="john@xyz.com"
                />
                {errors.pic_email && <p className="text-red-500 text-sm mt-1">{errors.pic_email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  No. Telepon PIC *
                </label>
                <input
                  type="tel"
                  value={formData.pic_telepon}
                  onChange={(e) => setFormData({...formData, pic_telepon: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="081298765432"
                />
                {errors.pic_telepon && <p className="text-red-500 text-sm mt-1">{errors.pic_telepon}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jabatan PIC
                </label>
                <input
                  type="text"
                  value={formData.pic_jabatan}
                  onChange={(e) => setFormData({...formData, pic_jabatan: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Manager"
                />
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <button
                onClick={handleBack}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                ← Kembali
              </button>
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Lanjut →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Lokasi Info */}
        {step === 3 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-6">Lokasi Pertama</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Lokasi *
                </label>
                <input
                  type="text"
                  value={formData.lokasi_nama}
                  onChange={(e) => setFormData({...formData, lokasi_nama: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Kantor Cabang Makassar"
                />
                {errors.lokasi_nama && <p className="text-red-500 text-sm mt-1">{errors.lokasi_nama}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Alamat Lengkap *
                </label>
                <textarea
                  value={formData.lokasi_alamat}
                  onChange={(e) => setFormData({...formData, lokasi_alamat: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Jl. Sudirman No. 123"
                />
                {errors.lokasi_alamat && <p className="text-red-500 text-sm mt-1">{errors.lokasi_alamat}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kota *
                  </label>
                  <input
                    type="text"
                    value={formData.lokasi_kota}
                    onChange={(e) => setFormData({...formData, lokasi_kota: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Makassar"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Provinsi *
                  </label>
                  <input
                    type="text"
                    value={formData.lokasi_provinsi}
                    onChange={(e) => setFormData({...formData, lokasi_provinsi: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Sulawesi Selatan"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kode Pos
                </label>
                <input
                  type="text"
                  value={formData.lokasi_kode_pos}
                  onChange={(e) => setFormData({...formData, lokasi_kode_pos: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="90111"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Jumlah Core Dedicated
                  </label>
                  <input
                    type="number"
                    value={formData.core_dedicated}
                    onChange={(e) => setFormData({...formData, core_dedicated: parseInt(e.target.value) || 0})}
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {errors.core_dedicated && <p className="text-red-500 text-sm mt-1">{errors.core_dedicated}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sharing Core
                  </label>
                  <select
                    value={formData.sharing_core}
                    onChange={(e) => setFormData({...formData, sharing_core: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Tidak">Tidak</option>
                    <option value="Ya">Ya</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <button
                onClick={handleBack}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                ← Kembali
              </button>
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Lanjut →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Password */}
        {step === 4 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-6">Buat Password</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Minimal 8 karakter"
                />
                {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}

                {/* Password Strength Indicator */}
                <div className="mt-2">
                  <div className="flex space-x-1">
                    <div className={`h-1 w-full rounded ${formData.password.length >= 8 ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                    <div className={`h-1 w-full rounded ${/[A-Z]/.test(formData.password) ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                    <div className={`h-1 w-full rounded ${/[a-z]/.test(formData.password) ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                    <div className={`h-1 w-full rounded ${/\d/.test(formData.password) ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Minimal 8 karakter, ada huruf besar & kecil, ada angka
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Konfirmasi Password *
                </label>
                <input
                  type="password"
                  value={formData.confirm_password}
                  onChange={(e) => setFormData({...formData, confirm_password: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ketik ulang password"
                />
                {errors.confirm_password && <p className="text-red-500 text-sm mt-1">{errors.confirm_password}</p>}
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <button
                onClick={handleBack}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                ← Kembali
              </button>
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Lanjut →
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-6">Review & Submit</h2>

            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-md">
                <h3 className="font-semibold text-gray-700 mb-2">Informasi Perusahaan</h3>
                <p className="text-sm text-gray-600">{formData.nama_perusahaan}</p>
                <p className="text-sm text-gray-600">{formData.email_perusahaan}</p>
                <p className="text-sm text-gray-600">{formData.telepon_perusahaan}</p>
              </div>

              <div className="bg-gray-50 p-4 rounded-md">
                <h3 className="font-semibold text-gray-700 mb-2">Informasi PIC</h3>
                <p className="text-sm text-gray-600">{formData.pic_nama} - {formData.pic_jabatan}</p>
                <p className="text-sm text-gray-600">{formData.pic_email}</p>
                <p className="text-sm text-gray-600">{formData.pic_telepon}</p>
              </div>

              <div className="bg-gray-50 p-4 rounded-md">
                <h3 className="font-semibold text-gray-700 mb-2">Lokasi Pertama</h3>
                <p className="text-sm text-gray-600">{formData.lokasi_nama}</p>
                <p className="text-sm text-gray-600">{formData.lokasi_alamat}</p>
                <p className="text-sm text-gray-600">{formData.lokasi_kota}, {formData.lokasi_provinsi}</p>
                <p className="text-sm text-gray-600">Core: {formData.core_dedicated}, Sharing: {formData.sharing_core}</p>
              </div>

              <div className="bg-yellow-50 p-4 rounded-md border border-yellow-200">
                <p className="text-sm text-yellow-800">
                  Dengan mendaftar, Anda setuju dengan Syarat & Ketentuan KIMA
                </p>
              </div>

              {errors.general && (
                <div className="bg-red-50 p-4 rounded-md border border-red-200">
                  <p className="text-sm text-red-700">{errors.general}</p>
                </div>
              )}
            </div>

            <div className="flex justify-between mt-6">
              <button
                onClick={handleBack}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                ← Kembali
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
              >
                {loading ? 'Mendaftar...' : 'Daftar ✓'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortalRegister;