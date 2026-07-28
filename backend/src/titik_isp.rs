use std::sync::Arc;

use axum::{
    Extension, Json, extract::Query, extract::State, http::StatusCode, response::IntoResponse,
};
use sqlx::Row;

use crate::{
    error::ApiError,
    models::{AuthUser, CreateTitikIspRequest, Page, Pagination, StatusResponse, TitikIspRow},
    state::AppState,
    util::{pagination, require_staff},
};

pub async fn list_isp_points(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Query(query): Query<Pagination>,
) -> Result<Json<Page<TitikIspRow>>, ApiError> {
    require_staff(&auth.role)?;

    let search_term = query.search.as_deref().unwrap_or("").trim();
    let has_search = !search_term.is_empty();
    let search_pattern = format!("%{}%", search_term);

    let (page, page_size, offset) = pagination(query);

    let total: i64 = if has_search {
        sqlx::query_scalar(
            "SELECT COUNT(*) FROM titik_isp ti \
             JOIN pelanggan p ON p.id = ti.pelanggan_id \
             WHERE p.nama_pelanggan LIKE ? OR ti.label LIKE ?",
        )
        .bind(&search_pattern)
        .bind(&search_pattern)
        .fetch_one(&state.database)
        .await
    } else {
        sqlx::query_scalar("SELECT COUNT(*) FROM titik_isp")
            .fetch_one(&state.database)
            .await
    }
    .map_err(ApiError::database)?;

    let rows = if has_search {
        sqlx::query(
            "SELECT ti.id, ti.pelanggan_id, p.nama_pelanggan, ti.label, \
                    CAST(ti.latitude AS DOUBLE) AS latitude, \
                    CAST(ti.longitude AS DOUBLE) AS longitude, \
                    CAST(ti.created_at AS CHAR) AS created_at, \
                    CAST(ti.updated_at AS CHAR) AS updated_at \
             FROM titik_isp ti \
             JOIN pelanggan p ON p.id = ti.pelanggan_id \
             WHERE p.nama_pelanggan LIKE ? OR ti.label LIKE ? \
             ORDER BY p.nama_pelanggan, ti.label \
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
            "SELECT ti.id, ti.pelanggan_id, p.nama_pelanggan, ti.label, \
                    CAST(ti.latitude AS DOUBLE) AS latitude, \
                    CAST(ti.longitude AS DOUBLE) AS longitude, \
                    CAST(ti.created_at AS CHAR) AS created_at, \
                    CAST(ti.updated_at AS CHAR) AS updated_at \
             FROM titik_isp ti \
             JOIN pelanggan p ON p.id = ti.pelanggan_id \
             ORDER BY p.nama_pelanggan, ti.label \
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
        .map(|row| -> Result<TitikIspRow, ApiError> {
            Ok(TitikIspRow {
                id: row.try_get("id").map_err(ApiError::database)?,
                pelanggan_id: row.try_get("pelanggan_id").map_err(ApiError::database)?,
                nama_pelanggan: row.try_get("nama_pelanggan").map_err(ApiError::database)?,
                label: row.try_get("label").map_err(ApiError::database)?,
                latitude: row.try_get("latitude").map_err(ApiError::database)?,
                longitude: row.try_get("longitude").map_err(ApiError::database)?,
                created_at: row.try_get("created_at").map_err(ApiError::database)?,
                updated_at: row.try_get("updated_at").map_err(ApiError::database)?,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Json(Page {
        data,
        total: total.max(0) as u64,
        page,
        page_size,
    }))
}

pub async fn upsert_isp_point(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Json(input): Json<CreateTitikIspRequest>,
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
    if input.latitude.abs() < f64::EPSILON && input.longitude.abs() < f64::EPSILON {
        return Err(ApiError::bad_request(
            "Koordinat 0,0 tidak dapat digunakan sebagai titik ISP.",
        ));
    }

    let label = input.label.as_deref().unwrap_or("").to_owned();

    if let Some(id) = input.id {
        sqlx::query(
            "UPDATE titik_isp SET pelanggan_id = ?, label = ?, latitude = ?, longitude = ? \
             WHERE id = ?",
        )
        .bind(input.pelanggan_id)
        .bind(&label)
        .bind(input.latitude)
        .bind(input.longitude)
        .bind(id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;
    } else {
        sqlx::query(
            "INSERT INTO titik_isp (pelanggan_id, label, latitude, longitude) \
             VALUES (?, ?, ?, ?)",
        )
        .bind(input.pelanggan_id)
        .bind(&label)
        .bind(input.latitude)
        .bind(input.longitude)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;
    }

    Ok((StatusCode::OK, Json(StatusResponse { status: "ok" })))
}

pub async fn delete_isp_point(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    axum::extract::Path(id): axum::extract::Path<u64>,
) -> Result<StatusCode, ApiError> {
    require_staff(&auth.role)?;

    let result = sqlx::query("DELETE FROM titik_isp WHERE id = ?")
        .bind(id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;

    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("Titik ISP tidak ditemukan."));
    }

    Ok(StatusCode::NO_CONTENT)
}
