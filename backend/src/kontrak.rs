use std::sync::Arc;

use axum::{
    Extension, Json,
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use sqlx::{MySqlPool, Row};

use crate::{
    access::assert_pelanggan_access,
    drive::{
        delete_kontrak_tree, ensure_kontrak_tree, ensure_pelanggan_tree, parse_drive_folder_id,
    },
    error::ApiError,
    models::{
        AuthUser, ContractRow, CreateContractRequest, ExtendContractRequest,
        NextKontrakCodeResponse, Page, Pagination, StatusResponse, UpdateContractRequest,
        UpgradeContractRequest,
    },
    state::AppState,
    util::{
        pagination, parse_date, require_admin, require_business_read, trim_opt,
        validate_opt_string_length, validate_string_length,
    },
};

const VALID_STATUS: &[&str] = &[
    "Beroperasi",
    "Belum Beroperasi",
    "Proses Perpanjangan",
    "Diperpanjang",
    "Di-upgrade",
    "Berhenti",
];

/// Menyelaraskan status kontrak aktif yang periodenya sudah berakhir.
///
/// Status histori (`Diperpanjang`, `Di-upgrade`, dan `Berhenti`) tidak disentuh
/// karena status tersebut merupakan hasil tindakan bisnis yang sudah selesai.
pub async fn sync_expired_contract_statuses(database: &MySqlPool) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE lokasi \
         SET status_kontrak = 'Proses Perpanjangan' \
         WHERE periode_berakhir < CURDATE() \
           AND status_kontrak IN ('Beroperasi', 'Belum Beroperasi')",
    )
    .execute(database)
    .await?;

    Ok(result.rows_affected())
}

pub async fn delete_contract(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    axum::extract::Path(id): axum::extract::Path<u64>,
) -> Result<Json<StatusResponse>, ApiError> {
    require_admin(&auth.role)?;

    let mut tx = state.database.begin().await.map_err(ApiError::database)?;

    // Kunci kontrak dan kerjakan seluruh penghapusan database dalam satu transaksi.
    let existing = sqlx::query(
        "SELECT l.pelanggan_id, l.link_folder_berkas, p.nama_pelanggan, l.nama_lokasi, \
         COALESCE(CAST(l.periode_awal AS CHAR), '') AS periode_awal, \
         COALESCE(CAST(l.periode_berakhir AS CHAR), '') AS periode_berakhir \
         FROM lokasi l JOIN pelanggan p ON p.id = l.pelanggan_id WHERE l.id = ? FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!(contract_id = id, error = %e, "Failed to query contract details for delete");
        ApiError::internal(format!("Gagal membaca data kontrak untuk hapus: {e}"))
    })?
    .ok_or_else(|| ApiError::not_found("Kontrak tidak ditemukan"))?;

    let pelanggan_id: u64 = existing
        .try_get::<u64, _>("pelanggan_id")
        .or_else(|_| existing.try_get::<i64, _>("pelanggan_id").map(|v| v as u64))
        .unwrap_or_default();
    let link_folder: Option<String> = existing.try_get("link_folder_berkas").unwrap_or(None);

    // Check user has access to this pelanggan
    assert_pelanggan_access(&state.database, auth.id, &auth.role, pelanggan_id).await?;

    // Delete linked dependent records first to respect FK constraints
    sqlx::query("UPDATE lokasi SET previous_lokasi_id = NULL WHERE previous_lokasi_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::database)?;
    sqlx::query("DELETE FROM billing_details WHERE lokasi_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::database)?;
    sqlx::query("DELETE FROM billing WHERE lokasi_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::database)?;
    sqlx::query("DELETE FROM rute_fo WHERE lokasi_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::database)?;
    sqlx::query("DELETE FROM dokumen WHERE lokasi_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::database)?;

    sqlx::query("DELETE FROM lokasi WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            tracing::error!(contract_id = id, error = %e, "Failed to delete lokasi row");
            ApiError::internal(format!("Gagal menghapus lokasi: {e}"))
        })?;

    if let Some(ref link) = link_folder
        && let Some(folder_id) = parse_drive_folder_id(link)
        && let Err(error) = delete_kontrak_tree(&state.drive, &folder_id).await
    {
        tx.rollback().await.map_err(ApiError::database)?;
        return Err(ApiError::drive(error));
    }

    tx.commit().await.map_err(ApiError::database)?;
    Ok(Json(StatusResponse { status: "deleted" }))
}

const VALID_SHARING: &[&str] = &["1/2", "1/4", "1/8", "1/16", "1/32"];

fn normalize_core(value: Option<String>) -> Result<Option<String>, ApiError> {
    let Some(value) = value else {
        return Ok(None);
    };

    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }

    let number = value
        .strip_suffix(" Core")
        .or_else(|| value.strip_suffix(" core"))
        .unwrap_or(value)
        .trim();
    let parsed = number.parse::<u64>().map_err(|_| {
        ApiError::bad_request("Core harus berupa angka bulat positif, contoh: 1 atau 4.")
    })?;
    if parsed == 0 {
        return Err(ApiError::bad_request(
            "Core harus berupa angka bulat positif, minimal 1.",
        ));
    }

    Ok(Some(format!("{parsed} Core")))
}

fn normalize_sharing_core(value: Option<String>) -> Result<Option<String>, ApiError> {
    let sharing = trim_opt(value);
    if let Some(ref value) = sharing
        && !VALID_SHARING.contains(&value.as_str())
    {
        return Err(ApiError::bad_request(
            "Sharing Core harus salah satu dari 1/2, 1/4, 1/8, 1/16, 1/32.",
        ));
    }
    Ok(sharing)
}

fn normalize_core_selection(
    core: Option<String>,
    sharing_core: Option<String>,
    require_value: bool,
) -> Result<(Option<String>, Option<String>), ApiError> {
    let core = normalize_core(core)?;
    let sharing_core = normalize_sharing_core(sharing_core)?;

    if core.is_some() && sharing_core.is_some() {
        return Err(ApiError::bad_request(
            "Core dan Sharing Core tidak boleh diisi bersamaan.",
        ));
    }
    if require_value && core.is_none() && sharing_core.is_none() {
        return Err(ApiError::bad_request("Isi Core atau pilih Sharing Core."));
    }

    Ok((core, sharing_core))
}

pub async fn list_contracts(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Query(query): Query<Pagination>,
) -> Result<Json<Page<ContractRow>>, ApiError> {
    require_business_read(&auth.role)?;

    // Jalankan sinkronisasi sebelum membaca/filter data agar kontrak yang baru
    // melewati tanggal berakhir langsung tersimpan sebagai Proses Perpanjangan.
    let updated = sync_expired_contract_statuses(&state.database)
        .await
        .map_err(ApiError::database)?;
    if updated > 0 {
        tracing::info!(updated, "Contract statuses synchronized after expiration");
    }

    let search_term = query.search.as_deref().unwrap_or("").trim();
    let has_search = !search_term.is_empty();
    let search_pattern = format!("%{}%", search_term);

    let status_list: Vec<String> = query
        .status
        .as_deref()
        .unwrap_or("")
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let has_status = !status_list.is_empty();
    let status_placeholders = status_list
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(", ");
    let status_in_clause = format!("l.status_kontrak IN ({})", status_placeholders);

    let active_only = query.active_only.unwrap_or(false);
    let active_clause = if active_only {
        " AND ((l.periode_awal <= CURDATE() AND l.periode_berakhir >= CURDATE()) OR l.status_kontrak = 'Proses Perpanjangan')"
    } else {
        ""
    };
    let order_clause = if active_only {
        "l.periode_berakhir ASC"
    } else {
        "p.nama_pelanggan ASC, l.nama_lokasi ASC, l.periode_awal ASC"
    };

    let (page, page_size, offset) = pagination(query);
    let total: i64 = if has_search {
        if has_status {
            {
                let sql = format!(
                    "SELECT COUNT(*) FROM lokasi l \
                     JOIN pelanggan p ON p.id = l.pelanggan_id \
                     WHERE (? <> 'isp' OR EXISTS ( \
                       SELECT 1 FROM user_pelanggan_access a \
                       WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id \
                     )) AND ( \
                        p.nama_pelanggan LIKE ? OR \
                        l.no_kontrak LIKE ? OR \
                        l.nama_lokasi LIKE ? OR \
                        l.kode_kontrak LIKE ? \
                       ) AND {} {}",
                    status_in_clause, active_clause
                );
                let mut q = sqlx::query_scalar(&sql)
                    .bind(&auth.role)
                    .bind(auth.id)
                    .bind(&search_pattern)
                    .bind(&search_pattern)
                    .bind(&search_pattern)
                    .bind(&search_pattern);
                for s in &status_list {
                    q = q.bind(s);
                }
                q.fetch_one(&state.database).await
            }
        } else {
            let sql = format!(
                "SELECT COUNT(*) FROM lokasi l \
                 JOIN pelanggan p ON p.id = l.pelanggan_id \
                 WHERE (? <> 'isp' OR EXISTS ( \
                   SELECT 1 FROM user_pelanggan_access a \
                   WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id \
                 )) AND ( \
                   p.nama_pelanggan LIKE ? OR \
                   l.no_kontrak LIKE ? OR \
                   l.nama_lokasi LIKE ? OR \
                   l.kode_kontrak LIKE ? \
                 ){}",
                active_clause
            );
            sqlx::query_scalar(&sql)
                .bind(&auth.role)
                .bind(auth.id)
                .bind(&search_pattern)
                .bind(&search_pattern)
                .bind(&search_pattern)
                .bind(&search_pattern)
                .fetch_one(&state.database)
                .await
        }
    } else if has_status {
        let sql = format!(
            "SELECT COUNT(*) FROM lokasi l \
             JOIN pelanggan p ON p.id = l.pelanggan_id \
             WHERE (? <> 'isp' OR EXISTS ( \
               SELECT 1 FROM user_pelanggan_access a \
               WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id \
              )) AND {} {}",
            status_in_clause, active_clause
        );
        let mut q = sqlx::query_scalar(&sql).bind(&auth.role).bind(auth.id);
        for s in &status_list {
            q = q.bind(s);
        }
        q.fetch_one(&state.database).await
    } else {
        let sql = format!(
            "SELECT COUNT(*) FROM lokasi l \
             WHERE (? <> 'isp' OR EXISTS ( \
               SELECT 1 FROM user_pelanggan_access a \
               WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id \
             )){}",
            active_clause
        );
        sqlx::query_scalar(&sql)
            .bind(&auth.role)
            .bind(auth.id)
            .fetch_one(&state.database)
            .await
    }
    .map_err(ApiError::database)?;

    let rows = if has_search {
        if has_status {
            {
                let sql = format!(
                    "SELECT l.id, l.kode_kontrak, l.no_kontrak AS nomor_kontrak, l.pelanggan_id, \
                            p.nama_pelanggan, l.nama_lokasi, l.status_kontrak, \
                            CAST(l.periode_awal AS CHAR) AS periode_awal, \
                            CAST(l.periode_berakhir AS CHAR) AS periode_berakhir, \
                            l.kategori AS jalur, l.link_folder_berkas, \
                            l.core, l.sharing_core, l.durasi_kontrak_bulan, \
                            CAST(l.nilai_kontrak AS DOUBLE) AS nilai_kontrak, \
                            CAST(l.biaya_aktivasi AS DOUBLE) AS biaya_aktivasi, \
                            CAST(l.perbulan AS DOUBLE) AS perbulan, \
                            CAST(l.nilai_periode_aktif AS DOUBLE) AS nilai_periode_aktif \
                     FROM lokasi l JOIN pelanggan p ON p.id = l.pelanggan_id \
                     WHERE (? <> 'isp' OR EXISTS ( \
                       SELECT 1 FROM user_pelanggan_access a \
                       WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id \
                     )) AND ( \
                        p.nama_pelanggan LIKE ? OR \
                        l.no_kontrak LIKE ? OR \
                        l.nama_lokasi LIKE ? OR \
                        l.kode_kontrak LIKE ? \
                      ) AND {} {}\
                     ORDER BY {} \
                     LIMIT ? OFFSET ?",
                    status_in_clause, active_clause, order_clause
                );
                let mut q = sqlx::query(&sql)
                    .bind(&auth.role)
                    .bind(auth.id)
                    .bind(&search_pattern)
                    .bind(&search_pattern)
                    .bind(&search_pattern)
                    .bind(&search_pattern);
                for s in &status_list {
                    q = q.bind(s);
                }
                q.bind(page_size)
                    .bind(offset)
                    .fetch_all(&state.database)
                    .await
            }
        } else {
            let sql = format!(
                "SELECT l.id, l.kode_kontrak, l.no_kontrak AS nomor_kontrak, l.pelanggan_id, \
                        p.nama_pelanggan, l.nama_lokasi, l.status_kontrak, \
                        CAST(l.periode_awal AS CHAR) AS periode_awal, \
                        CAST(l.periode_berakhir AS CHAR) AS periode_berakhir, \
                        l.kategori AS jalur, l.link_folder_berkas, \
                        l.core, l.sharing_core, l.durasi_kontrak_bulan, \
                        CAST(l.nilai_kontrak AS DOUBLE) AS nilai_kontrak, \
                        CAST(l.biaya_aktivasi AS DOUBLE) AS biaya_aktivasi, \
                        CAST(l.perbulan AS DOUBLE) AS perbulan, \
                        CAST(l.nilai_periode_aktif AS DOUBLE) AS nilai_periode_aktif \
                 FROM lokasi l JOIN pelanggan p ON p.id = l.pelanggan_id \
                 WHERE (? <> 'isp' OR EXISTS ( \
                   SELECT 1 FROM user_pelanggan_access a \
                   WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id \
                 )) AND ( \
                    p.nama_pelanggan LIKE ? OR \
                    l.no_kontrak LIKE ? OR \
                    l.nama_lokasi LIKE ? OR \
                    l.kode_kontrak LIKE ? \
                  ){} \
                  ORDER BY {} \
                  LIMIT ? OFFSET ?",
                active_clause, order_clause
            );
            sqlx::query(&sql)
                .bind(&auth.role)
                .bind(auth.id)
                .bind(&search_pattern)
                .bind(&search_pattern)
                .bind(&search_pattern)
                .bind(&search_pattern)
                .bind(page_size)
                .bind(offset)
                .fetch_all(&state.database)
                .await
        }
    } else if has_status {
        let sql = format!(
            "SELECT l.id, l.kode_kontrak, l.no_kontrak AS nomor_kontrak, l.pelanggan_id, \
                    p.nama_pelanggan, l.nama_lokasi, l.status_kontrak, \
                    CAST(l.periode_awal AS CHAR) AS periode_awal, \
                    CAST(l.periode_berakhir AS CHAR) AS periode_berakhir, \
                    l.kategori AS jalur, l.link_folder_berkas, \
                    l.core, l.sharing_core, l.durasi_kontrak_bulan, \
                    CAST(l.nilai_kontrak AS DOUBLE) AS nilai_kontrak, \
                    CAST(l.biaya_aktivasi AS DOUBLE) AS biaya_aktivasi, \
                    CAST(l.perbulan AS DOUBLE) AS perbulan, \
                    CAST(l.nilai_periode_aktif AS DOUBLE) AS nilai_periode_aktif \
             FROM lokasi l JOIN pelanggan p ON p.id = l.pelanggan_id \
             WHERE (? <> 'isp' OR EXISTS ( \
               SELECT 1 FROM user_pelanggan_access a \
               WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id \
              )) AND {} {} \
              ORDER BY {} \
              LIMIT ? OFFSET ?",
            status_in_clause, active_clause, order_clause
        );
        let mut q = sqlx::query(&sql).bind(&auth.role).bind(auth.id);
        for s in &status_list {
            q = q.bind(s);
        }
        q.bind(page_size)
            .bind(offset)
            .fetch_all(&state.database)
            .await
    } else {
        let sql = format!(
            "SELECT l.id, l.kode_kontrak, l.no_kontrak AS nomor_kontrak, l.pelanggan_id, \
                    p.nama_pelanggan, l.nama_lokasi, l.status_kontrak, \
                    CAST(l.periode_awal AS CHAR) AS periode_awal, \
                    CAST(l.periode_berakhir AS CHAR) AS periode_berakhir, \
                    l.kategori AS jalur, l.link_folder_berkas, \
                    l.core, l.sharing_core, l.durasi_kontrak_bulan, \
                    CAST(l.nilai_kontrak AS DOUBLE) AS nilai_kontrak, \
                    CAST(l.biaya_aktivasi AS DOUBLE) AS biaya_aktivasi, \
                    CAST(l.perbulan AS DOUBLE) AS perbulan, \
                    CAST(l.nilai_periode_aktif AS DOUBLE) AS nilai_periode_aktif \
             FROM lokasi l JOIN pelanggan p ON p.id = l.pelanggan_id \
             WHERE (? <> 'isp' OR EXISTS ( \
               SELECT 1 FROM user_pelanggan_access a \
               WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id \
             )){} \
              ORDER BY {} \
              LIMIT ? OFFSET ?",
            active_clause, order_clause
        );
        sqlx::query(&sql)
            .bind(&auth.role)
            .bind(auth.id)
            .bind(page_size)
            .bind(offset)
            .fetch_all(&state.database)
            .await
    }
    .map_err(ApiError::database)?;
    let data = rows
        .into_iter()
        .map(|row| {
            let mut contract = map_contract_row(row);
            if auth.role == "isp" {
                contract.link_folder_berkas = None;
            }
            contract
        })
        .collect();
    Ok(Json(Page {
        data,
        total: total.max(0) as u64,
        page,
        page_size,
    }))
}

pub async fn get_next_kontrak_code(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
) -> Result<Json<NextKontrakCodeResponse>, ApiError> {
    require_admin(&auth.role)?;
    let year = chrono::Utc::now().format("%Y").to_string();
    let pattern = format!("CTR-{}-%", year);

    // Get the max sequence number for this year
    let row = sqlx::query(
        "SELECT MAX(CAST(SUBSTRING(kode_kontrak, 10) AS UNSIGNED)) AS max_seq \
         FROM lokasi WHERE kode_kontrak LIKE ?",
    )
    .bind(&pattern)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?;

    let max_seq: i64 = match row {
        Some(r) => {
            // Try to get as i64 first, then try u64
            if let Ok(v) = r.try_get::<i64, _>("max_seq") {
                v
            } else if let Ok(v) = r.try_get::<u64, _>("max_seq") {
                v as i64
            } else {
                0i64
            }
        }
        None => 0,
    };

    let next_seq = max_seq + 1;
    let kode_kontrak = format!("CTR-{}-{:04}", year, next_seq);

    Ok(Json(NextKontrakCodeResponse { kode_kontrak }))
}

pub async fn create_contract(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Json(input): Json<CreateContractRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&auth.role)?;

    let kode_kontrak = input.kode_kontrak.trim().to_owned();
    let nama_lokasi = input.nama_lokasi.trim().to_owned();
    let periode_awal = input.periode_awal.trim().to_owned();
    let periode_berakhir = input.periode_berakhir.trim().to_owned();
    if kode_kontrak.is_empty() {
        return Err(ApiError::bad_request("Kode kontrak wajib diisi."));
    }
    if nama_lokasi.is_empty() {
        return Err(ApiError::bad_request("Nama lokasi wajib diisi."));
    }
    let max_len = state.max_string_length;
    validate_string_length(&kode_kontrak, max_len, "Kode kontrak")?;
    validate_string_length(&nama_lokasi, max_len, "Nama lokasi")?;
    validate_opt_string_length(input.no_kontrak.as_deref(), max_len, "No. kontrak")?;
    validate_opt_string_length(input.keterangan.as_deref(), max_len, "Keterangan")?;
    validate_opt_string_length(input.core.as_deref(), max_len, "Core")?;
    validate_opt_string_length(input.sharing_core.as_deref(), max_len, "Sharing core")?;
    parse_date(&periode_awal)?;
    parse_date(&periode_berakhir)?;
    if parse_date(&periode_berakhir)? < parse_date(&periode_awal)? {
        return Err(ApiError::bad_request(
            "Periode berakhir harus >= periode awal.",
        ));
    }

    let status = if let Some(s) = input
        .status_kontrak
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        s.to_owned()
    } else {
        let today = chrono::Local::now().naive_local().date();
        let start = parse_date(&periode_awal)?;
        let end = parse_date(&periode_berakhir)?;
        if today < start {
            "Belum Beroperasi".to_owned()
        } else if today <= end {
            "Beroperasi".to_owned()
        } else {
            "Proses Perpanjangan".to_owned()
        }
    };
    if !VALID_STATUS.contains(&status.as_str()) {
        return Err(ApiError::bad_request("Status kontrak tidak valid."));
    }

    let (core, sharing_core) = normalize_core_selection(input.core, input.sharing_core, true)?;

    let pelanggan_row = sqlx::query(
        "SELECT id, nama_pelanggan, kode_pelanggan, link_folder_berkas FROM pelanggan WHERE id = ? LIMIT 1",
    )
    .bind(input.pelanggan_id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?;
    let Some(pelanggan_row) = pelanggan_row else {
        return Err(ApiError::not_found("Pelanggan tidak ditemukan."));
    };
    let nama_pelanggan: String = pelanggan_row
        .try_get("nama_pelanggan")
        .map_err(ApiError::database)?;
    let kode_pelanggan: Option<String> = pelanggan_row.try_get("kode_pelanggan").unwrap_or(None);
    let link_folder: Option<String> = pelanggan_row.try_get("link_folder_berkas").unwrap_or(None);

    // Resolve parent folder ID for kontrak tree
    let parent_folder_id = {
        let id = link_folder
            .as_deref()
            .and_then(parse_drive_folder_id)
            .filter(|s| !s.is_empty());
        if let Some(id) = id {
            id
        } else {
            let (new_id, new_url) = ensure_pelanggan_tree(
                &state.drive,
                kode_pelanggan.as_deref().unwrap_or(""),
                &nama_pelanggan,
            )
            .await
            .map_err(ApiError::drive)?;
            sqlx::query("UPDATE pelanggan SET link_folder_berkas = ? WHERE id = ?")
                .bind(&new_url)
                .bind(input.pelanggan_id)
                .execute(&state.database)
                .await
                .map_err(ApiError::database)?;
            new_id
        }
    };

    let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM lokasi WHERE kode_kontrak = ?")
        .bind(&kode_kontrak)
        .fetch_one(&state.database)
        .await
        .map_err(ApiError::database)?;
    if exists > 0 {
        return Err(ApiError::conflict("Kode kontrak sudah digunakan."));
    }

    let kategori = trim_opt(input.kategori);
    let no_kontrak = trim_opt(input.no_kontrak);
    let keterangan = trim_opt(input.keterangan);
    let biaya_aktivasi = input.biaya_aktivasi.unwrap_or(0.0);
    let perbulan = input.perbulan.unwrap_or(0.0);
    let nilai_periode_aktif = input.nilai_periode_aktif.unwrap_or(0.0);

    let mut tx = state.database.begin().await.map_err(ApiError::database)?;
    let result = sqlx::query(
        "INSERT INTO lokasi \
         (kode_kontrak, pelanggan_id, kategori, nama_lokasi, core, sharing_core, \
          periode_awal, periode_berakhir, durasi_kontrak_bulan, no_kontrak, \
          nilai_kontrak, biaya_aktivasi, perbulan, nilai_periode_aktif, \
          status_kontrak, keterangan) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&kode_kontrak)
    .bind(input.pelanggan_id)
    .bind(&kategori)
    .bind(&nama_lokasi)
    .bind(&core)
    .bind(&sharing_core)
    .bind(&periode_awal)
    .bind(&periode_berakhir)
    .bind(input.durasi_kontrak_bulan)
    .bind(&no_kontrak)
    .bind(input.nilai_kontrak)
    .bind(biaya_aktivasi)
    .bind(perbulan)
    .bind(nilai_periode_aktif)
    .bind(&status)
    .bind(&keterangan)
    .execute(&mut *tx)
    .await
    .map_err(ApiError::database)?;
    let id = result.last_insert_id();

    let (_, link) = match ensure_kontrak_tree(
        &state.drive,
        &parent_folder_id,
        &nama_lokasi,
        &periode_awal,
        &periode_berakhir,
    )
    .await
    {
        Ok(folder) => folder,
        Err(error) => {
            tx.rollback().await.map_err(ApiError::database)?;
            return Err(ApiError::drive(error));
        }
    };
    sqlx::query("UPDATE lokasi SET link_folder_berkas = ? WHERE id = ?")
        .bind(&link)
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::database)?;

    tx.commit().await.map_err(ApiError::database)?;

    Ok((
        StatusCode::CREATED,
        Json(ContractRow {
            id,
            kode_kontrak,
            nomor_kontrak: no_kontrak,
            pelanggan_id: input.pelanggan_id,
            nama_pelanggan,
            nama_lokasi,
            status_kontrak: status,
            periode_awal,
            periode_berakhir,
            jalur: kategori,
            link_folder_berkas: Some(link),
            core,
            sharing_core,
            durasi_kontrak_bulan: input.durasi_kontrak_bulan,
            nilai_kontrak: input.nilai_kontrak,
            biaya_aktivasi: input.biaya_aktivasi,
            perbulan: input.perbulan,
            nilai_periode_aktif: input.nilai_periode_aktif,
        }),
    ))
}

pub async fn update_contract(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    axum::extract::Path(id): axum::extract::Path<u64>,
    Json(input): Json<UpdateContractRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&auth.role)?;

    // Fetch existing contract to get current values
    let existing = sqlx::query("SELECT * FROM lokasi WHERE id = ?")
        .bind(id)
        .fetch_optional(&state.database)
        .await
        .map_err(ApiError::database)?
        .ok_or_else(|| ApiError::not_found("Kontrak tidak ditemukan"))?;

    // Get existing values
    let existing_kode: String = existing.try_get("kode_kontrak").unwrap_or_default();
    let existing_pelanggan_id: u64 = existing.try_get("pelanggan_id").unwrap_or_default();
    let existing_nama_lokasi: String = existing.try_get("nama_lokasi").unwrap_or_default();
    let existing_periode_awal: String = existing.try_get("periode_awal").unwrap_or_default();
    let existing_periode_berakhir: String =
        existing.try_get("periode_berakhir").unwrap_or_default();
    let existing_status: String = existing.try_get("status_kontrak").unwrap_or_default();
    let existing_kategori: String = existing.try_get("kategori").unwrap_or_default();
    let existing_core: Option<String> = existing.try_get("core").unwrap_or(None);
    let existing_sharing_core: Option<String> = existing.try_get("sharing_core").unwrap_or(None);
    let existing_no_kontrak: Option<String> = existing.try_get("no_kontrak").unwrap_or(None);
    let existing_durasi: Option<u32> = existing.try_get("durasi_kontrak_bulan").unwrap_or(None);
    let existing_nilai: Option<f64> = existing.try_get::<f64, _>("nilai_kontrak").ok();
    let existing_biaya: Option<f64> = existing.try_get::<f64, _>("biaya_aktivasi").ok();
    let existing_perbulan: Option<f64> = existing.try_get::<f64, _>("perbulan").ok();
    let existing_nilai_periode: Option<f64> =
        existing.try_get::<f64, _>("nilai_periode_aktif").ok();
    let existing_keterangan: Option<String> = existing.try_get("keterangan").unwrap_or(None);

    // Validate and prepare kode_kontrak
    let kode_kontrak = if let Some(ref kode) = input.kode_kontrak {
        let kode = kode.trim();
        if kode.is_empty() {
            return Err(ApiError::bad_request("Kode kontrak tidak boleh kosong"));
        }
        if kode != existing_kode {
            let count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM lokasi WHERE kode_kontrak = ? AND id != ?",
            )
            .bind(kode)
            .bind(id)
            .fetch_one(&state.database)
            .await
            .map_err(ApiError::database)?;
            if count > 0 {
                return Err(ApiError::conflict("Kode kontrak sudah digunakan"));
            }
        }
        kode.to_owned()
    } else {
        existing_kode
    };

    // Validate and prepare nama_lokasi
    let nama_lokasi = if let Some(ref nl) = input.nama_lokasi {
        let nl = nl.trim();
        if nl.is_empty() {
            return Err(ApiError::bad_request("Nama lokasi tidak boleh kosong"));
        }
        nl.to_owned()
    } else {
        existing_nama_lokasi
    };

    // Validate and prepare periode_awal
    let periode_awal = if let Some(ref pa) = input.periode_awal {
        parse_date(pa)?.format("%Y-%m-%d").to_string()
    } else {
        existing_periode_awal
    };

    // Validate and prepare periode_berakhir
    let periode_berakhir = if let Some(ref pb) = input.periode_berakhir {
        parse_date(pb)?.format("%Y-%m-%d").to_string()
    } else {
        existing_periode_berakhir
    };

    // Validate dates
    let start = parse_date(&periode_awal)?;
    let end = parse_date(&periode_berakhir)?;
    if end < start {
        return Err(ApiError::bad_request(
            "Tanggal berakhir harus setelah tanggal mulai",
        ));
    }

    // Validate status
    let status = if let Some(ref s) = input.status_kontrak {
        if !VALID_STATUS.contains(&s.as_str()) {
            return Err(ApiError::bad_request(format!(
                "Status tidak valid. Pilih: {}",
                VALID_STATUS.join(", ")
            )));
        }
        s.to_owned()
    } else {
        existing_status
    };

    // Validate kategori
    let kategori = if let Some(ref k) = input.kategori {
        trim_opt(Some(k.clone())).unwrap_or(existing_kategori)
    } else {
        existing_kategori
    };

    // If either field is present, the request explicitly replaces the capacity mode.
    // If both are omitted, retain the existing selection for partial updates.
    let (core, sharing_core) = if input.core.is_none() && input.sharing_core.is_none() {
        (existing_core.clone(), existing_sharing_core.clone())
    } else {
        normalize_core_selection(input.core.clone(), input.sharing_core.clone(), true)?
    };

    let no_kontrak = if let Some(ref v) = input.no_kontrak {
        trim_opt(Some(v.clone()))
    } else {
        existing_no_kontrak.clone()
    };
    let durasi = input.durasi_kontrak_bulan.or(existing_durasi);
    let nilai_kontrak = input.nilai_kontrak.or(existing_nilai);
    let biaya_aktivasi = input.biaya_aktivasi.or(existing_biaya);
    let perbulan = input.perbulan.or(existing_perbulan);
    let nilai_periode_aktif = input.nilai_periode_aktif.or(existing_nilai_periode);
    let keterangan = if let Some(ref v) = input.keterangan {
        trim_opt(Some(v.clone()))
    } else {
        existing_keterangan.clone()
    };
    let pelanggan_id = input.pelanggan_id.unwrap_or(existing_pelanggan_id);

    // Execute update
    sqlx::query(
        "UPDATE lokasi SET \
         pelanggan_id = ?, kode_kontrak = ?, nama_lokasi = ?, periode_awal = ?, \
         periode_berakhir = ?, status_kontrak = ?, kategori = ?, \
         core = ?, sharing_core = ?, no_kontrak = ?, durasi_kontrak_bulan = ?, \
         nilai_kontrak = ?, biaya_aktivasi = ?, perbulan = ?, nilai_periode_aktif = ?, \
         keterangan = ? WHERE id = ?",
    )
    .bind(pelanggan_id)
    .bind(&kode_kontrak)
    .bind(&nama_lokasi)
    .bind(&periode_awal)
    .bind(&periode_berakhir)
    .bind(&status)
    .bind(&kategori)
    .bind(&core)
    .bind(&sharing_core)
    .bind(&no_kontrak)
    .bind(durasi)
    .bind(nilai_kontrak)
    .bind(biaya_aktivasi)
    .bind(perbulan)
    .bind(nilai_periode_aktif)
    .bind(&keterangan)
    .bind(id)
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;

    // Fetch updated record
    let row = sqlx::query(
        "SELECT l.*, p.nama_pelanggan FROM lokasi l \
         JOIN pelanggan p ON p.id = l.pelanggan_id WHERE l.id = ?",
    )
    .bind(id)
    .fetch_one(&state.database)
    .await
    .map_err(ApiError::database)?;

    Ok((StatusCode::OK, Json(map_contract_row(row))))
}

fn map_contract_row(row: sqlx::mysql::MySqlRow) -> ContractRow {
    ContractRow {
        id: row.try_get("id").unwrap_or_default(),
        kode_kontrak: row.try_get("kode_kontrak").unwrap_or_default(),
        nomor_kontrak: row.try_get("nomor_kontrak").unwrap_or(None),
        pelanggan_id: row.try_get("pelanggan_id").unwrap_or_default(),
        nama_pelanggan: row.try_get("nama_pelanggan").unwrap_or_default(),
        nama_lokasi: row.try_get("nama_lokasi").unwrap_or_default(),
        status_kontrak: row.try_get("status_kontrak").unwrap_or_default(),
        periode_awal: row.try_get("periode_awal").unwrap_or_default(),
        periode_berakhir: row.try_get("periode_berakhir").unwrap_or_default(),
        jalur: row.try_get("jalur").unwrap_or(None),
        link_folder_berkas: row.try_get("link_folder_berkas").unwrap_or(None),
        core: row.try_get("core").unwrap_or(None),
        sharing_core: row.try_get("sharing_core").unwrap_or(None),
        durasi_kontrak_bulan: row.try_get("durasi_kontrak_bulan").unwrap_or(None),
        nilai_kontrak: row.try_get("nilai_kontrak").unwrap_or(None),
        biaya_aktivasi: row.try_get("biaya_aktivasi").unwrap_or(None),
        perbulan: row.try_get("perbulan").unwrap_or(None),
        nilai_periode_aktif: row.try_get("nilai_periode_aktif").unwrap_or(None),
    }
}

pub async fn extend_contract(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    axum::extract::Path(id): axum::extract::Path<u64>,
    Json(input): Json<ExtendContractRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&auth.role)?;

    let old_row = sqlx::query(
        "SELECT l.*, p.nama_pelanggan, p.kode_pelanggan, p.link_folder_berkas as pelanggan_link \
         FROM lokasi l JOIN pelanggan p ON p.id = l.pelanggan_id WHERE l.id = ?",
    )
    .bind(id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?
    .ok_or_else(|| ApiError::not_found("Kontrak lama tidak ditemukan"))?;

    let pelanggan_id: u64 = old_row
        .try_get("pelanggan_id")
        .map_err(ApiError::database)?;
    let nama_pelanggan: String = old_row
        .try_get("nama_pelanggan")
        .map_err(ApiError::database)?;
    let nama_lokasi: String = old_row.try_get("nama_lokasi").map_err(ApiError::database)?;
    let kategori: Option<String> = old_row.try_get("kategori").ok();
    let old_core: Option<String> = old_row.try_get("core").ok();
    let old_sharing: Option<String> = old_row.try_get("sharing_core").ok();
    let kode_pelanggan: Option<String> = old_row.try_get("kode_pelanggan").unwrap_or(None);
    let pelanggan_link: Option<String> = old_row.try_get("pelanggan_link").unwrap_or(None);

    let (core, sharing_core) = if input.core.is_none() && input.sharing_core.is_none() {
        (old_core, old_sharing)
    } else {
        normalize_core_selection(input.core.clone(), input.sharing_core.clone(), true)?
    };

    assert_pelanggan_access(&state.database, auth.id, &auth.role, pelanggan_id).await?;

    let kode_kontrak = if let Some(ref kode) = input.kode_kontrak {
        let trimmed = kode.trim();
        if trimmed.is_empty() {
            format!("CTR-{}-EXT-{}", chrono::Utc::now().format("%Y"), id)
        } else {
            trimmed.to_string()
        }
    } else {
        format!("CTR-{}-EXT-{}", chrono::Utc::now().format("%Y"), id)
    };

    let periode_awal = parse_date(&input.periode_awal)?
        .format("%Y-%m-%d")
        .to_string();
    let periode_berakhir = parse_date(&input.periode_berakhir)?
        .format("%Y-%m-%d")
        .to_string();
    let start = parse_date(&periode_awal)?;
    let end = parse_date(&periode_berakhir)?;
    let today = chrono::Local::now().naive_local().date();
    let status = if today < start {
        "Belum Beroperasi".to_owned()
    } else if today <= end {
        "Beroperasi".to_owned()
    } else {
        "Proses Perpanjangan".to_owned()
    };
    let no_kontrak = trim_opt(input.no_kontrak);
    let keterangan = trim_opt(input.keterangan);
    let biaya_aktivasi = input.biaya_aktivasi.unwrap_or(0.0);
    let perbulan = input.perbulan.unwrap_or(0.0);
    let nilai_periode_aktif = input.nilai_periode_aktif.unwrap_or(0.0);

    sqlx::query("UPDATE lokasi SET status_kontrak = 'Diperpanjang' WHERE id = ?")
        .bind(id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;

    let result = sqlx::query(
        "INSERT INTO lokasi \
         (kode_kontrak, pelanggan_id, kategori, nama_lokasi, core, sharing_core, \
          periode_awal, periode_berakhir, durasi_kontrak_bulan, no_kontrak, \
          nilai_kontrak, biaya_aktivasi, perbulan, nilai_periode_aktif, \
          status_kontrak, keterangan) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&kode_kontrak)
    .bind(pelanggan_id)
    .bind(&kategori)
    .bind(&nama_lokasi)
    .bind(&core)
    .bind(&sharing_core)
    .bind(&periode_awal)
    .bind(&periode_berakhir)
    .bind(input.durasi_kontrak_bulan)
    .bind(&no_kontrak)
    .bind(input.nilai_kontrak)
    .bind(biaya_aktivasi)
    .bind(perbulan)
    .bind(nilai_periode_aktif)
    .bind(&status)
    .bind(&keterangan)
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;

    let new_id = result.last_insert_id();

    // Resolve parent folder ID for kontrak tree
    let parent_folder_id = {
        let id = pelanggan_link
            .as_deref()
            .and_then(parse_drive_folder_id)
            .filter(|s| !s.is_empty());
        if let Some(id) = id {
            id
        } else {
            let (new_id, new_url) = ensure_pelanggan_tree(
                &state.drive,
                kode_pelanggan.as_deref().unwrap_or(""),
                &nama_pelanggan,
            )
            .await
            .map_err(ApiError::drive)?;
            sqlx::query("UPDATE pelanggan SET link_folder_berkas = ? WHERE id = ?")
                .bind(&new_url)
                .bind(pelanggan_id)
                .execute(&state.database)
                .await
                .map_err(ApiError::database)?;
            new_id
        }
    };

    let (_, link) = ensure_kontrak_tree(
        &state.drive,
        &parent_folder_id,
        &nama_lokasi,
        &periode_awal,
        &periode_berakhir,
    )
    .await
    .map_err(ApiError::drive)?;

    sqlx::query("UPDATE lokasi SET link_folder_berkas = ? WHERE id = ?")
        .bind(&link)
        .bind(new_id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;

    let new_row = sqlx::query(
        "SELECT l.*, p.nama_pelanggan FROM lokasi l JOIN pelanggan p ON p.id = l.pelanggan_id WHERE l.id = ?",
    )
    .bind(new_id)
    .fetch_one(&state.database)
    .await
    .map_err(ApiError::database)?;

    Ok((StatusCode::CREATED, Json(map_contract_row(new_row))))
}

pub async fn upgrade_contract(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    axum::extract::Path(id): axum::extract::Path<u64>,
    Json(input): Json<UpgradeContractRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&auth.role)?;

    let old_row = sqlx::query(
        "SELECT l.*, DATE_FORMAT(l.periode_awal, '%Y-%m-%d') AS periode_awal_text, \
         p.nama_pelanggan, p.kode_pelanggan, p.link_folder_berkas as pelanggan_link \
         FROM lokasi l JOIN pelanggan p ON p.id = l.pelanggan_id WHERE l.id = ?",
    )
    .bind(id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?
    .ok_or_else(|| ApiError::not_found("Kontrak lama tidak ditemukan"))?;

    let pelanggan_id: u64 = old_row
        .try_get("pelanggan_id")
        .map_err(ApiError::database)?;
    let nama_pelanggan: String = old_row
        .try_get("nama_pelanggan")
        .map_err(ApiError::database)?;
    let nama_lokasi: String = old_row.try_get("nama_lokasi").map_err(ApiError::database)?;
    let kode_pelanggan: Option<String> = old_row.try_get("kode_pelanggan").unwrap_or(None);
    let pelanggan_link: Option<String> = old_row.try_get("pelanggan_link").unwrap_or(None);

    assert_pelanggan_access(&state.database, auth.id, &auth.role, pelanggan_id).await?;

    let contract_start: String = old_row
        .try_get("periode_awal_text")
        .map_err(ApiError::database)?;
    let contract_start = parse_date(&contract_start)?;
    let upgrade_date = parse_date(&input.tanggal_mulai_upgrade)?;
    validate_upgrade_date(contract_start, upgrade_date)?;
    let truncated_end = upgrade_date.pred_opt().unwrap_or(upgrade_date);
    let truncated_end_str = truncated_end.format("%Y-%m-%d").to_string();
    let start_date_str = upgrade_date.format("%Y-%m-%d").to_string();

    let (core, sharing_core) =
        normalize_core_selection(input.core.clone(), input.sharing_core.clone(), true)?;

    let durasi = input.durasi_kontrak_bulan.unwrap_or(12);
    let end_date = upgrade_date
        .checked_add_signed(chrono::Duration::days((durasi * 30) as i64))
        .unwrap_or(upgrade_date);
    let end_date_str = end_date.format("%Y-%m-%d").to_string();

    sqlx::query(
        "UPDATE lokasi SET periode_berakhir = ?, status_kontrak = 'Di-upgrade' WHERE id = ?",
    )
    .bind(&truncated_end_str)
    .bind(id)
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;

    let kode_kontrak = if let Some(ref kode) = input.kode_kontrak {
        let trimmed = kode.trim();
        if trimmed.is_empty() {
            format!("CTR-{}-UPG-{}", chrono::Utc::now().format("%Y"), id)
        } else {
            trimmed.to_string()
        }
    } else {
        format!("CTR-{}-UPG-{}", chrono::Utc::now().format("%Y"), id)
    };

    let no_kontrak = trim_opt(input.no_kontrak);
    let keterangan = trim_opt(input.keterangan);
    let biaya_aktivasi = input.biaya_aktivasi.unwrap_or(0.0);
    let perbulan = input.perbulan.unwrap_or(0.0);
    let nilai_periode_aktif = input.nilai_periode_aktif.unwrap_or(0.0);

    let start = parse_date(&start_date_str)?;
    let end = parse_date(&end_date_str)?;
    let today = chrono::Local::now().naive_local().date();
    let status = if today < start {
        "Belum Beroperasi".to_owned()
    } else if today <= end {
        "Beroperasi".to_owned()
    } else {
        "Proses Perpanjangan".to_owned()
    };

    let result = sqlx::query(
        "INSERT INTO lokasi \
         (kode_kontrak, pelanggan_id, nama_lokasi, core, sharing_core, \
          periode_awal, periode_berakhir, durasi_kontrak_bulan, no_kontrak, \
          nilai_kontrak, biaya_aktivasi, perbulan, nilai_periode_aktif, \
          status_kontrak, keterangan) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&kode_kontrak)
    .bind(pelanggan_id)
    .bind(&nama_lokasi)
    .bind(&core)
    .bind(&sharing_core)
    .bind(&start_date_str)
    .bind(&end_date_str)
    .bind(durasi)
    .bind(&no_kontrak)
    .bind(input.nilai_kontrak)
    .bind(biaya_aktivasi)
    .bind(perbulan)
    .bind(nilai_periode_aktif)
    .bind(&status)
    .bind(&keterangan)
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;

    let new_id = result.last_insert_id();

    // Resolve parent folder ID for kontrak tree
    let parent_folder_id = {
        let id = pelanggan_link
            .as_deref()
            .and_then(parse_drive_folder_id)
            .filter(|s| !s.is_empty());
        if let Some(id) = id {
            id
        } else {
            let (new_id, new_url) = ensure_pelanggan_tree(
                &state.drive,
                kode_pelanggan.as_deref().unwrap_or(""),
                &nama_pelanggan,
            )
            .await
            .map_err(ApiError::drive)?;
            sqlx::query("UPDATE pelanggan SET link_folder_berkas = ? WHERE id = ?")
                .bind(&new_url)
                .bind(pelanggan_id)
                .execute(&state.database)
                .await
                .map_err(ApiError::database)?;
            new_id
        }
    };

    let (_, link) = ensure_kontrak_tree(
        &state.drive,
        &parent_folder_id,
        &nama_lokasi,
        &start_date_str,
        &end_date_str,
    )
    .await
    .map_err(ApiError::drive)?;

    sqlx::query("UPDATE lokasi SET link_folder_berkas = ? WHERE id = ?")
        .bind(&link)
        .bind(new_id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;

    let new_row = sqlx::query(
        "SELECT l.*, p.nama_pelanggan FROM lokasi l JOIN pelanggan p ON p.id = l.pelanggan_id WHERE l.id = ?",
    )
    .bind(new_id)
    .fetch_one(&state.database)
    .await
    .map_err(ApiError::database)?;

    Ok((StatusCode::CREATED, Json(map_contract_row(new_row))))
}

fn validate_upgrade_date(
    contract_start: chrono::NaiveDate,
    upgrade_date: chrono::NaiveDate,
) -> Result<(), ApiError> {
    if upgrade_date <= contract_start {
        return Err(ApiError::bad_request(
            "Tanggal upgrade harus setelah tanggal mulai kontrak. Gunakan edit kontrak untuk perubahan pada hari pertama.",
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{normalize_core, normalize_core_selection, validate_upgrade_date};

    fn date(value: &str) -> chrono::NaiveDate {
        chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").expect("tanggal pengujian valid")
    }

    #[test]
    fn rejects_upgrade_on_contract_start_date() {
        assert!(validate_upgrade_date(date("2026-07-24"), date("2026-07-24")).is_err());
    }

    #[test]
    fn rejects_upgrade_before_contract_start_date() {
        assert!(validate_upgrade_date(date("2026-07-24"), date("2026-07-23")).is_err());
    }

    #[test]
    fn accepts_upgrade_after_contract_start_date() {
        assert!(validate_upgrade_date(date("2026-07-24"), date("2026-07-25")).is_ok());
    }

    #[test]
    fn normalizes_manual_core_to_storage_format() {
        assert_eq!(
            normalize_core(Some(" 4 ".to_owned())).ok().flatten(),
            Some("4 Core".to_owned())
        );
        assert_eq!(
            normalize_core(Some("4 Core".to_owned())).ok().flatten(),
            Some("4 Core".to_owned())
        );
    }

    #[test]
    fn rejects_invalid_manual_core() {
        assert!(normalize_core(Some("0".to_owned())).is_err());
        assert!(normalize_core(Some("abc".to_owned())).is_err());
    }

    #[test]
    fn core_and_sharing_are_exclusive_and_one_is_required() {
        assert!(
            normalize_core_selection(Some("4".to_owned()), Some("1/4".to_owned()), true).is_err()
        );
        assert!(normalize_core_selection(None, None, true).is_err());
        assert!(normalize_core_selection(None, Some("1/4".to_owned()), true).is_ok());
    }
}
