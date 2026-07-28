use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct StatusResponse {
    pub status: &'static str,
}

#[derive(Serialize)]
pub struct NextKontrakCodeResponse {
    pub kode_kontrak: String,
}

#[derive(Serialize)]
pub struct NextPelangganCodeResponse {
    pub kode_pelanggan: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub access_token: String,
    pub token_type: &'static str,
    pub expires_in: u64,
    pub user: SessionUser,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub must_change_password: bool,
}

#[derive(Clone, Serialize)]
pub struct SessionUser {
    pub id: u64,
    pub email: String,
    pub role: String,
}

#[derive(Clone)]
pub struct AuthUser {
    pub id: u64,
    pub role: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: u64,
    pub email: String,
    pub role: String,
    pub session_version: u64,
    pub iat: u64,
    pub exp: u64,
}

#[derive(Deserialize)]
pub struct Pagination {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
    pub search: Option<String>,
    pub status: Option<String>,
    pub active_only: Option<bool>,
}

#[derive(Serialize)]
pub struct Page<T> {
    pub data: Vec<T>,
    pub total: u64,
    pub page: u64,
    pub page_size: u64,
}

#[derive(Serialize)]
pub struct CustomerRow {
    pub id: u64,
    pub kode_pelanggan: Option<String>,
    pub nama_pelanggan: String,
    pub pic: Option<String>,
    pub telepon: Option<String>,
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link_folder_berkas: Option<String>,
    pub keterangan: Option<String>,
    pub lokasi_beroperasi: i64,
    pub lokasi_belum_beroperasi: i64,
    pub lokasi_proses_perpanjangan: i64,
}

#[derive(Deserialize)]
pub struct CreateCustomerRequest {
    pub kode_pelanggan: Option<String>,
    pub nama_pelanggan: String,
    pub pic: Option<String>,
    pub telepon: Option<String>,
    pub email: Option<String>,
    pub keterangan: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateCustomerRequest {
    pub nama_pelanggan: Option<String>,
    pub pic: Option<String>,
    pub telepon: Option<String>,
    pub email: Option<String>,
    pub keterangan: Option<String>,
}

#[derive(Deserialize)]
pub struct RenameDocumentRequest {
    pub nama_file: String,
}

#[derive(Serialize)]
pub struct ContractRow {
    pub id: u64,
    pub kode_kontrak: String,
    pub nomor_kontrak: Option<String>,
    pub pelanggan_id: u64,
    pub nama_pelanggan: String,
    pub nama_lokasi: String,
    pub status_kontrak: String,
    pub periode_awal: String,
    pub periode_berakhir: String,
    pub jalur: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link_folder_berkas: Option<String>,
    pub core: Option<String>,
    pub sharing_core: Option<String>,
    pub durasi_kontrak_bulan: Option<u32>,
    pub nilai_kontrak: Option<f64>,
    pub biaya_aktivasi: Option<f64>,
    pub perbulan: Option<f64>,
    pub nilai_periode_aktif: Option<f64>,
}

#[derive(Deserialize)]
pub struct CreateContractRequest {
    pub pelanggan_id: u64,
    pub kode_kontrak: String,
    pub nama_lokasi: String,
    pub periode_awal: String,
    pub periode_berakhir: String,
    pub status_kontrak: Option<String>,
    pub kategori: Option<String>,
    pub core: Option<String>,
    pub sharing_core: Option<String>,
    pub no_kontrak: Option<String>,
    pub nilai_kontrak: Option<f64>,
    pub biaya_aktivasi: Option<f64>,
    pub perbulan: Option<f64>,
    pub nilai_periode_aktif: Option<f64>,
    pub durasi_kontrak_bulan: Option<u32>,
    pub keterangan: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateContractRequest {
    pub pelanggan_id: Option<u64>,
    pub kode_kontrak: Option<String>,
    pub nama_lokasi: Option<String>,
    pub periode_awal: Option<String>,
    pub periode_berakhir: Option<String>,
    pub status_kontrak: Option<String>,
    pub kategori: Option<String>,
    pub core: Option<String>,
    pub sharing_core: Option<String>,
    pub no_kontrak: Option<String>,
    pub nilai_kontrak: Option<f64>,
    pub biaya_aktivasi: Option<f64>,
    pub perbulan: Option<f64>,
    pub nilai_periode_aktif: Option<f64>,
    pub durasi_kontrak_bulan: Option<u32>,
    pub keterangan: Option<String>,
}

#[derive(Deserialize)]
pub struct ExtendContractRequest {
    pub kode_kontrak: Option<String>,
    pub no_kontrak: Option<String>,
    pub periode_awal: String,
    pub durasi_kontrak_bulan: u32,
    pub periode_berakhir: String,
    pub nilai_kontrak: Option<f64>,
    pub biaya_aktivasi: Option<f64>,
    pub perbulan: Option<f64>,
    pub nilai_periode_aktif: Option<f64>,
    pub keterangan: Option<String>,
    pub core: Option<String>,
    pub sharing_core: Option<String>,
}

#[derive(Deserialize)]
pub struct UpgradeContractRequest {
    pub kode_kontrak: Option<String>,
    pub no_kontrak: Option<String>,
    pub tanggal_mulai_upgrade: String,
    pub core: Option<String>,
    pub sharing_core: Option<String>,
    pub nilai_kontrak: Option<f64>,
    pub biaya_aktivasi: Option<f64>,
    pub perbulan: Option<f64>,
    pub nilai_periode_aktif: Option<f64>,
    pub durasi_kontrak_bulan: Option<u32>,
    pub keterangan: Option<String>,
}

#[derive(Serialize)]
pub struct DocumentRow {
    pub id: u64,
    pub pelanggan_id: Option<u64>,
    pub lokasi_id: Option<u64>,
    pub billing_id: Option<u64>,
    pub uploaded_by_user_id: Option<u64>,
    pub kategori: String,
    pub nama_file: String,
    pub ukuran_byte: Option<u64>,
    pub mime_type: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct DriveSyncResponse {
    pub folders_scanned: u64,
    pub files_scanned: u64,
    pub new_documents: u64,
    pub existing_documents: u64,
    pub errors: u64,
}

#[derive(Clone, Serialize)]
pub struct DriveSyncProgress {
    pub job_id: u64,
    pub status: String,
    pub total_targets: u64,
    pub processed_targets: u64,
    pub folders_scanned: u64,
    pub files_scanned: u64,
    pub new_documents: u64,
    pub existing_documents: u64,
    pub errors: u64,
    pub message: Option<String>,
}

#[derive(Serialize)]
pub struct BackupJobRow {
    pub id: u64,
    pub trigger_type: String,
    pub scheduled_date: Option<String>,
    pub status: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub drive_file_id: Option<String>,
    pub file_name: Option<String>,
    pub sha256: Option<String>,
    pub dump_bytes: Option<u64>,
    pub compressed_bytes: Option<u64>,
    pub encrypted_bytes: Option<u64>,
    pub error_message: Option<String>,
}

#[derive(Deserialize)]
pub struct RestoreBackupRequest {
    pub backup_job_id: u64,
}

#[derive(Serialize)]
pub struct BackupRestoreResult {
    pub restore_job_id: u64,
    pub backup_job_id: u64,
    pub status: String,
    pub table_count: u64,
    pub sha256: String,
}

#[derive(Serialize)]
pub struct IspDocumentRow {
    pub id: u64,
    pub pelanggan_id: u64,
    pub lokasi_id: Option<u64>,
    pub nama_pelanggan: String,
    pub nama_lokasi: Option<String>,
    pub kategori: String,
    pub nama_file: String,
    pub ukuran_byte: Option<u64>,
    pub mime_type: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct PelangganAccessRow {
    pub id: u64,
    pub kode_pelanggan: Option<String>,
    pub nama_pelanggan: String,
}

#[derive(Deserialize)]
pub struct UpdateUserPelangganAccessRequest {
    pub pelanggan_ids: Vec<u64>,
}

#[derive(Deserialize)]
pub struct ListDocumentsQuery {
    pub pelanggan_id: Option<u64>,
    pub lokasi_id: Option<u64>,
    pub billing_id: Option<u64>,
    pub page: Option<u64>,
    pub page_size: Option<u64>,
}

#[derive(Deserialize)]
pub struct CreateUserRequest {
    pub email: String,
    pub password: String,
    pub role: String,
}

#[derive(Deserialize)]
pub struct UpdateUserRequest {
    pub email: Option<String>,
    pub role: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Deserialize)]
pub struct ResetPasswordRequest {
    pub new_password: String,
}

#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    pub new_password: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct MapPointRow {
    pub lokasi_id: u64,
    pub nama_lokasi: String,
    pub pelanggan_id: u64,
    pub nama_pelanggan: String,
    pub points: Option<serde_json::Value>,
    pub approval_status: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateMapPointRequest {
    pub lokasi_id: u64,
    pub latitude: f64,
    pub longitude: f64,
    pub label: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TitikIspRow {
    pub id: u64,
    pub pelanggan_id: u64,
    pub nama_pelanggan: String,
    pub label: String,
    pub latitude: f64,
    pub longitude: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct CreateTitikIspRequest {
    pub id: Option<u64>,
    pub pelanggan_id: u64,
    pub latitude: f64,
    pub longitude: f64,
    pub label: Option<String>,
}

#[derive(Serialize)]
pub struct TitikLokasiDetailRow {
    pub id: u64,
    pub lokasi_id: u64,
    pub label: String,
    pub latitude: f64,
    pub longitude: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct ListTitikLokasiDetailQuery {
    pub lokasi_id: u64,
}

#[derive(Deserialize)]
pub struct CreateTitikLokasiDetailRequest {
    pub lokasi_id: u64,
    pub label: String,
    pub latitude: f64,
    pub longitude: f64,
}

#[derive(Deserialize)]
pub struct UpdateTitikLokasiDetailRequest {
    pub label: String,
    pub latitude: f64,
    pub longitude: f64,
}

#[derive(Serialize)]
pub struct UserRow {
    pub id: u64,
    pub email: String,
    pub role: String,
    pub is_active: bool,
    pub disabled_at: Option<String>,
    pub last_login_at: Option<String>,
    pub must_change_password: bool,
    pub failed_login_attempts: u16,
    pub locked_until: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
