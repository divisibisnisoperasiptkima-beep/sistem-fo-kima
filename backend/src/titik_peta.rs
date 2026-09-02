use std::sync::Arc;

use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use sqlx::Row;

use crate::{
    baa_template::{BaaTemplateData, render_baa, render_baa_pdf},
    dokumen::resolve_lokasi_period_folder,
    drive::{ensure_category_folder, sanitize_folder_name},
    error::ApiError,
    models::{
        AuthUser, CreateLocationBaaRequest, CreateMapPointRequest, DocumentRow,
        LocationBaaResponse, MapPointRow, Page, Pagination, StatusResponse,
    },
    state::AppState,
    util::{pagination, require_staff},
};

fn normalize_coordinate_lines(value: &str) -> Vec<String> {
    value
        .lines()
        .map(str::trim)
        .map(|line| line.trim_start_matches('•').trim())
        .map(|line| line.strip_prefix("- ").unwrap_or(line).trim())
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn coordinate_bullet_text(value: &str) -> String {
    normalize_coordinate_lines(value)
        .into_iter()
        .map(|line| format!("• {line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

pub async fn list_map_points(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Query(query): Query<Pagination>,
) -> Result<Json<Page<MapPointRow>>, ApiError> {
    require_staff(&auth.role)?;

    let search_term = query.search.as_deref().unwrap_or("").trim();
    let has_search = !search_term.is_empty();
    let search_pattern = format!("%{}%", search_term);

    let (page, page_size, offset) = pagination(query);

    let total: i64 = if has_search {
        sqlx::query_scalar(
            "SELECT COUNT(*) FROM ( \
                 SELECT l.pelanggan_id, l.nama_lokasi FROM lokasi l \
                 JOIN pelanggan p ON p.id = l.pelanggan_id \
                 WHERE p.nama_pelanggan LIKE ? OR l.nama_lokasi LIKE ? \
                 GROUP BY l.pelanggan_id, l.nama_lokasi \
             ) AS lokasi_unik",
        )
        .bind(&search_pattern)
        .bind(&search_pattern)
        .fetch_one(&state.database)
        .await
    } else {
        sqlx::query_scalar(
            "SELECT COUNT(*) FROM (SELECT pelanggan_id, nama_lokasi FROM lokasi GROUP BY pelanggan_id, nama_lokasi) AS lokasi_unik",
        )
            .fetch_one(&state.database)
            .await
    }
    .map_err(ApiError::database)?;

    let rows = if has_search {
        sqlx::query(
            "SELECT l.id AS lokasi_id, l.nama_lokasi, l.pelanggan_id, \
                    p.nama_pelanggan, p.pic, p.telepon, \
                    COALESCE((SELECT JSON_OBJECT('latitude', tld.latitude, 'longitude', tld.longitude, 'label', tld.label) \
                              FROM titik_lokasi_detail tld WHERE tld.lokasi_id = l.id ORDER BY tld.updated_at DESC, tld.id DESC LIMIT 1), tp.points, \
                             CASE WHEN l.latitude IS NOT NULL AND l.longitude IS NOT NULL \
                                  THEN JSON_OBJECT('latitude', l.latitude, 'longitude', l.longitude, 'label', l.nama_lokasi) END) AS points, \
                    DATE_FORMAT(l.tanggal_aktivasi, '%Y-%m-%d') AS tanggal_aktivasi, \
                    COALESCE((SELECT CAST(tld.latitude AS DOUBLE) FROM titik_lokasi_detail tld WHERE tld.lokasi_id = l.id ORDER BY tld.updated_at DESC, tld.id DESC LIMIT 1), CAST(l.latitude AS DOUBLE)) AS latitude, \
                    COALESCE((SELECT CAST(tld.longitude AS DOUBLE) FROM titik_lokasi_detail tld WHERE tld.lokasi_id = l.id ORDER BY tld.updated_at DESC, tld.id DESC LIMIT 1), CAST(l.longitude AS DOUBLE)) AS longitude, \
                    CAST(l.power AS DOUBLE) AS power, l.vlan_id, l.mac_modem, l.alamat_user, l.core, \
                    tp.approval_status, tp.updated_at, \
                    (SELECT d.id FROM dokumen d WHERE d.lokasi_id = l.id AND d.kategori = 'BAA' ORDER BY d.id DESC LIMIT 1) AS baa_document_id, \
                    (SELECT d.nama_file FROM dokumen d WHERE d.lokasi_id = l.id AND d.kategori = 'BAA' ORDER BY d.id DESC LIMIT 1) AS baa_document_name, \
                    (SELECT d.mime_type FROM dokumen d WHERE d.lokasi_id = l.id AND d.kategori = 'BAA' ORDER BY d.id DESC LIMIT 1) AS baa_document_mime_type, \
                    (SELECT CAST(d.created_at AS CHAR) FROM dokumen d WHERE d.lokasi_id = l.id AND d.kategori = 'BAA' ORDER BY d.id DESC LIMIT 1) AS baa_created_at \
             FROM lokasi l \
             JOIN (SELECT pelanggan_id, nama_lokasi, MAX(id) AS lokasi_id FROM lokasi GROUP BY pelanggan_id, nama_lokasi) lu \
               ON lu.lokasi_id = l.id \
             JOIN pelanggan p ON p.id = l.pelanggan_id \
             LEFT JOIN titik_pelanggan tp ON tp.lokasi_id = l.id \
             WHERE p.nama_pelanggan LIKE ? OR l.nama_lokasi LIKE ? \
             ORDER BY p.nama_pelanggan, l.nama_lokasi \
             LIMIT ? OFFSET ?",
        )
        .bind(&search_pattern)
        .bind(&search_pattern)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.database)
        .await
    } else {
        sqlx::query(
            "SELECT l.id AS lokasi_id, l.nama_lokasi, l.pelanggan_id, \
                    p.nama_pelanggan, p.pic, p.telepon, \
                    COALESCE((SELECT JSON_OBJECT('latitude', tld.latitude, 'longitude', tld.longitude, 'label', tld.label) \
                              FROM titik_lokasi_detail tld WHERE tld.lokasi_id = l.id ORDER BY tld.updated_at DESC, tld.id DESC LIMIT 1), tp.points, \
                             CASE WHEN l.latitude IS NOT NULL AND l.longitude IS NOT NULL \
                                  THEN JSON_OBJECT('latitude', l.latitude, 'longitude', l.longitude, 'label', l.nama_lokasi) END) AS points, \
                    DATE_FORMAT(l.tanggal_aktivasi, '%Y-%m-%d') AS tanggal_aktivasi, \
                    COALESCE((SELECT CAST(tld.latitude AS DOUBLE) FROM titik_lokasi_detail tld WHERE tld.lokasi_id = l.id ORDER BY tld.updated_at DESC, tld.id DESC LIMIT 1), CAST(l.latitude AS DOUBLE)) AS latitude, \
                    COALESCE((SELECT CAST(tld.longitude AS DOUBLE) FROM titik_lokasi_detail tld WHERE tld.lokasi_id = l.id ORDER BY tld.updated_at DESC, tld.id DESC LIMIT 1), CAST(l.longitude AS DOUBLE)) AS longitude, \
                    CAST(l.power AS DOUBLE) AS power, l.vlan_id, l.mac_modem, l.alamat_user, l.core, \
                    tp.approval_status, tp.updated_at, \
                    (SELECT d.id FROM dokumen d WHERE d.lokasi_id = l.id AND d.kategori = 'BAA' ORDER BY d.id DESC LIMIT 1) AS baa_document_id, \
                    (SELECT d.nama_file FROM dokumen d WHERE d.lokasi_id = l.id AND d.kategori = 'BAA' ORDER BY d.id DESC LIMIT 1) AS baa_document_name, \
                    (SELECT d.mime_type FROM dokumen d WHERE d.lokasi_id = l.id AND d.kategori = 'BAA' ORDER BY d.id DESC LIMIT 1) AS baa_document_mime_type, \
                    (SELECT CAST(d.created_at AS CHAR) FROM dokumen d WHERE d.lokasi_id = l.id AND d.kategori = 'BAA' ORDER BY d.id DESC LIMIT 1) AS baa_created_at \
             FROM lokasi l \
             JOIN (SELECT pelanggan_id, nama_lokasi, MAX(id) AS lokasi_id FROM lokasi GROUP BY pelanggan_id, nama_lokasi) lu \
               ON lu.lokasi_id = l.id \
             JOIN pelanggan p ON p.id = l.pelanggan_id \
             LEFT JOIN titik_pelanggan tp ON tp.lokasi_id = l.id \
             ORDER BY p.nama_pelanggan, l.nama_lokasi, l.id \
             LIMIT ? OFFSET ?",
        )
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.database)
        .await
    }
    .map_err(ApiError::database)?;

    let data = rows
        .into_iter()
        .map(|row| MapPointRow {
            lokasi_id: row.try_get("lokasi_id").unwrap_or_default(),
            nama_lokasi: row.try_get("nama_lokasi").unwrap_or_default(),
            pelanggan_id: row.try_get("pelanggan_id").unwrap_or_default(),
            nama_pelanggan: row.try_get("nama_pelanggan").unwrap_or_default(),
            pic: row.try_get("pic").unwrap_or(None),
            telepon: row.try_get("telepon").unwrap_or(None),
            points: row.try_get("points").ok(),
            tanggal_aktivasi: row.try_get("tanggal_aktivasi").unwrap_or(None),
            latitude: row.try_get("latitude").unwrap_or(None),
            longitude: row.try_get("longitude").unwrap_or(None),
            power: row.try_get("power").unwrap_or(None),
            vlan_id: row.try_get("vlan_id").unwrap_or(None),
            mac_modem: row.try_get("mac_modem").unwrap_or(None),
            alamat_user: row.try_get("alamat_user").unwrap_or(None),
            core: row.try_get("core").unwrap_or(None),
            approval_status: row.try_get("approval_status").unwrap_or(None),
            updated_at: row.try_get("updated_at").unwrap_or(None),
            baa_document_id: row.try_get("baa_document_id").unwrap_or(None),
            baa_document_name: row.try_get("baa_document_name").unwrap_or(None),
            baa_document_mime_type: row.try_get("baa_document_mime_type").unwrap_or(None),
            baa_created_at: row.try_get("baa_created_at").unwrap_or(None),
        })
        .collect();

    Ok(Json(Page {
        data,
        total: total.max(0) as u64,
        page,
        page_size,
    }))
}

pub async fn upsert_map_point(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Json(input): Json<CreateMapPointRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_staff(&auth.role)?;

    if input.latitude < -90.0 || input.latitude > 90.0 {
        return Err(ApiError::bad_request("Latitude harus antara -90 dan 90."));
    }
    if input.longitude < -180.0 || input.longitude > 180.0 {
        return Err(ApiError::bad_request(
            "Longitude harus antara -180 dan 180.",
        ));
    }

    let pelanggan_id: u64 =
        sqlx::query_scalar("SELECT pelanggan_id FROM lokasi WHERE id = ? LIMIT 1")
            .bind(input.lokasi_id)
            .fetch_optional(&state.database)
            .await
            .map_err(ApiError::database)?
            .ok_or_else(|| ApiError::not_found("Lokasi kontrak tidak ditemukan."))?;

    let points = serde_json::json!({
        "latitude": input.latitude,
        "longitude": input.longitude,
        "label": input.label.as_deref().unwrap_or(""),
    });

    sqlx::query(
        "INSERT INTO titik_pelanggan \
         (pelanggan_id, lokasi_id, points, approval_status) \
         VALUES (?, ?, ?, 'disetujui') \
         ON DUPLICATE KEY UPDATE \
         pelanggan_id = VALUES(pelanggan_id), \
         points = VALUES(points), \
         approval_status = 'disetujui', \
         pending_points = NULL, \
         submitted_by_user_id = NULL",
    )
    .bind(pelanggan_id)
    .bind(input.lokasi_id)
    .bind(&points)
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;

    Ok((StatusCode::OK, Json(StatusResponse { status: "ok" })))
}

pub async fn delete_map_point(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Path(lokasi_id): Path<u64>,
) -> Result<StatusCode, ApiError> {
    require_staff(&auth.role)?;

    let result = sqlx::query("DELETE FROM titik_pelanggan WHERE lokasi_id = ?")
        .bind(lokasi_id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;

    if result.rows_affected() == 0 {
        return Err(ApiError::not_found(
            "Titik peta untuk lokasi ini tidak ditemukan.",
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}

/// Mengambil dokumen BAA terakhir untuk satu lokasi/kontrak.
/// BAA yang dibuat dari tabel Titik Peta adalah dokumen lokasi biasa, bukan
/// dokumen portal, sehingga tidak mengubah status atau tahapan SOP.
pub async fn get_location_baa(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Path(lokasi_id): Path<u64>,
) -> Result<Json<Option<LocationBaaResponse>>, ApiError> {
    require_staff(&auth.role)?;
    let row = sqlx::query(
        "SELECT d.id, d.pelanggan_id, d.lokasi_id, d.billing_id, d.uploaded_by_user_id, \
                d.kategori, d.nama_file, d.ukuran_byte, d.mime_type, \
                CAST(d.created_at AS CHAR) AS created_at \
         FROM dokumen d \
         WHERE d.lokasi_id = ? AND d.kategori = 'BAA' \
         ORDER BY d.id DESC LIMIT 1",
    )
    .bind(lokasi_id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?;

    let document = row.map(|row| DocumentRow {
        id: row.try_get("id").unwrap_or_default(),
        pelanggan_id: row.try_get("pelanggan_id").unwrap_or(None),
        lokasi_id: row.try_get("lokasi_id").unwrap_or(None),
        billing_id: row.try_get("billing_id").unwrap_or(None),
        uploaded_by_user_id: row.try_get("uploaded_by_user_id").unwrap_or(None),
        kategori: row.try_get("kategori").unwrap_or_else(|_| "BAA".to_owned()),
        nama_file: row
            .try_get("nama_file")
            .unwrap_or_else(|_| "BAA.docx".to_owned()),
        ukuran_byte: row.try_get("ukuran_byte").unwrap_or(None),
        mime_type: row.try_get("mime_type").unwrap_or(None),
        created_at: row.try_get("created_at").unwrap_or_default(),
    });
    let form_data = sqlx::query_scalar::<_, String>(
        "SELECT CAST(form_data AS CHAR) FROM titik_peta_baa_forms WHERE lokasi_id = ? LIMIT 1",
    )
    .bind(lokasi_id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?;
    let form = form_data
        .as_deref()
        .and_then(|value| serde_json::from_str::<CreateLocationBaaRequest>(value).ok())
        .unwrap_or_default();
    if document.is_none() && form_data.is_none() {
        return Ok(Json(None));
    }
    Ok(Json(Some(LocationBaaResponse { document, form })))
}

/// Mengisi template BAA dari form teknisi dan menaruh hasilnya pada folder
/// `Lokasi/<nama lokasi>/<periode>/BAA` di bawah folder ISP/pelanggan.
pub async fn create_location_baa(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Path(lokasi_id): Path<u64>,
    Json(input): Json<CreateLocationBaaRequest>,
) -> Result<(StatusCode, Json<DocumentRow>), ApiError> {
    require_staff(&auth.role)?;
    let submitted_input = input.clone();

    let row = sqlx::query(
        "SELECT l.id, l.nama_lokasi, l.alamat_user, \
                DATE_FORMAT(l.tanggal_aktivasi, '%Y-%m-%d') AS tanggal_aktivasi, \
                CAST(l.latitude AS DOUBLE) AS latitude, CAST(l.longitude AS DOUBLE) AS longitude, \
                l.power, l.vlan_id, l.mac_modem, l.core, \
                CAST(l.periode_awal AS CHAR) AS periode_awal, \
                CAST(l.periode_berakhir AS CHAR) AS periode_berakhir, \
                l.link_folder_berkas, l.pelanggan_id, \
                p.nama_pelanggan, p.pic, p.telepon, p.kode_pelanggan, \
                p.link_folder_berkas AS pelanggan_link \
         FROM lokasi l JOIN pelanggan p ON p.id = l.pelanggan_id \
         WHERE l.id = ? LIMIT 1",
    )
    .bind(lokasi_id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?
    .ok_or_else(|| ApiError::not_found("Lokasi kontrak tidak ditemukan."))?;

    let nama_lokasi: String = row.try_get("nama_lokasi").unwrap_or_default();
    let alamat_lokasi: String = row
        .try_get("alamat_user")
        .unwrap_or(None)
        .unwrap_or_default();
    let tanggal_aktivasi: String = input
        .tanggal_aktivasi
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| row.try_get("tanggal_aktivasi").unwrap_or(None))
        .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
    let latitude: Option<f64> = row.try_get("latitude").unwrap_or(None);
    let longitude: Option<f64> = row.try_get("longitude").unwrap_or(None);
    let titik_lokasi = sqlx::query(
        "SELECT CAST(latitude AS DOUBLE) AS latitude, CAST(longitude AS DOUBLE) AS longitude \
         FROM titik_lokasi_detail WHERE lokasi_id = ? \
         ORDER BY updated_at DESC, id DESC",
    )
    .bind(lokasi_id)
    .fetch_all(&state.database)
    .await
    .map_err(ApiError::database)?;
    let koordinat_lokasi = titik_lokasi
        .into_iter()
        .filter_map(|point| {
            let latitude = point.try_get::<Option<f64>, _>("latitude").ok().flatten()?;
            let longitude = point
                .try_get::<Option<f64>, _>("longitude")
                .ok()
                .flatten()?;
            Some(format!("{latitude:.6}, {longitude:.6}"))
        })
        .collect::<Vec<_>>()
        .join("\n");
    let koordinat_tersimpan = input
        .koordinat
        .as_deref()
        .map(normalize_coordinate_lines)
        .filter(|values| !values.is_empty())
        .map(|values| values.join("\n"))
        .or_else(|| (!koordinat_lokasi.is_empty()).then_some(koordinat_lokasi))
        .or_else(|| {
            latitude
                .zip(longitude)
                .map(|(lat, lon)| format!("{lat:.6}, {lon:.6}"))
        })
        .unwrap_or_default();
    let koordinat = coordinate_bullet_text(&koordinat_tersimpan);
    let nomor_baa = input
        .nomor_baa
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("BAA-{}-{:03}", chrono::Local::now().format("%Y"), lokasi_id));

    let vlan: Option<u32> = row.try_get("vlan_id").unwrap_or(None);
    let mac_modem: Option<String> = row.try_get("mac_modem").unwrap_or(None);
    let power: Option<f64> = row.try_get("power").unwrap_or(None);
    let core: Option<String> = row.try_get("core").unwrap_or(None);
    let effective_core = input
        .core
        .clone()
        // Paket lama tetap diterima sebagai fallback untuk permintaan klien
        // sebelum field Core tersedia, tetapi hasil BAA selalu memakai satu
        // nilai yang sama untuk Paket dan Core.
        .or_else(|| input.paket.clone())
        .or_else(|| core.clone())
        .unwrap_or_default();
    let data = BaaTemplateData {
        nomor_baa,
        nama_pic: input
            .nama_pic
            .unwrap_or_else(|| row.try_get("pic").unwrap_or(None).unwrap_or_default()),
        alamat_pic: input.alamat_pic.unwrap_or_default(),
        phone: input
            .phone
            .unwrap_or_else(|| row.try_get("telepon").unwrap_or(None).unwrap_or_default()),
        tanggal_aktivasi,
        nama_pelanggan: input.nama_pelanggan.unwrap_or_else(|| nama_lokasi.clone()),
        alamat_pelanggan: input
            .alamat_pelanggan
            .unwrap_or_else(|| alamat_lokasi.clone()),
        // Paket pada template BAA merepresentasikan layanan core yang dipakai.
        // Gunakan satu sumber nilai agar Paket dan Core tidak berbeda.
        paket: effective_core.clone(),
        ont_onu: input.ont_onu.unwrap_or_default(),
        mac_address: input
            .mac_address
            .unwrap_or_else(|| mac_modem.clone().unwrap_or_default()),
        switch_media_converter: input.switch_media_converter.unwrap_or_default(),
        serial_number_ip_switch: input.serial_number_ip_switch.unwrap_or_default(),
        fiber_outlet_otb: input.fiber_outlet_otb.unwrap_or_default(),
        patch_core: input.patch_core.unwrap_or_default(),
        kabel_drop_wire_fo: input.kabel_drop_wire_fo.unwrap_or_default(),
        koordinat,
        signal_input_cpe: input.signal_input_cpe.unwrap_or_else(|| {
            power
                .map(|value| format!("{value} dBm"))
                .unwrap_or_default()
        }),
        vlan: input
            .vlan
            .unwrap_or_else(|| vlan.map(|value| value.to_string()).unwrap_or_default()),
        core: effective_core,
    };

    let mut stored_form = submitted_input;
    stored_form.nomor_baa = Some(data.nomor_baa.clone());
    stored_form.nama_pic = Some(data.nama_pic.clone());
    stored_form.alamat_pic = Some(data.alamat_pic.clone());
    stored_form.phone = Some(data.phone.clone());
    stored_form.tanggal_aktivasi = Some(data.tanggal_aktivasi.clone());
    stored_form.nama_pelanggan = Some(data.nama_pelanggan.clone());
    stored_form.alamat_pelanggan = Some(data.alamat_pelanggan.clone());
    stored_form.paket = Some(data.paket.clone());
    stored_form.ont_onu = Some(data.ont_onu.clone());
    stored_form.mac_address = Some(data.mac_address.clone());
    stored_form.switch_media_converter = Some(data.switch_media_converter.clone());
    stored_form.serial_number_ip_switch = Some(data.serial_number_ip_switch.clone());
    stored_form.fiber_outlet_otb = Some(data.fiber_outlet_otb.clone());
    stored_form.patch_core = Some(data.patch_core.clone());
    stored_form.kabel_drop_wire_fo = Some(data.kabel_drop_wire_fo.clone());
    // Simpan nilai mentah per baris. Bullet hanya dibuat saat dokumen
    // dirender, sehingga form tetap mudah diedit pada pembuatan berikutnya.
    stored_form.koordinat = Some(koordinat_tersimpan);
    stored_form.signal_input_cpe = Some(data.signal_input_cpe.clone());
    stored_form.vlan = Some(data.vlan.clone());
    stored_form.core = Some(data.core.clone());
    let form_json = serde_json::to_string(&stored_form).map_err(|error| {
        ApiError::internal(format!("Data form BAA tidak dapat disimpan: {error}"))
    })?;
    let folder_row = sqlx::query(
        "SELECT l.id, l.nama_lokasi, CAST(l.periode_awal AS CHAR) AS periode_awal, \
                CAST(l.periode_berakhir AS CHAR) AS periode_berakhir, l.link_folder_berkas, \
                l.pelanggan_id, p.nama_pelanggan, p.kode_pelanggan, \
                p.link_folder_berkas AS pelanggan_link \
         FROM lokasi l JOIN pelanggan p ON p.id = l.pelanggan_id \
         WHERE l.id = ? LIMIT 1",
    )
    .bind(lokasi_id)
    .fetch_one(&state.database)
    .await
    .map_err(ApiError::database)?;
    let period_folder = resolve_lokasi_period_folder(&state, &folder_row).await?;
    let baa_folder = ensure_category_folder(&state.drive, &period_folder, "BAA")
        .await
        .map_err(ApiError::drive)?;
    let safe_location = sanitize_folder_name(&nama_lokasi);
    let file_name = format!(
        "BAA_{}_{}.pdf",
        safe_location,
        chrono::Local::now().format("%Y%m%d%H%M%S")
    );
    let mime_type = "application/pdf";
    let source_file_name = format!(
        "BAA_{}_{}_source.docx",
        safe_location,
        chrono::Local::now().format("%Y%m%d%H%M%S%3f")
    );
    let docx_bytes = render_baa(&data).map_err(ApiError::internal)?;
    let bytes = match state
        .drive
        .upload_docx_for_pdf_conversion(&baa_folder, &source_file_name, docx_bytes)
        .await
    {
        Ok(source_file) => {
            let exported = state
                .drive
                .export_file_content(&source_file.id, mime_type)
                .await;
            let _ = state.drive.delete_file(&source_file.id).await;
            match exported {
                Ok(pdf_bytes) if !pdf_bytes.is_empty() => pdf_bytes,
                Err(error) => {
                    tracing::warn!(error = %error, "Konversi template BAA via Drive gagal; gunakan PDF fallback");
                    render_baa_pdf(&data)
                }
                Ok(_) => render_baa_pdf(&data),
            }
        }
        Err(error) => {
            tracing::warn!(error = %error, "Upload template BAA untuk konversi gagal; gunakan PDF fallback");
            render_baa_pdf(&data)
        }
    };
    let uploaded = state
        .drive
        .upload_file(&baa_folder, &file_name, mime_type, bytes.clone())
        .await
        .map_err(ApiError::drive)?;
    let drive_file_id = uploaded.id.clone();
    let drive_url = uploaded
        .web_view_link
        .unwrap_or_else(|| format!("https://drive.google.com/file/d/{drive_file_id}/view"));
    let pelanggan_id: u64 = row.try_get("pelanggan_id").map_err(ApiError::database)?;
    let existing = sqlx::query(
        "SELECT id, drive_file_id FROM dokumen \
         WHERE lokasi_id = ? AND kategori = 'BAA' ORDER BY id DESC LIMIT 1",
    )
    .bind(lokasi_id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?;
    let old_drive_file_id: Option<String> = existing
        .as_ref()
        .and_then(|row| row.try_get("drive_file_id").unwrap_or(None));
    let mut transaction = state.database.begin().await.map_err(ApiError::database)?;
    let document_id = if let Some(existing) = existing {
        let document_id: u64 = existing.try_get("id").map_err(ApiError::database)?;
        sqlx::query(
            "UPDATE dokumen SET pelanggan_id = ?, uploaded_by_user_id = ?, nama_file = ?, \
                    drive_file_id = ?, drive_folder_id = ?, drive_url = ?, ukuran_byte = ?, mime_type = ?, \
                    created_at = CURRENT_TIMESTAMP \
             WHERE id = ?",
        )
        .bind(pelanggan_id)
        .bind(auth.id)
        .bind(&file_name)
        .bind(&drive_file_id)
        .bind(&baa_folder)
        .bind(&drive_url)
        .bind(bytes.len() as u64)
        .bind(mime_type)
        .bind(document_id)
        .execute(&mut *transaction)
        .await
        .map_err(ApiError::database)?;
        document_id
    } else {
        let result = sqlx::query(
            "INSERT INTO dokumen \
             (pelanggan_id, lokasi_id, uploaded_by_user_id, kategori, nama_file, drive_file_id, drive_folder_id, drive_url, ukuran_byte, mime_type) \
             VALUES (?, ?, ?, 'BAA', ?, ?, ?, ?, ?, ?)",
        )
        .bind(pelanggan_id)
        .bind(lokasi_id)
        .bind(auth.id)
        .bind(&file_name)
        .bind(&drive_file_id)
        .bind(&baa_folder)
        .bind(&drive_url)
        .bind(bytes.len() as u64)
        .bind(mime_type)
        .execute(&mut *transaction)
        .await
        .map_err(ApiError::database)?;
        result.last_insert_id()
    };
    sqlx::query(
        "INSERT INTO titik_peta_baa_forms (lokasi_id, document_id, form_data, updated_by_user_id) \
         VALUES (?, ?, ?, ?) \
         ON DUPLICATE KEY UPDATE document_id = VALUES(document_id), form_data = VALUES(form_data), \
             updated_by_user_id = VALUES(updated_by_user_id), updated_at = CURRENT_TIMESTAMP",
    )
    .bind(lokasi_id)
    .bind(document_id)
    .bind(form_json)
    .bind(auth.id)
    .execute(&mut *transaction)
    .await
    .map_err(ApiError::database)?;
    transaction.commit().await.map_err(ApiError::database)?;
    if let Some(old_drive_file_id) = old_drive_file_id {
        if old_drive_file_id != drive_file_id {
            let _ = state.drive.delete_file(&old_drive_file_id).await;
        }
    }

    Ok((
        StatusCode::CREATED,
        Json(DocumentRow {
            id: document_id,
            pelanggan_id: Some(pelanggan_id),
            lokasi_id: Some(lokasi_id),
            billing_id: None,
            uploaded_by_user_id: Some(auth.id),
            kategori: "BAA".to_owned(),
            nama_file: file_name,
            ukuran_byte: Some(bytes.len() as u64),
            mime_type: Some(mime_type.to_owned()),
            created_at: chrono::Local::now()
                .naive_local()
                .format("%Y-%m-%d %H:%M:%S")
                .to_string(),
        }),
    ))
}
