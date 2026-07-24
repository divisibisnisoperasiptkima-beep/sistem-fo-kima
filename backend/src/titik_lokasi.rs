use std::sync::Arc;

use axum::{Extension, Json, extract::{Path, Query, State}, http::StatusCode, response::IntoResponse};
use sqlx::Row;

use crate::{
    error::ApiError,
    models::{
        AuthUser, CreateTitikLokasiDetailRequest, ListTitikLokasiDetailQuery, StatusResponse,
        TitikLokasiDetailRow, UpdateTitikLokasiDetailRequest,
    },
    state::AppState,
    util::require_staff,
};

fn validate_coordinates(latitude: f64, longitude: f64) -> Result<(), ApiError> {
    if !(-90.0..=90.0).contains(&latitude) {
        return Err(ApiError::bad_request("Latitude harus antara -90 dan 90."));
    }
    if !(-180.0..=180.0).contains(&longitude) {
        return Err(ApiError::bad_request("Longitude harus antara -180 dan 180."));
    }
    if latitude.abs() < f64::EPSILON && longitude.abs() < f64::EPSILON {
        return Err(ApiError::bad_request("Koordinat 0,0 tidak dapat digunakan."));
    }
    Ok(())
}

pub async fn list_location_points(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Query(query): Query<ListTitikLokasiDetailQuery>,
) -> Result<Json<Vec<TitikLokasiDetailRow>>, ApiError> {
    require_staff(&auth.role)?;

    let rows = sqlx::query(
        "SELECT id, lokasi_id, label, \
                CAST(latitude AS DOUBLE) AS latitude, \
                CAST(longitude AS DOUBLE) AS longitude, \
                CAST(created_at AS CHAR) AS created_at, \
                CAST(updated_at AS CHAR) AS updated_at \
         FROM titik_lokasi_detail WHERE lokasi_id = ? ORDER BY id",
    )
    .bind(query.lokasi_id)
    .fetch_all(&state.database)
    .await
    .map_err(ApiError::database)?;

    let data = rows.into_iter().map(|row| -> Result<TitikLokasiDetailRow, ApiError> {
        Ok(TitikLokasiDetailRow {
            id: row.try_get("id").map_err(ApiError::database)?,
            lokasi_id: row.try_get("lokasi_id").map_err(ApiError::database)?,
            label: row.try_get("label").map_err(ApiError::database)?,
            latitude: row.try_get("latitude").map_err(ApiError::database)?,
            longitude: row.try_get("longitude").map_err(ApiError::database)?,
            created_at: row.try_get("created_at").map_err(ApiError::database)?,
            updated_at: row.try_get("updated_at").map_err(ApiError::database)?,
        })
    }).collect::<Result<Vec<_>, _>>()?;

    Ok(Json(data))
}

pub async fn create_location_point(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Json(input): Json<CreateTitikLokasiDetailRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_staff(&auth.role)?;
    validate_coordinates(input.latitude, input.longitude)?;
    if input.label.trim().is_empty() {
        return Err(ApiError::bad_request("Label titik lokasi wajib diisi."));
    }

    let exists: Option<u64> = sqlx::query_scalar("SELECT id FROM lokasi WHERE id = ? LIMIT 1")
        .bind(input.lokasi_id).fetch_optional(&state.database).await.map_err(ApiError::database)?;
    if exists.is_none() { return Err(ApiError::not_found("Lokasi kontrak tidak ditemukan.")); }

    sqlx::query("INSERT INTO titik_lokasi_detail (lokasi_id, label, latitude, longitude) VALUES (?, ?, ?, ?)")
        .bind(input.lokasi_id).bind(input.label.trim()).bind(input.latitude).bind(input.longitude)
        .execute(&state.database).await.map_err(ApiError::database)?;
    Ok((StatusCode::CREATED, Json(StatusResponse { status: "ok" })))
}

pub async fn update_location_point(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<u64>,
    Json(input): Json<UpdateTitikLokasiDetailRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_staff(&auth.role)?;
    validate_coordinates(input.latitude, input.longitude)?;
    if input.label.trim().is_empty() { return Err(ApiError::bad_request("Label titik lokasi wajib diisi.")); }
    let result = sqlx::query("UPDATE titik_lokasi_detail SET label = ?, latitude = ?, longitude = ? WHERE id = ?")
        .bind(input.label.trim()).bind(input.latitude).bind(input.longitude).bind(id)
        .execute(&state.database).await.map_err(ApiError::database)?;
    if result.rows_affected() == 0 { return Err(ApiError::not_found("Titik lokasi tidak ditemukan.")); }
    Ok((StatusCode::OK, Json(StatusResponse { status: "ok" })))
}

pub async fn delete_location_point(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<u64>,
) -> Result<StatusCode, ApiError> {
    require_staff(&auth.role)?;
    let result = sqlx::query("DELETE FROM titik_lokasi_detail WHERE id = ?").bind(id)
        .execute(&state.database).await.map_err(ApiError::database)?;
    if result.rows_affected() == 0 { return Err(ApiError::not_found("Titik lokasi tidak ditemukan.")); }
    Ok(StatusCode::NO_CONTENT)
}
