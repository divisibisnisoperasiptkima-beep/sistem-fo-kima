use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use argon2::{Argon2, PasswordHash, PasswordVerifier};
use axum::{
    Extension, Json,
    extract::{ConnectInfo, Request, State},
    http::header,
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use sqlx::Row;

use crate::{
    error::ApiError,
    models::{AuthUser, ChangePasswordRequest, Claims, LoginRequest, LoginResponse, SessionUser},
    state::AppState,
    util::hash_password,
};

fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

const CHANGE_PASSWORD_PATH: &str = "/api/auth/change-password";

fn blocks_pending_password_change(must_change_password: bool, path: &str) -> bool {
    must_change_password && path != CHANGE_PASSWORD_PATH
}

fn issue_session(
    state: &AppState,
    user: SessionUser,
    session_version: u64,
    must_change_password: bool,
) -> Result<LoginResponse, ApiError> {
    let now = now_seconds();
    let expires_in = state.token_expiry_seconds;
    let claims = Claims {
        sub: user.id,
        email: user.email.clone(),
        role: user.role.clone(),
        session_version,
        iat: now,
        exp: now + expires_in,
    };
    let access_token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .map_err(|_| ApiError::internal("Gagal membuat token akses."))?;

    Ok(LoginResponse {
        access_token,
        token_type: "Bearer",
        expires_in,
        user,
        must_change_password,
    })
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<std::net::SocketAddr>,
    Json(input): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, ApiError> {
    let ip = addr.ip().to_string();

    if !state.rate_limit_check(&ip) {
        return Err(ApiError::too_many_requests(
            "Terlalu banyak percobaan login. Silakan coba lagi nanti.",
        ));
    }

    let email = input.email.trim().to_lowercase();
    if email.is_empty() || input.password.is_empty() {
        return Err(ApiError::bad_request("Email dan kata sandi wajib diisi."));
    }

    let row = sqlx::query(
        "SELECT id, email, password_hash, role, session_version, must_change_password, \
                is_active, (locked_until IS NULL OR locked_until <= NOW()) AS is_unlocked \
         FROM users WHERE email = ? LIMIT 1",
    )
    .bind(&email)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?;

    let Some(row) = row else {
        return Err(ApiError::unauthorized("Email atau kata sandi tidak valid."));
    };

    let user_id: u64 = row.try_get("id").map_err(ApiError::database)?;
    let is_active: bool = row.try_get("is_active").map_err(ApiError::database)?;
    let is_unlocked: bool = row.try_get("is_unlocked").map_err(ApiError::database)?;
    let password_hash: String = row.try_get("password_hash").map_err(ApiError::database)?;
    let parsed_hash = PasswordHash::new(&password_hash).map_err(|_| {
        tracing::error!(user_id, "Corrupt password hash in database");
        ApiError::internal("Terjadi kesalahan pada server.")
    })?;

    if Argon2::default()
        .verify_password(input.password.as_bytes(), &parsed_hash)
        .is_err()
    {
        sqlx::query(
            "UPDATE users \
             SET failed_login_attempts = failed_login_attempts + 1, \
                 locked_until = CASE \
                   WHEN failed_login_attempts + 1 >= ? \
                   THEN DATE_ADD(NOW(), INTERVAL ? MINUTE) \
                   ELSE locked_until \
                 END \
             WHERE id = ?",
        )
        .bind(state.login_max_failed_attempts)
        .bind(state.login_lockout_minutes)
        .bind(user_id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;

        return Err(ApiError::unauthorized("Email atau kata sandi tidak valid."));
    }

    if !is_active {
        return Err(ApiError::unauthorized(
            "Akun Anda sudah dinonaktifkan. Hubungi administrator.",
        ));
    }

    if !is_unlocked {
        return Err(ApiError::unauthorized(
            "Akun sedang terkunci. Silakan coba lagi nanti.",
        ));
    }

    let user = SessionUser {
        id: user_id,
        email: row.try_get("email").map_err(ApiError::database)?,
        role: row.try_get("role").map_err(ApiError::database)?,
    };
    let session_version: u64 = row.try_get("session_version").map_err(ApiError::database)?;
    let must_change_password: bool = row
        .try_get("must_change_password")
        .map_err(ApiError::database)?;
    let response = issue_session(&state, user, session_version, must_change_password)?;

    sqlx::query("UPDATE users SET last_login_at = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id = ?")
        .bind(response.user.id)
        .execute(&state.database)
        .await
        .map_err(ApiError::database)?;

    Ok(Json(response))
}

pub async fn require_auth(
    State(state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let token = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .ok_or_else(|| ApiError::unauthorized("Token Bearer diperlukan."))?;

    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_required_spec_claims(&["exp"]);

    let claims = decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &validation,
    )
    .map_err(|_| ApiError::unauthorized("Token tidak valid atau sudah kedaluwarsa."))?
    .claims;

    if !matches!(claims.role.as_str(), "admin" | "teknisi" | "isp") {
        return Err(ApiError::forbidden("Role pengguna tidak diizinkan."));
    }

    let current = sqlx::query(
        "SELECT session_version, role, must_change_password \
         FROM users WHERE id = ? AND is_active = 1 LIMIT 1",
    )
    .bind(claims.sub)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?
    .ok_or_else(|| ApiError::unauthorized("Pengguna tidak ditemukan atau tidak aktif."))?;
    let current_version: u64 = current
        .try_get("session_version")
        .map_err(ApiError::database)?;
    let current_role: String = current.try_get("role").map_err(ApiError::database)?;
    let must_change_password: bool = current
        .try_get("must_change_password")
        .map_err(ApiError::database)?;

    if current_version != claims.session_version || current_role != claims.role {
        return Err(ApiError::unauthorized(
            "Sesi telah berakhir. Silakan login kembali.",
        ));
    }

    if blocks_pending_password_change(must_change_password, request.uri().path()) {
        return Err(ApiError::forbidden(
            "Anda wajib mengubah kata sandi sebelum mengakses fitur lain.",
        ));
    }

    request.extensions_mut().insert(AuthUser {
        id: claims.sub,
        role: claims.role,
    });
    Ok(next.run(request).await)
}

/// Mengembalikan identitas sesi yang sudah diverifikasi middleware.
/// Endpoint ini dipakai frontend saat aplikasi dibuka kembali dari localStorage.
pub async fn current_session(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
) -> Result<Json<SessionUser>, ApiError> {
    let row =
        sqlx::query("SELECT id, email, role FROM users WHERE id = ? AND is_active = 1 LIMIT 1")
            .bind(auth.id)
            .fetch_optional(&state.database)
            .await
            .map_err(ApiError::database)?
            .ok_or_else(|| ApiError::unauthorized("Pengguna tidak ditemukan atau tidak aktif."))?;

    Ok(Json(SessionUser {
        id: row.try_get("id").map_err(ApiError::database)?,
        email: row.try_get("email").map_err(ApiError::database)?,
        role: row.try_get("role").map_err(ApiError::database)?,
    }))
}

pub async fn change_password(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Json(input): Json<ChangePasswordRequest>,
) -> Result<Json<LoginResponse>, ApiError> {
    if input.new_password.is_empty() {
        return Err(ApiError::bad_request("Kata sandi baru wajib diisi."));
    }
    if input.new_password.len() < 6 {
        return Err(ApiError::bad_request("Kata sandi baru minimal 6 karakter."));
    }

    let password_hash = hash_password(&input.new_password)?;

    let result = sqlx::query(
        "UPDATE users \
         SET password_hash = ?, must_change_password = 0, session_version = session_version + 1 \
         WHERE id = ? AND must_change_password = 1",
    )
    .bind(&password_hash)
    .bind(auth.id)
    .execute(&state.database)
    .await
    .map_err(ApiError::database)?;

    if result.rows_affected() != 1 {
        return Err(ApiError::forbidden(
            "Anda tidak diwajibkan mengubah kata sandi saat ini.",
        ));
    }

    let row = sqlx::query(
        "SELECT id, email, role, session_version \
         FROM users WHERE id = ? AND is_active = 1 LIMIT 1",
    )
    .bind(auth.id)
    .fetch_optional(&state.database)
    .await
    .map_err(ApiError::database)?
    .ok_or_else(|| ApiError::unauthorized("Pengguna tidak ditemukan atau tidak aktif."))?;
    let user = SessionUser {
        id: row.try_get("id").map_err(ApiError::database)?,
        email: row.try_get("email").map_err(ApiError::database)?,
        role: row.try_get("role").map_err(ApiError::database)?,
    };
    let session_version: u64 = row.try_get("session_version").map_err(ApiError::database)?;

    Ok(Json(issue_session(&state, user, session_version, false)?))
}

#[cfg(test)]
mod tests {
    use super::{CHANGE_PASSWORD_PATH, blocks_pending_password_change};

    #[test]
    fn pending_password_change_only_allows_its_own_endpoint() {
        assert_eq!(CHANGE_PASSWORD_PATH, "/api/auth/change-password");
        assert!(!blocks_pending_password_change(true, CHANGE_PASSWORD_PATH));
        assert!(blocks_pending_password_change(true, "/api/dashboard"));
        assert!(blocks_pending_password_change(true, "/api/auth/session"));
        assert!(!blocks_pending_password_change(false, "/api/dashboard"));
    }
}
