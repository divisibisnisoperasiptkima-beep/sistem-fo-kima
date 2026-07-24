use sqlx::{MySqlPool, Row};

use crate::error::ApiError;

pub async fn assert_pelanggan_access(
    database: &MySqlPool,
    user_id: u64,
    role: &str,
    pelanggan_id: u64,
) -> Result<(), ApiError> {
    if role != "isp" {
        return Ok(());
    }
    let allowed: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM user_pelanggan_access \
         WHERE user_id = ? AND pelanggan_id = ?",
    )
    .bind(user_id)
    .bind(pelanggan_id)
    .fetch_one(database)
    .await
    .map_err(ApiError::database)?;
    if allowed == 0 {
        return Err(ApiError::forbidden(
            "Akses ke pelanggan ini tidak diizinkan.",
        ));
    }
    Ok(())
}

pub async fn resolve_lokasi_pelanggan_id(
    database: &MySqlPool,
    lokasi_id: u64,
) -> Result<u64, ApiError> {
    let row = sqlx::query("SELECT pelanggan_id FROM lokasi WHERE id = ? LIMIT 1")
        .bind(lokasi_id)
        .fetch_optional(database)
        .await
        .map_err(ApiError::database)?;
    let Some(row) = row else {
        return Err(ApiError::not_found("Kontrak/lokasi tidak ditemukan."));
    };
    row.try_get("pelanggan_id").map_err(ApiError::database)
}

pub async fn resolve_billing_context(
    database: &MySqlPool,
    billing_id: u64,
) -> Result<(u64, u64), ApiError> {
    let row = sqlx::query(
        "SELECT b.lokasi_id, l.pelanggan_id \
         FROM billing b JOIN lokasi l ON l.id = b.lokasi_id \
         WHERE b.id = ? LIMIT 1",
    )
    .bind(billing_id)
    .fetch_optional(database)
    .await
    .map_err(ApiError::database)?;
    let Some(row) = row else {
        return Err(ApiError::not_found("Billing tidak ditemukan."));
    };
    Ok((
        row.try_get("lokasi_id").map_err(ApiError::database)?,
        row.try_get("pelanggan_id").map_err(ApiError::database)?,
    ))
}
