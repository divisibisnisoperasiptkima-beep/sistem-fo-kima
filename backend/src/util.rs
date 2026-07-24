use chrono::NaiveDate;

use crate::{error::ApiError, models::Pagination};

pub fn pagination(query: Pagination) -> (u64, u64, u64) {
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
    (page, page_size, (page - 1) * page_size)
}

pub fn required_env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("{name} wajib diatur pada backend/.env"))
}

pub fn optional_env_bool(name: &str, default: bool) -> bool {
    match std::env::var(name) {
        Ok(value) => matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        ),
        Err(_) => default,
    }
}

pub fn optional_env_u64(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(default)
}

pub fn optional_env_usize(name: &str, default: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(default)
}

pub fn trim_opt(value: Option<String>) -> Option<String> {
    value
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty())
}

pub fn optional_trim_or_keep(input: Option<String>, existing: Option<String>) -> Option<String> {
    match input {
        Some(v) => {
            let trimmed = v.trim().to_owned();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        }
        None => existing,
    }
}

pub fn is_staff(role: &str) -> bool {
    matches!(role, "admin" | "teknisi")
}

pub fn require_staff(role: &str) -> Result<(), ApiError> {
    if is_staff(role) {
        Ok(())
    } else {
        Err(ApiError::forbidden(
            "Hanya admin atau teknisi yang diizinkan.",
        ))
    }
}

pub fn require_business_read(role: &str) -> Result<(), ApiError> {
    if matches!(role, "admin" | "isp") {
        Ok(())
    } else {
        Err(ApiError::forbidden(
            "Role teknisi hanya diizinkan mengakses data peta.",
        ))
    }
}

pub fn require_admin(role: &str) -> Result<(), ApiError> {
    if role == "admin" {
        Ok(())
    } else {
        Err(ApiError::forbidden("Hanya administrator yang diizinkan."))
    }
}

pub fn hash_password(password: &str) -> Result<String, ApiError> {
    use argon2::{
        Argon2,
        password_hash::{PasswordHasher, SaltString, rand_core::OsRng},
    };

    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|_| ApiError::internal("Gagal menghasilkan hash kata sandi."))
}

pub fn parse_date(value: &str) -> Result<NaiveDate, ApiError> {
    let trimmed = value.trim();
    NaiveDate::parse_from_str(trimmed, "%Y-%m-%d")
        .or_else(|_| NaiveDate::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S"))
        .map_err(|_| ApiError::bad_request(format!("Format tanggal tidak valid: {value}")))
}

pub fn validate_string_length(value: &str, max_len: usize, field_name: &str) -> Result<(), ApiError> {
    if value.len() > max_len {
        return Err(ApiError::bad_request(format!(
            "{field_name} maksimal {max_len} karakter."
        )));
    }
    Ok(())
}

pub fn validate_opt_string_length(
    value: Option<&str>,
    max_len: usize,
    field_name: &str,
) -> Result<(), ApiError> {
    if let Some(v) = value {
        validate_string_length(v, max_len, field_name)?;
    }
    Ok(())
}
