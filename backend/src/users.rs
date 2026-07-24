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
    models::{
        CreateUserRequest, Page, ResetPasswordRequest, StatusResponse,
        UpdateUserRequest, UserRow,
    },
    state::AppState,
    util::{self, require_admin},
};

const USER_SELECT: &str = "\
    SELECT id, email, role, is_active, \
           CAST(disabled_at AS CHAR) AS disabled_at, \
           CAST(last_login_at AS CHAR) AS last_login_at, \
           must_change_password, failed_login_attempts, \
           CAST(locked_until AS CHAR) AS locked_until, \
           CAST(created_at AS CHAR) AS created_at, \
           CAST(updated_at AS CHAR) AS updated_at \
    FROM users";

fn map_user_row(row: &sqlx::mysql::MySqlRow) -> Result<UserRow, ApiError> {
    Ok(UserRow {
        id: row.try_get("id").map_err(ApiError::database)?,
        email: row.try_get("email").map_err(ApiError::database)?,
        role: row.try_get("role").map_err(ApiError::database)?,
        is_active: row.try_get::<bool, _>("is_active").map_err(ApiError::database)?,
        disabled_at: row.try_get::<Option<String>, _>("disabled_at").map_err(ApiError::database)?,
        last_login_at: row.try_get::<Option<String>, _>("last_login_at").map_err(ApiError::database)?,
        must_change_password: row.try_get::<bool, _>("must_change_password").map_err(ApiError::database)?,
        failed_login_attempts: row.try_get::<u16, _>("failed_login_attempts").map_err(ApiError::database)?,
        locked_until: row.try_get::<Option<String>, _>("locked_until").map_err(ApiError::database)?,
        created_at: row.try_get("created_at").map_err(ApiError::database)?,
        updated_at: row.try_get("updated_at").map_err(ApiError::database)?,
    })
}

fn validate_role(role: &str) -> Result<(), ApiError> {
    if matches!(role, "admin" | "teknisi" | "isp") {
        Ok(())
    } else {
        Err(ApiError::bad_request(
            "Role harus salah satu dari: admin, teknisi, atau isp.",
        ))
    }
}

pub async fn list_users(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Query(query): Query<crate::models::Pagination>,
) -> Result<Json<Page<UserRow>>, ApiError> {
    require_admin(&auth.role)?;

    let search_term = query.search.clone();
    let (page, page_size, offset) = util::pagination(query);
    let search_pattern = search_term
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .map(|s| format!("%{}%", s.trim()));

    let total: i64 = if let Some(ref pat) = search_pattern {
        sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE email LIKE ?")
            .bind(pat)
            .fetch_one(&state.database)
            .await
            .map_err(ApiError::database)?
    } else {
        sqlx::query_scalar("SELECT COUNT(*) FROM users")
            .fetch_one(&state.database)
            .await
            .map_err(ApiError::database)?
    };

    let rows: Vec<UserRow> = if let Some(ref pat) = search_pattern {
        sqlx::query(&format!(
            "{USER_SELECT} WHERE email LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ))
        .bind(pat)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.database)
        .await
        .map_err(ApiError::database)?
    } else {
        sqlx::query(&format!(
            "{USER_SELECT} ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ))
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.database)
        .await
        .map_err(ApiError::database)?
    }
    .iter()
    .map(|row| map_user_row(row))
    .collect::<Result<Vec<_>, _>>()?;

    Ok(Json(Page {
        data: rows,
        total: total.max(0) as u64,
        page,
        page_size,
    }))
}

pub async fn create_user(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Json(input): Json<CreateUserRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&auth.role)?;

    let email = input.email.trim().to_lowercase();
    if email.is_empty() {
        return Err(ApiError::bad_request("Email wajib diisi."));
    }
    util::validate_string_length(&email, state.max_string_length, "Email")?;

    if input.password.len() < 6 {
        return Err(ApiError::bad_request("Kata sandi minimal 6 karakter."));
    }

    validate_role(input.role.trim())?;
    let role = input.role.trim().to_owned();

    let exists: bool = sqlx::query_scalar(
        "SELECT COUNT(*) > 0 FROM users WHERE email = ?",
    )
    .bind(&email)
    .fetch_one(&state.database)
    .await
    .map_err(ApiError::database)?;

    if exists {
        return Err(ApiError::conflict("Email sudah terdaftar."));
    }

    let password_hash = util::hash_password(&input.password)?;

    let result = sqlx::query(
        "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
    )
    .bind(&email)
    .bind(&password_hash)
    .bind(&role)
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;

    let id = result.last_insert_id();

    let row = sqlx::query(&format!("{USER_SELECT} WHERE id = ? LIMIT 1"))
        .bind(id)
        .fetch_one(&state.database)
        .await
        .map_err(ApiError::database)?;

    Ok((StatusCode::CREATED, Json(map_user_row(&row)?)))
}

pub async fn update_user(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(id): Path<u64>,
    Json(input): Json<UpdateUserRequest>,
) -> Result<Json<UserRow>, ApiError> {
    require_admin(&auth.role)?;

    let existing = sqlx::query(&format!("{USER_SELECT} WHERE id = ? LIMIT 1"))
        .bind(id)
        .fetch_optional(&state.database)
        .await
        .map_err(ApiError::database)?
        .ok_or_else(|| ApiError::not_found("Pengguna tidak ditemukan."))?;

    let email = if let Some(ref e) = input.email {
        let trimmed = e.trim().to_lowercase();
        if trimmed.is_empty() {
            return Err(ApiError::bad_request("Email tidak boleh kosong."));
        }
        util::validate_string_length(&trimmed, state.max_string_length, "Email")?;

        let dup: bool = sqlx::query_scalar(
            "SELECT COUNT(*) > 0 FROM users WHERE email = ? AND id != ?",
        )
        .bind(&trimmed)
        .bind(id)
        .fetch_one(&state.database)
        .await
        .map_err(ApiError::database)?;

        if dup {
            return Err(ApiError::conflict("Email sudah digunakan oleh pengguna lain."));
        }
        trimmed
    } else {
        existing.try_get::<String, _>("email").map_err(ApiError::database)?
    };

    let role = if let Some(ref r) = input.role {
        validate_role(r.trim())?;
        let new_role = r.trim().to_owned();

        if auth.id == id && new_role != "admin" {
            return Err(ApiError::forbidden(
                "Anda tidak dapat mengubah role diri sendiri dari admin.",
            ));
        }

        let admin_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1",
        )
        .fetch_one(&state.database)
        .await
        .map_err(ApiError::database)?;

        if auth.id == id && admin_count <= 1 && new_role != "admin" {
            return Err(ApiError::forbidden(
                "Anda adalah administrator terakhir. Role tidak dapat diubah.",
            ));
        }

        new_role
    } else {
        existing.try_get::<String, _>("role").map_err(ApiError::database)?
    };

    let is_active = if let Some(active) = input.is_active {
        if auth.id == id && !active {
            return Err(ApiError::forbidden(
                "Anda tidak dapat menonaktifkan akun sendiri.",
            ));
        }
        active
    } else {
        existing.try_get::<bool, _>("is_active").map_err(ApiError::database)?
    };

    if is_active {
        sqlx::query(
            "UPDATE users SET email = ?, role = ?, is_active = 1, disabled_at = NULL WHERE id = ?",
        )
        .bind(&email)
        .bind(&role)
        .bind(id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;
    } else {
        sqlx::query(
            "UPDATE users SET email = ?, role = ?, is_active = 0, disabled_at = NOW(), session_version = session_version + 1 WHERE id = ?",
        )
        .bind(&email)
        .bind(&role)
        .bind(id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;
    }

    let row = sqlx::query(&format!("{USER_SELECT} WHERE id = ? LIMIT 1"))
        .bind(id)
        .fetch_one(&state.database)
        .await
        .map_err(ApiError::database)?;

    Ok(Json(map_user_row(&row)?))
}

pub async fn delete_user(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(id): Path<u64>,
) -> Result<StatusCode, ApiError> {
    require_admin(&auth.role)?;

    if auth.id == id {
        return Err(ApiError::forbidden(
            "Anda tidak dapat menghapus akun sendiri.",
        ));
    }

    let existing = sqlx::query(
        "SELECT id, role, is_active FROM users WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?
    .ok_or_else(|| ApiError::not_found("Pengguna tidak ditemukan."))?;

    let target_role: String = existing.try_get("role").map_err(ApiError::database)?;
    let target_active: bool = existing.try_get("is_active").map_err(ApiError::database)?;

    if target_role == "admin" && target_active {
        let admin_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1",
        )
        .fetch_one(&state.database)
        .await
        .map_err(ApiError::database)?;

        if admin_count <= 1 {
            return Err(ApiError::forbidden(
                "Tidak dapat menghapus administrator terakhir yang aktif.",
            ));
        }
    }

    // Audit menyimpan foreign key wajib ke akun target, sehingga akun tidak
    // dihapus fisik. Nonaktifkan sesi agar akun langsung tidak dapat login.
    sqlx::query(
        "UPDATE users \
         SET is_active = 0, disabled_at = NOW(), session_version = session_version + 1 \
         WHERE id = ?",
    )
        .bind(id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn reset_password(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<crate::models::AuthUser>,
    Path(id): Path<u64>,
    Json(input): Json<ResetPasswordRequest>,
) -> Result<Json<StatusResponse>, ApiError> {
    require_admin(&auth.role)?;

    if input.new_password.len() < 6 {
        return Err(ApiError::bad_request("Kata sandi baru minimal 6 karakter."));
    }

    let exists: bool = sqlx::query_scalar(
        "SELECT COUNT(*) > 0 FROM users WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&state.database)
    .await
    .map_err(ApiError::database)?;

    if !exists {
        return Err(ApiError::not_found("Pengguna tidak ditemukan."));
    }

    let password_hash = util::hash_password(&input.new_password)?;

    sqlx::query(
        "UPDATE users SET password_hash = ?, session_version = session_version + 1, \
         must_change_password = 1, locked_until = NULL, failed_login_attempts = 0 \
         WHERE id = ?",
    )
    .bind(&password_hash)
    .bind(id)
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;

    Ok(Json(StatusResponse {
        status: "password_reset",
    }))
}
