use std::sync::Arc;

use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use chrono::Local;
use sqlx::MySqlPool;

use crate::{
    access::assert_pelanggan_access,
    error::ApiError,
    sop::models::*,
    state::AppState,
    util::{parse_date, trim_opt, validate_opt_string_length, validate_string_length},
};

// Model SOP menyimpan timestamp sebagai String, sedangkan kolom MySQL bertipe
// TIMESTAMP dan project ini tidak mengaktifkan fitur chrono pada sqlx. Sama seperti
// modul lain (users.rs, dokumen.rs), kolom waktu harus di-CAST ke CHAR agar bisa
// didekode ke String. Karena itu query tidak boleh memakai `SELECT *`.
const WORKFLOW_COLUMNS: &str = "id, pelanggan_id, lokasi_id, nama_lokasi_diajukan, \
    alamat_lokasi_diajukan, core_diajukan, sharing_core_diajukan, kota, provinsi, \
    current_step, total_steps, status, back_to_step, rejection_reason, assigned_to_role, \
    assigned_to_user_id, CAST(started_at AS CHAR) AS started_at, \
    CAST(completed_at AS CHAR) AS completed_at, CAST(expired_at AS CHAR) AS expired_at, \
    CAST(updated_at AS CHAR) AS updated_at";

const WORKFLOW_COLUMNS_PREFIXED: &str = "sw.id, sw.pelanggan_id, sw.lokasi_id, \
    sw.nama_lokasi_diajukan, sw.alamat_lokasi_diajukan, sw.core_diajukan, \
    sw.sharing_core_diajukan, sw.kota, sw.provinsi, sw.current_step, sw.total_steps, \
    sw.status, sw.back_to_step, sw.rejection_reason, sw.assigned_to_role, \
    sw.assigned_to_user_id, CAST(sw.started_at AS CHAR) AS started_at, \
    CAST(sw.completed_at AS CHAR) AS completed_at, CAST(sw.expired_at AS CHAR) AS expired_at, \
    CAST(sw.updated_at AS CHAR) AS updated_at";

const STEP_HISTORY_COLUMNS: &str = "id, workflow_id, step_nomor, actor_role, actor_user_id, \
    action_type, description, back_to_step, ip_address, user_agent, \
    CAST(created_at AS CHAR) AS created_at";

const DOCUMENT_COLUMNS: &str = "id, workflow_id, step_nomor, kategori, nama_file, deskripsi, \
    drive_file_id, drive_folder_id, ukuran_byte, mime_type, upload_status, \
    uploaded_by_user_id, uploaded_by_role, verified_by_user_id, verified_by_role, \
    CAST(verified_at AS CHAR) AS verified_at, verification_notes, \
    CAST(created_at AS CHAR) AS created_at";

// ============================================
// PORTAL - CUSTOMER ENDPOINTS (No Auth Required for Register)
// ============================================

pub async fn portal_register(
    State(state): State<Arc<AppState>>,
    Json(body): Json<PortalRegisterRequest>,
) -> Result<Json<PortalRegisterResponse>, ApiError> {
    // Validate input
    if let Err(e) = body.validate() {
        return Err(ApiError::bad_request(&e));
    }

    // Satu pemohon dapat mengajukan beberapa titik layanan. Yang ditolak hanya
    // duplikasi untuk lokasi yang sama yang masih menunggu tinjauan KIMA.
    let existing_registration: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM portal_registrations
         WHERE email_perusahaan = ? AND lokasi_nama = ? AND status = 'menunggu'",
    )
    .bind(&body.pic_email)
    .bind(&body.lokasi_nama)
    .fetch_optional(&state.database)
    .await
    .map_err(|e| ApiError::internal(&format!("Database error: {}", e)))?;

    if existing_registration.is_some() {
        return Err(ApiError::conflict(
            "Sudah ada permohonan untuk lokasi ini yang sedang ditinjau KIMA.",
        ));
    }

    // Core/sharing mengikuti constraint existing di tabel lokasi:
    // - core harus kosong atau format "<n> Core"
    // - sharing_core harus salah satu: 1/2, 1/4, 1/8, 1/16, 1/32
    // - tidak boleh isi dua-duanya (xor)
    // Divalidasi di sini juga (bukan hanya saat approve) agar admin tidak menemukan
    // pendaftaran yang datanya tidak valid saat sudah waktunya disetujui.
    let sharing_value = parse_sharing_core(&body.sharing_core)?;
    if body.core_dedicated > 0 && sharing_value.is_some() {
        return Err(ApiError::bad_request(
            "Core dedicated dan sharing core tidak dapat dipilih bersamaan.",
        ));
    }

    let kode_registrasi = generate_registration_code(&state.database).await?;

    let registration = sqlx::query(
        "INSERT INTO portal_registrations (
            kode_registrasi, nama_perusahaan, email_perusahaan, telepon_perusahaan, npwp,
            pic_nama, pic_email, pic_telepon, pic_jabatan,
            lokasi_nama, lokasi_alamat, lokasi_kota, lokasi_provinsi, lokasi_kode_pos,
            core_dedicated, sharing_core, status, created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'menunggu', NOW())",
    )
    .bind(&kode_registrasi)
    // Kolom bernama `*_perusahaan` adalah skema lama. Pada Tahap 1 nilainya
    // menyimpan identitas pemohon dan kontak PIC, bukan legalitas perusahaan.
    .bind(&body.nama_pemohon)
    .bind(&body.pic_email)
    .bind(&body.pic_telepon)
    .bind(Option::<String>::None)
    .bind(&body.pic_nama)
    .bind(&body.pic_email)
    .bind(&body.pic_telepon)
    .bind(&body.pic_jabatan)
    .bind(&body.lokasi_nama)
    .bind(&body.lokasi_alamat)
    .bind(&body.lokasi_kota)
    .bind(&body.lokasi_provinsi)
    .bind(&body.lokasi_kode_pos)
    .bind(body.core_dedicated)
    .bind(&body.sharing_core)
    .execute(&state.database)
    .await
    .map_err(|e| ApiError::internal(&format!("Insert portal_registrations failed: {}", e)))?;

    // Simpan notifikasi untuk Admin agar permohonan baru terlihat tanpa harus
    // melakukan refresh antrean secara manual.
    sqlx::query(
        "INSERT INTO admin_notifications (source, reference_id, title, message)
         VALUES ('sop1', ?, 'Permohonan layanan baru', ?)",
    )
    .bind(registration.last_insert_id())
    .bind(format!(
        "Permohonan {} dari {} menunggu tinjauan Admin.",
        kode_registrasi, body.nama_pemohon
    ))
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;

    tracing::info!(
        "New service request submitted by {} ({})",
        body.pic_email,
        kode_registrasi
    );

    Ok(Json(PortalRegisterResponse {
        success: true,
        kode_registrasi,
        message: "Permohonan layanan terkirim. Tim KIMA akan meninjau dan menghubungi PIC lokasi untuk konfirmasi serta survei jalur.".to_string(),
    }))
}

/// Pelacakan publik memakai kode permohonan dan email PIC. Respons hanya
/// memuat progres yang boleh diketahui pemohon, bukan hasil teknis atau ISP.
pub async fn track_service_request(
    State(state): State<Arc<AppState>>,
    Json(body): Json<TrackServiceRequest>,
) -> Result<Json<TrackServiceResponse>, ApiError> {
    let kode = body.kode_registrasi.trim();
    let email = body.email_pic.trim();
    if kode.is_empty() || !email.contains('@') {
        return Err(ApiError::bad_request(
            "Kode permohonan dan email PIC wajib diisi.",
        ));
    }
    let row = sqlx::query_as(
        "SELECT NULL AS id, kode_registrasi, lokasi_nama, NULL AS pelanggan_id, status, survey_status,
                CAST(survey_jadwal_at AS CHAR) AS survey_jadwal_at, NULL AS survey_dokumen_id, rejection_reason,
                cancellation_reason, CAST(cancelled_at AS CHAR) AS cancelled_at,
                penawaran_status, penawaran_nomor, CAST(penawaran_nilai AS CHAR) AS penawaran_nilai, penawaran_catatan,
                penawaran_dokumen_id,
                respons_pemohon_catatan, po_nomor, po_catatan, NULL AS po_dokumen_id,
                NULL AS po_akte_dokumen_id, NULL AS po_izin_dokumen_id, legal_status, legal_catatan,
                 direksi_status, direksi_catatan, pks_nomor, pks_status, NULL AS pks_dokumen_id, NULL AS bak_dokumen_id, NULL AS bak_pelanggan_signed_dokumen_id, NULL AS pks_pelanggan_signed_dokumen_id, NULL AS pks_signed_dokumen_id,
                CAST(pks_lokasi_signed_at AS CHAR) AS pks_lokasi_signed_at,
                CAST(bak_direktur_bidang_signed_at AS CHAR) AS bak_direktur_bidang_signed_at,
                CAST(pks_direktur_utama_signed_at AS CHAR) AS pks_direktur_utama_signed_at
                , aktivasi_status, CAST(aktivasi_jadwal_at AS CHAR) AS aktivasi_jadwal_at, aktivasi_catatan,
                baa_nomor, baa_status, NULL AS baa_dokumen_id, CAST(baa_lokasi_accepted_at AS CHAR) AS baa_lokasi_accepted_at,
                invoice_nomor, CAST(invoice_nilai AS CHAR) AS invoice_nilai, invoice_status, NULL AS invoice_dokumen_id, NULL AS faktur_pajak_dokumen_id, pembayaran_status, NULL AS pembayaran_dokumen_id
         FROM portal_registrations WHERE kode_registrasi = ? AND pic_email = ?"
    )
    .bind(kode).bind(email).fetch_optional(&state.database).await.map_err(ApiError::database)?
        .ok_or_else(|| ApiError::not_found("Kode permohonan atau email PIC tidak sesuai."))?;
    Ok(Json(row))
}

/// Pemohon dapat membatalkan permohonan sebelum KIMA memprosesnya.
/// Endpoint tetap publik karena akun Pelanggan baru dibuat setelah permohonan
/// diterima; kode permohonan dan email PIC menjadi verifikasi kepemilikan.
pub async fn cancel_service_request(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CancelServiceRequest>,
) -> Result<Json<PortalRegisterResponse>, ApiError> {
    let kode = body.kode_registrasi.trim();
    let email = body.email_pic.trim();
    let reason = body.cancellation_reason.trim();
    if kode.is_empty() || !email.contains('@') {
        return Err(ApiError::bad_request(
            "Kode permohonan dan email PIC wajib diisi.",
        ));
    }
    if reason.len() < 5 {
        return Err(ApiError::bad_request(
            "Alasan pembatalan minimal 5 karakter.",
        ));
    }

    let current: Option<(u64, String)> = sqlx::query_as(
        "SELECT id, status FROM portal_registrations
         WHERE kode_registrasi = ? AND pic_email = ? LIMIT 1",
    )
    .bind(kode)
    .bind(email)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?;
    let Some((registration_id, status)) = current else {
        return Err(ApiError::not_found(
            "Kode permohonan atau email PIC tidak sesuai.",
        ));
    };
    if status != "menunggu" {
        return Err(ApiError::conflict(
            "Permohonan tidak dapat dibatalkan karena sudah diproses KIMA.",
        ));
    }

    let changed = sqlx::query(
        "UPDATE portal_registrations
         SET status = 'dibatalkan', cancellation_reason = ?, cancelled_at = NOW(),
             cancelled_by_email = ?, processed_at = NOW()
         WHERE id = ? AND status = 'menunggu'",
    )
    .bind(reason)
    .bind(email)
    .bind(registration_id)
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::conflict(
            "Permohonan sudah diproses atau dibatalkan oleh pihak lain.",
        ));
    }

    sqlx::query(
        "INSERT INTO admin_notifications (source, reference_id, title, message)
         VALUES ('sop1', ?, 'Permohonan layanan dibatalkan', ?)
         ON DUPLICATE KEY UPDATE title = VALUES(title), message = VALUES(message), read_at = NULL",
    )
    .bind(registration_id)
    .bind(format!(
        "Permohonan {} dibatalkan oleh pemohon. Alasan: {}",
        kode, reason
    ))
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;

    tracing::info!("Service request cancelled by {} ({})", email, kode);
    Ok(Json(PortalRegisterResponse {
        success: true,
        kode_registrasi: kode.to_string(),
        message: "Permohonan berhasil dibatalkan.".to_string(),
    }))
}

/// Admin KIMA dapat membatalkan permohonan yang masih menunggu tinjauan atau
/// sudah diterima tetapi layanan belum aktif.
/// Berbeda dari pembatalan publik, identitas pelaku dicatat melalui
/// processed_by_user_id dari sesi Admin.
pub async fn admin_cancel_service_request(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(registration_id): Path<u64>,
    Json(body): Json<AdminCancelServiceRequest>,
) -> Result<Json<PortalRegisterResponse>, ApiError> {
    crate::util::require_admin(&auth.role)?;
    let reason = body.cancellation_reason.trim();
    if reason.len() < 5 {
        return Err(ApiError::bad_request(
            "Alasan pembatalan minimal 5 karakter.",
        ));
    }

    let current: Option<(String, String, String)> = sqlx::query_as(
        "SELECT kode_registrasi, status, aktivasi_status FROM portal_registrations WHERE id = ? LIMIT 1",
    )
    .bind(registration_id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?;
    let Some((kode, status, aktivasi_status)) = current else {
        return Err(ApiError::not_found("Permohonan tidak ditemukan."));
    };
    let can_cancel = status == "menunggu" || (status == "disetujui" && aktivasi_status != "aktif");
    if !can_cancel {
        return Err(ApiError::conflict(
            "Permohonan hanya dapat dibatalkan sebelum layanan aktif.",
        ));
    }

    let changed = sqlx::query(
        "UPDATE portal_registrations
         SET status = 'dibatalkan', cancellation_reason = ?, cancelled_at = NOW(),
             processed_by_user_id = ?, processed_at = NOW()
         WHERE id = ? AND status IN ('menunggu', 'disetujui') AND aktivasi_status <> 'aktif'",
    )
    .bind(reason)
    .bind(auth.id)
    .bind(registration_id)
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::conflict(
            "Permohonan sudah diproses atau dibatalkan oleh pihak lain.",
        ));
    }

    sqlx::query(
        "INSERT INTO admin_notifications (source, reference_id, title, message)
         VALUES ('sop1', ?, 'Permohonan layanan dibatalkan KIMA', ?)
         ON DUPLICATE KEY UPDATE title = VALUES(title), message = VALUES(message), read_at = NULL",
    )
    .bind(registration_id)
    .bind(format!(
        "Permohonan {} dibatalkan oleh Admin KIMA. Alasan: {}",
        kode, reason
    ))
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;

    tracing::info!(
        "Service request {} cancelled by Admin user {}",
        kode,
        auth.id
    );
    Ok(Json(PortalRegisterResponse {
        success: true,
        kode_registrasi: kode,
        message: "Permohonan berhasil dibatalkan oleh Admin KIMA.".to_string(),
    }))
}

/// Daftar permohonan layanan milik akun Pelanggan yang sudah terautentikasi.
/// Berbeda dengan pelacakan publik, akun tidak perlu memasukkan kode dan email
/// lagi; kepemilikan dibatasi oleh akun pembuat atau pelanggan yang ditugaskan.
pub async fn list_my_service_requests(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
) -> Result<Json<Vec<TrackServiceResponse>>, ApiError> {
    if auth.role != "pelanggan" {
        return Err(ApiError::forbidden(
            "Endpoint ini hanya tersedia untuk akun Pelanggan.",
        ));
    }

    let rows = sqlx::query_as(
        "SELECT id, kode_registrasi, lokasi_nama, pelanggan_id, status, survey_status,
                CAST(survey_jadwal_at AS CHAR) AS survey_jadwal_at, survey_dokumen_id, rejection_reason,
                cancellation_reason, CAST(cancelled_at AS CHAR) AS cancelled_at,
                penawaran_status, penawaran_nomor, CAST(penawaran_nilai AS CHAR) AS penawaran_nilai, penawaran_catatan,
                penawaran_dokumen_id,
                respons_pemohon_catatan, po_nomor, po_catatan, po_dokumen_id,
                po_akte_dokumen_id, po_izin_dokumen_id, legal_status, legal_catatan,
                 direksi_status, direksi_catatan, pks_nomor, pks_status, pks_dokumen_id, bak_dokumen_id, bak_pelanggan_signed_dokumen_id, pks_pelanggan_signed_dokumen_id, pks_signed_dokumen_id,
                CAST(pks_lokasi_signed_at AS CHAR) AS pks_lokasi_signed_at,
                CAST(bak_direktur_bidang_signed_at AS CHAR) AS bak_direktur_bidang_signed_at,
                CAST(pks_direktur_utama_signed_at AS CHAR) AS pks_direktur_utama_signed_at,
                aktivasi_status, CAST(aktivasi_jadwal_at AS CHAR) AS aktivasi_jadwal_at, aktivasi_catatan,
                baa_nomor, baa_status,
                CASE WHEN baa_status IN ('menunggu_konfirmasi_lokasi', 'diterima_lokasi') THEN baa_dokumen_id ELSE NULL END AS baa_dokumen_id,
                CAST(baa_lokasi_accepted_at AS CHAR) AS baa_lokasi_accepted_at,
                invoice_nomor, CAST(invoice_nilai AS CHAR) AS invoice_nilai, invoice_status, invoice_dokumen_id, faktur_pajak_dokumen_id, pembayaran_status, pembayaran_dokumen_id
         FROM portal_registrations
         WHERE user_id = ? OR (user_id IS NULL AND pelanggan_id IN (
             SELECT pelanggan_id FROM user_pelanggan_access WHERE user_id = ?
         ))
         ORDER BY created_at DESC, id DESC",
    )
    .bind(auth.id)
    .bind(auth.id)
    .fetch_all(&state.database)
    .await
    .map_err(ApiError::database)?;

    Ok(Json(rows))
}

pub async fn respond_offer(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RespondOfferRequest>,
) -> Result<StatusCode, ApiError> {
    let decision = body.keputusan.trim();
    if !matches!(decision, "setuju" | "negosiasi" | "tolak") {
        return Err(ApiError::bad_request("Keputusan penawaran tidak valid."));
    }
    if decision != "setuju" && body.catatan.as_deref().unwrap_or("").trim().is_empty() {
        return Err(ApiError::bad_request(
            "Catatan wajib diisi untuk negosiasi atau penolakan.",
        ));
    }
    let changed = sqlx::query(
        "UPDATE portal_registrations SET
             status = CASE WHEN ? = 'tolak' THEN 'ditolak' ELSE status END,
             rejection_reason = CASE WHEN ? = 'tolak' THEN ? ELSE rejection_reason END,
             penawaran_status = ?, respons_pemohon_catatan = ?, respons_pemohon_at = NOW()
         WHERE kode_registrasi = ? AND pic_email = ? AND status = 'disetujui' AND penawaran_status = 'dikirim'"
    )
    .bind(decision)
    .bind(decision)
    .bind(&body.catatan)
    .bind(decision)
    .bind(&body.catatan)
    .bind(body.kode_registrasi.trim())
    .bind(body.email_pic.trim())
    .execute(&state.database).await.map_err(ApiError::database)?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::conflict(
            "Penawaran belum tersedia atau sudah direspons.",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn create_portal_registration_offer(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(registration_id): Path<u64>,
    Json(body): Json<CreateOfferRequest>,
) -> Result<StatusCode, ApiError> {
    crate::util::require_admin(&auth.role)?;
    if body.penawaran_nomor.trim().is_empty()
        || !body.penawaran_nilai.is_finite()
        || body.penawaran_nilai <= 0.0
    {
        return Err(ApiError::bad_request(
            "Nomor dan nilai penawaran yang valid wajib diisi.",
        ));
    }
    let document_id = body.penawaran_dokumen_id.ok_or_else(|| {
        ApiError::bad_request("Surat penawaran wajib diunggah sebelum penawaran dikirim.")
    })?;

    let pelanggan_id: Option<Option<u64>> = sqlx::query_scalar(
        "SELECT pelanggan_id
         FROM portal_registrations
         WHERE id = ? AND status = 'disetujui' AND survey_status = 'selesai'
           AND (isp_directory_id IS NOT NULL OR isp_user_id IS NOT NULL)",
    )
    .bind(registration_id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?;
    let pelanggan_id = pelanggan_id.flatten().ok_or_else(|| {
        ApiError::conflict(
            "Survei harus selesai dan ISP harus ditetapkan sebelum penawaran dikirim.",
        )
    })?;

    // Kategori baru `Surat Penawaran` dipakai oleh alur portal yang sudah
    // terstruktur. `Dokumen Lain` tetap diterima untuk file lama yang sudah
    // tersimpan sebelum migrasi, tetapi harus tetap milik pelanggan dan
    // belum tertaut ke permohonan lain.
    validate_portal_document_categories(
        &state.database,
        document_id,
        pelanggan_id,
        &["Surat Penawaran", "Dokumen Lain"],
        Some(registration_id),
    )
    .await?;

    let changed = sqlx::query(
        "UPDATE portal_registrations SET penawaran_status = 'dikirim', penawaran_nomor = ?,
            penawaran_nilai = ?, penawaran_catatan = ?, penawaran_dokumen_id = ?, penawaran_dikirim_at = NOW(),
            respons_pemohon_catatan = NULL, respons_pemohon_at = NULL
         WHERE id = ? AND status = 'disetujui' AND survey_status = 'selesai'
           AND (isp_directory_id IS NOT NULL OR isp_user_id IS NOT NULL)"
    )
    .bind(&body.penawaran_nomor).bind(body.penawaran_nilai).bind(&body.penawaran_catatan).bind(document_id).bind(registration_id)
    .execute(&state.database).await.map_err(ApiError::database)?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::conflict(
            "Survei harus selesai dan ISP harus ditetapkan sebelum penawaran dikirim.",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn submit_po(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SubmitPoRequest>,
) -> Result<StatusCode, ApiError> {
    let po_nomor = body.po_nomor.trim();
    let kode = body.kode_registrasi.trim();
    let email = body.email_pic.trim();
    if po_nomor.is_empty() {
        return Err(ApiError::bad_request("Nomor PO wajib diisi."));
    }
    if kode.is_empty() || email.is_empty() {
        return Err(ApiError::bad_request(
            "Kode permohonan dan email PIC wajib diisi.",
        ));
    }

    // Ambil konteks permohonan terlebih dahulu supaya dokumen PO hanya dapat
    // ditautkan ke pelanggan yang memiliki permohonan tersebut.
    let registration: Option<(u64, Option<u64>)> = sqlx::query_as(
        "SELECT id, pelanggan_id
         FROM portal_registrations
         WHERE kode_registrasi = ? AND pic_email = ?
           AND status = 'disetujui' AND penawaran_status = 'setuju'
         LIMIT 1",
    )
    .bind(kode)
    .bind(email)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?;
    let Some((registration_id, pelanggan_id)) = registration else {
        return Err(ApiError::conflict(
            "PO hanya dapat dikirim setelah penawaran disetujui.",
        ));
    };

    let document_ids = [
        body.po_dokumen_id,
        body.po_akte_dokumen_id,
        body.po_izin_dokumen_id,
    ];
    let provided_documents = document_ids.iter().filter(|id| id.is_some()).count();
    if provided_documents != 0 && provided_documents != document_ids.len() {
        return Err(ApiError::bad_request(
            "Surat PO/permintaan, akte pendirian, dan izin pelanggan harus diunggah bersama.",
        ));
    }
    if provided_documents == document_ids.len() {
        let Some(pelanggan_id) = pelanggan_id else {
            return Err(ApiError::conflict(
                "Permohonan belum terhubung ke akun pelanggan.",
            ));
        };
        let [po_document_id, akte_document_id, izin_document_id] = document_ids.map(Option::unwrap);
        if po_document_id == akte_document_id
            || po_document_id == izin_document_id
            || akte_document_id == izin_document_id
        {
            return Err(ApiError::bad_request(
                "Dokumen surat PO, akte pendirian, dan izin pelanggan harus berupa tiga file berbeda.",
            ));
        }
        validate_portal_document_categories(
            &state.database,
            po_document_id,
            pelanggan_id,
            &["Surat PO", "Dokumen Lain"],
            Some(registration_id),
        )
        .await?;
        validate_portal_document_categories(
            &state.database,
            akte_document_id,
            pelanggan_id,
            &["Akte Pendirian", "Dokumen Lain"],
            Some(registration_id),
        )
        .await?;
        validate_portal_document_categories(
            &state.database,
            izin_document_id,
            pelanggan_id,
            &["Izin Pelanggan", "Dokumen Lain"],
            Some(registration_id),
        )
        .await?;
    }

    let changed = sqlx::query(
        "UPDATE portal_registrations
         SET po_nomor = ?, po_catatan = ?,
             po_dokumen_id = COALESCE(?, po_dokumen_id),
             po_akte_dokumen_id = COALESCE(?, po_akte_dokumen_id),
             po_izin_dokumen_id = COALESCE(?, po_izin_dokumen_id),
             po_submitted_at = NOW(),
             legal_status = 'menunggu_verifikasi'
         WHERE id = ? AND status = 'disetujui' AND penawaran_status = 'setuju'",
    )
    .bind(po_nomor)
    .bind(&body.po_catatan)
    .bind(body.po_dokumen_id)
    .bind(body.po_akte_dokumen_id)
    .bind(body.po_izin_dokumen_id)
    .bind(registration_id)
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::conflict(
            "PO hanya dapat dikirim setelah penawaran disetujui.",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn review_portal_registration_legal(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(id): Path<u64>,
    Json(body): Json<ReviewLegalRequest>,
) -> Result<StatusCode, ApiError> {
    crate::util::require_admin(&auth.role)?;
    if !matches!(body.keputusan.as_str(), "terverifikasi" | "perlu_perbaikan") {
        return Err(ApiError::bad_request("Keputusan legal tidak valid."));
    }
    if body.keputusan == "terverifikasi" && body.nota_dinas_dokumen_id.is_none() {
        return Err(ApiError::bad_request(
            "Nota dinas PDF wajib diunggah untuk pengajuan persetujuan KIMA.",
        ));
    }
    if body.keputusan == "perlu_perbaikan"
        && body
            .legal_catatan
            .as_deref()
            .unwrap_or("")
            .trim()
            .is_empty()
    {
        return Err(ApiError::bad_request(
            "Catatan perbaikan wajib diisi agar pelanggan mengetahui dokumen yang harus diperbaiki.",
        ));
    }
    if body.keputusan == "terverifikasi" {
        let documents: Option<(Option<u64>, Option<u64>, Option<u64>, Option<u64>)> =
            sqlx::query_as(
                "SELECT po_dokumen_id, po_akte_dokumen_id, po_izin_dokumen_id, pelanggan_id
             FROM portal_registrations
             WHERE id = ? AND status = 'disetujui' AND legal_status = 'menunggu_verifikasi'
             LIMIT 1",
            )
            .bind(id)
            .fetch_optional(&state.database)
            .await
            .map_err(ApiError::database)?;
        let Some((po_document_id, akte_document_id, izin_document_id, pelanggan_id)) = documents
        else {
            return Err(ApiError::conflict(
                "Dokumen belum siap diverifikasi atau sudah diproses.",
            ));
        };
        if po_document_id.is_none() || akte_document_id.is_none() || izin_document_id.is_none() {
            return Err(ApiError::bad_request(
                "Surat PO/permintaan, akte pendirian, dan izin pelanggan wajib tersedia sebelum Legal memverifikasi.",
            ));
        }
        let Some(pelanggan_id) = pelanggan_id else {
            return Err(ApiError::conflict(
                "Permohonan belum terhubung ke akun pelanggan.",
            ));
        };
        let nota_dinas_dokumen_id = body.nota_dinas_dokumen_id.unwrap();
        let valid_nota_dinas: Option<(u64,)> = sqlx::query_as(
            "SELECT id FROM dokumen
             WHERE id = ? AND pelanggan_id = ? AND kategori = 'Nota Dinas'
               AND (portal_registration_id = ? OR portal_registration_id IS NULL)
               AND (LOWER(nama_file) LIKE '%.pdf' OR LOWER(COALESCE(mime_type, '')) = 'application/pdf')
             LIMIT 1",
        )
        .bind(nota_dinas_dokumen_id)
        .bind(pelanggan_id)
        .bind(id)
        .fetch_optional(&state.database)
        .await
        .map_err(ApiError::database)?;
        if valid_nota_dinas.is_none() {
            return Err(ApiError::bad_request(
                "Nota dinas tidak ditemukan, bukan milik pelanggan pada permohonan ini, atau bukan PDF.",
            ));
        }
    }
    let direksi = if body.keputusan == "terverifikasi" {
        "menunggu"
    } else {
        "belum_diajukan"
    };
    let nota_dinas = if body.keputusan == "terverifikasi" {
        body.nota_dinas.clone()
    } else {
        None
    };
    let nota_dinas_dokumen_id = if body.keputusan == "terverifikasi" {
        body.nota_dinas_dokumen_id
    } else {
        None
    };
    let changed = sqlx::query("UPDATE portal_registrations SET legal_status = ?, legal_catatan = ?, nota_dinas = ?, nota_dinas_dokumen_id = ?, direksi_status = ?, direksi_catatan = CASE WHEN ? = 'perlu_perbaikan' THEN NULL ELSE direksi_catatan END, direksi_decided_at = CASE WHEN ? = 'perlu_perbaikan' THEN NULL ELSE direksi_decided_at END WHERE id = ? AND status = 'disetujui' AND legal_status = 'menunggu_verifikasi'")
        .bind(&body.keputusan).bind(&body.legal_catatan).bind(&nota_dinas).bind(nota_dinas_dokumen_id).bind(direksi).bind(&body.keputusan).bind(&body.keputusan).bind(id)
        .execute(&state.database).await.map_err(ApiError::database)?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::conflict(
            "Dokumen belum siap diverifikasi atau sudah diproses.",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn decide_portal_registration_direksi(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(id): Path<u64>,
    Json(body): Json<DireksiDecisionRequest>,
) -> Result<StatusCode, ApiError> {
    // Persetujuan kerja sama merupakan kewenangan internal KIMA. DBO/Admin
    // dapat menyelesaikan tahap ini tanpa akun Direksi; role Direksi tetap
    // diterima agar pengajuan lama dan konfigurasi yang masih memakai antrean
    // Direksi tetap kompatibel.
    if !matches!(auth.role.as_str(), "admin" | "dbo" | "direksi") {
        return Err(ApiError::forbidden(
            "Keputusan persetujuan hanya dapat diberikan oleh Admin KIMA/DBO atau Direksi.",
        ));
    }
    if !matches!(body.keputusan.as_str(), "setuju" | "tolak") {
        return Err(ApiError::bad_request("Keputusan persetujuan tidak valid."));
    }
    let changed = sqlx::query("UPDATE portal_registrations SET direksi_status = ?, direksi_catatan = ?, direksi_decided_at = NOW(), penawaran_status = CASE WHEN ? = 'tolak' THEN 'negosiasi' ELSE penawaran_status END WHERE id = ? AND status = 'disetujui' AND direksi_status = 'menunggu'")
        .bind(&body.keputusan).bind(&body.catatan).bind(&body.keputusan).bind(id)
        .execute(&state.database).await.map_err(ApiError::database)?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::conflict(
            "Permohonan belum menunggu keputusan persetujuan atau sudah diputuskan.",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn prepare_portal_registration_pks(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(id): Path<u64>,
    Json(body): Json<PreparePksRequest>,
) -> Result<StatusCode, ApiError> {
    crate::util::require_admin(&auth.role)?;
    if body.pks_nomor.trim().is_empty() {
        return Err(ApiError::bad_request("Nomor BAK/PKS wajib diisi."));
    }
    if body.bak_dokumen_id.is_none() && body.pks_dokumen_id.is_none() {
        return Err(ApiError::bad_request(
            "Unggah minimal satu dokumen: BAK atau PKS.",
        ));
    }
    let pelanggan_id: Option<u64> = sqlx::query_scalar(
        "SELECT pelanggan_id FROM portal_registrations
         WHERE id = ? AND status = 'disetujui' AND direksi_status = 'setuju'",
    )
    .bind(id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?
    .flatten();
    let pelanggan_id = pelanggan_id.ok_or_else(|| ApiError::conflict("BAK/PKS hanya dapat disusun setelah persetujuan KIMA dan permohonan terhubung ke pelanggan."))?;
    if let Some(document_id) = body.bak_dokumen_id {
        validate_portal_document(
            &state.database,
            document_id,
            pelanggan_id,
            "BAK-PKS",
            Some(id),
        )
        .await?;
    }
    if let Some(document_id) = body.pks_dokumen_id {
        validate_portal_document(
            &state.database,
            document_id,
            pelanggan_id,
            "BAK-PKS",
            Some(id),
        )
        .await?;
    }
    // BAK/PKS yang diunggah oleh DBO adalah berkas final yang tanda tangannya
    // sudah lengkap di luar sistem. Tidak ada lagi checkbox tanda tangan,
    // unggah ulang pelanggan, atau verifikasi salinan pelanggan di portal.
    let changed = sqlx::query("UPDATE portal_registrations SET pks_nomor = ?, pks_catatan = ?, bak_dokumen_id = ?, pks_dokumen_id = ?, bak_pelanggan_signed_dokumen_id = NULL, pks_pelanggan_signed_dokumen_id = NULL, pks_signed_dokumen_id = NULL, pks_status = 'lengkap', pks_disusun_at = NOW(), pks_lokasi_signed_at = NULL, bak_direktur_bidang_signed_at = NULL, pks_direktur_utama_signed_at = NULL WHERE id = ? AND status = 'disetujui' AND direksi_status = 'setuju'")
        .bind(body.pks_nomor.trim()).bind(&body.pks_catatan).bind(body.bak_dokumen_id).bind(body.pks_dokumen_id).bind(id).execute(&state.database).await.map_err(ApiError::database)?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::conflict(
            "BAK/PKS hanya dapat disusun setelah persetujuan KIMA.",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn update_portal_registration_activation(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(id): Path<u64>,
    Json(body): Json<UpdateActivationRequest>,
) -> Result<StatusCode, ApiError> {
    if auth.role != "teknisi" {
        return Err(ApiError::forbidden(
            "Hanya Teknisi yang dapat memperbarui aktivasi layanan.",
        ));
    }
    if !matches!(
        body.aktivasi_status.as_str(),
        "belum_dijadwalkan" | "terjadwal" | "proses" | "aktif"
    ) {
        return Err(ApiError::bad_request("Status aktivasi tidak valid."));
    }
    if body.aktivasi_status == "terjadwal"
        && body
            .aktivasi_jadwal_at
            .as_deref()
            .unwrap_or("")
            .trim()
            .is_empty()
    {
        return Err(ApiError::bad_request("Jadwal aktivasi wajib diisi."));
    }
    let changed = sqlx::query("UPDATE portal_registrations SET aktivasi_status = ?, aktivasi_jadwal_at = ?, aktivasi_catatan = ?, aktivasi_aktif_at = CASE WHEN ? = 'aktif' THEN NOW() ELSE aktivasi_aktif_at END WHERE id = ? AND status = 'disetujui' AND pks_status = 'lengkap'")
        .bind(&body.aktivasi_status).bind(&body.aktivasi_jadwal_at).bind(&body.aktivasi_catatan).bind(&body.aktivasi_status).bind(id).execute(&state.database).await.map_err(ApiError::database)?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::conflict(
            "Aktivasi hanya dapat dimulai setelah BAK/PKS lengkap.",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn create_portal_registration_baa(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(id): Path<u64>,
    Json(body): Json<CreateBaaRequest>,
) -> Result<StatusCode, ApiError> {
    if auth.role != "teknisi" {
        return Err(ApiError::forbidden(
            "Hanya Teknisi yang dapat membuat BAA setelah aktivasi.",
        ));
    }
    if body.baa_nomor.trim().is_empty() {
        return Err(ApiError::bad_request("Nomor BAA wajib diisi."));
    }
    let document_id = body
        .baa_dokumen_id
        .ok_or_else(|| ApiError::bad_request("Dokumen BAA wajib diunggah."))?;
    let pelanggan_id: Option<u64> = sqlx::query_scalar("SELECT pelanggan_id FROM portal_registrations WHERE id = ? AND status = 'disetujui' AND aktivasi_status = 'aktif'")
        .bind(id).fetch_optional(&state.database).await.map_err(ApiError::database)?.flatten();
    let pelanggan_id = pelanggan_id
        .ok_or_else(|| ApiError::conflict("BAA hanya dapat dibuat setelah layanan aktif."))?;
    validate_portal_document(&state.database, document_id, pelanggan_id, "BAA", Some(id)).await?;
    let changed = sqlx::query("UPDATE portal_registrations SET baa_nomor = ?, baa_catatan = ?, baa_dokumen_id = ?, baa_status = 'menunggu_verifikasi_dbo', baa_dibuat_at = NOW(), baa_dbo_verified_at = NULL, baa_dikirim_at = NULL, baa_lokasi_accepted_at = NULL WHERE id = ? AND status = 'disetujui' AND aktivasi_status = 'aktif'")
        .bind(body.baa_nomor.trim()).bind(&body.baa_catatan).bind(document_id).bind(id).execute(&state.database).await.map_err(ApiError::database)?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::conflict(
            "BAA hanya dapat dibuat setelah layanan aktif.",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

/// DBO/Admin memeriksa BAA yang dibuat Teknisi sebelum meneruskannya kepada
/// pelanggan. Satu tindakan ini mencatat verifikasi dan waktu pengiriman,
/// sehingga invoice belum dapat diterbitkan sebelum pelanggan menerima BAA.
pub async fn verify_portal_registration_baa(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(id): Path<u64>,
    Json(body): Json<VerifyBaaRequest>,
) -> Result<StatusCode, ApiError> {
    crate::util::require_admin(&auth.role)?;
    let note = body
        .catatan
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let changed = sqlx::query(
        "UPDATE portal_registrations
         SET baa_status = 'menunggu_konfirmasi_lokasi',
             baa_catatan = CASE WHEN ? IS NULL THEN baa_catatan ELSE ? END,
             baa_dbo_verified_at = NOW(), baa_dikirim_at = NOW(), baa_lokasi_accepted_at = NULL
         WHERE id = ? AND status = 'disetujui'
           AND aktivasi_status = 'aktif'
           AND baa_status = 'menunggu_verifikasi_dbo'
           AND baa_dokumen_id IS NOT NULL",
    )
    .bind(note)
    .bind(note)
    .bind(id)
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::conflict(
            "BAA belum menunggu verifikasi DBO, dokumen belum tersedia, atau layanan belum aktif.",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn accept_portal_registration_baa(
    State(state): State<Arc<AppState>>,
    Json(body): Json<AcceptBaaRequest>,
) -> Result<StatusCode, ApiError> {
    let changed = sqlx::query("UPDATE portal_registrations SET baa_status = 'diterima_lokasi', baa_lokasi_accepted_at = NOW() WHERE kode_registrasi = ? AND pic_email = ? AND status = 'disetujui' AND baa_status = 'menunggu_konfirmasi_lokasi' AND baa_dokumen_id IS NOT NULL")
        .bind(body.kode_registrasi.trim()).bind(body.email_pic.trim()).execute(&state.database).await.map_err(ApiError::database)?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::conflict(
            "BAA belum tersedia atau sudah dikonfirmasi.",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn create_portal_registration_invoice(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(id): Path<u64>,
    Json(body): Json<CreateInvoiceRequest>,
) -> Result<StatusCode, ApiError> {
    if auth.role != "keuangan" {
        return Err(ApiError::forbidden(
            "Hanya Keuangan yang dapat membuat atau mengirim invoice.",
        ));
    }
    if body.invoice_nomor.trim().is_empty()
        || !body.invoice_nilai.is_finite()
        || body.invoice_nilai <= 0.0
        || body.invoice_jatuh_tempo.trim().is_empty()
    {
        return Err(ApiError::bad_request(
            "Nomor, nilai, dan jatuh tempo invoice wajib valid.",
        ));
    }
    let invoice_id = body
        .invoice_dokumen_id
        .ok_or_else(|| ApiError::bad_request("File invoice wajib diunggah."))?;
    let faktur_id = body
        .faktur_pajak_dokumen_id
        .ok_or_else(|| ApiError::bad_request("File faktur pajak wajib diunggah."))?;
    let pelanggan_id: Option<u64> = sqlx::query_scalar("SELECT pelanggan_id FROM portal_registrations WHERE id = ? AND status = 'disetujui' AND baa_status = 'diterima_lokasi'")
        .bind(id).fetch_optional(&state.database).await.map_err(ApiError::database)?.flatten();
    let pelanggan_id = pelanggan_id.ok_or_else(|| {
        ApiError::conflict("Invoice hanya dapat dibuat setelah BAA diterima lokasi.")
    })?;
    validate_portal_document(
        &state.database,
        invoice_id,
        pelanggan_id,
        "Invoice",
        Some(id),
    )
    .await?;
    validate_portal_document(
        &state.database,
        faktur_id,
        pelanggan_id,
        "Faktur Pajak",
        Some(id),
    )
    .await?;
    let changed = sqlx::query("UPDATE portal_registrations SET invoice_nomor = ?, invoice_nilai = ?, invoice_jatuh_tempo = ?, invoice_dokumen_id = ?, faktur_pajak_dokumen_id = ?, invoice_status = ?, invoice_dikirim_at = CASE WHEN ? THEN NOW() ELSE NULL END, pembayaran_status = 'menunggu_pembayaran' WHERE id = ? AND status = 'disetujui' AND baa_status = 'diterima_lokasi'")
        .bind(body.invoice_nomor.trim()).bind(body.invoice_nilai).bind(body.invoice_jatuh_tempo.trim()).bind(invoice_id).bind(faktur_id).bind(if body.kirim_sekarang { "dikirim" } else { "draft" }).bind(body.kirim_sekarang).bind(id).execute(&state.database).await.map_err(ApiError::database)?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::conflict(
            "Invoice hanya dapat dibuat setelah BAA diterima lokasi.",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn confirm_portal_registration_payment(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ConfirmPaymentRequest>,
) -> Result<StatusCode, ApiError> {
    let document_id = body
        .pembayaran_dokumen_id
        .ok_or_else(|| ApiError::bad_request("Bukti pembayaran wajib diunggah."))?;
    let registration: Option<(u64, u64)> = sqlx::query_as("SELECT id, pelanggan_id FROM portal_registrations WHERE kode_registrasi = ? AND pic_email = ? AND status = 'disetujui' AND invoice_status = 'dikirim' AND pembayaran_status = 'menunggu_pembayaran'")
        .bind(body.kode_registrasi.trim()).bind(body.email_pic.trim()).fetch_optional(&state.database).await.map_err(ApiError::database)?;
    let (registration_id, pelanggan_id) = registration.ok_or_else(|| {
        ApiError::conflict("Invoice belum dikirim atau pembayaran sudah dikonfirmasi.")
    })?;
    validate_portal_document(
        &state.database,
        document_id,
        pelanggan_id,
        "Bukti Pembayaran",
        Some(registration_id),
    )
    .await?;
    let changed = sqlx::query("UPDATE portal_registrations SET pembayaran_status = 'menunggu_verifikasi', pembayaran_catatan = ?, pembayaran_dokumen_id = ? WHERE kode_registrasi = ? AND pic_email = ? AND status = 'disetujui' AND invoice_status = 'dikirim' AND pembayaran_status = 'menunggu_pembayaran'")
        .bind(&body.catatan).bind(document_id).bind(body.kode_registrasi.trim()).bind(body.email_pic.trim()).execute(&state.database).await.map_err(ApiError::database)?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::conflict(
            "Invoice belum dikirim atau pembayaran sudah dikonfirmasi.",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn verify_portal_registration_payment(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(id): Path<u64>,
    Json(body): Json<VerifyPaymentRequest>,
) -> Result<StatusCode, ApiError> {
    if auth.role != "keuangan" {
        return Err(ApiError::forbidden(
            "Hanya Keuangan yang dapat memverifikasi pembayaran.",
        ));
    }
    if !matches!(body.keputusan.as_str(), "terverifikasi" | "ditolak") {
        return Err(ApiError::bad_request(
            "Keputusan verifikasi pembayaran tidak valid.",
        ));
    }
    if body.keputusan == "ditolak" && body.catatan.as_deref().unwrap_or("").trim().is_empty() {
        return Err(ApiError::bad_request(
            "Catatan wajib diisi saat pembayaran ditolak.",
        ));
    }
    let pending: Option<(u64,)> = sqlx::query_as("SELECT id FROM portal_registrations WHERE id = ? AND pembayaran_status = 'menunggu_verifikasi'")
        .bind(id).fetch_optional(&state.database).await.map_err(ApiError::database)?;
    if pending.is_none() {
        return Err(ApiError::conflict(
            "Belum ada pembayaran yang menunggu verifikasi atau pembayaran sudah diproses.",
        ));
    }

    // Verifikasi pembayaran hanya menyelesaikan status SOP. Kontrak/lokasi
    // sengaja tidak dibuat otomatis; Admin KIMA mencatatnya secara manual dari
    // menu Kontrak setelah data komersial dan nomor kontrak dikonfirmasi.
    let changed = sqlx::query("UPDATE portal_registrations SET pembayaran_status = ?, pembayaran_catatan = ? WHERE id = ? AND pembayaran_status = 'menunggu_verifikasi'")
        .bind(&body.keputusan)
        .bind(&body.catatan)
        .bind(id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::conflict(
            "Pembayaran sudah diproses oleh pengguna lain.",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

// ============================================
// PORTAL REGISTRATIONS - ADMIN REVIEW ENDPOINTS
// ============================================

pub async fn list_portal_registrations(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Query(params): Query<ListWorkflowsQuery>,
) -> Result<Json<Vec<PortalRegistrationListItem>>, ApiError> {
    if !matches!(
        auth.role.as_str(),
        "admin" | "dbo" | "direksi" | "keuangan" | "teknisi"
    ) {
        return Err(ApiError::forbidden(
            "Role ini tidak memiliki antrean kerja permohonan.",
        ));
    }

    let status_filter = params.status.as_deref();

    let rows: Vec<PortalRegistrationListItem> = if let Some(status) = status_filter {
        sqlx::query_as(
            "SELECT pr.id, pr.kode_registrasi, pr.pelanggan_id, pr.lokasi_id, pr.nama_perusahaan, pr.email_perusahaan, pr.telepon_perusahaan,
                    pr.pic_nama, pr.pic_email, pr.pic_telepon, pr.pic_jabatan, pr.lokasi_nama, pr.lokasi_alamat,
                    pr.lokasi_kota, pr.lokasi_provinsi, pr.lokasi_kode_pos, pr.core_dedicated, pr.sharing_core,
                    pr.status, pr.rejection_reason, pr.cancellation_reason, CAST(pr.cancelled_at AS CHAR) AS cancelled_at,
                    pr.survey_status, COALESCE(isp_directory.nama_isp, isp.email) AS isp_nama, pr.survey_dokumen_id, pr.penawaran_status, pr.respons_pemohon_catatan, pr.penawaran_dokumen_id, pr.po_nomor, pr.po_dokumen_id, pr.po_akte_dokumen_id, pr.po_izin_dokumen_id,
                    pr.legal_status, pr.nota_dinas_dokumen_id, pr.direksi_status, pr.pks_status, pr.pks_dokumen_id, pr.bak_dokumen_id, pr.bak_pelanggan_signed_dokumen_id, pr.pks_pelanggan_signed_dokumen_id, pr.pks_signed_dokumen_id,
                    CAST(pr.bak_direktur_bidang_signed_at AS CHAR) AS bak_direktur_bidang_signed_at,
                    CAST(pr.pks_direktur_utama_signed_at AS CHAR) AS pks_direktur_utama_signed_at,
                    pr.aktivasi_status, pr.baa_status, pr.baa_dokumen_id,
                    CAST(pr.baa_dbo_verified_at AS CHAR) AS baa_dbo_verified_at,
                    CAST(pr.baa_dikirim_at AS CHAR) AS baa_dikirim_at,
                    pr.invoice_status, pr.invoice_dokumen_id, pr.faktur_pajak_dokumen_id, pr.pembayaran_status, pr.pembayaran_dokumen_id, CAST(pr.created_at AS CHAR) AS created_at
             FROM portal_registrations pr
             LEFT JOIN isp_directory ON isp_directory.id = pr.isp_directory_id
             LEFT JOIN users isp ON isp.id = pr.isp_user_id
             WHERE pr.status = ? ORDER BY pr.created_at DESC"
        )
        .bind(status)
        .fetch_all(&state.database)
        .await
        .map_err(ApiError::database)?
    } else {
        sqlx::query_as(
            "SELECT pr.id, pr.kode_registrasi, pr.pelanggan_id, pr.lokasi_id, pr.nama_perusahaan, pr.email_perusahaan, pr.telepon_perusahaan,
                    pr.pic_nama, pr.pic_email, pr.pic_telepon, pr.pic_jabatan, pr.lokasi_nama, pr.lokasi_alamat,
                    pr.lokasi_kota, pr.lokasi_provinsi, pr.lokasi_kode_pos, pr.core_dedicated, pr.sharing_core,
                    pr.status, pr.rejection_reason, pr.cancellation_reason, CAST(pr.cancelled_at AS CHAR) AS cancelled_at,
                      pr.survey_status, COALESCE(isp_directory.nama_isp, isp.email) AS isp_nama, pr.survey_dokumen_id, pr.penawaran_status, pr.respons_pemohon_catatan, pr.penawaran_dokumen_id, pr.po_nomor, pr.po_dokumen_id, pr.po_akte_dokumen_id, pr.po_izin_dokumen_id,
                      pr.legal_status, pr.nota_dinas_dokumen_id, pr.direksi_status, pr.pks_status, pr.pks_dokumen_id, pr.bak_dokumen_id, pr.bak_pelanggan_signed_dokumen_id, pr.pks_pelanggan_signed_dokumen_id, pr.pks_signed_dokumen_id,
                      CAST(pr.bak_direktur_bidang_signed_at AS CHAR) AS bak_direktur_bidang_signed_at,
                      CAST(pr.pks_direktur_utama_signed_at AS CHAR) AS pks_direktur_utama_signed_at,
                      pr.aktivasi_status, pr.baa_status, pr.baa_dokumen_id,
                      CAST(pr.baa_dbo_verified_at AS CHAR) AS baa_dbo_verified_at,
                      CAST(pr.baa_dikirim_at AS CHAR) AS baa_dikirim_at,
                      pr.invoice_status, pr.invoice_dokumen_id, pr.faktur_pajak_dokumen_id, pr.pembayaran_status, pr.pembayaran_dokumen_id, CAST(pr.created_at AS CHAR) AS created_at
             FROM portal_registrations pr
             LEFT JOIN isp_directory ON isp_directory.id = pr.isp_directory_id
             LEFT JOIN users isp ON isp.id = pr.isp_user_id
             ORDER BY pr.created_at DESC"
        )
        .fetch_all(&state.database)
        .await
        .map_err(ApiError::database)?
    };

    let mut rows = rows;
    if let Some(penawaran_status) = params.penawaran_status.as_deref() {
        rows.retain(|row| row.penawaran_status == penawaran_status);
    }
    rows.retain(|row| match auth.role.as_str() {
        // Admin KIMA/DBO menangani seluruh antrean internal, termasuk
        // keputusan persetujuan kerja sama.
        "admin" | "dbo" => true,
        // Antrean Direksi tetap tersedia sebagai jalur opsional/legacy;
        // Admin KIMA/DBO juga dapat memutuskan langsung dari antrean admin.
        "direksi" => row.direksi_status == "menunggu",
        // Keuangan menerbitkan tagihan setelah BAA diterima serta memverifikasi bukti bayar.
        "keuangan" => {
            row.baa_status == "diterima_lokasi" || row.pembayaran_status == "menunggu_verifikasi"
        }
        // Teknisi hanya bekerja atas permohonan yang sudah diterima KIMA.
        "teknisi" => {
            row.status == "disetujui"
                && (row.survey_status == "belum_dijadwalkan"
                    || row.survey_status == "terjadwal"
                    || (row.pks_status == "lengkap" && row.aktivasi_status != "aktif")
                    || (row.aktivasi_status == "aktif" && row.baa_status == "belum_dibuat"))
        }
        _ => false,
    });

    Ok(Json(rows))
}

pub async fn get_portal_registration(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(registration_id): Path<u64>,
) -> Result<Json<PortalRegistrationDetail>, ApiError> {
    if !matches!(auth.role.as_str(), "admin" | "dbo" | "teknisi") {
        return Err(ApiError::forbidden(
            "Detail permohonan hanya tersedia untuk Admin KIMA/DBO atau Teknisi.",
        ));
    }
    let row = sqlx::query_as(
        "SELECT pr.id, pr.kode_registrasi, pr.pelanggan_id, pr.nama_perusahaan, pr.email_perusahaan,
                pr.telepon_perusahaan, pr.npwp, pr.pic_nama, pr.pic_email,
                pr.pic_telepon, pr.pic_jabatan, pr.lokasi_nama, pr.lokasi_alamat,
                pr.lokasi_kota, pr.lokasi_provinsi, pr.lokasi_kode_pos,
                pr.core_dedicated, pr.sharing_core, pr.status, pr.rejection_reason,
                pr.cancellation_reason, CAST(pr.cancelled_at AS CHAR) AS cancelled_at,
                pr.kebutuhan_terkonfirmasi, pr.survey_status,
                CAST(pr.survey_jadwal_at AS CHAR) AS survey_jadwal_at, pr.survey_hasil, pr.survey_dokumen_id,
                pr.isp_user_id, pr.isp_directory_id,
                COALESCE(isp_directory.nama_isp, isp.email) AS isp_nama, pr.penawaran_status,
                pr.penawaran_nomor, CAST(pr.penawaran_nilai AS CHAR) AS penawaran_nilai,
                pr.penawaran_catatan, pr.penawaran_dokumen_id, pr.respons_pemohon_catatan, pr.po_nomor,
                pr.po_catatan, pr.po_dokumen_id, pr.po_akte_dokumen_id, pr.po_izin_dokumen_id, pr.legal_status, pr.legal_catatan, pr.nota_dinas, pr.nota_dinas_dokumen_id,
                pr.direksi_status, pr.direksi_catatan, pr.pks_nomor, pr.pks_catatan, pr.pks_dokumen_id, pr.bak_dokumen_id, pr.bak_pelanggan_signed_dokumen_id, pr.pks_pelanggan_signed_dokumen_id, pr.pks_signed_dokumen_id,
                pr.pks_status, CAST(pr.pks_lokasi_signed_at AS CHAR) AS pks_lokasi_signed_at,
                CAST(pr.bak_direktur_bidang_signed_at AS CHAR) AS bak_direktur_bidang_signed_at,
                CAST(pr.pks_direktur_utama_signed_at AS CHAR) AS pks_direktur_utama_signed_at,
                pr.aktivasi_status, CAST(pr.aktivasi_jadwal_at AS CHAR) AS aktivasi_jadwal_at,
                pr.aktivasi_catatan, pr.baa_nomor, pr.baa_catatan, pr.baa_dokumen_id, pr.baa_status,
                CAST(pr.baa_dbo_verified_at AS CHAR) AS baa_dbo_verified_at,
                CAST(pr.baa_dikirim_at AS CHAR) AS baa_dikirim_at,
                CAST(pr.baa_lokasi_accepted_at AS CHAR) AS baa_lokasi_accepted_at,
                pr.invoice_nomor, CAST(pr.invoice_nilai AS CHAR) AS invoice_nilai,
                CAST(pr.invoice_jatuh_tempo AS CHAR) AS invoice_jatuh_tempo,
                pr.invoice_status, pr.invoice_dokumen_id, pr.faktur_pajak_dokumen_id, pr.pembayaran_status, pr.pembayaran_dokumen_id, pr.pembayaran_catatan,
                CAST(pr.created_at AS CHAR) AS created_at
         FROM portal_registrations pr
         LEFT JOIN isp_directory ON isp_directory.id = pr.isp_directory_id
         LEFT JOIN users isp ON isp.id = pr.isp_user_id
         WHERE pr.id = ?"
    ).bind(registration_id).fetch_optional(&state.database).await.map_err(ApiError::database)?
        .ok_or_else(|| ApiError::not_found("Permohonan tidak ditemukan"))?;
    Ok(Json(row))
}

pub async fn list_isp_candidates(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
) -> Result<Json<Vec<IspCandidate>>, ApiError> {
    if !matches!(auth.role.as_str(), "admin" | "teknisi") {
        return Err(ApiError::forbidden(
            "Daftar ISP hanya tersedia untuk Admin KIMA atau Teknisi.",
        ));
    }
    let rows = sqlx::query_as(
        "SELECT d.id, d.pelanggan_id, d.nama_isp, d.pic_nama, d.email, d.telepon, d.wilayah, d.user_id
         FROM isp_directory d
         LEFT JOIN users u ON u.id = d.user_id
         WHERE d.status = 'aktif' AND (d.user_id IS NULL OR u.is_active = 1)
         ORDER BY d.nama_isp",
    )
        .fetch_all(&state.database).await.map_err(ApiError::database)?;
    Ok(Json(rows))
}

pub async fn list_isp_directory(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
) -> Result<Json<Vec<IspDirectoryRow>>, ApiError> {
    crate::util::require_admin(&auth.role)?;
    let rows = sqlx::query_as(
        "SELECT d.id, d.pelanggan_id, d.nama_isp, d.pic_nama, d.email, d.telepon, d.wilayah, d.catatan,
                d.status, d.user_id, u.email AS linked_account_email,
                CAST(d.created_at AS CHAR) AS created_at,
                CAST(d.updated_at AS CHAR) AS updated_at
         FROM isp_directory d
         LEFT JOIN users u ON u.id = d.user_id
         ORDER BY CASE WHEN d.status = 'aktif' THEN 0 ELSE 1 END, d.nama_isp",
    )
    .fetch_all(&state.database)
    .await
    .map_err(ApiError::database)?;
    Ok(Json(rows))
}

fn validate_isp_directory_fields(nama_isp: &str, status: &str) -> Result<(), ApiError> {
    if nama_isp.trim().len() < 2 {
        return Err(ApiError::bad_request(
            "Nama ISP wajib diisi minimal 2 karakter.",
        ));
    }
    if !matches!(status, "aktif" | "nonaktif") {
        return Err(ApiError::bad_request(
            "Status ISP harus aktif atau nonaktif.",
        ));
    }
    Ok(())
}

async fn validate_isp_account(database: &MySqlPool, user_id: Option<u64>) -> Result<(), ApiError> {
    let Some(user_id) = user_id else {
        return Ok(());
    };
    let valid: Option<(u64,)> =
        sqlx::query_as("SELECT id FROM users WHERE id = ? AND role = 'isp'")
            .bind(user_id)
            .fetch_optional(database)
            .await
            .map_err(ApiError::database)?;
    if valid.is_none() {
        return Err(ApiError::bad_request(
            "Akun yang ditautkan harus memiliki role ISP.",
        ));
    }
    Ok(())
}

async fn get_isp_directory_row(database: &MySqlPool, id: u64) -> Result<IspDirectoryRow, ApiError> {
    sqlx::query_as(
        "SELECT d.id, d.pelanggan_id, d.nama_isp, d.pic_nama, d.email, d.telepon, d.wilayah, d.catatan,
                d.status, d.user_id, u.email AS linked_account_email,
                CAST(d.created_at AS CHAR) AS created_at,
                CAST(d.updated_at AS CHAR) AS updated_at
         FROM isp_directory d
         LEFT JOIN users u ON u.id = d.user_id
         WHERE d.id = ?",
    )
    .bind(id)
    .fetch_optional(database)
    .await
    .map_err(ApiError::database)?
    .ok_or_else(|| ApiError::not_found("ISP tidak ditemukan."))
}

pub async fn create_isp_directory(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Json(body): Json<CreateIspDirectoryRequest>,
) -> Result<Json<IspDirectoryRow>, ApiError> {
    crate::util::require_admin(&auth.role)?;
    let status = body.status.as_deref().unwrap_or("aktif");
    validate_isp_directory_fields(&body.nama_isp, status)?;
    validate_isp_account(&state.database, body.user_id).await?;
    let nama_isp = body.nama_isp.trim();
    let pic_nama = body
        .pic_nama
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let email = body
        .email
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let telepon = body
        .telepon
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let wilayah = body
        .wilayah
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let catatan = body
        .catatan
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let mut tx = state.database.begin().await.map_err(ApiError::database)?;
    // Menu Direktori ISP dan menu Pelanggan harus menunjuk master yang sama.
    // Jika ISP baru belum memiliki baris master, buat baris Pelanggan (ISP)
    // tanpa membuat akun login apa pun.
    let pelanggan_id: u64 = if let Some((id,)) = sqlx::query_as::<_, (u64,)>(
        "SELECT id FROM pelanggan WHERE LOWER(nama_pelanggan) = LOWER(?)
         LIMIT 1 FOR UPDATE",
    )
    .bind(nama_isp)
    .fetch_optional(&mut *tx)
    .await
    .map_err(ApiError::database)?
    {
        id
    } else {
        let result = sqlx::query(
            "INSERT INTO pelanggan (nama_pelanggan, pic, telepon, email, keterangan)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(nama_isp)
        .bind(pic_nama)
        .bind(telepon)
        .bind(email)
        .bind(catatan)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::database)?;
        result.last_insert_id()
    };

    let result = sqlx::query(
        "INSERT INTO isp_directory
            (pelanggan_id, nama_isp, pic_nama, email, telepon, wilayah, catatan, status, user_id, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(pelanggan_id)
    .bind(nama_isp)
    .bind(pic_nama)
    .bind(email)
    .bind(telepon)
    .bind(wilayah)
    .bind(catatan)
    .bind(status)
    .bind(body.user_id)
    .bind(auth.id)
    .execute(&mut *tx)
    .await
    .map_err(|error| {
        if matches!(error, sqlx::Error::Database(_)) {
            ApiError::conflict("Nama ISP atau akun ISP tersebut sudah terdaftar.")
        } else {
            ApiError::database(error)
        }
    })?;
    let directory_id = result.last_insert_id();
    tx.commit().await.map_err(ApiError::database)?;
    get_isp_directory_row(&state.database, directory_id)
        .await
        .map(Json)
}

pub async fn update_isp_directory(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(id): Path<u64>,
    Json(body): Json<UpdateIspDirectoryRequest>,
) -> Result<Json<IspDirectoryRow>, ApiError> {
    crate::util::require_admin(&auth.role)?;
    let current = get_isp_directory_row(&state.database, id).await?;
    let nama_isp = body.nama_isp.as_deref().unwrap_or(&current.nama_isp);
    let status = body.status.as_deref().unwrap_or(&current.status);
    validate_isp_directory_fields(nama_isp, status)?;
    let user_id = body.user_id.or(current.user_id);
    validate_isp_account(&state.database, user_id).await?;
    sqlx::query(
        "UPDATE isp_directory SET nama_isp = ?, pic_nama = ?, email = ?, telepon = ?,
            wilayah = ?, catatan = ?, status = ?, user_id = ? WHERE id = ?",
    )
    .bind(nama_isp.trim())
    .bind(body.pic_nama.as_deref().or(current.pic_nama.as_deref()))
    .bind(body.email.as_deref().or(current.email.as_deref()))
    .bind(body.telepon.as_deref().or(current.telepon.as_deref()))
    .bind(body.wilayah.as_deref().or(current.wilayah.as_deref()))
    .bind(body.catatan.as_deref().or(current.catatan.as_deref()))
    .bind(status)
    .bind(user_id)
    .bind(id)
    .execute(&state.database)
    .await
    .map_err(|error| {
        if matches!(error, sqlx::Error::Database(_)) {
            ApiError::conflict("Nama ISP atau akun ISP tersebut sudah terdaftar.")
        } else {
            ApiError::database(error)
        }
    })?;
    if let Some(pelanggan_id) = current.pelanggan_id {
        sqlx::query(
            "UPDATE pelanggan
             SET nama_pelanggan = ?, pic = ?, email = ?, telepon = ?, keterangan = ?
             WHERE id = ?",
        )
        .bind(nama_isp.trim())
        .bind(body.pic_nama.as_deref().or(current.pic_nama.as_deref()))
        .bind(body.email.as_deref().or(current.email.as_deref()))
        .bind(body.telepon.as_deref().or(current.telepon.as_deref()))
        .bind(body.catatan.as_deref().or(current.catatan.as_deref()))
        .bind(pelanggan_id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;
    }
    get_isp_directory_row(&state.database, id).await.map(Json)
}

pub async fn update_portal_registration_survey(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(registration_id): Path<u64>,
    Json(body): Json<UpdateSurveyRequest>,
) -> Result<StatusCode, ApiError> {
    if !matches!(
        body.survey_status.as_str(),
        "belum_dijadwalkan" | "terjadwal" | "selesai"
    ) {
        return Err(ApiError::bad_request("Status survei tidak valid."));
    }
    if body.survey_status == "terjadwal"
        && body
            .survey_jadwal_at
            .as_deref()
            .unwrap_or("")
            .trim()
            .is_empty()
    {
        return Err(ApiError::bad_request("Jadwal survei wajib diisi."));
    }
    if auth.role != "teknisi" {
        return Err(ApiError::forbidden(
            "Tahap penjadwalan dan survei jalur hanya dapat diproses Teknisi.",
        ));
    }
    let current: Option<(String,)> = sqlx::query_as(
        "SELECT survey_status FROM portal_registrations WHERE id = ? AND status = 'disetujui'",
    )
    .bind(registration_id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?;
    let Some((current_status,)) = current else {
        return Err(ApiError::not_found(
            "Permohonan belum diterima untuk survei atau tidak ditemukan.",
        ));
    };

    if body.survey_status == "selesai" {
        if current_status != "terjadwal" {
            return Err(ApiError::conflict(
                "Survei harus dijadwalkan Teknisi sebelum hasil survei dapat disimpan.",
            ));
        }
        if body.survey_hasil.as_deref().unwrap_or("").trim().is_empty()
            || body.isp_id.or(body.isp_user_id).is_none()
            || body.survey_dokumen_id.is_none()
        {
            return Err(ApiError::bad_request(
                "Hasil survei, dokumentasi survei, dan ISP terpilih wajib diisi setelah survei selesai.",
            ));
        }
    } else if body.survey_status == "terjadwal" {
        if !matches!(current_status.as_str(), "belum_dijadwalkan" | "terjadwal") {
            return Err(ApiError::conflict(
                "Jadwal survei hanya dapat ditentukan sebelum survei selesai.",
            ));
        }
    } else {
        return Err(ApiError::bad_request(
            "Teknisi harus memilih jadwal survei atau menandai survei selesai.",
        ));
    }
    if body.survey_status != "selesai" && (body.isp_id.is_some() || body.isp_user_id.is_some()) {
        return Err(ApiError::bad_request(
            "ISP hanya dapat ditetapkan setelah survei selesai.",
        ));
    }
    if body.survey_status == "selesai" {
        validate_portal_document_for_registration(
            &state.database,
            body.survey_dokumen_id.unwrap(),
            "Dokumen Survey",
            registration_id,
        )
        .await?;
    }
    // Client lama mengirim `isp_user_id`; client baru mengirim ID master ISP.
    // Keduanya dinormalisasi ke direktori ISP agar ISP tanpa akun tetap valid.
    let selected_directory_id = if let Some(directory_id) = body.isp_id {
        let valid: Option<(u64, Option<u64>)> = sqlx::query_as(
            "SELECT d.id, d.user_id FROM isp_directory d
             LEFT JOIN users u ON u.id = d.user_id
             WHERE d.id = ? AND d.status = 'aktif' AND (d.user_id IS NULL OR u.is_active = 1)",
        )
        .bind(directory_id)
        .fetch_optional(&state.database)
        .await
        .map_err(ApiError::database)?;
        valid.map(|(id, user_id)| (id, user_id))
    } else if let Some(user_id) = body.isp_user_id {
        let valid: Option<(u64, Option<u64>)> = sqlx::query_as(
            "SELECT d.id, d.user_id FROM isp_directory d
             JOIN users u ON u.id = d.user_id
             WHERE d.user_id = ? AND d.status = 'aktif' AND u.is_active = 1",
        )
        .bind(user_id)
        .fetch_optional(&state.database)
        .await
        .map_err(ApiError::database)?;
        valid.map(|(id, user_id)| (id, user_id))
    } else {
        None
    };
    if (body.isp_id.is_some() || body.isp_user_id.is_some()) && selected_directory_id.is_none() {
        return Err(ApiError::bad_request(
            "ISP yang dipilih tidak aktif atau tidak terdaftar di direktori ISP KIMA.",
        ));
    }
    let (directory_id, linked_user_id) = selected_directory_id
        .map(|(directory_id, user_id)| (Some(directory_id), user_id))
        .unwrap_or((None, None));
    let isp_pelanggan_id: Option<u64> = if let Some(directory_id) = directory_id {
        sqlx::query_scalar(
            "SELECT pelanggan_id FROM isp_directory WHERE id = ? AND status = 'aktif' LIMIT 1",
        )
        .bind(directory_id)
        .fetch_optional(&state.database)
        .await
        .map_err(ApiError::database)?
        .flatten()
    } else {
        None
    };
    let affected = sqlx::query(
        "UPDATE portal_registrations SET pelanggan_id = COALESCE(?, pelanggan_id), kebutuhan_terkonfirmasi = COALESCE(?, kebutuhan_terkonfirmasi), survey_status = ?,
            survey_jadwal_at = ?, survey_hasil = ?, survey_dokumen_id = COALESCE(?, survey_dokumen_id), survey_completed_at = CASE WHEN ? = 'selesai' THEN NOW() ELSE NULL END,
            isp_directory_id = COALESCE(?, isp_directory_id),
            isp_user_id = CASE WHEN ? IS NULL THEN isp_user_id ELSE ? END,
            isp_ditetapkan_at = CASE WHEN ? IS NULL THEN isp_ditetapkan_at ELSE NOW() END
         WHERE id = ? AND status = 'disetujui'"
    )
    .bind(isp_pelanggan_id).bind(body.kebutuhan_terkonfirmasi.as_deref()).bind(&body.survey_status).bind(&body.survey_jadwal_at)
    .bind(&body.survey_hasil).bind(body.survey_dokumen_id).bind(&body.survey_status).bind(directory_id).bind(directory_id).bind(linked_user_id).bind(directory_id)
    .bind(registration_id).execute(&state.database).await.map_err(ApiError::database)?;
    if affected.rows_affected() == 0 {
        return Err(ApiError::conflict(
            "Permohonan belum diterima untuk survei atau tidak ditemukan.",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn approve_portal_registration(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(registration_id): Path<u64>,
) -> Result<Json<ApproveRegistrationResponse>, ApiError> {
    crate::util::require_admin(&auth.role)?;

    let (kode_registrasi, status, pic_email): (String, String, String) = sqlx::query_as(
        "SELECT kode_registrasi, status, pic_email
         FROM portal_registrations WHERE id = ?",
    )
    .bind(registration_id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?
    .ok_or_else(|| ApiError::not_found("Pendaftaran tidak ditemukan"))?;

    if status != "menunggu" {
        return Err(ApiError::conflict(
            "Pendaftaran ini sudah diproses sebelumnya",
        ));
    }

    let mut tx = state.database.begin().await.map_err(ApiError::database)?;
    let existing_user: Option<(u64, String, bool)> =
        sqlx::query_as("SELECT id, role, is_active FROM users WHERE email = ? LIMIT 1")
            .bind(&pic_email)
            .fetch_optional(&mut *tx)
            .await
            .map_err(ApiError::database)?;
    let user_id = if let Some((user_id, role, is_active)) = existing_user {
        if role != "pelanggan" {
            return Err(ApiError::conflict(
                "Email PIC sudah digunakan oleh akun dengan role lain.",
            ));
        }
        if !is_active {
            return Err(ApiError::conflict(
                "Akun Lokasi/Tenant untuk PIC sedang nonaktif.",
            ));
        }
        user_id
    } else {
        return Err(ApiError::conflict(
            "Buat akun Lokasi/Tenant untuk email PIC terlebih dahulu melalui menu penerimaan permohonan.",
        ));
    };
    // `pelanggan_id` adalah master ISP menurut terminologi KIMA. Data tenant
    // tidak boleh dibuat sebagai pelanggan baru pada saat approval; relasi
    // pengaju cukup disimpan melalui akun dan portal registration ini. ISP
    // baru ditautkan setelah Teknisi menyelesaikan survei jalur.
    sqlx::query("UPDATE portal_registrations SET status = 'disetujui', pelanggan_id = NULL, user_id = ?, processed_by_user_id = ?, processed_at = NOW() WHERE id = ? AND status = 'menunggu'")
        .bind(user_id).bind(auth.id).bind(registration_id).execute(&mut *tx).await.map_err(ApiError::database)?;
    tx.commit().await.map_err(ApiError::database)?;

    tracing::info!("Service request accepted for survey: {}", kode_registrasi);

    Ok(Json(ApproveRegistrationResponse {
        success: true,
        kode_registrasi,
        message: "Permohonan diterima untuk tahap konfirmasi kebutuhan dan survei jalur. Akun Lokasi/Tenant telah ditautkan; ISP akan ditetapkan KIMA setelah survei jalur.".to_string(),
        account_created: false,
        temporary_password: None,
    }))
}

pub async fn reject_portal_registration(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(registration_id): Path<u64>,
    Json(body): Json<RejectRegistrationRequest>,
) -> Result<Json<PortalRegisterResponse>, ApiError> {
    crate::util::require_admin(&auth.role)?;

    if body.rejection_reason.trim().is_empty() {
        return Err(ApiError::bad_request("Alasan penolakan wajib diisi"));
    }

    let current_status: Option<(String,)> =
        sqlx::query_as("SELECT status FROM portal_registrations WHERE id = ?")
            .bind(registration_id)
            .fetch_optional(&state.database)
            .await
            .map_err(ApiError::database)?;

    let Some((status,)) = current_status else {
        return Err(ApiError::not_found("Pendaftaran tidak ditemukan"));
    };

    if status != "menunggu" {
        return Err(ApiError::conflict(
            "Pendaftaran ini sudah diproses sebelumnya",
        ));
    }

    sqlx::query(
        "UPDATE portal_registrations SET
            status = 'ditolak', rejection_reason = ?,
            processed_by_user_id = ?, processed_at = NOW()
         WHERE id = ?",
    )
    .bind(&body.rejection_reason)
    .bind(auth.id)
    .bind(registration_id)
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;

    Ok(Json(PortalRegisterResponse {
        success: true,
        kode_registrasi: String::new(),
        message: "Pendaftaran ditolak.".to_string(),
    }))
}

// ============================================
// AJUKAN LOKASI TAMBAHAN (Pelanggan existing, sudah login)
// ============================================
//
// Berbeda dengan portal_register: pelanggan sudah tervalidasi (sudah punya akun),
// jadi tidak melalui portal_registrations/status menunggu. Langsung buat lokasi +
// sop_workflows baru untuk pelanggan yang sama, sesuai rencana dokumen bagian 2.4/4.3
// (pelanggan lama hanya mengisi Bagian B, data perusahaan sudah tersimpan).
pub async fn submit_service_change_request(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Json(body): Json<SubmitServiceChangeRequest>,
) -> Result<Json<ServiceChangeRequestResponse>, ApiError> {
    if auth.role != "pelanggan" {
        return Err(ApiError::forbidden(
            "Hanya Pelanggan existing yang dapat mengajukan SOP kedua.",
        ));
    }
    let jenis = body.jenis_permintaan.trim();
    if !matches!(
        jenis,
        "tambah_sharing_core" | "tambah_dedicated_core" | "lokasi_baru"
    ) {
        return Err(ApiError::bad_request(
            "Jenis permintaan SOP kedua tidak valid.",
        ));
    }
    if body.kontrak_induk_id == 0 {
        return Err(ApiError::bad_request("Kontrak induk wajib dipilih."));
    }
    if body.lokasi_nama.trim().is_empty() || body.lokasi_alamat.trim().is_empty() {
        return Err(ApiError::bad_request("Nama dan alamat lokasi wajib diisi."));
    }
    if body.lokasi_kota.trim().is_empty() || body.lokasi_provinsi.trim().is_empty() {
        return Err(ApiError::bad_request(
            "Kota dan provinsi lokasi wajib diisi.",
        ));
    }
    if body.core_dedicated < 0 {
        return Err(ApiError::bad_request(
            "Jumlah dedicated core tidak boleh kurang dari 0.",
        ));
    }
    let sharing = body
        .sharing_core
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    match jenis {
        "tambah_sharing_core" if sharing.is_none() || body.core_dedicated != 0 => {
            return Err(ApiError::bad_request(
                "Permintaan tambah sharing core harus memiliki sharing core dan dedicated core 0.",
            ));
        }
        "tambah_dedicated_core" if body.core_dedicated <= 0 || sharing.is_some() => {
            return Err(ApiError::bad_request(
                "Permintaan tambah dedicated core harus memiliki jumlah core dan tanpa sharing core.",
            ));
        }
        "lokasi_baru" if body.lokasi_id.is_some() => {
            return Err(ApiError::bad_request(
                "Lokasi baru tidak boleh menunjuk lokasi layanan existing.",
            ));
        }
        kind if kind != "lokasi_baru" && body.lokasi_id.is_none() => {
            return Err(ApiError::bad_request(
                "Lokasi layanan existing wajib dipilih untuk penambahan core.",
            ));
        }
        _ => {}
    }

    let pelanggan_id: (u64,) = sqlx::query_as(
        "SELECT l.pelanggan_id
         FROM lokasi l
         WHERE l.id = ?
           AND EXISTS (SELECT 1 FROM portal_registrations pr WHERE pr.user_id = ? AND pr.lokasi_id = l.id)
         LIMIT 1",
    )
    .bind(body.kontrak_induk_id)
    .bind(auth.id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?
    .or(
        sqlx::query_as(
            "SELECT pelanggan_id FROM user_pelanggan_access WHERE user_id = ? LIMIT 1",
        )
        .bind(auth.id)
        .fetch_optional(&state.database)
        .await
        .map_err(ApiError::database)?,
    )
    .ok_or_else(|| ApiError::forbidden("Akun Lokasi/Tenant belum terhubung ke lokasi layanan."))?;

    let kontrak: Option<(u64, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT id, core, sharing_core FROM lokasi WHERE id = ? AND pelanggan_id = ?",
    )
    .bind(body.kontrak_induk_id)
    .bind(pelanggan_id.0)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?;
    let Some((_, core_sebelum, sharing_sebelum)) = kontrak else {
        return Err(ApiError::not_found(
            "Kontrak induk tidak ditemukan dalam akun pelanggan.",
        ));
    };

    if let Some(lokasi_id) = body.lokasi_id {
        let exists: Option<(u64,)> = sqlx::query_as(
            "SELECT l.id FROM lokasi l
             WHERE l.id = ? AND l.pelanggan_id = ?
               AND EXISTS (SELECT 1 FROM portal_registrations pr WHERE pr.user_id = ? AND pr.lokasi_id = l.id)",
        )
        .bind(lokasi_id)
        .bind(pelanggan_id.0)
        .bind(auth.id)
        .fetch_optional(&state.database)
        .await
        .map_err(ApiError::database)?;
        if exists.is_none() {
            return Err(ApiError::not_found(
                "Lokasi layanan tidak ditemukan dalam akun pelanggan.",
            ));
        }
    }

    let kode_perubahan = generate_change_request_code(&state.database).await?;
    let id = sqlx::query(
        "INSERT INTO sop2_service_change_requests
         (kode_perubahan, pelanggan_id, kontrak_induk_id, lokasi_id, jenis_permintaan,
          lokasi_nama, lokasi_alamat, lokasi_kota, lokasi_provinsi, lokasi_kode_pos,
          core_dedicated, sharing_core, core_sebelum, sharing_core_sebelum,
          catatan_pelanggan, current_step, status, requested_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, 'diproses', ?)",
    )
    .bind(&kode_perubahan)
    .bind(pelanggan_id.0)
    .bind(body.kontrak_induk_id)
    .bind(body.lokasi_id)
    .bind(jenis)
    .bind(body.lokasi_nama.trim())
    .bind(body.lokasi_alamat.trim())
    .bind(body.lokasi_kota.trim())
    .bind(body.lokasi_provinsi.trim())
    .bind(
        body.lokasi_kode_pos
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty()),
    )
    .bind(body.core_dedicated)
    .bind(sharing)
    .bind(core_sebelum)
    .bind(sharing_sebelum)
    .bind(
        body.catatan_pelanggan
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty()),
    )
    .bind(auth.id)
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?
    .last_insert_id();

    sqlx::query("INSERT INTO sop2_step_history (request_id, step_nomor, actor_role, actor_user_id, action_type, detail_json) VALUES (?, 1, 'pelanggan', ?, 'ajukan_perubahan', ?)")
        .bind(id)
        .bind(auth.id)
        .bind(serde_json::to_string(&serde_json::json!({
            "jenis_permintaan": jenis,
            "lokasi_nama": body.lokasi_nama.trim()
        })).map_err(|_| ApiError::internal("Detail riwayat tidak dapat disimpan."))?)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;
    notify_sop2(
        &state.database,
        id,
        "admin",
        None,
        "Permohonan SOP2 baru",
        &format!(
            "Permohonan {} dari pelanggan menunggu verifikasi Admin.",
            kode_perubahan
        ),
    )
    .await?;

    let row = sqlx::query_as::<_, ServiceChangeRequestResponse>(
        "SELECT id, kode_perubahan, pelanggan_id, kontrak_induk_id, lokasi_id,
                jenis_permintaan, lokasi_nama, core_dedicated, sharing_core,
                current_step, total_steps, status, CAST(created_at AS CHAR) AS created_at
         FROM sop2_service_change_requests WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&state.database)
    .await
    .map_err(ApiError::database)?;
    Ok(Json(row))
}

pub async fn list_sop2_requests(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
) -> Result<Json<Vec<ServiceChangeWorkItem>>, ApiError> {
    if auth.role == "isp" {
        return Err(ApiError::forbidden(
            "Role ISP tidak memiliki akses ke SOP kedua.",
        ));
    }
    let mut rows: Vec<ServiceChangeWorkItem> = if auth.role == "pelanggan" {
        sqlx::query_as(
            "SELECT r.id, r.kode_perubahan, r.pelanggan_id, p.nama_pelanggan,
                    r.kontrak_induk_id, r.lokasi_id, r.lokasi_nama, r.jenis_permintaan,
                    r.core_dedicated, r.sharing_core, r.current_step, r.total_steps, r.status, r.catatan_pelanggan,
                    CAST(r.detail_json AS CHAR) AS detail_json, r.last_action,
                    CAST(r.created_at AS CHAR) AS created_at, CAST(r.updated_at AS CHAR) AS updated_at
             FROM sop2_service_change_requests r
             JOIN pelanggan p ON p.id = r.pelanggan_id
             WHERE r.requested_by_user_id = ?
                OR EXISTS (SELECT 1 FROM portal_registrations pr WHERE pr.user_id = ? AND (pr.lokasi_id = r.lokasi_id OR pr.lokasi_id = r.kontrak_induk_id))
             ORDER BY r.created_at DESC",
        )
        .bind(auth.id)
        .bind(auth.id)
        .fetch_all(&state.database)
        .await
        .map_err(ApiError::database)?
    } else if matches!(auth.role.as_str(), "admin" | "teknisi" | "keuangan") {
        sqlx::query_as(
            "SELECT r.id, r.kode_perubahan, r.pelanggan_id, p.nama_pelanggan,
                    r.kontrak_induk_id, r.lokasi_id, r.lokasi_nama, r.jenis_permintaan,
                    r.core_dedicated, r.sharing_core, r.current_step, r.total_steps, r.status, r.catatan_pelanggan,
                    CAST(r.detail_json AS CHAR) AS detail_json, r.last_action,
                    CAST(r.created_at AS CHAR) AS created_at, CAST(r.updated_at AS CHAR) AS updated_at
             FROM sop2_service_change_requests r
             JOIN pelanggan p ON p.id = r.pelanggan_id
             ORDER BY r.created_at DESC",
        )
        .fetch_all(&state.database)
        .await
        .map_err(ApiError::database)?
    } else {
        return Err(ApiError::forbidden(
            "Role Anda tidak memiliki akses ke SOP kedua.",
        ));
    };

    rows.retain(|row| {
        if row.status == "selesai" || row.status == "ditolak" {
            return auth.role == "pelanggan";
        }
        match auth.role.as_str() {
            "admin" => matches!(row.current_step, 1 | 2 | 4 | 6 | 7),
            "teknisi" => matches!(row.current_step, 3 | 8 | 9),
            "keuangan" => matches!(row.current_step, 10 | 11),
            "pelanggan" => true,
            _ => false,
        }
    });
    Ok(Json(rows))
}

pub async fn list_sop2_history(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(request_id): Path<u64>,
) -> Result<Json<Vec<ServiceChangeHistory>>, ApiError> {
    let ownership: Option<(u64,)> = sqlx::query_as(
        "SELECT r.pelanggan_id FROM sop2_service_change_requests r WHERE r.id = ?
         AND (r.requested_by_user_id = ? OR EXISTS (
             SELECT 1 FROM portal_registrations pr
             WHERE pr.user_id = ? AND (pr.lokasi_id = r.lokasi_id OR pr.lokasi_id = r.kontrak_induk_id)
         ))",
    )
    .bind(request_id)
    .bind(auth.id)
    .bind(auth.id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?;
    let pelanggan_id: (u64,) = if auth.role == "pelanggan" {
        ownership.ok_or_else(|| ApiError::not_found("Permohonan SOP2 tidak ditemukan."))?
    } else {
        sqlx::query_as("SELECT pelanggan_id FROM sop2_service_change_requests WHERE id = ?")
            .bind(request_id)
            .fetch_optional(&state.database)
            .await
            .map_err(ApiError::database)?
            .ok_or_else(|| ApiError::not_found("Permohonan SOP2 tidak ditemukan."))?
    };
    if auth.role == "isp" {
        return Err(ApiError::forbidden(
            "Role ISP tidak memiliki akses ke riwayat SOP2.",
        ));
    }
    if auth.role == "pelanggan" && ownership.is_none() {
        assert_pelanggan_access(&state.database, auth.id, &auth.role, pelanggan_id.0).await?;
    }
    if !matches!(
        auth.role.as_str(),
        "pelanggan" | "admin" | "teknisi" | "keuangan" | "direksi"
    ) {
        return Err(ApiError::forbidden(
            "Role Anda tidak memiliki akses ke riwayat SOP2.",
        ));
    }
    let rows = sqlx::query_as("SELECT id, request_id, step_nomor, actor_role, actor_user_id, action_type, CAST(detail_json AS CHAR) AS detail_json, CAST(created_at AS CHAR) AS created_at FROM sop2_step_history WHERE request_id = ? ORDER BY created_at ASC, id ASC")
        .bind(request_id).fetch_all(&state.database).await.map_err(ApiError::database)?;
    Ok(Json(rows))
}

async fn notify_sop2(
    pool: &MySqlPool,
    request_id: u64,
    recipient_role: &str,
    recipient_user_id: Option<u64>,
    title: &str,
    message: &str,
) -> Result<(), ApiError> {
    sqlx::query("INSERT INTO sop2_notifications (request_id, recipient_role, recipient_user_id, title, message) VALUES (?, ?, ?, ?, ?)")
        .bind(request_id).bind(recipient_role).bind(recipient_user_id).bind(title).bind(message)
        .execute(pool).await.map_err(ApiError::database)?;
    Ok(())
}

pub async fn list_sop2_notifications(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
) -> Result<Json<Vec<ServiceChangeNotification>>, ApiError> {
    if auth.role == "isp" {
        return Err(ApiError::forbidden(
            "Role ISP tidak memiliki akses ke notifikasi SOP2.",
        ));
    }
    let rows = sqlx::query_as("SELECT n.id, n.request_id, r.kode_perubahan, n.recipient_role, n.title, n.message, CAST(n.read_at AS CHAR) AS read_at, CAST(n.created_at AS CHAR) AS created_at FROM sop2_notifications n JOIN sop2_service_change_requests r ON r.id = n.request_id WHERE (n.recipient_user_id = ? OR (n.recipient_user_id IS NULL AND n.recipient_role = ?)) ORDER BY n.created_at DESC LIMIT 50")
        .bind(auth.id).bind(&auth.role).fetch_all(&state.database).await.map_err(ApiError::database)?;
    Ok(Json(rows))
}

pub async fn mark_sop2_notification(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(notification_id): Path<u64>,
    Json(body): Json<MarkNotificationRead>,
) -> Result<StatusCode, ApiError> {
    if auth.role == "isp" {
        return Err(ApiError::forbidden(
            "Role ISP tidak memiliki akses ke notifikasi SOP2.",
        ));
    }
    let read = body.read.unwrap_or(true);
    let changed = sqlx::query("UPDATE sop2_notifications SET read_at = CASE WHEN ? THEN NOW() ELSE NULL END WHERE id = ? AND (recipient_user_id = ? OR (recipient_user_id IS NULL AND recipient_role = ?))")
        .bind(read).bind(notification_id).bind(auth.id).bind(&auth.role).execute(&state.database).await.map_err(ApiError::database)?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::not_found("Notifikasi tidak ditemukan."));
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Daftar notifikasi yang relevan untuk Admin KIMA. SOP1 menggunakan tabel
/// notifikasi khusus karena pendaftaran belum memiliki workflow SOP2, sementara
/// notifikasi SOP2 yang ditujukan ke Admin tetap ditampilkan pada panel yang
/// sama.
pub async fn list_admin_notifications(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
) -> Result<Json<Vec<AdminNotification>>, ApiError> {
    crate::util::require_admin(&auth.role)?;

    let mut rows: Vec<AdminNotification> = sqlx::query_as(
        "SELECT n.id, 'sop2' AS source, n.request_id AS reference_id,
                r.kode_perubahan AS kode, n.title, n.message,
                CAST(n.read_at AS CHAR) AS read_at,
                CAST(n.created_at AS CHAR) AS created_at
         FROM sop2_notifications n
         JOIN sop2_service_change_requests r ON r.id = n.request_id
         WHERE n.recipient_role = 'admin'
           AND (n.recipient_user_id = ? OR n.recipient_user_id IS NULL)
         ORDER BY n.created_at DESC
         LIMIT 50",
    )
    .bind(auth.id)
    .fetch_all(&state.database)
    .await
    .map_err(ApiError::database)?;

    let mut sop1_rows: Vec<AdminNotification> = sqlx::query_as(
        "SELECT n.id, n.source, n.reference_id,
                pr.kode_registrasi AS kode, n.title, n.message,
                CAST(n.read_at AS CHAR) AS read_at,
                CAST(n.created_at AS CHAR) AS created_at
         FROM admin_notifications n
         JOIN portal_registrations pr ON pr.id = n.reference_id
         WHERE n.source = 'sop1'
         ORDER BY n.created_at DESC
         LIMIT 50",
    )
    .fetch_all(&state.database)
    .await
    .map_err(ApiError::database)?;

    rows.append(&mut sop1_rows);
    rows.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    rows.truncate(50);
    Ok(Json(rows))
}

/// Tandai notifikasi Admin sebagai sudah dibaca atau belum dibaca. Parameter
/// source mencegah benturan id antara tabel notifikasi SOP1 dan SOP2.
pub async fn mark_admin_notification(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path((source, notification_id)): Path<(String, u64)>,
    Json(body): Json<MarkNotificationRead>,
) -> Result<StatusCode, ApiError> {
    crate::util::require_admin(&auth.role)?;
    let read = body.read.unwrap_or(true);

    let changed = match source.to_ascii_lowercase().as_str() {
        "sop2" => sqlx::query(
            "UPDATE sop2_notifications
                 SET read_at = CASE WHEN ? THEN NOW() ELSE NULL END
                 WHERE id = ? AND recipient_role = 'admin'
                   AND (recipient_user_id = ? OR recipient_user_id IS NULL)",
        )
        .bind(read)
        .bind(notification_id)
        .bind(auth.id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?,
        "sop1" => sqlx::query(
            "UPDATE admin_notifications
                 SET read_at = CASE WHEN ? THEN NOW() ELSE NULL END
                 WHERE id = ? AND source = 'sop1'",
        )
        .bind(read)
        .bind(notification_id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?,
        _ => return Err(ApiError::bad_request("Sumber notifikasi tidak valid.")),
    };

    if changed.rows_affected() == 0 {
        return Err(ApiError::not_found("Notifikasi tidak ditemukan."));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn complete_sop2_step(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(request_id): Path<u64>,
    Json(body): Json<CompleteServiceChangeStep>,
) -> Result<Json<ServiceChangeWorkItem>, ApiError> {
    let row: ServiceChangeWorkItem = sqlx::query_as(
        "SELECT r.id, r.kode_perubahan, r.pelanggan_id, p.nama_pelanggan,
                r.kontrak_induk_id, r.lokasi_id, r.lokasi_nama, r.jenis_permintaan,
                r.core_dedicated, r.sharing_core, r.current_step, r.total_steps, r.status, r.catatan_pelanggan,
                CAST(r.detail_json AS CHAR) AS detail_json, r.last_action,
                CAST(r.created_at AS CHAR) AS created_at, CAST(r.updated_at AS CHAR) AS updated_at
         FROM sop2_service_change_requests r JOIN pelanggan p ON p.id = r.pelanggan_id WHERE r.id = ?",
    )
    .bind(request_id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?
    .ok_or_else(|| ApiError::not_found("Permohonan SOP kedua tidak ditemukan."))?;
    if auth.role == "isp" {
        return Err(ApiError::forbidden(
            "Role ISP tidak dapat memproses SOP kedua.",
        ));
    }
    if auth.role == "pelanggan" {
        let owned: Option<(u64,)> = sqlx::query_as(
            "SELECT id FROM sop2_service_change_requests r
             WHERE r.id = ? AND (r.requested_by_user_id = ? OR EXISTS (
                 SELECT 1 FROM portal_registrations pr
                 WHERE pr.user_id = ? AND (pr.lokasi_id = r.lokasi_id OR pr.lokasi_id = r.kontrak_induk_id)
             )) LIMIT 1",
        )
        .bind(request_id)
        .bind(auth.id)
        .bind(auth.id)
        .fetch_optional(&state.database)
        .await
        .map_err(ApiError::database)?;
        if owned.is_none() {
            assert_pelanggan_access(&state.database, auth.id, &auth.role, row.pelanggan_id).await?;
        }
    }
    let allowed = match row.current_step {
        5 | 12 => auth.role == "pelanggan",
        2 | 4 | 6 | 7 => auth.role == "admin",
        3 | 8 | 9 => auth.role == "teknisi",
        10 | 11 => auth.role == "keuangan",
        1 => false,
        _ => false,
    };
    if !allowed {
        return Err(ApiError::forbidden(
            "Tahap ini bukan tanggung jawab role Anda.",
        ));
    }
    if row.status == "selesai" {
        return Err(ApiError::bad_request("Permohonan sudah selesai."));
    }
    let action = body
        .action
        .clone()
        .unwrap_or_else(|| format!("step_{}", row.current_step));
    let data = body.data.clone().unwrap_or_else(|| serde_json::json!({}));
    let required = |key: &str| {
        data.get(key)
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_some()
    };
    let valid_action = match row.current_step {
        2 => action == "kirim_tarif" && required("tarif_catatan"),
        3 => action == "survei_jalur" && required("survey_hasil"),
        4 => action == "kirim_po" && required("po_nomor"),
        5 => action == "submit_po" && required("po_nomor"),
        6 => action == "siapkan_perjanjian" && required("perjanjian_nomor"),
        7 => action == "tanda_tangan_bak" && required("baa_nomor"),
        8 => action == "aktivasi" && required("aktivasi_catatan"),
        9 => action == "kirim_baa" && required("baa_nomor"),
        10 => {
            action == "terbitkan_invoice"
                && required("invoice_nomor")
                && data
                    .get("invoice_nilai")
                    .and_then(|value| value.as_f64())
                    .unwrap_or(0.0)
                    > 0.0
        }
        11 => action == "kirim_invoice",
        12 => action == "konfirmasi_bayar" && required("bukti_pembayaran"),
        _ => false,
    };
    if !valid_action {
        return Err(ApiError::bad_request(
            "Data wajib atau aksi SOP2 belum lengkap untuk tahap ini.",
        ));
    }
    let mut merged_detail = row
        .detail_json
        .as_deref()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    if let Some(values) = data.as_object() {
        merged_detail.extend(values.clone());
    }
    if let Some(catatan) = body
        .catatan
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        merged_detail.insert(
            "catatan_terakhir".to_owned(),
            serde_json::Value::String(catatan.to_owned()),
        );
    }
    let detail_json = serde_json::to_string(&serde_json::Value::Object(merged_detail))
        .map_err(|_| ApiError::internal("Data detail SOP2 tidak dapat disimpan."))?;
    let next_step = row.current_step + 1;
    let next_status = if next_step > row.total_steps {
        "selesai"
    } else {
        "diproses"
    };
    let mut tx = state.database.begin().await.map_err(ApiError::database)?;
    if next_step > row.total_steps {
        // Pembayaran adalah titik final SOP2. Pada titik ini perubahan layanan
        // diproyeksikan ke tabel kontrak: core pada lokasi existing diperbarui,
        // sedangkan lokasi baru dibuat sebagai baris turunan dari kontrak induk.
        let detail: (Option<String>, Option<String>, String, String) = sqlx::query_as(
            "SELECT core, sharing_core, CAST(periode_awal AS CHAR), CAST(periode_berakhir AS CHAR)
             FROM lokasi WHERE id = ? FOR UPDATE",
        )
        .bind(row.kontrak_induk_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(ApiError::database)?;
        if row.jenis_permintaan == "lokasi_baru" {
            let kode = generate_lokasi_code(&state.database).await?;
            let new_core = if row.core_dedicated > 0 {
                Some(format!("{} Core", row.core_dedicated))
            } else if row.sharing_core.is_none() {
                detail.0.clone()
            } else {
                None
            };
            let new_sharing = row.sharing_core.clone().or_else(|| {
                if row.core_dedicated == 0 {
                    detail.1.clone()
                } else {
                    None
                }
            });
            let new_id = sqlx::query(
                "INSERT INTO lokasi (kode_kontrak, pelanggan_id, previous_lokasi_id, kategori,
                 nama_lokasi, core, sharing_core, periode_awal, periode_berakhir,
                 status_kontrak, jenis_perubahan_kontrak, alasan_perubahan, created_at)
                 VALUES (?, ?, ?, 'Tambahan SOP2', ?, ?, ?, ?, ?, 'Belum Beroperasi',
                         'lokasi_baru', ?, NOW())",
            )
            .bind(&kode)
            .bind(row.pelanggan_id)
            .bind(row.kontrak_induk_id)
            .bind(&row.lokasi_nama)
            .bind(new_core)
            .bind(new_sharing)
            .bind(&detail.2)
            .bind(&detail.3)
            .bind(body.catatan.as_deref().or(row.catatan_pelanggan.as_deref()))
            .execute(&mut *tx)
            .await
            .map_err(ApiError::database)?
            .last_insert_id();
            sqlx::query("UPDATE sop2_service_change_requests SET lokasi_hasil_id = ? WHERE id = ?")
                .bind(new_id)
                .bind(request_id)
                .execute(&mut *tx)
                .await
                .map_err(ApiError::database)?;
        } else {
            let target_id = row.lokasi_id.unwrap_or(row.kontrak_induk_id);
            if row.jenis_permintaan == "tambah_dedicated_core" {
                sqlx::query(
                    "UPDATE lokasi SET core = CONCAT(CAST(COALESCE(CAST(NULLIF(REPLACE(core, ' Core', ''), '') AS UNSIGNED), 0) + CAST(? AS UNSIGNED) AS UNSIGNED),
                     ' Core'), jenis_perubahan_kontrak = 'tambah_dedicated_core', alasan_perubahan = ? WHERE id = ?",
                ).bind(row.core_dedicated).bind(body.catatan.as_deref()).bind(target_id).execute(&mut *tx).await.map_err(ApiError::database)?;
            } else {
                sqlx::query("UPDATE lokasi SET sharing_core = ?, jenis_perubahan_kontrak = 'tambah_sharing_core', alasan_perubahan = ? WHERE id = ?")
                    .bind(row.sharing_core).bind(body.catatan.as_deref()).bind(target_id).execute(&mut *tx).await.map_err(ApiError::database)?;
            }
        }
    }
    sqlx::query("UPDATE sop2_service_change_requests SET current_step = ?, status = ?, detail_json = ?, last_action = ?, rejection_reason = COALESCE(?, rejection_reason) WHERE id = ?")
        .bind(next_step).bind(next_status)
        .bind(&detail_json).bind(&action)
        .bind(body.catatan.as_deref().map(str::trim).filter(|v| !v.is_empty()))
        .bind(request_id).execute(&mut *tx).await.map_err(ApiError::database)?;
    sqlx::query("INSERT INTO sop2_step_history (request_id, step_nomor, actor_role, actor_user_id, action_type, detail_json) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(request_id).bind(row.current_step).bind(&auth.role).bind(auth.id)
        .bind(&action).bind(&detail_json).execute(&mut *tx).await.map_err(ApiError::database)?;
    tx.commit().await.map_err(ApiError::database)?;
    let recipient_role = match next_step {
        3 | 8 | 9 => "teknisi",
        2 | 4 | 6 | 7 => "admin",
        10 | 11 => "keuangan",
        5 | 12 | 13 => "pelanggan",
        _ => "admin",
    };
    let recipient_user_id = if recipient_role == "pelanggan" {
        sqlx::query_scalar::<_, u64>(
            "SELECT requested_by_user_id FROM sop2_service_change_requests WHERE id = ?",
        )
        .bind(request_id)
        .fetch_optional(&state.database)
        .await
        .map_err(ApiError::database)?
    } else {
        None
    };
    notify_sop2(
        &state.database,
        request_id,
        recipient_role,
        recipient_user_id,
        "Tahap SOP2 menunggu tindakan",
        &format!(
            "Permohonan {} sekarang menunggu tahap {} oleh {}.",
            row.kode_perubahan, next_step, recipient_role
        ),
    )
    .await?;
    let updated: ServiceChangeWorkItem = sqlx::query_as(
        "SELECT r.id, r.kode_perubahan, r.pelanggan_id, p.nama_pelanggan,
                r.kontrak_induk_id, r.lokasi_id, r.lokasi_nama, r.jenis_permintaan,
                r.core_dedicated, r.sharing_core, r.current_step, r.total_steps, r.status, r.catatan_pelanggan,
                CAST(r.detail_json AS CHAR) AS detail_json, r.last_action,
                CAST(r.created_at AS CHAR) AS created_at, CAST(r.updated_at AS CHAR) AS updated_at
         FROM sop2_service_change_requests r JOIN pelanggan p ON p.id = r.pelanggan_id WHERE r.id = ?",
    ).bind(request_id).fetch_one(&state.database).await.map_err(ApiError::database)?;
    Ok(Json(updated))
}

pub async fn submit_additional_location(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Json(body): Json<AddLocationRequest>,
) -> Result<Json<AddLocationResponse>, ApiError> {
    if auth.role != "pelanggan" {
        return Err(ApiError::forbidden(
            "Hanya akun pelanggan yang dapat mengajukan lokasi baru.",
        ));
    }

    if let Err(e) = body.validate() {
        return Err(ApiError::bad_request(&e));
    }

    let pelanggan_id: (u64,) =
        sqlx::query_as("SELECT pelanggan_id FROM user_pelanggan_access WHERE user_id = ? LIMIT 1")
            .bind(auth.id)
            .fetch_optional(&state.database)
            .await
            .map_err(ApiError::database)?
            .ok_or_else(|| {
                ApiError::forbidden("Akun ini belum terhubung ke data pelanggan manapun.")
            })?;
    let pelanggan_id = pelanggan_id.0;

    let core_value = if body.core_dedicated > 0 {
        format!("{} Core", body.core_dedicated)
    } else {
        String::new()
    };
    let sharing_value = parse_sharing_core(&body.sharing_core)?;
    if !core_value.is_empty() && sharing_value.is_some() {
        return Err(ApiError::bad_request(
            "Core dedicated dan sharing core tidak dapat dipilih bersamaan.",
        ));
    }

    let lokasi_code = generate_lokasi_code(&state.database).await?;

    let mut tx = state
        .database
        .begin()
        .await
        .map_err(|e| ApiError::internal(&format!("Transaction start failed: {}", e)))?;

    let today = chrono::Utc::now().date_naive();
    let one_year_later = today
        .checked_add_months(chrono::Months::new(12))
        .unwrap_or(today);
    let today_str = today.format("%Y-%m-%d").to_string();
    let one_year_later_str = one_year_later.format("%Y-%m-%d").to_string();

    let lokasi_id = sqlx::query(
        "INSERT INTO lokasi (
            kode_kontrak, nama_lokasi, pelanggan_id, status_kontrak, kategori,
            periode_awal, periode_berakhir, biaya_aktivasi, perbulan, nilai_periode_aktif,
            core, sharing_core, created_at
         )
         VALUES (?, ?, ?, 'Belum Beroperasi', 'Baru', ?, ?, 0, 0, 0, ?, ?, NOW())",
    )
    .bind(&lokasi_code)
    .bind(&body.lokasi_nama)
    .bind(pelanggan_id)
    .bind(today_str)
    .bind(one_year_later_str)
    .bind(core_value)
    .bind(sharing_value)
    .execute(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(&format!("Insert lokasi failed: {}", e)))?
    .last_insert_id();

    let workflow_id = sqlx::query(
        "INSERT INTO sop_workflows (pelanggan_id, lokasi_id, nama_lokasi_diajukan, alamat_lokasi_diajukan,
         core_diajukan, sharing_core_diajukan, kota, provinsi, current_step, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'draft')"
    )
    .bind(pelanggan_id)
    .bind(lokasi_id)
    .bind(&body.lokasi_nama)
    .bind(&body.lokasi_alamat)
    .bind(body.core_dedicated)
    .bind(&body.sharing_core)
    .bind(&body.lokasi_kota)
    .bind(&body.lokasi_provinsi)
    .execute(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(&format!("Insert workflow failed: {}", e)))?
    .last_insert_id();

    sqlx::query(
        "INSERT INTO sop_step_history (workflow_id, step_nomor, actor_role, actor_user_id, action_type, description, created_at)
         VALUES (?, 1, 'customer', ?, 'submit_lokasi_tambahan', 'Pelanggan mengajukan lokasi tambahan', NOW())"
    )
    .bind(workflow_id)
    .bind(auth.id)
    .execute(&mut *tx)
    .await
    .map_err(|e| ApiError::internal(&format!("Insert history failed: {}", e)))?;

    tx.commit()
        .await
        .map_err(|e| ApiError::internal(&format!("Transaction commit failed: {}", e)))?;

    tracing::info!(
        "Pelanggan {} submitted additional lokasi: {}",
        pelanggan_id,
        lokasi_code
    );

    Ok(Json(AddLocationResponse {
        success: true,
        lokasi_code,
        workflow_id,
        message: "Pengajuan lokasi baru berhasil dikirim.".to_string(),
    }))
}

pub async fn get_workflow_status(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(workflow_id): Path<u64>,
) -> Result<Json<WorkflowStatusResponse>, ApiError> {
    if auth.role == "isp" {
        return Err(ApiError::forbidden(
            "Role ISP tidak memiliki akses ke workflow pengajuan pelanggan.",
        ));
    }
    // Get workflow
    let workflow: SopWorkflow = sqlx::query_as(&format!(
        "SELECT {WORKFLOW_COLUMNS} FROM sop_workflows WHERE id = ?"
    ))
    .bind(workflow_id)
    .fetch_one(&state.database)
    .await
    .map_err(|_| ApiError::not_found("Workflow tidak ditemukan"))?;

    assert_pelanggan_access(&state.database, auth.id, &auth.role, workflow.pelanggan_id).await?;

    // Get pelanggan info separately
    let pelanggan: Option<(String,)> =
        sqlx::query_as("SELECT nama_pelanggan FROM pelanggan WHERE id = ?")
            .bind(workflow.pelanggan_id)
            .fetch_optional(&state.database)
            .await
            .map_err(|e| ApiError::internal(&format!("Pelanggan query failed: {}", e)))?;

    // Get lokasi code separately
    let lokasi: Option<(String,)> = sqlx::query_as("SELECT kode_kontrak FROM lokasi WHERE id = ?")
        .bind(workflow.lokasi_id)
        .fetch_optional(&state.database)
        .await
        .map_err(|e| ApiError::internal(&format!("Lokasi query failed: {}", e)))?;

    // Get step history
    let history: Vec<SopStepHistory> = sqlx::query_as(
        &format!("SELECT {STEP_HISTORY_COLUMNS} FROM sop_step_history WHERE workflow_id = ? ORDER BY created_at DESC")
    )
    .bind(workflow_id)
    .fetch_all(&state.database)
    .await
    .map_err(|e| ApiError::internal(&format!("History query failed: {}", e)))?;

    // Get documents
    let documents: Vec<SopDocument> = sqlx::query_as(
        &format!("SELECT {DOCUMENT_COLUMNS} FROM sop_documents WHERE workflow_id = ? ORDER BY created_at DESC")
    )
    .bind(workflow_id)
    .fetch_all(&state.database)
    .await
    .map_err(|e| ApiError::internal(&format!("Documents query failed: {}", e)))?;

    Ok(Json(WorkflowStatusResponse {
        id: workflow.id,
        kode_lokasi: lokasi.map(|(k,)| k).unwrap_or_default(),
        nama_lokasi: workflow.nama_lokasi_diajukan.clone(),
        pelanggan_nama: pelanggan.map(|(n,)| n).unwrap_or_default(),
        current_step: workflow.current_step,
        total_steps: workflow.total_steps,
        status: workflow.status,
        assigned_to_role: workflow.assigned_to_role.clone(),
        step_history: history,
        documents,
        started_at: workflow.started_at,
        completed_at: workflow.completed_at,
    }))
}

// ============================================
// PROTECTED ENDPOINTS (Require Auth)
// ============================================

pub async fn submit_step(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path((workflow_id, step)): Path<(u64, i32)>,
    Json(body): Json<serde_json::Value>,
) -> Result<StatusCode, ApiError> {
    const VALID_CONTRACT_STATUS: &[&str] = &[
        "Beroperasi",
        "Belum Beroperasi",
        "Proses Perpanjangan",
        "Diperpanjang",
        "Di-upgrade",
        "Berhenti",
    ];

    // Get current workflow state (to validate progression)
    let workflow: SopWorkflow = sqlx::query_as(&format!(
        "SELECT {WORKFLOW_COLUMNS} FROM sop_workflows WHERE id = ?"
    ))
    .bind(workflow_id)
    .fetch_one(&state.database)
    .await
    .map_err(|_| ApiError::not_found("Workflow tidak ditemukan"))?;

    if workflow.current_step != step {
        return Err(ApiError::bad_request(format!(
            "Workflow saat ini berada di langkah {}. Tidak dapat memproses langkah {}.",
            workflow.current_step, step
        )));
    }

    assert_workflow_assignee(&workflow, &auth.role)?;

    // Process based on step
    match step {
        1 => {
            if auth.role != "pelanggan" {
                return Err(ApiError::forbidden(
                    "Hanya pelanggan yang dapat mengirim langkah konfirmasi pelanggan.",
                ));
            }

            let req: Step1SubmitRequest = serde_json::from_value(body)
                .map_err(|e| ApiError::bad_request(&format!("Invalid request body: {}", e)))?;

            sqlx::query(
                "UPDATE sop_workflows
                 SET nama_lokasi_diajukan = ?,
                     alamat_lokasi_diajukan = ?,
                     core_diajukan = ?,
                     sharing_core_diajukan = ?,
                     current_step = 2,
                     assigned_to_role = 'admin',
                     updated_at = NOW()
                 WHERE id = ?",
            )
            .bind(&req.nama_lokasi_diajukan)
            .bind(&req.alamat_lokasi_diajukan)
            .bind(req.core_diajukan)
            .bind(&req.sharing_core_diajukan)
            .bind(workflow_id)
            .execute(&state.database)
            .await
            .map_err(|e| ApiError::internal(&format!("Update failed: {}", e)))?;

            log_step_history(
                &state.database,
                workflow_id,
                1,
                "customer",
                None,
                "submit",
                Some("Submit minat pemasangan"),
            )
            .await?;
        }
        2 => {
            if auth.role != "admin" {
                return Err(ApiError::forbidden(
                    "Hanya Admin KIMA yang dapat memvalidasi langkah ini.",
                ));
            }

            let req: Step2ValidationRequest = serde_json::from_value(body)
                .map_err(|e| ApiError::bad_request(&format!("Invalid request body: {}", e)))?;

            let (next_step, next_role) = match req.decision.as_str() {
                "approve" => (3, "customer"),
                "reject" | "revise" => (1, "customer"),
                _ => {
                    return Err(ApiError::bad_request(&format!(
                        "Decision not valid: {}",
                        req.decision
                    )));
                }
            };

            sqlx::query(
                "UPDATE sop_workflows
                 SET current_step = ?,
                     assigned_to_role = ?,
                     updated_at = NOW()
                 WHERE id = ?",
            )
            .bind(next_step)
            .bind(next_role)
            .bind(workflow_id)
            .execute(&state.database)
            .await
            .map_err(|e| ApiError::internal(&format!("Update failed: {}", e)))?;

            log_step_history(
                &state.database,
                workflow_id,
                2,
                "admin",
                None,
                "validate",
                req.catatan_validasi
                    .as_deref()
                    .or(Some("Validasi administratif")),
            )
            .await?;
        }
        3 => {
            if auth.role != "pelanggan" {
                return Err(ApiError::forbidden(
                    "Hanya pelanggan yang dapat mengirim konfirmasi kebutuhan.",
                ));
            }

            let req: Step3SubmitRequest = serde_json::from_value(body)
                .map_err(|e| ApiError::bad_request(&format!("Invalid request body: {}", e)))?;

            sqlx::query(
                "UPDATE sop_workflows
                 SET core_diajukan = ?,
                     sharing_core_diajukan = ?,
                     current_step = 4,
                     assigned_to_role = 'teknisi',
                     status = 'in_progress',
                     updated_at = NOW()
                 WHERE id = ?",
            )
            .bind(req.core_dedicated)
            .bind(&req.sharing_core)
            .bind(workflow_id)
            .execute(&state.database)
            .await
            .map_err(|e| ApiError::internal(&format!("Update failed: {}", e)))?;

            log_step_history(
                &state.database,
                workflow_id,
                3,
                "customer",
                Some(auth.id),
                "submit",
                Some("Konfirmasi kebutuhan core"),
            )
            .await?;
        }
        4 => {
            // Validasi role: hanya teknisi
            if !matches!(auth.role.as_str(), "teknisi") {
                return Err(ApiError::forbidden(
                    "Hanya teknisi yang dapat melakukan survey teknis.",
                ));
            }

            let req: Step4SurveyRequest = serde_json::from_value(body)
                .map_err(|e| ApiError::bad_request(&format!("Invalid request body: {}", e)))?;

            // Validasi kesiapan jalur
            if !matches!(req.kesiapan_jalur.as_str(), "ready" | "not_ready") {
                return Err(ApiError::bad_request(
                    "Kesiapan jalur harus 'ready' atau 'not_ready'.",
                ));
            }

            let max_len = state.max_string_length;
            validate_string_length(&req.hasil_survey, max_len, "Hasil survey")?;
            validate_opt_string_length(req.catatan_teknis.as_deref(), max_len, "Catatan teknis")?;

            let mut tx = state.database.begin().await.map_err(ApiError::database)?;

            // Insert survey documents (foto lokasi & jalur)
            for foto_id in req.foto_lokasi.iter().chain(req.foto_jalur.iter()) {
                sqlx::query(
                    "INSERT INTO sop_documents (
                        workflow_id, step_nomor, kategori, nama_file, deskripsi,
                        drive_file_id, upload_status, uploaded_by_user_id, uploaded_by_role, created_at
                     ) VALUES (?, 4, 'hasil_survey', ?, 'Foto survey teknis', ?, 'uploaded', ?, ?, NOW())",
                )
                .bind(workflow_id)
                .bind(format!("survey_{}.jpg", uuid_generator(foto_id)))
                .bind(foto_id)
                .bind(auth.id)
                .bind(auth.role.as_str())
                .execute(&mut *tx)
                .await
                .map_err(ApiError::database)?;
            }

            // Tentukan next step berdasarkan kesiapan jalur
            let (next_step, next_role, status) = if req.kesiapan_jalur == "ready" {
                (5, "admin", "in_progress") // Lanjut ke proposal
            } else {
                (1, "customer", "in_progress") // Kembali ke customer untuk revisi lokasi
            };

            sqlx::query(
                "UPDATE sop_workflows
                 SET current_step = ?,
                     assigned_to_role = ?,
                     status = ?,
                     updated_at = NOW()
                 WHERE id = ?",
            )
            .bind(next_step)
            .bind(next_role)
            .bind(status)
            .bind(workflow_id)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::database)?;

            tx.commit().await.map_err(ApiError::database)?;

            // Log history SETELAH commit: log_step_history memakai koneksi pool lain,
            // dan FK-check insert-nya membaca baris workflow yang masih terkunci `tx`
            // selama transaksi terbuka → lock wait timeout. Commit dulu, baru log.
            let survey_summary = format!(
                "Survey teknis selesai. Kesiapan jalur: {}. Lokasi: {:?}. {}",
                req.kesiapan_jalur,
                (req.koordinat_lat, req.koordinat_lng),
                req.rekomendasi_jalur
                    .as_deref()
                    .unwrap_or("Tidak ada rekomendasi khusus")
            );

            log_step_history(
                &state.database,
                workflow_id,
                4,
                auth.role.as_str(),
                Some(auth.id),
                "submit_survey",
                Some(&survey_summary),
            )
            .await?;
        }
        5 => {
            // Validasi role: hanya dbo/admin
            if auth.role != "admin" {
                return Err(ApiError::forbidden(
                    "Hanya Admin KIMA yang dapat menyusun proposal.",
                ));
            }

            let req: Step5ProposalRequest = serde_json::from_value(body)
                .map_err(|e| ApiError::bad_request(&format!("Invalid request body: {}", e)))?;

            // Validasi tanggal proposal
            let _proposal_date = parse_date(&req.tanggal_proposal)?;

            let max_len = state.max_string_length;
            validate_string_length(&req.judul_proposal, max_len, "Judul proposal")?;
            validate_string_length(&req.nomor_proposal, max_len, "Nomor proposal")?;
            validate_opt_string_length(
                req.terms_conditions.as_deref(),
                max_len,
                "Terms & conditions",
            )?;

            let mut tx = state.database.begin().await.map_err(ApiError::database)?;

            // Simpan proposal document
            if let Some(file_id) = req.proposal_file_id {
                sqlx::query(
                    "INSERT INTO sop_documents (
                        workflow_id, step_nomor, kategori, nama_file, deskripsi,
                        drive_file_id, upload_status, uploaded_by_user_id, uploaded_by_role, created_at
                     ) VALUES (?, 5, 'proposal', ?, 'Proposal penawaran resmi', ?, 'uploaded', ?, ?, NOW())",
                )
                .bind(workflow_id)
                .bind(format!("proposal_{}.pdf", req.nomor_proposal))
                .bind(file_id)
                .bind(auth.id)
                .bind(auth.role.as_str())
                .execute(&mut *tx)
                .await
                .map_err(ApiError::database)?;
            }

            // Update workflow dengan info proposal
            sqlx::query(
                "UPDATE sop_workflows
                 SET current_step = 6,
                     assigned_to_role = 'customer',
                     status = 'in_progress',
                     updated_at = NOW()
                 WHERE id = ?",
            )
            .bind(workflow_id)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::database)?;

            tx.commit().await.map_err(ApiError::database)?;

            // Log history SETELAH commit (lihat catatan deadlock di step 4).
            let proposal_summary = format!(
                "Proposal {} selesai disusun. Nilai: Rp {}, Instalasi: Rp {}, Bulanan: Rp {}, Durasi: {} bulan",
                req.nomor_proposal,
                req.nilai_penawaran,
                req.biaya_instalasi,
                req.biaya_bulanan,
                req.durasi_kontrak_bulan
            );

            log_step_history(
                &state.database,
                workflow_id,
                5,
                auth.role.as_str(),
                Some(auth.id),
                "submit_proposal",
                Some(&proposal_summary),
            )
            .await?;
        }
        6 => {
            // Validasi role: dbo (presentasi) atau customer (respon)
            let req: Step6PresentasiRequest = serde_json::from_value(body)
                .map_err(|e| ApiError::bad_request(&format!("Invalid request body: {}", e)))?;

            // Validasi keputusan pelanggan
            if !matches!(
                req.keputusan_pelanggan.as_str(),
                "setuju" | "negosiasi" | "tolak"
            ) {
                return Err(ApiError::bad_request(
                    "Keputusan pelanggan harus 'setuju', 'negosiasi', atau 'tolak'.",
                ));
            }

            let max_len = state.max_string_length;
            validate_string_length(&req.hasil_presentasi, max_len, "Hasil presentasi")?;
            validate_opt_string_length(
                req.alasan_negosiasi.as_deref(),
                max_len,
                "Alasan negosiasi",
            )?;

            let mut tx = state.database.begin().await.map_err(ApiError::database)?;

            // Simpan notulen presentasi
            if let Some(file_id) = req.notulen_file_id {
                sqlx::query(
                    "INSERT INTO sop_documents (
                        workflow_id, step_nomor, kategori, nama_file, deskripsi,
                        drive_file_id, upload_status, uploaded_by_user_id, uploaded_by_role, created_at
                     ) VALUES (?, 6, 'notulen_meeting', ?, 'Notulen presentasi proposal', ?, 'uploaded', ?, ?, NOW())",
                )
                .bind(workflow_id)
                .bind(format!("notulen_{}.pdf", req.tanggal_presentasi))
                .bind(file_id)
                .bind(auth.id)
                .bind(auth.role.as_str())
                .execute(&mut *tx)
                .await
                .map_err(ApiError::database)?;
            }

            // Tentukan next step berdasarkan keputusan
            let (next_step, next_role, status) = match req.keputusan_pelanggan.as_str() {
                "setuju" => (7, "customer", "in_progress"), // Lanjut ke upload PO
                "negosiasi" => (5, "admin", "in_progress"), // Kembali ke Admin untuk revisi proposal
                "tolak" => (6, "customer", "rejected"),     // Status rejected, tetap di step 6
                _ => unreachable!(),
            };

            sqlx::query(
                "UPDATE sop_workflows
                 SET current_step = ?,
                     assigned_to_role = ?,
                     status = ?,
                     updated_at = NOW()
                 WHERE id = ?",
            )
            .bind(next_step)
            .bind(next_role)
            .bind(status)
            .bind(workflow_id)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::database)?;

            tx.commit().await.map_err(ApiError::database)?;

            // Log history SETELAH commit (lihat catatan deadlock di step 4).
            let presentasi_summary = format!(
                "Presentasi proposal pada {} ({}). Keputusan: {}. {}",
                req.tanggal_presentasi,
                req.metode_presentasi,
                req.keputusan_pelanggan,
                req.permintaan_revisi.as_deref().unwrap_or("")
            );

            log_step_history(
                &state.database,
                workflow_id,
                6,
                auth.role.as_str(),
                Some(auth.id),
                "presentasi_proposal",
                Some(&presentasi_summary),
            )
            .await?;
        }
        12 => {
            if auth.role != "pelanggan" {
                return Err(ApiError::forbidden(
                    "Hanya pelanggan yang dapat mengunggah BAK pada langkah ini.",
                ));
            }

            let req: Step12UploadRequest = serde_json::from_value(body)
                .map_err(|e| ApiError::bad_request(&format!("Invalid request body: {}", e)))?;

            let kategori = req.kategori_dokumen.trim();
            let nama_file = req.nama_file.trim();
            if kategori.is_empty() {
                return Err(ApiError::bad_request("Kategori dokumen wajib diisi."));
            }
            if nama_file.is_empty() {
                return Err(ApiError::bad_request("Nama file wajib diisi."));
            }

            let max_len = state.max_string_length;
            validate_string_length(kategori, max_len, "Kategori dokumen")?;
            validate_string_length(nama_file, max_len, "Nama file")?;
            validate_opt_string_length(req.deskripsi.as_deref(), max_len, "Deskripsi")?;

            let mut tx = state.database.begin().await.map_err(ApiError::database)?;

            sqlx::query(
                "INSERT INTO sop_documents (
                    workflow_id, step_nomor, kategori, nama_file, deskripsi,
                    drive_file_id, drive_folder_id, ukuran_byte, mime_type,
                    upload_status, uploaded_by_user_id, uploaded_by_role, created_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', ?, ?, NOW())",
            )
            .bind(workflow_id)
            .bind(12)
            .bind(kategori)
            .bind(nama_file)
            .bind(trim_opt(req.deskripsi))
            .bind(trim_opt(req.drive_file_id))
            .bind(trim_opt(req.drive_folder_id))
            .bind(req.ukuran_byte)
            .bind(trim_opt(req.mime_type))
            .bind(auth.id)
            .bind(auth.role.as_str())
            .execute(&mut *tx)
            .await
            .map_err(ApiError::database)?;

            sqlx::query(
                "UPDATE sop_workflows
                 SET current_step = 13,
                     assigned_to_role = 'admin',
                     status = 'in_progress',
                     updated_at = NOW()
                 WHERE id = ?",
            )
            .bind(workflow_id)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::database)?;

            tx.commit().await.map_err(ApiError::database)?;

            // Log history SETELAH commit (lihat catatan deadlock di step 4).
            log_step_history(
                &state.database,
                workflow_id,
                12,
                auth.role.as_str(),
                Some(auth.id),
                "upload_signed_bak",
                Some("Pelanggan mengunggah dokumen BAK bertanda tangan"),
            )
            .await?;
        }
        13 => {
            if auth.role != "admin" {
                return Err(ApiError::forbidden(
                    "Hanya administrator yang dapat melakukan aktivasi kontrak.",
                ));
            }

            let req: Step13ActivationRequest = serde_json::from_value(body)
                .map_err(|e| ApiError::bad_request(&format!("Invalid request body: {}", e)))?;

            let max_len = state.max_string_length;
            validate_opt_string_length(req.no_kontrak.as_deref(), max_len, "No. kontrak")?;
            validate_opt_string_length(req.keterangan.as_deref(), max_len, "Keterangan")?;
            validate_opt_string_length(req.kategori.as_deref(), max_len, "Kategori")?;

            let start = parse_date(&req.periode_awal)?;
            let end = parse_date(&req.periode_berakhir)?;
            if end < start {
                return Err(ApiError::bad_request(
                    "Periode berakhir harus >= periode awal.",
                ));
            }

            let status = if let Some(value) = req
                .status_kontrak
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                value.to_owned()
            } else {
                let today = Local::now().naive_local().date();
                if today < start {
                    "Belum Beroperasi".to_owned()
                } else if today <= end {
                    "Beroperasi".to_owned()
                } else {
                    "Proses Perpanjangan".to_owned()
                }
            };
            if !VALID_CONTRACT_STATUS.contains(&status.as_str()) {
                return Err(ApiError::bad_request("Status kontrak tidak valid."));
            }

            let lokasi_id = workflow.lokasi_id.ok_or_else(|| {
                ApiError::bad_request(
                    "Workflow belum memiliki lokasi terkait untuk aktivasi kontrak.",
                )
            })?;

            let mut tx = state.database.begin().await.map_err(ApiError::database)?;
            let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM lokasi WHERE id = ?")
                .bind(lokasi_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(ApiError::database)?;
            if exists == 0 {
                tx.rollback().await.map_err(ApiError::database)?;
                return Err(ApiError::not_found("Data lokasi kontrak tidak ditemukan."));
            }

            sqlx::query(
                "UPDATE lokasi SET
                    no_kontrak = ?,
                    periode_awal = ?,
                    periode_berakhir = ?,
                    durasi_kontrak_bulan = ?,
                    nilai_kontrak = ?,
                    biaya_aktivasi = ?,
                    perbulan = ?,
                    nilai_periode_aktif = ?,
                    kategori = COALESCE(?, kategori),
                    status_kontrak = ?,
                    keterangan = ?
                 WHERE id = ?",
            )
            .bind(trim_opt(req.no_kontrak))
            .bind(start.format("%Y-%m-%d").to_string())
            .bind(end.format("%Y-%m-%d").to_string())
            .bind(req.durasi_kontrak_bulan)
            .bind(req.nilai_kontrak)
            .bind(req.biaya_aktivasi.unwrap_or(0.0))
            .bind(req.perbulan.unwrap_or(0.0))
            .bind(req.nilai_periode_aktif.unwrap_or(0.0))
            .bind(trim_opt(req.kategori))
            .bind(&status)
            .bind(trim_opt(req.keterangan))
            .bind(lokasi_id)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::database)?;

            sqlx::query(
                "UPDATE sop_workflows
                 SET current_step = 14,
                     assigned_to_role = 'keuangan',
                     status = 'in_progress',
                     updated_at = NOW()
                 WHERE id = ?",
            )
            .bind(workflow_id)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::database)?;

            sqlx::query(
                "INSERT INTO sop_step_history (workflow_id, step_nomor, actor_role, actor_user_id, action_type, description, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())",
            )
            .bind(workflow_id)
            .bind(13)
            .bind("admin")
            .bind(auth.id)
            .bind("activate_contract")
            .bind("Aktivasi kontrak selesai dan workflow diteruskan ke keuangan")
            .execute(&mut *tx)
            .await
            .map_err(ApiError::database)?;

            tx.commit().await.map_err(ApiError::database)?;
        }
        _ => {
            return Err(ApiError::internal(&format!(
                "Step {} belum diimplementasikan",
                step
            )));
        }
    }

    Ok(StatusCode::OK)
}

pub async fn list_workflows(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Query(query): Query<ListWorkflowsQuery>,
) -> Result<Json<Vec<SopWorkflow>>, ApiError> {
    if auth.role == "isp" {
        return Err(ApiError::forbidden(
            "Role ISP tidak memiliki akses ke workflow pengajuan pelanggan.",
        ));
    }
    let page = query.page.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(20);
    let offset = (page - 1) * page_size;

    // Pelanggan hanya boleh melihat workflow milik pelanggan yang terikat
    // pada akunnya lewat ACL. Role internal (admin/dbo/teknisi/dst) melihat semua.
    let is_customer = auth.role == "pelanggan";

    let workflows: Vec<SopWorkflow> = sqlx::query_as(&format!(
        "SELECT {WORKFLOW_COLUMNS_PREFIXED}, p.nama_pelanggan
         FROM sop_workflows sw
         LEFT JOIN pelanggan p ON sw.pelanggan_id = p.id
         WHERE (? IS NULL OR sw.status = ?)
         AND (? IS NULL OR sw.assigned_to_role = ?)
         AND (
             ? = 0
             OR sw.pelanggan_id IN (
                 SELECT pelanggan_id FROM user_pelanggan_access WHERE user_id = ?
             )
         )
         ORDER BY sw.started_at DESC
         LIMIT ? OFFSET ?"
    ))
    .bind(query.status.as_ref())
    .bind(query.status.as_ref())
    .bind(query.assigned_to_role.as_ref())
    .bind(query.assigned_to_role.as_ref())
    .bind(is_customer as i32)
    .bind(auth.id)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.database)
    .await
    .map_err(|e| ApiError::internal(&format!("List query failed: {}", e)))?;

    Ok(Json(workflows))
}

pub async fn direksi_vote(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(workflow_id): Path<u64>,
    Json(body): Json<Step11VoteRequest>,
) -> Result<StatusCode, ApiError> {
    if !matches!(auth.role.as_str(), "direksi" | "admin") {
        return Err(ApiError::forbidden(
            "Hanya Direksi/Admin yang dapat memberikan keputusan pada langkah ini.",
        ));
    }

    // Get workflow
    let workflow: SopWorkflow = sqlx::query_as(&format!(
        "SELECT {WORKFLOW_COLUMNS} FROM sop_workflows WHERE id = ? AND current_step = 11"
    ))
    .bind(workflow_id)
    .fetch_one(&state.database)
    .await
    .map_err(|_| ApiError::not_found("Workflow tidak ditemukan atau bukan di step 11"))?;

    assert_workflow_assignee(&workflow, &auth.role)?;

    match body.decision.as_str() {
        "approve" => {
            // Move to step 12
            sqlx::query(
                "UPDATE sop_workflows SET current_step = 12, assigned_to_role = 'customer', updated_at = NOW() WHERE id = ?"
            )
            .bind(workflow_id)
            .execute(&state.database)
            .await
            .map_err(|e| ApiError::internal(&format!("Update failed: {}", e)))?;

            log_step_history(
                &state.database,
                workflow_id,
                11,
                auth.role.as_str(),
                Some(auth.id),
                "approve",
                Some(&body.notes),
            )
            .await?;
        }
        "reject" => {
            let back_step = body.back_to_step.unwrap_or(9);

            sqlx::query(
                "UPDATE sop_workflows SET current_step = ?, back_to_step = ?, rejection_reason = ?, updated_at = NOW() WHERE id = ?"
            )
            .bind(back_step)
            .bind(back_step)
            .bind(&body.notes)
            .bind(workflow_id)
            .execute(&state.database)
            .await
            .map_err(|e| ApiError::internal(&format!("Update failed: {}", e)))?;

            log_step_history(
                &state.database,
                workflow_id,
                11,
                auth.role.as_str(),
                Some(auth.id),
                "reject",
                Some(&body.notes),
            )
            .await?;
        }
        _ => {
            return Err(ApiError::bad_request(
                "Decision harus 'approve' atau 'reject'",
            ));
        }
    }

    Ok(StatusCode::OK)
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async fn validate_portal_document(
    pool: &MySqlPool,
    document_id: u64,
    pelanggan_id: u64,
    category: &str,
    registration_id: Option<u64>,
) -> Result<(), ApiError> {
    validate_portal_document_categories(
        pool,
        document_id,
        pelanggan_id,
        &[category],
        registration_id,
    )
    .await
}

/// Validasi dokumen portal berdasarkan permohonan, bukan berdasarkan master
/// pelanggan. Ini dipakai pada tahap survei ketika ISP belum ditetapkan dan
/// `portal_registrations.pelanggan_id` masih kosong.
async fn validate_portal_document_for_registration(
    pool: &MySqlPool,
    document_id: u64,
    category: &str,
    registration_id: u64,
) -> Result<(), ApiError> {
    let exists: Option<(u64,)> = sqlx::query_as(
        "SELECT id FROM dokumen
         WHERE id = ? AND portal_registration_id = ? AND kategori = ?
         LIMIT 1",
    )
    .bind(document_id)
    .bind(registration_id)
    .bind(category)
    .fetch_optional(pool)
    .await
    .map_err(ApiError::database)?;
    if exists.is_none() {
        return Err(ApiError::bad_request(
            "Dokumen tidak ditemukan atau belum tertaut ke permohonan ini.",
        ));
    }
    Ok(())
}

/// Validasi dokumen yang diunggah untuk satu permohonan portal. Kategori utama
/// boleh disertai kategori legacy (`Dokumen Lain`) agar data sebelum migrasi
/// tetap dapat diproses. Jika ID permohonan tersedia, dokumen harus tertaut ke
/// permohonan itu atau merupakan dokumen legacy yang belum memiliki relasi.
async fn validate_portal_document_categories(
    pool: &MySqlPool,
    document_id: u64,
    pelanggan_id: u64,
    categories: &[&str],
    registration_id: Option<u64>,
) -> Result<(), ApiError> {
    if categories.is_empty() {
        return Err(ApiError::internal("Kategori dokumen tidak boleh kosong."));
    }
    let placeholders = std::iter::repeat("?")
        .take(categories.len())
        .collect::<Vec<_>>()
        .join(", ");
    let relation_clause = if registration_id.is_some() {
        " AND (portal_registration_id = ? OR portal_registration_id IS NULL)"
    } else {
        ""
    };
    let query = format!(
        "SELECT id FROM dokumen
         WHERE id = ? AND pelanggan_id = ? AND kategori IN ({placeholders}){relation_clause}
         LIMIT 1"
    );
    let mut statement = sqlx::query_as::<_, (u64,)>(&query)
        .bind(document_id)
        .bind(pelanggan_id);
    for category in categories {
        statement = statement.bind(*category);
    }
    if let Some(registration_id) = registration_id {
        statement = statement.bind(registration_id);
    }
    let exists = statement
        .fetch_optional(pool)
        .await
        .map_err(ApiError::database)?;
    if exists.is_none() {
        return Err(ApiError::bad_request(
            "Dokumen tidak ditemukan atau tidak sesuai dengan kategori permohonan.",
        ));
    }
    Ok(())
}

async fn generate_registration_code(pool: &MySqlPool) -> Result<String, ApiError> {
    let year = chrono::Utc::now().format("%Y").to_string();
    let count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM portal_registrations WHERE kode_registrasi LIKE ?")
            .bind(format!("REG-{}-%", year))
            .fetch_one(pool)
            .await
            .map_err(|e| ApiError::internal(&format!("Code generation failed: {}", e)))?;

    Ok(format!("REG-{}-{:03}", year, count.0 + 1))
}

async fn generate_change_request_code(pool: &MySqlPool) -> Result<String, ApiError> {
    let year = chrono::Utc::now().format("%Y").to_string();
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sop2_service_change_requests WHERE kode_perubahan LIKE ?",
    )
    .bind(format!("S2-{}-%", year))
    .fetch_one(pool)
    .await
    .map_err(ApiError::database)?;
    Ok(format!("S2-{}-{:03}", year, count + 1))
}

#[allow(dead_code)] // Dipakai lagi saat Tahap 3 membuat pelanggan setelah penetapan ISP.
async fn generate_pelanggan_code(pool: &MySqlPool) -> Result<String, ApiError> {
    let year = chrono::Utc::now().format("%Y").to_string();
    let count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM pelanggan WHERE kode_pelanggan LIKE ?")
            .bind(format!("CUST-{}-%", year))
            .fetch_one(pool)
            .await
            .map_err(|e| ApiError::internal(&format!("Code generation failed: {}", e)))?;

    Ok(format!("CUST-{}-{:03}", year, count.0 + 1))
}

async fn generate_lokasi_code(pool: &MySqlPool) -> Result<String, ApiError> {
    let year = chrono::Utc::now().format("%Y").to_string();
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM lokasi WHERE kode_kontrak LIKE ?")
        .bind(format!("LKN-{}-%", year))
        .fetch_one(pool)
        .await
        .map_err(|e| ApiError::internal(&format!("Code generation failed: {}", e)))?;

    Ok(format!("LKN-{}-{:03}", year, count.0 + 1))
}

/// True bila `role` login berhak menangani langkah yang ditugaskan ke `assigned_role`.
///
/// Dua alias yang disengaja:
/// - "customer" adalah alias semantik untuk login pelanggan: state machine menulis
///   "customer", sedangkan pengguna login sebagai "pelanggan".
/// - "admin" adalah override internal universal. Ini menyamai maksud pemeriksaan per-step
///   (mis. `matches!(role, "dbo" | "admin")`) yang tanpa alias ini tak pernah tercapai
///   karena guard assignee berjalan lebih dulu. Pemeriksaan role per-step tetap menjadi
///   gerbang sebenarnya, jadi admin tetap ditolak pada langkah yang bukan haknya.
fn role_matches_assignment(assigned_role: &str, role: &str) -> bool {
    if assigned_role == role || role == "admin" {
        return true;
    }
    assigned_role == "customer" && role == "pelanggan"
}

fn assert_workflow_assignee(workflow: &SopWorkflow, role: &str) -> Result<(), ApiError> {
    if let Some(assigned_role) = workflow.assigned_to_role.as_deref()
        && !assigned_role.trim().is_empty()
        && !role_matches_assignment(assigned_role, role)
    {
        return Err(ApiError::forbidden(format!(
            "Langkah ini ditugaskan untuk role '{assigned_role}', bukan '{role}'."
        )));
    }
    Ok(())
}

async fn log_step_history(
    pool: &MySqlPool,
    workflow_id: u64,
    step: i32,
    actor_role: &str,
    actor_user_id: Option<u64>,
    action_type: &str,
    description: Option<&str>,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO sop_step_history (workflow_id, step_nomor, actor_role, actor_user_id, action_type, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())"
    )
    .bind(workflow_id)
    .bind(step)
    .bind(actor_role)
    .bind(actor_user_id)
    .bind(action_type)
    .bind(description)
    .execute(pool)
    .await
    .map_err(|e| ApiError::internal(&format!("History insert failed: {}", e)))?;

    Ok(())
}

// Helper untuk generate unique identifier dari drive file ID
fn uuid_generator(drive_id: &str) -> String {
    // Ambil 8 karakter pertama dari hash drive_id sebagai unique suffix
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    drive_id.hash(&mut hasher);
    format!("{:x}", hasher.finish())[..8].to_string()
}
