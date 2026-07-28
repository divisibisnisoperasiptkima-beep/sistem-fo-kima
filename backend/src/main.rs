mod access;
mod auth;
mod dashboard;
mod dokumen;
mod drive;
mod error;
mod kontrak;
mod models;
mod pelanggan;
mod schema;
mod state;
mod titik_isp;
mod titik_lokasi;
mod titik_peta;
mod users;
mod util;

use std::{collections::HashMap, env, net::SocketAddr, sync::Arc};

#[allow(unused_imports)]
use axum::routing::delete;
use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    middleware,
    response::IntoResponse,
    routing::{get, patch, post, put},
};
use tokio::sync::{Mutex, RwLock};
use tower_http::{cors::CorsLayer, limit::RequestBodyLimitLayer, trace::TraceLayer};
use tracing::info;

use crate::{
    auth::{change_password, current_session, login, require_auth},
    dashboard::get_dashboard,
    dokumen::{
        delete_document, download_document, list_documents, list_isp_documents, preview_document,
        rename_document, sync_drive_documents, sync_drive_documents_internal, upload_document,
    },
    drive::DriveClient,
    kontrak::{
        create_contract, delete_contract, extend_contract, get_next_kontrak_code, list_contracts,
        sync_expired_contract_statuses, update_contract, upgrade_contract,
    },
    models::StatusResponse,
    pelanggan::{
        create_customer, delete_customer, get_next_pelanggan_code, list_customers, update_customer,
    },
    schema::ensure_application_schema,
    state::AppState,
    titik_isp::{delete_isp_point, list_isp_points, upsert_isp_point},
    titik_lokasi::{
        create_location_point, delete_location_point, list_location_points, update_location_point,
    },
    titik_peta::{delete_map_point, list_map_points, upsert_map_point},
    users::{
        create_user, delete_user, list_user_pelanggan_access, list_users, reset_password,
        update_user, update_user_pelanggan_access,
    },
    util::{optional_env_u64, optional_env_usize, required_env},
};

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(env::var("RUST_LOG").unwrap_or_else(|_| "info,tower_http=info".to_owned()))
        .init();

    let database_url = required_env("DATABASE_URL");
    let jwt_secret: Arc<str> = required_env("JWT_SECRET").into();
    let bind_addr: SocketAddr = env::var("BIND_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8080".to_owned())
        .parse()
        .expect("BIND_ADDR harus berupa alamat socket, misalnya 127.0.0.1:8080");

    let database = sqlx::MySqlPool::connect(&database_url)
        .await
        .expect("Tidak dapat terhubung ke MySQL. Periksa DATABASE_URL pada backend/.env.");

    ensure_application_schema(&database)
        .await
        .expect("Gagal menyiapkan skema aplikasi di MySQL");

    let drive = DriveClient::from_env().expect("Konfigurasi Google Drive tidak lengkap");

    let rate_limiter = Arc::new(RwLock::new(HashMap::new()));

    let state = Arc::new(AppState {
        database,
        jwt_secret,
        drive,
        drive_sync_lock: Arc::new(Mutex::new(())),
        rate_limiter,
        core_capacity: optional_env_u64("CORE_CAPACITY", 384),
        max_upload_bytes: optional_env_usize("MAX_UPLOAD_BYTES", 25 * 1024 * 1024) as usize,
        max_string_length: optional_env_usize("MAX_STRING_LENGTH", 500) as usize,
        token_expiry_seconds: optional_env_u64("TOKEN_EXPIRY_SECONDS", 60 * 60 * 8),
        login_rate_limit: optional_env_usize("LOGIN_RATE_LIMIT", 5) as usize,
        login_rate_window_secs: optional_env_u64("LOGIN_RATE_WINDOW_SECS", 60),
        login_max_failed_attempts: optional_env_u64("LOGIN_MAX_FAILED_ATTEMPTS", 5) as u32,
        login_lockout_minutes: optional_env_u64("LOGIN_LOCKOUT_MINUTES", 15) as u32,
    });

    // Sinkronisasi awal memastikan data lama langsung mengikuti tanggal kontrak
    // saat backend dinyalakan.
    match sync_expired_contract_statuses(&state.database).await {
        Ok(updated) if updated > 0 => {
            info!(updated, "Contract statuses synchronized at startup");
        }
        Ok(_) => {}
        Err(error) => {
            tracing::error!(%error, "Initial contract status synchronization failed");
        }
    }

    // Jalankan kembali setiap hari agar status database tetap benar walaupun
    // tidak ada pengguna yang membuka halaman kontrak.
    let status_sync_database = state.database.clone();
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(24 * 60 * 60));
        ticker.tick().await;
        loop {
            ticker.tick().await;
            match sync_expired_contract_statuses(&status_sync_database).await {
                Ok(updated) if updated > 0 => {
                    tracing::info!(updated, "Contract statuses synchronized by daily job");
                }
                Ok(_) => {}
                Err(error) => {
                    tracing::error!(%error, "Daily contract status synchronization failed");
                }
            }
        }
    });

    // Sinkronisasi file Drive dijalankan berkala. Proses ini hanya membaca
    // folder yang sudah terdaftar di database dan tidak menghapus metadata.
    let drive_sync_state = state.clone();
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(10 * 60));
        ticker.tick().await;
        loop {
            ticker.tick().await;
            match sync_drive_documents_internal(&drive_sync_state).await {
                Ok(result) if result.new_documents > 0 => {
                    info!(
                        new_documents = result.new_documents,
                        files_scanned = result.files_scanned,
                        "Drive documents synchronized"
                    );
                }
                Ok(_) => {}
                Err(error) => {
                    tracing::error!(%error, "Drive document synchronization failed");
                }
            }
        }
    });

    let protected = Router::new()
        .route("/api/pelanggan", get(list_customers).post(create_customer))
        .route(
            "/api/pelanggan/{id}",
            put(update_customer).delete(delete_customer),
        )
        .route("/api/pelanggan-next-code", get(get_next_pelanggan_code))
        .route(
            "/api/kontrak-lengkap",
            get(list_contracts).post(create_contract),
        )
        .route(
            "/api/kontrak-lengkap/{id}",
            put(update_contract).delete(delete_contract),
        )
        .route("/api/kontrak-lengkap/{id}/extend", post(extend_contract))
        .route("/api/kontrak-lengkap/{id}/upgrade", post(upgrade_contract))
        .route("/api/kontrak-next-code", get(get_next_kontrak_code))
        .route("/api/dokumen", get(list_documents).post(upload_document))
        .route("/api/dokumen/sync", post(sync_drive_documents))
        .route("/api/isp/dokumen", get(list_isp_documents))
        .route("/api/dokumen/{id}/preview", get(preview_document))
        .route("/api/dokumen/{id}/download", get(download_document))
        .route(
            "/api/dokumen/{id}",
            patch(rename_document).delete(delete_document),
        )
        .route("/api/dashboard", get(get_dashboard))
        .route("/api/users", get(list_users).post(create_user))
        .route("/api/users/{id}", put(update_user).delete(delete_user))
        .route("/api/users/{id}/reset-password", post(reset_password))
        .route(
            "/api/users/{id}/pelanggan-access",
            get(list_user_pelanggan_access).put(update_user_pelanggan_access),
        )
        .route(
            "/api/titik-peta",
            get(list_map_points).post(upsert_map_point),
        )
        .route("/api/titik-peta/{lokasi_id}", delete(delete_map_point))
        .route(
            "/api/titik-isp",
            get(list_isp_points).post(upsert_isp_point),
        )
        .route("/api/titik-isp/{id}", delete(delete_isp_point))
        .route(
            "/api/titik-lokasi",
            get(list_location_points).post(create_location_point),
        )
        .route(
            "/api/titik-lokasi/{id}",
            put(update_location_point).delete(delete_location_point),
        )
        .route("/api/auth/change-password", post(change_password))
        .route("/api/auth/session", get(current_session))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth))
        .layer(RequestBodyLimitLayer::new(10 * 1024 * 1024));

    let allowed_origin =
        env::var("CORS_ALLOWED_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".to_owned());

    let app = Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .route("/api/auth/login", post(login))
        .merge(protected)
        .layer(TraceLayer::new_for_http())
        .layer(
            CorsLayer::new()
                .allow_origin(
                    allowed_origin
                        .parse::<axum::http::HeaderValue>()
                        .expect("CORS_ALLOWED_ORIGIN tidak valid"),
                )
                .allow_methods([
                    axum::http::Method::GET,
                    axum::http::Method::POST,
                    axum::http::Method::PUT,
                    axum::http::Method::PATCH,
                    axum::http::Method::DELETE,
                    axum::http::Method::OPTIONS,
                ])
                .allow_headers([
                    axum::http::header::AUTHORIZATION,
                    axum::http::header::CONTENT_TYPE,
                    axum::http::header::ACCEPT,
                ])
                .allow_credentials(true),
        )
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(bind_addr)
        .await
        .expect("Gagal membuka alamat server");
    info!(%bind_addr, "FO KIMA backend listening");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .expect("Server berhenti karena kesalahan");
}

async fn healthz() -> Json<StatusResponse> {
    Json(StatusResponse { status: "ok" })
}

async fn readyz(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match sqlx::query("SELECT 1").fetch_one(&state.database).await {
        Ok(_) => (StatusCode::OK, Json(StatusResponse { status: "ready" })).into_response(),
        Err(error) => {
            tracing::error!(%error, "MySQL readiness check failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(StatusResponse {
                    status: "database_unavailable",
                }),
            )
                .into_response()
        }
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Gagal memasang signal handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Gagal memasang SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(unix)]
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    #[cfg(not(unix))]
    ctrl_c.await;

    info!("Shutdown signal received");
}
