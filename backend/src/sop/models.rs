use serde::{Deserialize, Serialize};
use sqlx::FromRow;

// ============================================
// MAIN WORKFLOW STRUCT
// ============================================
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct SopWorkflow {
    pub id: u64,
    pub pelanggan_id: u64,
    pub lokasi_id: Option<u64>,

    pub nama_lokasi_diajukan: String,
    pub alamat_lokasi_diajukan: Option<String>,
    pub core_diajukan: i32,
    pub sharing_core_diajukan: String,
    pub kota: Option<String>,
    pub provinsi: Option<String>,

    pub current_step: i32,
    pub total_steps: i32,
    pub status: String, // 'draft', 'in_progress', 'completed', 'cancelled', 'rejected'

    pub back_to_step: Option<i32>,
    pub rejection_reason: Option<String>,

    pub assigned_to_role: Option<String>,
    pub assigned_to_user_id: Option<u64>,

    pub started_at: String,
    pub completed_at: Option<String>,
    pub expired_at: Option<String>,
    pub updated_at: String,
}

// ============================================
// STEP HISTORY STRUCT
// ============================================
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct SopStepHistory {
    pub id: u64,
    pub workflow_id: u64,
    pub step_nomor: i32,
    pub actor_role: String,
    pub actor_user_id: Option<u64>,
    pub action_type: String,
    pub description: Option<String>,
    pub back_to_step: Option<i32>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: String,
}

// ============================================
// DOCUMENT STRUCT
// ============================================
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct SopDocument {
    pub id: u64,
    pub workflow_id: u64,
    pub step_nomor: Option<i32>,
    pub kategori: String,
    pub nama_file: String,
    pub deskripsi: Option<String>,
    pub drive_file_id: Option<String>,
    pub drive_folder_id: Option<String>,
    pub ukuran_byte: Option<u64>,
    pub mime_type: Option<String>,
    pub upload_status: String, // 'pending', 'uploaded', 'verified', 'rejected', 'expired'
    pub uploaded_by_user_id: Option<u64>,
    pub uploaded_by_role: Option<String>,
    pub verified_by_user_id: Option<u64>,
    pub verified_by_role: Option<String>,
    pub verified_at: Option<String>,
    pub verification_notes: Option<String>,
    pub created_at: String,
}

// ============================================
// REGISTRATION REQUEST (Portal)
// ============================================
#[derive(Debug, Deserialize)]
pub struct PortalRegisterRequest {
    pub nama_pemohon: String,
    pub pic_nama: String,
    pub pic_email: String,
    pub pic_telepon: String,
    pub pic_jabatan: Option<String>,
    pub lokasi_nama: String,
    pub lokasi_alamat: String,
    pub lokasi_kota: String,
    pub lokasi_provinsi: String,
    pub lokasi_kode_pos: String,
    pub core_dedicated: i32,
    pub sharing_core: String, // 'Ya' or 'Tidak'
}

#[derive(Debug, Serialize)]
pub struct PortalRegisterResponse {
    pub success: bool,
    pub kode_registrasi: String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct TrackServiceRequest {
    pub kode_registrasi: String,
    pub email_pic: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct TrackServiceResponse {
    /// ID internal hanya dikirim pada endpoint akun pelanggan. Endpoint publik
    /// tetap mengembalikan NULL agar tidak mengekspos identifier berurutan.
    pub id: Option<u64>,
    pub kode_registrasi: String,
    pub lokasi_nama: String,
    /// Disembunyikan dari endpoint publik, tetapi diisi pada endpoint akun pelanggan
    /// agar unggahan dokumen dapat ditautkan ke ruang dokumen pelanggan yang benar.
    pub pelanggan_id: Option<u64>,
    pub status: String,
    pub survey_status: String,
    pub survey_jadwal_at: Option<String>,
    pub survey_dokumen_id: Option<u64>,
    pub rejection_reason: Option<String>,
    pub cancellation_reason: Option<String>,
    pub cancelled_at: Option<String>,
    pub penawaran_status: String,
    pub penawaran_nomor: Option<String>,
    pub penawaran_nilai: Option<String>,
    pub penawaran_catatan: Option<String>,
    pub penawaran_dokumen_id: Option<u64>,
    pub respons_pemohon_catatan: Option<String>,
    pub po_nomor: Option<String>,
    pub po_catatan: Option<String>,
    pub po_dokumen_id: Option<u64>,
    pub po_akte_dokumen_id: Option<u64>,
    pub po_izin_dokumen_id: Option<u64>,
    pub legal_status: String,
    pub legal_catatan: Option<String>,
    pub direksi_status: String,
    pub direksi_catatan: Option<String>,
    pub pks_nomor: Option<String>,
    pub pks_status: String,
    pub pks_dokumen_id: Option<u64>,
    pub bak_dokumen_id: Option<u64>,
    pub bak_pelanggan_signed_dokumen_id: Option<u64>,
    pub pks_pelanggan_signed_dokumen_id: Option<u64>,
    pub pks_signed_dokumen_id: Option<u64>,
    pub pks_lokasi_signed_at: Option<String>,
    pub bak_direktur_bidang_signed_at: Option<String>,
    pub pks_direktur_utama_signed_at: Option<String>,
    pub aktivasi_status: String,
    pub aktivasi_jadwal_at: Option<String>,
    pub aktivasi_catatan: Option<String>,
    pub baa_nomor: Option<String>,
    pub baa_status: String,
    pub baa_dokumen_id: Option<u64>,
    pub baa_lokasi_accepted_at: Option<String>,
    pub invoice_nomor: Option<String>,
    pub invoice_nilai: Option<String>,
    pub invoice_status: String,
    pub invoice_dokumen_id: Option<u64>,
    pub faktur_pajak_dokumen_id: Option<u64>,
    pub pembayaran_status: String,
    pub pembayaran_dokumen_id: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct CancelServiceRequest {
    pub kode_registrasi: String,
    pub email_pic: String,
    pub cancellation_reason: String,
}

#[derive(Debug, Deserialize)]
pub struct AdminCancelServiceRequest {
    pub cancellation_reason: String,
}

#[derive(Debug, Deserialize)]
pub struct RespondOfferRequest {
    pub kode_registrasi: String,
    pub email_pic: String,
    pub keputusan: String,
    pub catatan: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateOfferRequest {
    pub penawaran_nomor: String,
    pub penawaran_nilai: f64,
    pub penawaran_catatan: Option<String>,
    pub penawaran_dokumen_id: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct SubmitPoRequest {
    pub kode_registrasi: String,
    pub email_pic: String,
    pub po_nomor: String,
    pub po_catatan: Option<String>,
    pub po_dokumen_id: Option<u64>,
    pub po_akte_dokumen_id: Option<u64>,
    pub po_izin_dokumen_id: Option<u64>,
}
#[derive(Debug, Deserialize)]
pub struct ReviewLegalRequest {
    pub keputusan: String,
    pub legal_catatan: Option<String>,
    pub nota_dinas: Option<String>,
    pub nota_dinas_dokumen_id: Option<u64>,
}
#[derive(Debug, Deserialize)]
pub struct DireksiDecisionRequest {
    pub keputusan: String,
    pub catatan: Option<String>,
}
#[derive(Debug, Deserialize)]
pub struct PreparePksRequest {
    pub pks_nomor: String,
    pub pks_catatan: Option<String>,
    pub bak_dokumen_id: Option<u64>,
    pub pks_dokumen_id: Option<u64>,
}
#[derive(Debug, Deserialize)]
pub struct UpdateActivationRequest {
    pub aktivasi_status: String,
    pub aktivasi_jadwal_at: Option<String>,
    pub aktivasi_catatan: Option<String>,
}
#[derive(Debug, Deserialize)]
pub struct CreateBaaRequest {
    pub baa_nomor: String,
    pub baa_catatan: Option<String>,
    pub baa_dokumen_id: Option<u64>,
}
#[derive(Debug, Deserialize)]
pub struct VerifyBaaRequest {
    pub catatan: Option<String>,
}
#[derive(Debug, Deserialize)]
pub struct AcceptBaaRequest {
    pub kode_registrasi: String,
    pub email_pic: String,
}
#[derive(Debug, Deserialize)]
pub struct CreateInvoiceRequest {
    pub invoice_nomor: String,
    pub invoice_nilai: f64,
    pub invoice_jatuh_tempo: String,
    pub kirim_sekarang: bool,
    pub invoice_dokumen_id: Option<u64>,
    pub faktur_pajak_dokumen_id: Option<u64>,
}
#[derive(Debug, Deserialize)]
pub struct ConfirmPaymentRequest {
    pub kode_registrasi: String,
    pub email_pic: String,
    pub catatan: Option<String>,
    pub pembayaran_dokumen_id: Option<u64>,
}
#[derive(Debug, Deserialize)]
pub struct VerifyPaymentRequest {
    pub keputusan: String,
    pub catatan: Option<String>,
}

// ============================================
// PORTAL REGISTRATION - ADMIN REVIEW
// ============================================
#[derive(Debug, Serialize, FromRow)]
pub struct PortalRegistrationListItem {
    pub id: u64,
    pub kode_registrasi: String,
    pub pelanggan_id: Option<u64>,
    pub lokasi_id: Option<u64>,
    pub nama_perusahaan: String,
    pub email_perusahaan: String,
    pub telepon_perusahaan: String,
    pub pic_nama: String,
    pub pic_email: String,
    pub pic_telepon: String,
    pub pic_jabatan: Option<String>,
    pub lokasi_nama: String,
    pub lokasi_alamat: String,
    pub lokasi_kota: Option<String>,
    pub lokasi_provinsi: Option<String>,
    pub lokasi_kode_pos: Option<String>,
    pub core_dedicated: i32,
    pub sharing_core: Option<String>,
    pub status: String,
    pub cancellation_reason: Option<String>,
    pub cancelled_at: Option<String>,
    pub survey_status: String,
    pub isp_nama: Option<String>,
    pub survey_dokumen_id: Option<u64>,
    pub penawaran_status: String,
    pub respons_pemohon_catatan: Option<String>,
    pub penawaran_dokumen_id: Option<u64>,
    pub po_nomor: Option<String>,
    pub po_dokumen_id: Option<u64>,
    pub po_akte_dokumen_id: Option<u64>,
    pub po_izin_dokumen_id: Option<u64>,
    pub legal_status: String,
    pub direksi_status: String,
    pub nota_dinas_dokumen_id: Option<u64>,
    pub pks_status: String,
    pub pks_dokumen_id: Option<u64>,
    pub bak_dokumen_id: Option<u64>,
    pub bak_pelanggan_signed_dokumen_id: Option<u64>,
    pub pks_pelanggan_signed_dokumen_id: Option<u64>,
    pub pks_signed_dokumen_id: Option<u64>,
    pub bak_direktur_bidang_signed_at: Option<String>,
    pub pks_direktur_utama_signed_at: Option<String>,
    pub aktivasi_status: String,
    pub baa_status: String,
    pub baa_dokumen_id: Option<u64>,
    pub baa_dbo_verified_at: Option<String>,
    pub baa_dikirim_at: Option<String>,
    pub invoice_status: String,
    pub invoice_dokumen_id: Option<u64>,
    pub faktur_pajak_dokumen_id: Option<u64>,
    pub pembayaran_status: String,
    pub pembayaran_dokumen_id: Option<u64>,
    pub rejection_reason: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PortalRegistrationDetail {
    pub id: u64,
    pub kode_registrasi: String,
    pub pelanggan_id: Option<u64>,
    pub nama_perusahaan: String,
    pub email_perusahaan: String,
    pub telepon_perusahaan: String,
    pub npwp: Option<String>,
    pub pic_nama: String,
    pub pic_email: String,
    pub pic_telepon: String,
    pub pic_jabatan: Option<String>,
    pub lokasi_nama: String,
    pub lokasi_alamat: String,
    pub lokasi_kota: Option<String>,
    pub lokasi_provinsi: Option<String>,
    pub lokasi_kode_pos: Option<String>,
    pub core_dedicated: i32,
    pub sharing_core: Option<String>,
    pub status: String,
    pub rejection_reason: Option<String>,
    pub cancellation_reason: Option<String>,
    pub cancelled_at: Option<String>,
    pub kebutuhan_terkonfirmasi: Option<String>,
    pub survey_status: String,
    pub survey_jadwal_at: Option<String>,
    pub survey_hasil: Option<String>,
    pub survey_dokumen_id: Option<u64>,
    pub isp_user_id: Option<u64>,
    pub isp_directory_id: Option<u64>,
    pub isp_nama: Option<String>,
    pub penawaran_status: String,
    pub penawaran_nomor: Option<String>,
    pub penawaran_nilai: Option<String>,
    pub penawaran_catatan: Option<String>,
    pub penawaran_dokumen_id: Option<u64>,
    pub respons_pemohon_catatan: Option<String>,
    pub po_nomor: Option<String>,
    pub po_catatan: Option<String>,
    pub po_dokumen_id: Option<u64>,
    pub po_akte_dokumen_id: Option<u64>,
    pub po_izin_dokumen_id: Option<u64>,
    pub legal_status: String,
    pub legal_catatan: Option<String>,
    pub nota_dinas: Option<String>,
    pub nota_dinas_dokumen_id: Option<u64>,
    pub direksi_status: String,
    pub direksi_catatan: Option<String>,
    pub pks_nomor: Option<String>,
    pub pks_catatan: Option<String>,
    pub pks_status: String,
    pub pks_dokumen_id: Option<u64>,
    pub bak_dokumen_id: Option<u64>,
    pub bak_pelanggan_signed_dokumen_id: Option<u64>,
    pub pks_pelanggan_signed_dokumen_id: Option<u64>,
    pub pks_signed_dokumen_id: Option<u64>,
    pub pks_lokasi_signed_at: Option<String>,
    pub bak_direktur_bidang_signed_at: Option<String>,
    pub pks_direktur_utama_signed_at: Option<String>,
    pub aktivasi_status: String,
    pub aktivasi_jadwal_at: Option<String>,
    pub aktivasi_catatan: Option<String>,
    pub baa_nomor: Option<String>,
    pub baa_catatan: Option<String>,
    pub baa_status: String,
    pub baa_dokumen_id: Option<u64>,
    pub baa_dbo_verified_at: Option<String>,
    pub baa_dikirim_at: Option<String>,
    pub baa_lokasi_accepted_at: Option<String>,
    pub invoice_nomor: Option<String>,
    pub invoice_nilai: Option<String>,
    pub invoice_jatuh_tempo: Option<String>,
    pub invoice_status: String,
    pub invoice_dokumen_id: Option<u64>,
    pub faktur_pajak_dokumen_id: Option<u64>,
    pub pembayaran_status: String,
    pub pembayaran_dokumen_id: Option<u64>,
    pub pembayaran_catatan: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct IspCandidate {
    pub id: u64,
    pub pelanggan_id: Option<u64>,
    pub nama_isp: String,
    pub pic_nama: Option<String>,
    pub email: Option<String>,
    pub telepon: Option<String>,
    pub wilayah: Option<String>,
    pub user_id: Option<u64>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct IspDirectoryRow {
    pub id: u64,
    pub pelanggan_id: Option<u64>,
    pub nama_isp: String,
    pub pic_nama: Option<String>,
    pub email: Option<String>,
    pub telepon: Option<String>,
    pub wilayah: Option<String>,
    pub catatan: Option<String>,
    pub status: String,
    pub user_id: Option<u64>,
    pub linked_account_email: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateIspDirectoryRequest {
    pub nama_isp: String,
    pub pic_nama: Option<String>,
    pub email: Option<String>,
    pub telepon: Option<String>,
    pub wilayah: Option<String>,
    pub catatan: Option<String>,
    pub status: Option<String>,
    pub user_id: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateIspDirectoryRequest {
    pub nama_isp: Option<String>,
    pub pic_nama: Option<String>,
    pub email: Option<String>,
    pub telepon: Option<String>,
    pub wilayah: Option<String>,
    pub catatan: Option<String>,
    pub status: Option<String>,
    pub user_id: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSurveyRequest {
    pub kebutuhan_terkonfirmasi: Option<String>,
    pub survey_status: String,
    pub survey_jadwal_at: Option<String>,
    pub survey_hasil: Option<String>,
    pub survey_dokumen_id: Option<u64>,
    /// ID master ISP. `isp_user_id` dipertahankan untuk kompatibilitas client lama.
    pub isp_id: Option<u64>,
    pub isp_user_id: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct RejectRegistrationRequest {
    pub rejection_reason: String,
}

// ============================================
// AJUKAN LOKASI TAMBAHAN (Pelanggan existing, sudah login)
// ============================================
#[derive(Debug, Deserialize)]
pub struct AddLocationRequest {
    pub lokasi_nama: String,
    pub lokasi_alamat: String,
    pub lokasi_kota: String,
    pub lokasi_provinsi: String,
    #[allow(dead_code)]
    pub lokasi_kode_pos: String,
    pub core_dedicated: i32,
    pub sharing_core: String, // 'Ya' or 'Tidak'
}

impl AddLocationRequest {
    pub fn validate(&self) -> Result<(), String> {
        if self.lokasi_nama.trim().is_empty() {
            return Err("Nama lokasi wajib diisi".to_string());
        }
        if self.lokasi_alamat.trim().is_empty() {
            return Err("Alamat lokasi wajib diisi".to_string());
        }
        if self.core_dedicated < 0 {
            return Err("Jumlah core tidak boleh kurang dari 0".to_string());
        }
        Ok(())
    }
}

#[derive(Debug, Serialize)]
pub struct AddLocationResponse {
    pub success: bool,
    pub lokasi_code: String,
    pub workflow_id: u64,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct SubmitServiceChangeRequest {
    pub jenis_permintaan: String,
    pub kontrak_induk_id: u64,
    pub lokasi_id: Option<u64>,
    pub lokasi_nama: String,
    pub lokasi_alamat: String,
    pub lokasi_kota: String,
    pub lokasi_provinsi: String,
    pub lokasi_kode_pos: Option<String>,
    pub core_dedicated: i32,
    pub sharing_core: Option<String>,
    pub catatan_pelanggan: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ServiceChangeRequestResponse {
    pub id: u64,
    pub kode_perubahan: String,
    pub pelanggan_id: u64,
    pub kontrak_induk_id: u64,
    pub lokasi_id: Option<u64>,
    pub jenis_permintaan: String,
    pub lokasi_nama: String,
    pub core_dedicated: i32,
    pub sharing_core: Option<String>,
    pub current_step: u8,
    pub total_steps: u8,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ServiceChangeWorkItem {
    pub id: u64,
    pub kode_perubahan: String,
    pub pelanggan_id: u64,
    pub nama_pelanggan: String,
    pub kontrak_induk_id: u64,
    pub lokasi_id: Option<u64>,
    pub lokasi_nama: String,
    pub jenis_permintaan: String,
    pub core_dedicated: i32,
    pub sharing_core: Option<String>,
    pub current_step: u8,
    pub total_steps: u8,
    pub status: String,
    pub catatan_pelanggan: Option<String>,
    pub detail_json: Option<String>,
    pub last_action: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CompleteServiceChangeStep {
    pub catatan: Option<String>,
    pub action: Option<String>,
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ServiceChangeHistory {
    pub id: u64,
    pub request_id: u64,
    pub step_nomor: u8,
    pub actor_role: String,
    pub actor_user_id: Option<u64>,
    pub action_type: String,
    pub detail_json: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ServiceChangeNotification {
    pub id: u64,
    pub request_id: u64,
    pub kode_perubahan: String,
    pub recipient_role: String,
    pub title: String,
    pub message: String,
    pub read_at: Option<String>,
    pub created_at: String,
}

/// Notifikasi terpadu yang ditampilkan pada header Admin KIMA. Sumber SOP1
/// berasal dari pendaftaran layanan baru, sedangkan SOP2 berasal dari antrean
/// perubahan layanan yang sudah ada.
#[derive(Debug, Serialize, FromRow)]
pub struct AdminNotification {
    pub id: u64,
    pub source: String,
    pub reference_id: u64,
    pub kode: String,
    pub title: String,
    pub message: String,
    pub read_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct MarkNotificationRead {
    pub read: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct ApproveRegistrationResponse {
    pub success: bool,
    pub kode_registrasi: String,
    pub message: String,
    pub account_created: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temporary_password: Option<String>,
}

// ============================================
// LOGIN REQUEST (Portal - same as internal)
// ============================================
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct PortalLoginRequest {
    pub email: String,
    pub password: String,
}

// ============================================
// WORKFLOW STATUS RESPONSE
// ============================================
#[derive(Serialize)]
pub struct WorkflowStatusResponse {
    pub id: u64,
    pub kode_lokasi: String,
    pub nama_lokasi: String,
    pub pelanggan_nama: String,
    pub current_step: i32,
    pub total_steps: i32,
    pub status: String,
    pub assigned_to_role: Option<String>,
    pub step_history: Vec<SopStepHistory>,
    pub documents: Vec<SopDocument>,
    pub started_at: String,
    pub completed_at: Option<String>,
}

impl std::fmt::Debug for WorkflowStatusResponse {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WorkflowStatusResponse")
            .field("id", &self.id)
            .field("kode_lokasi", &self.kode_lokasi)
            .field("nama_lokasi", &self.nama_lokasi)
            .field("pelanggan_nama", &self.pelanggan_nama)
            .field("current_step", &self.current_step)
            .field("total_steps", &self.total_steps)
            .field("status", &self.status)
            .field("assigned_to_role", &self.assigned_to_role)
            .field("step_history_len", &self.step_history.len())
            .field("documents_len", &self.documents.len())
            .field("started_at", &self.started_at)
            .field("completed_at", &self.completed_at)
            .finish()
    }
}

// ============================================
// STEP SUBMISSION REQUESTS
// ============================================
#[derive(Debug, Deserialize)]
pub struct Step1SubmitRequest {
    pub nama_lokasi_diajukan: String,
    pub alamat_lokasi_diajukan: String,
    pub core_diajukan: i32,
    pub sharing_core_diajukan: String,
}

#[derive(Debug, Deserialize)]
pub struct Step3SubmitRequest {
    pub core_dedicated: i32,
    pub sharing_core: String,
    #[allow(dead_code)]
    pub keterangan: Option<String>,
}

// ============================================
// STEP 4: SURVEY TEKNIS (Teknisi)
// ============================================
#[derive(Debug, Deserialize)]
pub struct Step4SurveyRequest {
    pub hasil_survey: String,     // ringkasan hasil survey
    pub foto_lokasi: Vec<String>, // array drive_file_id
    pub foto_jalur: Vec<String>,  // array drive_file_id
    pub koordinat_lat: Option<f64>,
    pub koordinat_lng: Option<f64>,
    pub kesiapan_jalur: String, // 'ready' atau 'not_ready'
    pub catatan_teknis: Option<String>,
    pub rekomendasi_jalur: Option<String>,
}

// ============================================
// STEP 5: PENYUSUNAN PROPOSAL (DBO)
// ============================================
#[derive(Debug, Deserialize)]
pub struct Step5ProposalRequest {
    pub judul_proposal: String,
    pub nomor_proposal: String,   // contoh: PROP-2025-001
    pub tanggal_proposal: String, // YYYY-MM-DD
    pub nilai_penawaran: f64,
    pub biaya_instalasi: f64,
    pub biaya_bulanan: f64,
    pub durasi_kontrak_bulan: u32,
    #[allow(dead_code)]
    pub garansi_sla: Option<String>, // contoh: "99.5%"
    pub terms_conditions: Option<String>,
    pub proposal_file_id: Option<String>, // drive file ID proposal PDF
    #[allow(dead_code)]
    pub catatan_dbo: Option<String>,
}

// ============================================
// STEP 6: PRESENTASI PROPOSAL + RESPON (DBO/Customer)
// ============================================
#[derive(Debug, Deserialize)]
pub struct Step6PresentasiRequest {
    pub tanggal_presentasi: String, // YYYY-MM-DD
    pub metode_presentasi: String,  // 'online', 'offline', 'hybrid'
    #[allow(dead_code)]
    pub peserta_presentasi: Option<String>, // daftar peserta
    pub hasil_presentasi: String,   // ringkasan hasil
    pub keputusan_pelanggan: String, // 'setuju', 'negosiasi', 'tolak'
    pub alasan_negosiasi: Option<String>,
    pub permintaan_revisi: Option<String>, // apa yang perlu direvisi
    pub notulen_file_id: Option<String>,   // drive file ID notulen meeting
}

#[derive(Debug, Deserialize)]
pub struct Step2ValidationRequest {
    pub decision: String, // 'approve', 'reject', 'revise'
    pub catatan_validasi: Option<String>,
    #[allow(dead_code)]
    pub dokumen_verifikasi: Option<Vec<String>>, // List dokumen yang sudah diverifikasi
}

#[derive(Debug, Deserialize)]
pub struct Step12UploadRequest {
    pub kategori_dokumen: String,
    pub nama_file: String,
    pub drive_file_id: Option<String>,
    pub drive_folder_id: Option<String>,
    pub ukuran_byte: Option<u64>,
    pub mime_type: Option<String>,
    pub deskripsi: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Step13ActivationRequest {
    pub no_kontrak: Option<String>,
    pub periode_awal: String,
    pub periode_berakhir: String,
    pub durasi_kontrak_bulan: Option<u32>,
    pub nilai_kontrak: Option<f64>,
    pub biaya_aktivasi: Option<f64>,
    pub perbulan: Option<f64>,
    pub nilai_periode_aktif: Option<f64>,
    pub kategori: Option<String>,
    pub status_kontrak: Option<String>,
    pub keterangan: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Step11VoteRequest {
    pub decision: String, // 'approve', 'reject', 'revise'
    pub back_to_step: Option<i32>,
    pub notes: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct DocumentUploadRequest {
    pub workflow_id: u64,
    pub step_nomor: Option<i32>,
    pub kategori: String,
    pub deskripsi: Option<String>,
}

// ============================================
// WORKFLOW LIST QUERY PARAMS
// ============================================
#[derive(Debug, Deserialize)]
pub struct ListWorkflowsQuery {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
    pub status: Option<String>,
    pub penawaran_status: Option<String>,
    pub assigned_to_role: Option<String>,
    #[allow(dead_code)]
    pub search: Option<String>,
}

// ============================================
// STEP DEFINITIONS (18 Steps Mapping)
// ============================================
#[allow(dead_code)]
pub const STEP_DEFINITIONS: &[(&str, &str, &str)] = &[
    // (step_label, actor_role, action_required)
    ("Submit Minat", "customer", "upload_surat_minat"),
    ("Validasi Administratif", "dbo", "verify_documents"),
    ("Konfirmasi Kebutuhan", "customer", "submit_requirements"),
    ("Survey Teknis", "teknisi", "submit_survey"),
    ("Penyusunan Proposal", "dbo", "generate_proposal"),
    ("Presentasi Proposal", "dbo", "schedule_meeting"),
    ("Upload PO & Legalitas", "customer", "upload_documents"),
    ("Review Kontrak Legal", "legal", "review_contract"),
    ("Penawaran Harga", "dbo", "set_pricing"),
    ("Negosiasi Komersial", "dbo", "log_negotiation"),
    ("Approval Direksi", "direksi", "vote_decision"),
    ("Penandatanganan BAK", "customer", "upload_signed_bak"),
    ("Aktivasi Kontrak", "admin", "create_kontrak"),
    ("Penerbitan Invoice", "keuangan", "create_invoice"),
    ("Pembayaran Customer", "customer", "upload_payment_proof"),
    ("Verifikasi Pembayaran", "keuangan", "verify_payment"),
    ("Instalasi & Aktivasi", "teknisi", "activate_service"),
    ("Final Acceptance", "customer", "upload_snbt"),
];

#[allow(dead_code)]
pub fn get_step_definition(step: i32) -> Option<(&'static str, &'static str, &'static str)> {
    STEP_DEFINITIONS.get((step - 1) as usize).copied()
}

#[allow(dead_code)]
pub fn get_actor_for_step(step: i32) -> Option<&'static str> {
    get_step_definition(step).map(|(_, actor, _)| actor)
}

// ============================================
// SHARING CORE PARSER
// ============================================
use crate::error::ApiError;

/// Parse sharing_core input from form ('Ya'/'Tidak' or direct ratio like '1/2')
/// Returns Option<String> - None if 'Tidak', Some(ratio) if valid
pub fn parse_sharing_core(value: &str) -> Result<Option<String>, ApiError> {
    match value {
        "Tidak" => Ok(None),
        "Ya" => Ok(Some("1/2".to_string())), // Default to 1/2 if just "Ya"
        "1/2" | "1/4" | "1/8" | "1/16" | "1/32" => Ok(Some(value.to_string())),
        _ => Err(ApiError::bad_request(&format!(
            "Sharing core tidak valid: {}. Gunakan 'Ya', 'Tidak', atau ratio (1/2, 1/4, 1/8, 1/16, 1/32)",
            value
        ))),
    }
}

// ============================================
// VALIDATION HELPERS
// ============================================
impl PortalRegisterRequest {
    pub fn validate(&self) -> Result<(), String> {
        if self.nama_pemohon.trim().len() < 3 {
            return Err("Nama pemohon minimal 3 karakter".to_string());
        }
        if self.pic_nama.trim().is_empty() {
            return Err("Nama PIC wajib diisi".to_string());
        }
        if !self.pic_email.contains('@') {
            return Err("Email PIC tidak valid".to_string());
        }
        if self.pic_telepon.len() < 10 {
            return Err("Nomor telepon PIC minimal 10 digit".to_string());
        }
        if self.lokasi_nama.trim().is_empty() {
            return Err("Nama lokasi wajib diisi".to_string());
        }
        if self.lokasi_alamat.trim().is_empty() {
            return Err("Alamat lokasi wajib diisi".to_string());
        }
        if self.core_dedicated < 0 {
            return Err("Jumlah core tidak boleh kurang dari 0".to_string());
        }
        Ok(())
    }
}
