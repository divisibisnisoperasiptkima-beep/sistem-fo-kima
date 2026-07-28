use std::sync::Arc;

use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use sqlx::Row;

use crate::{
    access::assert_pelanggan_access,
    drive::{ensure_pelanggan_tree, folder_url, parse_drive_folder_id, sanitize_folder_name},
    error::ApiError,
    kontrak::sync_expired_contract_statuses,
    models::{
        AuthUser, CreateCustomerRequest, CustomerRow, NextPelangganCodeResponse, Page, Pagination,
        UpdateCustomerRequest,
    },
    state::AppState,
    util::{optional_trim_or_keep, pagination, require_admin, require_business_read, trim_opt},
};

pub async fn get_next_pelanggan_code(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
) -> Result<Json<NextPelangganCodeResponse>, ApiError> {
    require_admin(&auth.role)?;
    let chars: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut buf = [0u8; 6];
    let mut attempts = 0;
    loop {
        let mut seed: u64 = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0)
            .wrapping_add(attempts);
        for i in 0..6 {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
            buf[i] = chars[(seed as usize) % chars.len()];
        }
        let code = format!("PLG-{}", std::str::from_utf8(&buf).unwrap());
        let exists: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM pelanggan WHERE kode_pelanggan = ?")
                .bind(&code)
                .fetch_one(&state.database)
                .await
                .map_err(ApiError::database)?;
        if exists == 0 {
            return Ok(Json(NextPelangganCodeResponse {
                kode_pelanggan: code,
            }));
        }
        attempts += 1;
        if attempts >= 10 {
            return Err(ApiError::internal(
                "Gagal menghasilkan kode pelanggan unik.",
            ));
        }
    }
}

pub async fn list_customers(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Query(query): Query<Pagination>,
) -> Result<Json<Page<CustomerRow>>, ApiError> {
    require_business_read(&auth.role)?;

    // Samakan status yang dipakai ringkasan pelanggan dengan daftar kontrak.
    let updated = sync_expired_contract_statuses(&state.database)
        .await
        .map_err(ApiError::database)?;
    if updated > 0 {
        tracing::info!(
            updated,
            "Customer summary statuses synchronized after expiration"
        );
    }

    let search_term = query.search.as_deref().unwrap_or("").trim();
    let has_search = !search_term.is_empty();
    let search_pattern = format!("%{}%", search_term);

    let (page, page_size, offset) = pagination(query);
    let total: i64 = if has_search {
        sqlx::query_scalar(
            "SELECT COUNT(*) FROM pelanggan p \
             WHERE (? <> 'isp' OR EXISTS ( \
               SELECT 1 FROM user_pelanggan_access a \
               WHERE a.user_id = ? AND a.pelanggan_id = p.id \
             )) AND ( \
               p.kode_pelanggan LIKE ? OR \
               p.nama_pelanggan LIKE ? OR \
               p.pic LIKE ? OR \
               p.telepon LIKE ? OR \
               p.email LIKE ? \
             )",
        )
        .bind(&auth.role)
        .bind(auth.id)
        .bind(&search_pattern)
        .bind(&search_pattern)
        .bind(&search_pattern)
        .bind(&search_pattern)
        .bind(&search_pattern)
        .fetch_one(&state.database)
        .await
    } else {
        sqlx::query_scalar(
            "SELECT COUNT(*) FROM pelanggan p \
             WHERE ? <> 'isp' OR EXISTS ( \
               SELECT 1 FROM user_pelanggan_access a \
               WHERE a.user_id = ? AND a.pelanggan_id = p.id \
             )",
        )
        .bind(&auth.role)
        .bind(auth.id)
        .fetch_one(&state.database)
        .await
    }
    .map_err(ApiError::database)?;

    let rows = if has_search {
        sqlx::query(
            "SELECT p.id, p.kode_pelanggan, p.nama_pelanggan, p.pic, p.telepon, p.email, \
                    p.link_folder_berkas, p.keterangan, \
                (SELECT COUNT(*) FROM lokasi WHERE pelanggan_id = p.id AND status_kontrak = 'Beroperasi') AS lokasi_beroperasi, \
                (SELECT COUNT(*) FROM lokasi WHERE pelanggan_id = p.id AND status_kontrak = 'Belum Beroperasi') AS lokasi_belum_beroperasi, \
                (SELECT COUNT(*) FROM lokasi WHERE pelanggan_id = p.id AND status_kontrak = 'Proses Perpanjangan') AS lokasi_proses_perpanjangan \
             FROM pelanggan p \
             WHERE (? <> 'isp' OR EXISTS ( \
               SELECT 1 FROM user_pelanggan_access a \
               WHERE a.user_id = ? AND a.pelanggan_id = p.id \
             )) AND ( \
               p.kode_pelanggan LIKE ? OR \
               p.nama_pelanggan LIKE ? OR \
               p.pic LIKE ? OR \
               p.telepon LIKE ? OR \
               p.email LIKE ? \
             ) \
             ORDER BY p.nama_pelanggan, p.id LIMIT ? OFFSET ?",
        )
        .bind(&auth.role)
        .bind(auth.id)
        .bind(&search_pattern)
        .bind(&search_pattern)
        .bind(&search_pattern)
        .bind(&search_pattern)
        .bind(&search_pattern)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.database)
        .await
    } else {
        sqlx::query(
            "SELECT p.id, p.kode_pelanggan, p.nama_pelanggan, p.pic, p.telepon, p.email, \
                    p.link_folder_berkas, p.keterangan, \
                (SELECT COUNT(*) FROM lokasi WHERE pelanggan_id = p.id AND status_kontrak = 'Beroperasi') AS lokasi_beroperasi, \
                (SELECT COUNT(*) FROM lokasi WHERE pelanggan_id = p.id AND status_kontrak = 'Belum Beroperasi') AS lokasi_belum_beroperasi, \
                (SELECT COUNT(*) FROM lokasi WHERE pelanggan_id = p.id AND status_kontrak = 'Proses Perpanjangan') AS lokasi_proses_perpanjangan \
             FROM pelanggan p \
             WHERE ? <> 'isp' OR EXISTS ( \
               SELECT 1 FROM user_pelanggan_access a \
               WHERE a.user_id = ? AND a.pelanggan_id = p.id \
             ) \
             ORDER BY p.nama_pelanggan, p.id LIMIT ? OFFSET ?",
        )
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
        .map(|row| CustomerRow {
            id: row.try_get("id").unwrap_or_default(),
            kode_pelanggan: row.try_get("kode_pelanggan").unwrap_or(None),
            nama_pelanggan: row.try_get("nama_pelanggan").unwrap_or_default(),
            pic: row.try_get("pic").unwrap_or(None),
            telepon: row.try_get("telepon").unwrap_or(None),
            email: row.try_get("email").unwrap_or(None),
            link_folder_berkas: if auth.role == "isp" {
                None
            } else {
                row.try_get("link_folder_berkas").unwrap_or(None)
            },
            keterangan: row.try_get("keterangan").unwrap_or(None),
            lokasi_beroperasi: row.try_get("lokasi_beroperasi").unwrap_or(0),
            lokasi_belum_beroperasi: row.try_get("lokasi_belum_beroperasi").unwrap_or(0),
            lokasi_proses_perpanjangan: row.try_get("lokasi_proses_perpanjangan").unwrap_or(0),
        })
        .collect();
    Ok(Json(Page {
        data,
        total: total.max(0) as u64,
        page,
        page_size,
    }))
}

pub async fn create_customer(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Json(input): Json<CreateCustomerRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&auth.role)?;

    let nama_pelanggan = input.nama_pelanggan.trim().to_owned();
    if nama_pelanggan.is_empty() {
        return Err(ApiError::bad_request("Nama pelanggan wajib diisi."));
    }
    let kode_pelanggan = trim_opt(input.kode_pelanggan);
    let pic = trim_opt(input.pic);
    let telepon = trim_opt(input.telepon);
    let email = trim_opt(input.email);
    let keterangan = trim_opt(input.keterangan);

    if let Some(ref kode) = kode_pelanggan {
        let exists: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM pelanggan WHERE kode_pelanggan = ?")
                .bind(kode)
                .fetch_one(&state.database)
                .await
                .map_err(ApiError::database)?;
        if exists > 0 {
            return Err(ApiError::conflict("Kode pelanggan sudah digunakan."));
        }
    }

    let result = sqlx::query(
        "INSERT INTO pelanggan \
         (kode_pelanggan, nama_pelanggan, pic, telepon, email, keterangan) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&kode_pelanggan)
    .bind(&nama_pelanggan)
    .bind(&pic)
    .bind(&telepon)
    .bind(&email)
    .bind(&keterangan)
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;
    let id = result.last_insert_id();

    let (_, berkas_id) = ensure_pelanggan_tree(
        &state.drive,
        kode_pelanggan.as_deref().unwrap_or(""),
        &nama_pelanggan,
    )
    .await
    .map_err(ApiError::drive)?;
    let link = folder_url(&berkas_id);
    sqlx::query("UPDATE pelanggan SET link_folder_berkas = ? WHERE id = ?")
        .bind(&link)
        .bind(id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;

    assert_pelanggan_access(&state.database, auth.id, &auth.role, id).await?;

    Ok((
        StatusCode::CREATED,
        Json(CustomerRow {
            id,
            kode_pelanggan,
            nama_pelanggan,
            pic,
            telepon,
            email,
            link_folder_berkas: Some(link),
            keterangan,
            lokasi_beroperasi: 0,
            lokasi_belum_beroperasi: 0,
            lokasi_proses_perpanjangan: 0,
        }),
    ))
}

pub async fn update_customer(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<u64>,
    Json(input): Json<UpdateCustomerRequest>,
) -> Result<Json<CustomerRow>, ApiError> {
    require_admin(&auth.role)?;

    // Ambil data pelanggan yang ada
    let existing = sqlx::query(
        "SELECT id, kode_pelanggan, nama_pelanggan, pic, telepon, email, keterangan, link_folder_berkas \
         FROM pelanggan WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?;
    let Some(row) = existing else {
        return Err(ApiError::not_found("Pelanggan tidak ditemukan."));
    };

    let old_nama: String = row.try_get("nama_pelanggan").map_err(ApiError::database)?;
    let old_link: Option<String> = row.try_get("link_folder_berkas").unwrap_or(None);
    let kode_pelanggan: Option<String> =
        row.try_get("kode_pelanggan").map_err(ApiError::database)?;

    let old_pic: Option<String> = row.try_get("pic").unwrap_or(None);
    let old_telepon: Option<String> = row.try_get("telepon").unwrap_or(None);
    let old_email: Option<String> = row.try_get("email").unwrap_or(None);
    let old_keterangan: Option<String> = row.try_get("keterangan").unwrap_or(None);

    // Tentukan nilai baru
    let new_nama = input.nama_pelanggan.as_ref().map(|s| s.trim().to_owned());
    let nama_changed = new_nama
        .as_ref()
        .is_some_and(|n| !n.is_empty() && n != &old_nama);
    let final_nama = new_nama
        .filter(|n| !n.is_empty())
        .unwrap_or(old_nama.clone());

    let pic = optional_trim_or_keep(input.pic.clone(), old_pic);
    let telepon = optional_trim_or_keep(input.telepon.clone(), old_telepon);
    let email = optional_trim_or_keep(input.email.clone(), old_email);
    let keterangan = optional_trim_or_keep(input.keterangan.clone(), old_keterangan);

    // Update fields di database
    sqlx::query(
        "UPDATE pelanggan SET nama_pelanggan = ?, pic = ?, telepon = ?, email = ?, keterangan = ? \
         WHERE id = ?",
    )
    .bind(&final_nama)
    .bind(&pic)
    .bind(&telepon)
    .bind(&email)
    .bind(&keterangan)
    .bind(id)
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;

    // Hitung lokasi
    let lokasi_beroperasi: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM lokasi WHERE pelanggan_id = ? AND status_kontrak = 'Beroperasi'",
    )
    .bind(id)
    .fetch_one(&state.database)
    .await
    .map_err(ApiError::database)?;
    let lokasi_belum_beroperasi: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM lokasi WHERE pelanggan_id = ? AND status_kontrak = 'Belum Beroperasi'",
    )
    .bind(id)
    .fetch_one(&state.database)
    .await
    .map_err(ApiError::database)?;
    let lokasi_proses_perpanjangan: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM lokasi WHERE pelanggan_id = ? AND status_kontrak = 'Proses Perpanjangan'",
    )
    .bind(id)
    .fetch_one(&state.database)
    .await
    .map_err(ApiError::database)?;

    // Jika nama berubah, rename folder di Drive & perbarui link
    if nama_changed
        && let Some(ref link) = old_link
        && let Some(folder_id) = parse_drive_folder_id(link)
    {
        let folder_name = format!(
            "[{}] {}",
            kode_pelanggan.as_deref().unwrap_or(""),
            sanitize_folder_name(&final_nama)
        );
        if let Err(e) = state.drive.rename(&folder_id, &folder_name).await {
            tracing::warn!(id, ?e, "Gagal rename folder Drive, DB tetap diupdate");
        }
        let new_url = folder_url(&folder_id);
        sqlx::query("UPDATE pelanggan SET link_folder_berkas = ? WHERE id = ?")
            .bind(&new_url)
            .bind(id)
            .execute(&state.database)
            .await
            .map_err(ApiError::database)?;
        // Return the updated URL
        return Ok(Json(CustomerRow {
            id,
            kode_pelanggan,
            nama_pelanggan: final_nama,
            pic,
            telepon,
            email,
            link_folder_berkas: Some(new_url),
            keterangan,
            lokasi_beroperasi,
            lokasi_belum_beroperasi,
            lokasi_proses_perpanjangan,
        }));
    }

    Ok(Json(CustomerRow {
        id,
        kode_pelanggan,
        nama_pelanggan: final_nama,
        pic,
        telepon,
        email,
        link_folder_berkas: old_link,
        keterangan,
        lokasi_beroperasi,
        lokasi_belum_beroperasi,
        lokasi_proses_perpanjangan,
    }))
}

pub async fn delete_customer(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<u64>,
) -> Result<StatusCode, ApiError> {
    require_admin(&auth.role)?;

    // Check if customer has any contracts (lokasi)
    let contract_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM lokasi WHERE pelanggan_id = ?")
            .bind(id)
            .fetch_one(&state.database)
            .await
            .map_err(ApiError::database)?;

    if contract_count > 0 {
        return Err(ApiError::bad_request(&format!(
            "Tidak dapat menghapus pelanggan. Pelanggan memiliki {} kontrak/lokasi yang terhubung. Hapus atau pindahkan kontrak terlebih dahulu.",
            contract_count
        )));
    }

    // Ambil link_folder_berkas sebelum dihapus
    let link_folder: Option<String> =
        sqlx::query_scalar("SELECT link_folder_berkas FROM pelanggan WHERE id = ?")
            .bind(id)
            .fetch_optional(&state.database)
            .await
            .map_err(ApiError::database)?;

    // Hapus folder di Google Drive jika ada
    if let Some(link) = link_folder {
        if let Some(folder_id) = parse_drive_folder_id(&link) {
            if let Err(e) = state.drive.delete_file(&folder_id).await {
                tracing::warn!(
                    pelanggan_id = id,
                    folder_id = %folder_id,
                    error = ?e,
                    "Gagal hapus folder Drive, tetap lanjutkan hapus customer"
                );
            } else {
                tracing::info!(pelanggan_id = id, folder_id = %folder_id, "Folder Drive berhasil dihapus");
            }
        }
    }

    // Hapus customer dari database
    sqlx::query("DELETE FROM pelanggan WHERE id = ?")
        .bind(id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;

    Ok(StatusCode::NO_CONTENT)
}
