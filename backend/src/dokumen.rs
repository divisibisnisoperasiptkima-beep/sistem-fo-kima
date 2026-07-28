use std::sync::Arc;

use axum::{
    Extension, Json,
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use sqlx::Row;

use crate::{
    access::{assert_pelanggan_access, resolve_billing_context, resolve_lokasi_pelanggan_id},
    drive::{
        DOC_CATEGORIES, ensure_category_folder, ensure_kontrak_tree, ensure_pelanggan_tree,
        folder_url, parse_drive_folder_id,
    },
    error::ApiError,
    models::{
        AuthUser, DocumentRow, IspDocumentRow, ListDocumentsQuery, Page, Pagination,
        RenameDocumentRequest,
    },
    state::AppState,
    util::{pagination, require_admin, require_document_upload},
};

pub async fn list_documents(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Query(query): Query<ListDocumentsQuery>,
) -> Result<Json<Page<DocumentRow>>, ApiError> {
    require_admin(&auth.role)?;

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
                    nama_file, ukuran_byte, mime_type, \
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
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM dokumen WHERE lokasi_id = ?")
            .bind(lokasi_id)
            .fetch_one(&state.database)
            .await
            .map_err(ApiError::database)?;
        let rows = sqlx::query(
            "SELECT id, pelanggan_id, lokasi_id, billing_id, uploaded_by_user_id, kategori, \
                    nama_file, ukuran_byte, mime_type, \
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
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM dokumen WHERE billing_id = ?")
            .bind(billing_id)
            .fetch_one(&state.database)
            .await
            .map_err(ApiError::database)?;
        let rows = sqlx::query(
            "SELECT id, pelanggan_id, lokasi_id, billing_id, uploaded_by_user_id, kategori, \
                    nama_file, ukuran_byte, mime_type, \
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

/// Daftar dokumen lintas pelanggan/kontrak yang dapat dibaca akun ISP.
/// Respons sengaja tidak memuat link maupun ID Google Drive.
pub async fn list_isp_documents(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Query(query): Query<Pagination>,
) -> Result<Json<Page<IspDocumentRow>>, ApiError> {
    if auth.role != "isp" {
        return Err(ApiError::forbidden("Endpoint ini hanya untuk akun ISP."));
    }

    let search = query
        .search
        .as_deref()
        .unwrap_or_default()
        .trim()
        .to_owned();
    let has_search = !search.is_empty();
    let pattern = format!("%{}%", search);
    let (page, page_size, offset) = pagination(query);
    let access_clause = "EXISTS (SELECT 1 FROM user_pelanggan_access a WHERE a.user_id = ? AND a.pelanggan_id = COALESCE(d.pelanggan_id, l.pelanggan_id, bl.pelanggan_id))";
    let search_clause = " AND (d.nama_file LIKE ? OR d.kategori LIKE ? OR p.nama_pelanggan LIKE ? OR l.nama_lokasi LIKE ? OR bp.nama_pelanggan LIKE ? OR bl.nama_lokasi LIKE ?)";

    let total_sql = format!(
        "SELECT COUNT(*) FROM dokumen d \
         LEFT JOIN lokasi l ON l.id = d.lokasi_id \
         LEFT JOIN pelanggan p ON p.id = d.pelanggan_id \
         LEFT JOIN billing b ON b.id = d.billing_id \
         LEFT JOIN lokasi bl ON bl.id = b.lokasi_id \
         LEFT JOIN pelanggan bp ON bp.id = bl.pelanggan_id \
         WHERE {}{}",
        access_clause,
        if has_search { search_clause } else { "" }
    );
    let mut total_query = sqlx::query_scalar::<_, i64>(&total_sql).bind(auth.id);
    if has_search {
        for _ in 0..6 {
            total_query = total_query.bind(&pattern);
        }
    }
    let total = total_query
        .fetch_one(&state.database)
        .await
        .map_err(ApiError::database)?;

    let rows_sql = format!(
        "SELECT d.id, COALESCE(d.pelanggan_id, l.pelanggan_id, bl.pelanggan_id) AS pelanggan_id, \
                COALESCE(d.lokasi_id, b.lokasi_id) AS lokasi_id, \
                COALESCE(p.nama_pelanggan, bp.nama_pelanggan) AS nama_pelanggan, \
                COALESCE(l.nama_lokasi, bl.nama_lokasi) AS nama_lokasi, \
                d.kategori, d.nama_file, d.ukuran_byte, d.mime_type, \
                CAST(d.created_at AS CHAR) AS created_at \
         FROM dokumen d \
         LEFT JOIN lokasi l ON l.id = d.lokasi_id \
         LEFT JOIN pelanggan p ON p.id = d.pelanggan_id \
         LEFT JOIN billing b ON b.id = d.billing_id \
         LEFT JOIN lokasi bl ON bl.id = b.lokasi_id \
         LEFT JOIN pelanggan bp ON bp.id = bl.pelanggan_id \
         WHERE {}{} ORDER BY d.created_at DESC, d.id DESC LIMIT ? OFFSET ?",
        access_clause,
        if has_search { search_clause } else { "" }
    );
    let mut rows_query = sqlx::query(&rows_sql).bind(auth.id);
    if has_search {
        for _ in 0..6 {
            rows_query = rows_query.bind(&pattern);
        }
    }
    let rows = rows_query
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.database)
        .await
        .map_err(ApiError::database)?;
    let data = rows
        .into_iter()
        .map(|row| IspDocumentRow {
            id: row.try_get("id").unwrap_or_default(),
            pelanggan_id: row.try_get("pelanggan_id").unwrap_or_default(),
            lokasi_id: row.try_get("lokasi_id").unwrap_or(None),
            nama_pelanggan: row.try_get("nama_pelanggan").unwrap_or_default(),
            nama_lokasi: row.try_get("nama_lokasi").unwrap_or(None),
            kategori: row.try_get("kategori").unwrap_or_default(),
            nama_file: row.try_get("nama_file").unwrap_or_default(),
            ukuran_byte: row.try_get("ukuran_byte").unwrap_or(None),
            mime_type: row.try_get("mime_type").unwrap_or(None),
            created_at: row.try_get("created_at").unwrap_or_default(),
        })
        .collect();

    Ok(Json(Page {
        data,
        total: total.max(0) as u64,
        page,
        page_size,
    }))
}

pub async fn preview_document(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<u64>,
) -> Result<Response, ApiError> {
    serve_document(&state, &auth, id, true).await
}

pub async fn download_document(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<u64>,
) -> Result<Response, ApiError> {
    serve_document(&state, &auth, id, false).await
}

async fn serve_document(
    state: &AppState,
    auth: &AuthUser,
    id: u64,
    preview: bool,
) -> Result<Response, ApiError> {
    if !matches!(auth.role.as_str(), "admin" | "isp") {
        return Err(ApiError::forbidden(
            "Role pengguna tidak diizinkan membuka dokumen.",
        ));
    }

    let row = sqlx::query(
        "SELECT pelanggan_id, lokasi_id, billing_id, drive_file_id, nama_file, mime_type \
         FROM dokumen WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?
    .ok_or_else(|| ApiError::not_found("Dokumen tidak ditemukan."))?;

    let pelanggan_id: Option<u64> = row.try_get("pelanggan_id").unwrap_or(None);
    let lokasi_id: Option<u64> = row.try_get("lokasi_id").unwrap_or(None);
    let billing_id: Option<u64> = row.try_get("billing_id").unwrap_or(None);
    let access_pelanggan_id = if let Some(pelanggan_id) = pelanggan_id {
        pelanggan_id
    } else if let Some(lokasi_id) = lokasi_id {
        resolve_lokasi_pelanggan_id(&state.database, lokasi_id).await?
    } else if let Some(billing_id) = billing_id {
        resolve_billing_context(&state.database, billing_id)
            .await?
            .1
    } else {
        return Err(ApiError::internal("Dokumen tanpa pemilik."));
    };
    assert_pelanggan_access(&state.database, auth.id, &auth.role, access_pelanggan_id).await?;

    let drive_file_id: Option<String> = row.try_get("drive_file_id").unwrap_or(None);
    let drive_file_id = drive_file_id
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| ApiError::not_found("File dokumen tidak tersedia di Google Drive."))?;
    let file_name: String = row.try_get("nama_file").map_err(ApiError::database)?;
    let raw_mime_type: Option<String> = row.try_get("mime_type").unwrap_or(None);
    let mime_type = raw_mime_type.unwrap_or_else(|| "application/octet-stream".to_owned());

    let content_type = if preview {
        preview_mime_type(&mime_type).ok_or_else(|| {
            ApiError::unsupported_media_type(
                "Preview hanya tersedia untuk PDF dan gambar. Gunakan tombol download untuk format lain.",
            )
        })?
        .to_owned()
    } else {
        normalized_mime_type(&mime_type)
            .unwrap_or("application/octet-stream")
            .to_owned()
    };
    let bytes = state
        .drive
        .download_file_content(&drive_file_id)
        .await
        .map_err(ApiError::drive)?;

    let disposition = if preview { "inline" } else { "attachment" };
    let encoded_name = urlencoding::encode(if file_name.trim().is_empty() {
        "dokumen"
    } else {
        &file_name
    });
    let content_disposition =
        HeaderValue::from_str(&format!("{disposition}; filename*=UTF-8''{encoded_name}"))
            .map_err(|_| ApiError::internal("Nama file dokumen tidak valid."))?;

    let mut response = Body::from(bytes).into_response();
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&content_type)
            .map_err(|_| ApiError::internal("Tipe file dokumen tidak valid."))?,
    );
    headers.insert(header::CONTENT_DISPOSITION, content_disposition);
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    Ok(response)
}

fn normalized_mime_type(value: &str) -> Option<&str> {
    let value = value.split(';').next()?.trim();
    if value.is_empty() { None } else { Some(value) }
}

fn preview_mime_type(value: &str) -> Option<&'static str> {
    match normalized_mime_type(value)?.to_ascii_lowercase().as_str() {
        "application/pdf" => Some("application/pdf"),
        "image/jpeg" => Some("image/jpeg"),
        "image/png" => Some("image/png"),
        "image/gif" => Some("image/gif"),
        "image/webp" => Some("image/webp"),
        _ => None,
    }
}

pub async fn upload_document(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, ApiError> {
    require_document_upload(&auth.role)?;

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
                    return Err(ApiError::bad_request("Ukuran file melebihi batas 25 MB."));
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

    let owners = [
        pelanggan_id.is_some(),
        lokasi_id.is_some(),
        billing_id.is_some(),
    ]
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

    // Periksa otorisasi sebelum menyentuh Google Drive. Dengan urutan ini,
    // request ISP lintas pelanggan tidak dapat membuat folder sampah sebelum
    // akhirnya ditolak.
    let access_pelanggan_id = if let Some(pid) = pelanggan_id {
        pid
    } else if let Some(lid) = lokasi_id {
        resolve_lokasi_pelanggan_id(&state.database, lid).await?
    } else if let Some(bid) = billing_id {
        resolve_billing_context(&state.database, bid).await?.1
    } else {
        return Err(ApiError::bad_request("Pemilik dokumen tidak ditemukan."));
    };
    assert_pelanggan_access(&state.database, auth.id, &auth.role, access_pelanggan_id).await?;

    let (store_pelanggan_id, store_lokasi_id, store_billing_id, parent_folder_id) =
        resolve_upload_parent(&state, pelanggan_id, lokasi_id, billing_id).await?;

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
    require_admin(&auth.role)?;

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
    require_admin(&auth.role)?;

    let nama_file = input.nama_file.trim().to_owned();
    if nama_file.is_empty() {
        return Err(ApiError::bad_request("Nama file tidak boleh kosong."));
    }

    // Ambil data dokumen yang ada
    let row = sqlx::query(
        "SELECT id, pelanggan_id, lokasi_id, billing_id, kategori, nama_file, \
                drive_file_id, drive_folder_id, ukuran_byte, mime_type, \
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
        ukuran_byte: row.try_get("ukuran_byte").unwrap_or(None),
        mime_type: row.try_get("mime_type").unwrap_or(None),
        created_at: row.try_get("created_at").unwrap_or_default(),
    }
}

#[cfg(test)]
mod tests {
    use super::preview_mime_type;

    #[test]
    fn preview_only_allows_safe_document_types() {
        assert_eq!(
            preview_mime_type("application/pdf"),
            Some("application/pdf")
        );
        assert_eq!(
            preview_mime_type("image/png; charset=binary"),
            Some("image/png")
        );
        assert_eq!(preview_mime_type("text/html"), None);
        assert_eq!(preview_mime_type("image/svg+xml"), None);
    }
}
