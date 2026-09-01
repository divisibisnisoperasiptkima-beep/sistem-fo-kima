/**
 * Satu sumber pemetaan tanggung jawab untuk seluruh tampilan SOP.
 * Nilai role mengikuti role yang dikirim backend, sedangkan labelnya dibuat
 * eksplisit agar master ISP (Pelanggan KIMA) tidak tertukar dengan pemohon
 * layanan (Lokasi/Tenant).
 */
export const ROLE_LABELS = {
  customer: "Lokasi/Tenant",
  pelanggan: "Lokasi/Tenant",
  admin: "Admin KIMA",
  dbo: "Admin KIMA · DBO",
  legal: "Admin KIMA · Legal",
  teknisi: "Teknisi",
  direksi: "Direksi",
  keuangan: "Keuangan",
  isp: "ISP terpilih",
};

export const SOP1_STEPS = [
  { step: 1, name: "Kirim minat layanan", role: "customer" },
  { step: 2, name: "Validasi administratif", role: "dbo" },
  { step: 3, name: "Konfirmasi kebutuhan", role: "customer" },
  { step: 4, name: "Survei teknis jalur", role: "teknisi" },
  { step: 5, name: "Penyusunan proposal", role: "dbo" },
  { step: 6, name: "Presentasi proposal", role: "dbo" },
  { step: 7, name: "Upload PO & legalitas", role: "customer" },
  { step: 8, name: "Review kontrak legal", role: "legal" },
  { step: 9, name: "Penawaran harga", role: "dbo" },
  { step: 10, name: "Negosiasi komersial", role: "dbo" },
  { step: 11, name: "Persetujuan KIMA/DBO", role: "dbo" },
  { step: 12, name: "Penandatanganan BAK", role: "customer" },
  { step: 13, name: "Aktivasi kontrak", role: "admin" },
  { step: 14, name: "Penerbitan invoice", role: "keuangan" },
  { step: 15, name: "Pembayaran", role: "customer" },
  { step: 16, name: "Verifikasi pembayaran", role: "keuangan" },
  { step: 17, name: "Instalasi & aktivasi", role: "teknisi" },
  { step: 18, name: "Final acceptance", role: "customer" },
];

export const SOP2_STEPS = [
  { step: 1, name: "Ajukan perubahan layanan", role: "pelanggan" },
  { step: 2, name: "Kirim daftar tarif", role: "admin" },
  { step: 3, name: "Verifikasi jalur bersama pelanggan", role: "teknisi" },
  { step: 4, name: "Kirim PO dengan tarif kontrak", role: "admin" },
  { step: 5, name: "Verifikasi / kirim PO", role: "pelanggan" },
  { step: 6, name: "Siapkan dokumen perjanjian", role: "admin" },
  { step: 7, name: "Tanda tangani BAK", role: "admin" },
  { step: 8, name: "Aktifkan / sambungkan layanan", role: "teknisi" },
  { step: 9, name: "Kirim status aktivasi & BAA", role: "teknisi" },
  { step: 10, name: "Terbitkan invoice", role: "keuangan" },
  { step: 11, name: "Kirim tagihan", role: "keuangan" },
  { step: 12, name: "Konfirmasi pembayaran", role: "pelanggan" },
];

export function roleLabel(role) {
  if (!role) return "Belum ditetapkan";
  return ROLE_LABELS[String(role).toLowerCase()] || String(role).replaceAll("_", " ");
}

export function getStepInfo(step, definitions = SOP1_STEPS) {
  return definitions.find((item) => Number(item.step) === Number(step)) || null;
}

export function getSop1Owner(registration) {
  if (!registration) return { role: "admin", label: roleLabel("admin"), stage: "Meninjau permohonan" };

  if (registration.status === "menunggu") {
    return { role: "admin", label: roleLabel("admin"), stage: "Meninjau permohonan baru" };
  }
  if (["ditolak", "dibatalkan"].includes(registration.status)) {
    return { role: null, label: "Tidak ada tindakan aktif", stage: "Permohonan ditutup" };
  }

  if (registration.survey_status === "belum_dijadwalkan") {
    return { role: "teknisi", label: roleLabel("teknisi"), stage: "Menentukan jadwal survei" };
  }
  if (registration.survey_status === "terjadwal") {
    return { role: "teknisi", label: roleLabel("teknisi"), stage: "Melaksanakan survei jalur" };
  }
  if (registration.penawaran_status === "belum_dibuat") {
    return { role: "admin", label: roleLabel("dbo"), stage: "Menyiapkan penawaran" };
  }
  if (registration.penawaran_status === "dikirim") {
    return { role: "pelanggan", label: roleLabel("pelanggan"), stage: "Meninjau penawaran" };
  }
  if (registration.penawaran_status === "negosiasi") {
    return { role: "admin", label: roleLabel("dbo"), stage: "Menindaklanjuti negosiasi" };
  }
  if (registration.penawaran_status === "tolak") {
    return { role: null, label: "Tidak ada tindakan aktif", stage: "Penawaran ditolak" };
  }
  if (!registration.po_nomor) {
    return { role: "pelanggan", label: roleLabel("pelanggan"), stage: "Mengirim PO & legalitas" };
  }
  if (registration.legal_status === "menunggu_verifikasi") {
    return { role: "legal", label: roleLabel("legal"), stage: "Memverifikasi legalitas" };
  }
  if (registration.legal_status === "perlu_perbaikan") {
    return { role: "pelanggan", label: roleLabel("pelanggan"), stage: "Melengkapi perbaikan legalitas" };
  }
  if (registration.direksi_status === "menunggu") {
    return { role: "admin", label: roleLabel("dbo"), stage: "Memberi persetujuan kerja sama" };
  }
  if (registration.direksi_status === "tolak") {
    return { role: "admin", label: roleLabel("dbo"), stage: "Menindaklanjuti penolakan persetujuan" };
  }
  if (registration.pks_status === "belum_disusun") {
    return { role: "admin", label: roleLabel("admin"), stage: "Menyiapkan BAK/PKS" };
  }
  if (["menunggu_tanda_tangan", "menunggu_tanda_tangan_pelanggan", "menunggu_verifikasi_dokumen_pelanggan", "menunggu_dokumen_final"].includes(registration.pks_status)) {
    return { role: "admin", label: roleLabel("admin"), stage: "Menyiapkan ulang BAK/PKS final" };
  }
  if (registration.aktivasi_status !== "aktif") {
    return { role: "teknisi", label: roleLabel("teknisi"), stage: "Menjadwalkan / menjalankan aktivasi" };
  }
  if (registration.baa_status === "belum_dibuat") {
    return { role: "teknisi", label: roleLabel("teknisi"), stage: "Membuat BAA" };
  }
  if (registration.baa_status === "menunggu_verifikasi_dbo") {
    return { role: "admin", label: roleLabel("dbo"), stage: "Memeriksa dan mengirim BAA ke pelanggan" };
  }
  if (registration.baa_status === "menunggu_konfirmasi_lokasi") {
    return { role: "pelanggan", label: roleLabel("pelanggan"), stage: "Mengonfirmasi penerimaan BAA" };
  }
  if (registration.invoice_status === "belum_dibuat" || registration.invoice_status === "draft") {
    return { role: "keuangan", label: roleLabel("keuangan"), stage: "Menerbitkan invoice" };
  }
  if (registration.pembayaran_status === "belum_dibayar" || registration.pembayaran_status === "menunggu_pembayaran") {
    return { role: "pelanggan", label: roleLabel("pelanggan"), stage: "Melakukan pembayaran" };
  }
  if (registration.pembayaran_status === "menunggu_verifikasi") {
    return { role: "keuangan", label: roleLabel("keuangan"), stage: "Memverifikasi pembayaran" };
  }
  return { role: null, label: "Tidak ada tindakan aktif", stage: "Proses selesai" };
}

export function getSop2Owner(step) {
  const info = getStepInfo(step, SOP2_STEPS);
  if (!info) return { role: null, label: "Belum ditetapkan", stage: "Menunggu alur" };
  return { role: info.role, label: roleLabel(info.role), stage: info.name };
}
