use std::sync::Arc;

use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use sqlx::Row;

use crate::{
    error::ApiError,
    models::{AuthUser, CreateMapPointRequest, MapPointRow, Page, Pagination, StatusResponse},
    state::AppState,
    util::{pagination, require_staff},
};

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
                    p.nama_pelanggan, \
                    COALESCE((SELECT JSON_OBJECT('latitude', tld.latitude, 'longitude', tld.longitude, 'label', tld.label) \
                              FROM titik_lokasi_detail tld WHERE tld.lokasi_id = l.id ORDER BY tld.id LIMIT 1), tp.points) AS points, \
                    tp.approval_status, tp.updated_at \
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
                    p.nama_pelanggan, \
                    COALESCE((SELECT JSON_OBJECT('latitude', tld.latitude, 'longitude', tld.longitude, 'label', tld.label) \
                              FROM titik_lokasi_detail tld WHERE tld.lokasi_id = l.id ORDER BY tld.id LIMIT 1), tp.points) AS points, \
                    tp.approval_status, tp.updated_at \
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
            points: row.try_get("points").ok(),
            approval_status: row.try_get("approval_status").unwrap_or(None),
            updated_at: row.try_get("updated_at").unwrap_or(None),
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
