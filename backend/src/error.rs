use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;

#[derive(Serialize)]
pub struct ErrorResponse {
    pub message: String,
}

pub struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    pub fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, message)
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNAUTHORIZED, message)
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, message)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, message)
    }

    pub fn too_many_requests(message: impl Into<String>) -> Self {
        Self::new(StatusCode::TOO_MANY_REQUESTS, message)
    }

    pub fn unsupported_media_type(message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNSUPPORTED_MEDIA_TYPE, message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, message)
    }

    pub fn database(error: sqlx::Error) -> Self {
        tracing::error!(%error, "Database query failed");
        Self::internal("Terjadi kesalahan pada database.")
    }

    pub fn drive(error: impl std::fmt::Display) -> Self {
        tracing::error!(error = %error, "Google Drive operation failed");
        Self::internal("Operasi Google Drive gagal.")
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ErrorResponse {
                message: self.message,
            }),
        )
            .into_response()
    }
}
