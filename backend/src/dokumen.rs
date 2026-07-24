use std::sync::Arc;

use axum::{
    Extension, Json,
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use sqlx::Row;

use crate::{
    access::{
        assert_pelanggan_access, resolve_billing_context, resolve_lokasi_pelanggan_id,
    },
    drive::{
        DOC_CATEGORIES, ensure_category_folder, ensure_kontrak_tree, ensure_pelanggan_tree,
        folder_url, parse_drive_folder_id,
    },
    error::ApiError,
    models::{AuthUser, DocumentRow, ListDocumentsQuery, Page, Pagination, RenameDocumentRequest},
    state::AppState,
    util::{pagination, require_staff},
};

pub async fn list_documents(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Query(query): Query<ListDocumentsQuery>,
) -> Result<Json<Page<DocumentRow>>, ApiError> {
    let pagination_query = Pagination {
        page: query.page,
        page_size: query.page_size,
        search: None,
        status: None,
        active_only: None,
    };
    let (page, page_size, offset) = pagination(pagination_query);

    let owners = [
        query.pelanggan_id.is_some(),
        query.lokasi_id.is_some(),
        query.billing_id.is_some(),
    ]
    .into_iter()
    .filter(|v| *v)
    .count();
    if owners != 1 {
        return Err(ApiError::bad_request(
            "Sertakan tepat satu filter: pelanggan_id, lokasi_id, atau billing_id.",
        ));
    }

    if let Some(pelanggan_id) = query.pelanggan_id {
        assert_pelanggan_access(&state.database, auth.id, &auth.role, pelanggan_id).await?;
    }
    if let Some(lokasi_id) = query.lokasi_id {
        let pelanggan_id = resolve_lokasi_pelanggan_id(&state.database, lokasi_id).await?;
        assert_pelanggan_access(&state.database, auth.id, &auth.role, pelanggan_id).await?;
    }
    if let Some(billing_id) = query.billing_id {
        let (_, pelanggan_id) = resolve_billing_context(&state.database, billing_id).await?;
        assert_pelanggan_access(&state.database, auth.id, &auth.role, pelanggan_id).await?;
    }

    let (total, rows) = if let Some(pelanggan_id) = query.pelanggan_id {
        let total: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM dokumen WHERE pelanggan_id = ? AND lokasi_id IS NULL AND billing_id IS NULL",
        )
        .bind(pelanggan_id)
        .fetch_one(&state.database)
        .await
        .map_err(ApiError::database)?;
        let rows = sqlx::query(
            "SELECT id, pelanggan_id, lokasi_id, billing_id, uploaded_by_user_id, kategori, \
                    nama_file, drive_file_id, drive_folder_id, drive_url, ukuran_byte, mime_type, \
                    CAST(created_at AS CHAR) AS created_at \
             FROM dokumen \
             WHERE pelanggan_id = ? AND lokasi_id IS NULL AND billing_id IS NULL \
             ORDER BY id DESC LIMIT ? OFFSET ?",
        )
        .bind(pelanggan_id)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.database)
        .await
        .map_err(ApiError::database)?;
        (total, rows)
    } else if let Some(lokasi_id) = query.lokasi_id {
        let total: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM dokumen WHERE lokasi_id = ?")
                .bind(lokasi_id)
                .fetch_one(&state.database)
                .await
                .map_err(ApiError::database)?;
        let rows = sqlx::query(
            "SELECT id, pelanggan_id, lokasi_id, billing_id, uploaded_by_user_id, kategori, \
                    nama_file, drive_file_id, drive_folder_id, drive_url, ukuran_byte, mime_type, \
                    CAST(created_at AS CHAR) AS created_at \
             FROM dokumen WHERE lokasi_id = ? \
             ORDER BY id DESC LIMIT ? OFFSET ?",
        )
        .bind(lokasi_id)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.database)
        .await
        .map_err(ApiError::database)?;
        (total, rows)
    } else {
        let billing_id = query.billing_id.unwrap();
        let total: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM dokumen WHERE billing_id = ?")
                .bind(billing_id)
                .fetch_one(&state.database)
                .await
                .map_err(ApiError::database)?;
        let rows = sqlx::query(
            "SELECT id, pelanggan_id, lokasi_id, billing_id, uploaded_by_user_id, kategori, \
                    nama_file, drive_file_id, drive_folder_id, drive_url, ukuran_byte, mime_type, \
                    CAST(created_at AS CHAR) AS created_at \
             FROM dokumen WHERE billing_id = ? \
             ORDER BY id DESC LIMIT ? OFFSET ?",
        )
        .bind(billing_id)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.database)
        .await
        .map_err(ApiError::database)?;
        (total, rows)
    };

    let data = rows.into_iter().map(map_document_row).collect();
    Ok(Json(Page {
        data,
        total: total.max(0) as u64,
        page,
        page_size,
    }))
}

pub async fn upload_document(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, ApiError> {
    require_staff(&auth.role)?;

    let mut file_name: Option<String> = None;
    let mut mime_type: Option<String> = None;
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut kategori: Option<String> = None;
    let mut pelanggan_id: Option<u64> = None;
    let mut lokasi_id: Option<u64> = None;
    let mut billing_id: Option<u64> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::bad_request("Payload multipart tidak valid."))?
    {
        let name = field.name().unwrap_or_default().to_owned();
        match name.as_str() {
            "file" => {
                file_name = field
                    .file_name()
                    .map(|s| s.to_owned())
                    .filter(|s| !s.trim().is_empty());
                mime_type = field.content_type().map(|s| s.to_owned());
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|_| ApiError::bad_request("Gagal membaca file unggahan."))?;
                if bytes.len() > state.max_upload_bytes {
                    return Err(ApiError::bad_request(
                        "Ukuran file melebihi batas 25 MB.",
                    ));
                }
                file_bytes = Some(bytes.to_vec());
            }
            "kategori" => {
                kategori = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::bad_request("Field kategori tidak valid."))?,
                );
            }
            "pelanggan_id" => {
                pelanggan_id = parse_id_field(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::bad_request("Field pelanggan_id tidak valid."))?,
                )?;
            }
            "lokasi_id" => {
                lokasi_id = parse_id_field(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::bad_request("Field lokasi_id tidak valid."))?,
                )?;
            }
            "billing_id" => {
                billing_id = parse_id_field(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::bad_request("Field billing_id tidak valid."))?,
                )?;
            }
            _ => {}
        }
    }

    let file_bytes = file_bytes.ok_or_else(|| ApiError::bad_request("File wajib diunggah."))?;
    let nama_file = file_name
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::bad_request("Nama file tidak ditemukan."))?;
    let kategori = kategori
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::bad_request("Kategori wajib diisi."))?;
    if !DOC_CATEGORIES.iter().any(|c| *c == kategori) {
        return Err(ApiError::bad_request(
            "Kategori harus Kontrak, BAK-PKS, atau Dokumen Lain.",
        ));
    }

    let owners = [pelanggan_id.is_some(), lokasi_id.is_some(), billing_id.is_some()]
        .into_iter()
        .filter(|v| *v)
        .count();
    if owners != 1 {
        return Err(ApiError::bad_request(
            "Sertakan tepat satu pemilik: pelanggan_id, lokasi_id, atau billing_id.",
        ));
    }

    let mime = mime_type
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "application/octet-stream".to_owned());
    let ukuran = file_bytes.len() as u64;

    let (store_pelanggan_id, store_lokasi_id, store_billing_id, parent_folder_id) =
        resolve_upload_parent(&state, pelanggan_id, lokasi_id, billing_id).await?;

    if let Some(pid) = store_pelanggan_id {
        assert_pelanggan_access(&state.database, auth.id, &auth.role, pid).await?;
    }

    let category_folder_id = ensure_category_folder(&state.drive, &parent_folder_id, &kategori)
        .await
        .map_err(ApiError::drive)?;
    let uploaded = state
        .drive
        .upload_file(&category_folder_id, &nama_file, &mime, file_bytes)
        .await
        .map_err(ApiError::drive)?;
    let drive_url = uploaded
        .web_view_link
        .unwrap_or_else(|| format!("https://drive.google.com/file/d/{}/view", uploaded.id));

    let result = sqlx::query(
        "INSERT INTO dokumen \
         (pelanggan_id, lokasi_id, billing_id, uploaded_by_user_id, kategori, nama_file, \
          drive_file_id, drive_folder_id, drive_url, ukuran_byte, mime_type) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(store_pelanggan_id)
    .bind(store_lokasi_id)
    .bind(store_billing_id)
    .bind(auth.id)
    .bind(&kategori)
    .bind(&nama_file)
    .bind(&uploaded.id)
    .bind(&category_folder_id)
    .bind(&drive_url)
    .bind(ukuran)
    .bind(&mime)
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;

    // Jika upload dokumen dengan kategori "Kontrak", auto-update link_folder_berkas di lokasi bila belum terisi
    if kategori == "Kontrak" && store_lokasi_id.is_some() {
        let _ = sqlx::query(
            "UPDATE lokasi SET link_folder_berkas = COALESCE(NULLIF(link_folder_berkas, ''), ?) WHERE id = ?",
        )
        .bind(&drive_url)
        .bind(store_lokasi_id)
        .execute(&state.database)
        .await;
    }

    Ok((
        StatusCode::CREATED,
        Json(DocumentRow {
            id: result.last_insert_id(),
            pelanggan_id: store_pelanggan_id,
            lokasi_id: store_lokasi_id,
            billing_id: store_billing_id,
            uploaded_by_user_id: Some(auth.id),
            kategori,
            nama_file,
            drive_file_id: Some(uploaded.id),
            drive_folder_id: Some(category_folder_id),
            drive_url: Some(drive_url),
            ukuran_byte: Some(ukuran),
            mime_type: Some(mime),
            created_at: chrono::Local::now()
                .naive_local()
                .format("%Y-%m-%d %H:%M:%S")
                .to_string(),
        }),
    ))
}

pub async fn delete_document(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<u64>,
) -> Result<StatusCode, ApiError> {
    require_staff(&auth.role)?;

    let row = sqlx::query(
        "SELECT id, pelanggan_id, lokasi_id, billing_id, drive_file_id FROM dokumen WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?;
    let Some(row) = row else {
        return Err(ApiError::not_found("Dokumen tidak ditemukan."));
    };

    let pelanggan_id: Option<u64> = row.try_get("pelanggan_id").unwrap_or(None);
    let lokasi_id: Option<u64> = row.try_get("lokasi_id").unwrap_or(None);
    let billing_id: Option<u64> = row.try_get("billing_id").unwrap_or(None);
    let drive_file_id: Option<String> = row.try_get("drive_file_id").unwrap_or(None);

    let access_pelanggan_id = if let Some(pid) = pelanggan_id {
        pid
    } else if let Some(lid) = lokasi_id {
        resolve_lokasi_pelanggan_id(&state.database, lid).await?
    } else if let Some(bid) = billing_id {
        resolve_billing_context(&state.database, bid).await?.1
    } else {
        return Err(ApiError::internal("Dokumen tanpa pemilik."));
    };
    assert_pelanggan_access(&state.database, auth.id, &auth.role, access_pelanggan_id).await?;

    if let Some(file_id) = drive_file_id {
        state
            .drive
            .delete_file(&file_id)
            .await
            .map_err(ApiError::drive)?;
    }

    sqlx::query("DELETE FROM dokumen WHERE id = ?")
        .bind(id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;

    Ok(StatusCode::NO_CONTENT)
}

async fn resolve_upload_parent(
    state: &AppState,
    pelanggan_id: Option<u64>,
    lokasi_id: Option<u64>,
    billing_id: Option<u64>,
) -> Result<(Option<u64>, Option<u64>, Option<u64>, String), ApiError> {
    if let Some(pid) = pelanggan_id {
        let row = sqlx::query(
            "SELECT id, nama_pelanggan, link_folder_berkas FROM pelanggan WHERE id = ? LIMIT 1",
        )
        .bind(pid)
        .fetch_optional(&state.database)
        .await
        .map_err(ApiError::database)?;
        let Some(row) = row else {
            return Err(ApiError::not_found("Pelanggan tidak ditemukan."));
        };
        let nama: String = row.try_get("nama_pelanggan").map_err(ApiError::database)?;
        let link: Option<String> = row.try_get("link_folder_berkas").unwrap_or(None);
        // link_folder_berkas pelanggan menunjuk folder berkas (parent kategori dokumen).
        let parent = if let Some(folder_id) = link.as_deref().and_then(parse_drive_folder_id) {
            folder_id
        } else {
            let (_, berkas_id) = ensure_pelanggan_tree(&state.drive, "", &nama)
                .await
                .map_err(ApiError::drive)?;
            let url = folder_url(&berkas_id);
            sqlx::query("UPDATE pelanggan SET link_folder_berkas = ? WHERE id = ?")
                .bind(&url)
                .bind(pid)
                .execute(&state.database)
                .await
                .map_err(ApiError::database)?;
            berkas_id
        };
        return Ok((Some(pid), None, None, parent));
    }

    if let Some(lid) = lokasi_id {
        let row = sqlx::query(
            "SELECT l.id, l.nama_lokasi, CAST(l.periode_awal AS CHAR) AS periode_awal, \
                    CAST(l.periode_berakhir AS CHAR) AS periode_berakhir, l.link_folder_berkas, \
                    l.pelanggan_id, p.nama_pelanggan, p.kode_pelanggan, \
                    p.link_folder_berkas AS pelanggan_link \
             FROM lokasi l JOIN pelanggan p ON p.id = l.pelanggan_id \
             WHERE l.id = ? LIMIT 1",
        )
        .bind(lid)
        .fetch_optional(&state.database)
        .await
        .map_err(ApiError::database)?;
        let Some(row) = row else {
            return Err(ApiError::not_found("Kontrak/lokasi tidak ditemukan."));
        };
        let parent = resolve_lokasi_period_folder(state, &row).await?;
        let pelanggan_id: u64 = row.try_get("pelanggan_id").map_err(ApiError::database)?;
        return Ok((Some(pelanggan_id), Some(lid), None, parent));
    }

    let bid = billing_id.unwrap();
    let (lid, pid) = resolve_billing_context(&state.database, bid).await?;
    let row = sqlx::query(
        "SELECT l.id, l.nama_lokasi, CAST(l.periode_awal AS CHAR) AS periode_awal, \
                CAST(l.periode_berakhir AS CHAR) AS periode_berakhir, l.link_folder_berkas, \
                l.pelanggan_id, p.nama_pelanggan, p.kode_pelanggan, \
                p.link_folder_berkas AS pelanggan_link \
         FROM lokasi l JOIN pelanggan p ON p.id = l.pelanggan_id \
         WHERE l.id = ? LIMIT 1",
    )
    .bind(lid)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?;
    let Some(row) = row else {
        return Err(ApiError::not_found("Kontrak/lokasi tidak ditemukan."));
    };
    let parent = resolve_lokasi_period_folder(state, &row).await?;
    Ok((Some(pid), Some(lid), Some(bid), parent))
}

async fn resolve_lokasi_period_folder(
    state: &AppState,
    row: &sqlx::mysql::MySqlRow,
) -> Result<String, ApiError> {
    let link: Option<String> = row.try_get("link_folder_berkas").unwrap_or(None);
    if let Some(folder_id) = link.as_deref().and_then(parse_drive_folder_id) {
        return Ok(folder_id);
    }

    let lokasi_id: u64 = row.try_get("id").map_err(ApiError::database)?;
    let nama_lokasi: String = row.try_get("nama_lokasi").map_err(ApiError::database)?;
    let nama_pelanggan: String = row.try_get("nama_pelanggan").map_err(ApiError::database)?;
    let kode_pelanggan: Option<String> = row.try_get("kode_pelanggan").unwrap_or(None);
    let pelanggan_link: Option<String> = row.try_get("pelanggan_link").unwrap_or(None);
    let periode_awal: String = row
        .try_get::<String, _>("periode_awal")
        .map(|s| s.chars().take(10).collect())
        .map_err(ApiError::database)?;
    let periode_berakhir: String = row
        .try_get::<String, _>("periode_berakhir")
        .map(|s| s.chars().take(10).collect())
        .map_err(ApiError::database)?;

    // Resolve the pelanggan folder ID
    let parent_folder_id = if let Some(ref link) = pelanggan_link {
        parse_drive_folder_id(link).unwrap_or_default()
    } else {
        String::new()
    };
    let parent_folder_id = if parent_folder_id.is_empty() {
        let (new_id, new_url) = ensure_pelanggan_tree(
            &state.drive,
            kode_pelanggan.as_deref().unwrap_or(""),
            &nama_pelanggan,
        )
        .await
        .map_err(ApiError::drive)?;
        let pelanggan_id: u64 = row.try_get("pelanggan_id").map_err(ApiError::database)?;
        sqlx::query("UPDATE pelanggan SET link_folder_berkas = ? WHERE id = ?")
            .bind(&new_url)
            .bind(pelanggan_id)
            .execute(&state.database)
            .await
            .map_err(ApiError::database)?;
        new_id
    } else {
        parent_folder_id
    };

    let (periode_id, url) = ensure_kontrak_tree(
        &state.drive,
        &parent_folder_id,
        &nama_lokasi,
        &periode_awal,
        &periode_berakhir,
    )
    .await
    .map_err(ApiError::drive)?;
    sqlx::query("UPDATE lokasi SET link_folder_berkas = ? WHERE id = ?")
        .bind(&url)
        .bind(lokasi_id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;
    Ok(periode_id)
}

fn parse_id_field(value: String) -> Result<Option<u64>, ApiError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    trimmed
        .parse::<u64>()
        .map(Some)
        .map_err(|_| ApiError::bad_request(format!("ID tidak valid: {trimmed}")))
}

pub async fn rename_document(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<u64>,
    Json(input): Json<RenameDocumentRequest>,
) -> Result<Json<DocumentRow>, ApiError> {
    require_staff(&auth.role)?;

    let nama_file = input.nama_file.trim().to_owned();
    if nama_file.is_empty() {
        return Err(ApiError::bad_request("Nama file tidak boleh kosong."));
    }

    // Ambil data dokumen yang ada
    let row = sqlx::query(
        "SELECT id, pelanggan_id, lokasi_id, billing_id, kategori, nama_file, \
                drive_file_id, drive_folder_id, drive_url, ukuran_byte, mime_type, \
                CAST(created_at AS CHAR) AS created_at \
         FROM dokumen WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?;
    let Some(row) = row else {
        return Err(ApiError::not_found("Dokumen tidak ditemukan."));
    };

    let pelanggan_id: Option<u64> = row.try_get("pelanggan_id").unwrap_or(None);
    let lokasi_id: Option<u64> = row.try_get("lokasi_id").unwrap_or(None);
    let billing_id: Option<u64> = row.try_get("billing_id").unwrap_or(None);

    // Verifikasi akses
    let access_pelanggan_id = if let Some(pid) = pelanggan_id {
        pid
    } else if let Some(lid) = lokasi_id {
        resolve_lokasi_pelanggan_id(&state.database, lid).await?
    } else if let Some(bid) = billing_id {
        resolve_billing_context(&state.database, bid).await?.1
    } else {
        return Err(ApiError::internal("Dokumen tanpa pemilik."));
    };
    assert_pelanggan_access(&state.database, auth.id, &auth.role, access_pelanggan_id).await?;

    let drive_file_id: Option<String> = row.try_get("drive_file_id").unwrap_or(None);

    // Rename di Google Drive jika ada drive_file_id
    if let Some(ref file_id) = drive_file_id
        && let Err(e) = state.drive.rename(file_id, &nama_file).await
    {
        tracing::warn!(id, ?e, "Gagal rename file di Drive, DB tetap diupdate");
    }

    // Update nama_file di database
    sqlx::query("UPDATE dokumen SET nama_file = ? WHERE id = ?")
        .bind(&nama_file)
        .bind(id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;

    Ok(Json(DocumentRow {
        id,
        pelanggan_id,
        lokasi_id,
        billing_id,
        uploaded_by_user_id: row.try_get("uploaded_by_user_id").unwrap_or(None),
        kategori: row.try_get("kategori").unwrap_or_default(),
        nama_file,
        drive_file_id,
        drive_folder_id: row.try_get("drive_folder_id").unwrap_or(None),
        drive_url: row.try_get("drive_url").unwrap_or(None),
        ukuran_byte: row.try_get("ukuran_byte").unwrap_or(None),
        mime_type: row.try_get("mime_type").unwrap_or(None),
        created_at: row.try_get("created_at").unwrap_or_default(),
    }))
}

fn map_document_row(row: sqlx::mysql::MySqlRow) -> DocumentRow {
    DocumentRow {
        id: row.try_get("id").unwrap_or_default(),
        pelanggan_id: row.try_get("pelanggan_id").unwrap_or(None),
        lokasi_id: row.try_get("lokasi_id").unwrap_or(None),
        billing_id: row.try_get("billing_id").unwrap_or(None),
        uploaded_by_user_id: row.try_get("uploaded_by_user_id").unwrap_or(None),
        kategori: row.try_get("kategori").unwrap_or_default(),
        nama_file: row.try_get("nama_file").unwrap_or_default(),
        drive_file_id: row.try_get("drive_file_id").unwrap_or(None),
        drive_folder_id: row.try_get("drive_folder_id").unwrap_or(None),
        drive_url: row.try_get("drive_url").unwrap_or(None),
        ukuran_byte: row.try_get("ukuran_byte").unwrap_or(None),
        mime_type: row.try_get("mime_type").unwrap_or(None),
        created_at: row.try_get("created_at").unwrap_or_default(),
    }
}

