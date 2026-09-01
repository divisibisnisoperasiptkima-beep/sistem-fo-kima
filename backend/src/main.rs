mod access;
mod auth;
mod baa_template;
mod backup;
mod dashboard;
mod dokumen;
mod drive;
mod error;
mod kontrak;
mod models;
mod pelanggan;
mod schema;
mod sop;
mod state;
mod titik_isp;
mod titik_lokasi;
mod titik_peta;
mod users;
mod util;

use std::{
    collections::HashMap,
    env,
    net::SocketAddr,
    sync::{Arc, atomic::AtomicU64},
};

#[allow(unused_imports)]
use axum::routing::delete;
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
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
    backup::{
        list_backup_jobs, recover_interrupted_backup_jobs, recover_interrupted_restore_jobs,
        run_backup_scheduler, trigger_backup, trigger_restore,
    },
    dashboard::get_dashboard,
    dokumen::{
        delete_document, download_document, get_current_drive_sync_status, get_drive_sync_status,
        list_documents, list_isp_documents, preview_document, rename_document,
        start_drive_sync_job, sync_drive_documents_internal, upload_document,
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
    titik_peta::{
        create_location_baa, delete_map_point, get_location_baa, list_map_points, upsert_map_point,
    },
    users::{
        create_user, delete_user, list_user_pelanggan_access, list_users, reset_password,
        update_user, update_user_pelanggan_access,
    },
    util::{optional_env_bool, optional_env_u64, optional_env_usize, required_env},
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
    let backup_config =
        backup::BackupConfig::from_env().expect("Konfigurasi backup tidak valid pada backend/.env");
    if backup_config.enabled {
        info!(
            timezone = %backup_config.timezone,
            hour = backup_config.schedule_hour,
            minute = backup_config.schedule_minute,
            retention_daily = backup_config.retention_daily,
            "Database backup configured; automatic scheduler is active"
        );
    }

    let rate_limiter = Arc::new(RwLock::new(HashMap::new()));

    let state = Arc::new(AppState {
        database,
        jwt_secret,
        drive,
        backup_config,
        backup_lock: Arc::new(Mutex::new(())),
        drive_sync_lock: Arc::new(Mutex::new(())),
        drive_sync_job: Arc::new(Mutex::new(None)),
        drive_sync_next_id: Arc::new(AtomicU64::new(1)),
        rate_limiter,
        core_capacity: optional_env_u64("CORE_CAPACITY", 384),
        max_upload_bytes: optional_env_usize("MAX_UPLOAD_BYTES", 25 * 1024 * 1024) as usize,
        max_string_length: optional_env_usize("MAX_STRING_LENGTH", 500) as usize,
        token_expiry_seconds: optional_env_u64("TOKEN_EXPIRY_SECONDS", 60 * 60 * 8),
        login_rate_limit: optional_env_usize("LOGIN_RATE_LIMIT", 5).max(1),
        login_rate_max_ips: optional_env_usize("LOGIN_RATE_MAX_IPS", 10_000).max(1),
        login_rate_window_secs: optional_env_u64("LOGIN_RATE_WINDOW_SECS", 60).max(1),
        login_max_failed_attempts: optional_env_u64("LOGIN_MAX_FAILED_ATTEMPTS", 5) as u32,
        login_lockout_minutes: optional_env_u64("LOGIN_LOCKOUT_MINUTES", 15) as u32,
        trust_proxy_headers: optional_env_bool("TRUST_PROXY_HEADERS", false),
    });
    // Beri ruang untuk header dan field multipart; ukuran file tetap divalidasi
    // secara tepat terhadap MAX_UPLOAD_BYTES di handler upload.
    let request_body_limit = state.max_upload_bytes.saturating_add(1024 * 1024);

    if let Err(error) = recover_interrupted_backup_jobs(&state.database).await {
        tracing::error!(%error, "Gagal memulihkan status backup yang terhenti");
    }
    if let Err(error) = recover_interrupted_restore_jobs(&state).await {
        tracing::error!(%error, "Gagal memulihkan status restore yang terhenti");
    }

    if state.backup_config.enabled {
        let backup_state = state.clone();
        tokio::spawn(async move {
            run_backup_scheduler(backup_state).await;
        });
    }

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
        .route("/api/dokumen/sync", post(start_drive_sync_job))
        .route("/api/admin/backup/run", post(trigger_backup))
        .route("/api/admin/backup/jobs", get(list_backup_jobs))
        .route("/api/admin/backup/restore", post(trigger_restore))
        .route(
            "/api/dokumen/sync/current",
            get(get_current_drive_sync_status),
        )
        .route("/api/dokumen/sync/{job_id}", get(get_drive_sync_status))
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
        .route(
            "/api/titik-peta/{lokasi_id}/baa",
            get(get_location_baa).post(create_location_baa),
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
        .route(
            "/api/portal/workflows/{workflow_id}/status",
            get(sop::handlers::get_workflow_status),
        )
        .route(
            "/api/portal/permohonan-saya",
            get(sop::handlers::list_my_service_requests),
        )
        .route(
            "/api/portal/sop2/permohonan",
            get(sop::handlers::list_sop2_requests)
                .post(sop::handlers::submit_service_change_request),
        )
        .route(
            "/api/portal/sop2/{id}/history",
            get(sop::handlers::list_sop2_history),
        )
        .route(
            "/api/portal/sop2/notifications",
            get(sop::handlers::list_sop2_notifications),
        )
        .route(
            "/api/portal/sop2/notifications/{id}",
            patch(sop::handlers::mark_sop2_notification),
        )
        .route(
            "/api/admin/notifications",
            get(sop::handlers::list_admin_notifications),
        )
        .route(
            "/api/admin/notifications/{source}/{id}",
            patch(sop::handlers::mark_admin_notification),
        )
        .route(
            "/admin/sop2/{id}/step",
            patch(sop::handlers::complete_sop2_step),
        )
        .route("/admin/workflows/list", get(sop::handlers::list_workflows))
        .route(
            "/admin/sop/{workflow_id}/direksi/vote",
            patch(sop::handlers::direksi_vote),
        )
        .route(
            "/portal/sop/{workflow_id}/step/{step}",
            post(sop::handlers::submit_step),
        )
        .route(
            "/admin/portal-registrations",
            get(sop::handlers::list_portal_registrations),
        )
        .route(
            "/admin/portal-registrations/{id}",
            get(sop::handlers::get_portal_registration),
        )
        .route(
            "/admin/portal-registrations/{id}/survey",
            patch(sop::handlers::update_portal_registration_survey),
        )
        .route(
            "/admin/portal-registrations/{id}/penawaran",
            patch(sop::handlers::create_portal_registration_offer),
        )
        .route(
            "/admin/portal-registrations/{id}/legal",
            patch(sop::handlers::review_portal_registration_legal),
        )
        .route(
            "/admin/portal-registrations/{id}/direksi",
            patch(sop::handlers::decide_portal_registration_direksi),
        )
        // Nama netral untuk keputusan persetujuan KIMA/DBO. Route lama
        // /direksi dipertahankan agar klien yang sudah terpasang tetap aman.
        .route(
            "/admin/portal-registrations/{id}/persetujuan",
            patch(sop::handlers::decide_portal_registration_direksi),
        )
        .route(
            "/admin/portal-registrations/{id}/pks",
            patch(sop::handlers::prepare_portal_registration_pks),
        )
        .route(
            "/admin/portal-registrations/{id}/aktivasi",
            patch(sop::handlers::update_portal_registration_activation),
        )
        .route(
            "/admin/portal-registrations/{id}/baa",
            patch(sop::handlers::create_portal_registration_baa),
        )
        .route(
            "/admin/portal-registrations/{id}/baa/verify",
            patch(sop::handlers::verify_portal_registration_baa),
        )
        .route(
            "/admin/portal-registrations/{id}/invoice",
            patch(sop::handlers::create_portal_registration_invoice),
        )
        .route(
            "/admin/portal-registrations/{id}/payment",
            patch(sop::handlers::verify_portal_registration_payment),
        )
        .route(
            "/admin/isp-candidates",
            get(sop::handlers::list_isp_candidates),
        )
        .route(
            "/admin/portal-registrations/{id}/approve",
            post(sop::handlers::approve_portal_registration),
        )
        .route(
            "/admin/portal-registrations/{id}/reject",
            post(sop::handlers::reject_portal_registration),
        )
        .route(
            "/admin/portal-registrations/{id}/cancel",
            post(sop::handlers::admin_cancel_service_request),
        )
        .route(
            "/api/pelanggan/lokasi/ajukan",
            post(sop::handlers::submit_additional_location),
        )
        .route(
            "/admin/isp-directory",
            get(sop::handlers::list_isp_directory).post(sop::handlers::create_isp_directory),
        )
        .route(
            "/admin/isp-directory/{id}",
            patch(sop::handlers::update_isp_directory),
        )
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth))
        // Axum's Multipart extractor has a separate default 2 MiB limit.
        // Align it with the configured upload limit; RequestBodyLimitLayer
        // below still protects the complete HTTP request including overhead.
        .layer(DefaultBodyLimit::max(request_body_limit))
        .layer(RequestBodyLimitLayer::new(request_body_limit));

    let allowed_origin =
        env::var("CORS_ALLOWED_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".to_owned());

    // SOP routes - some public (register), some protected (will be added to protected router)
    let sop_public_routes = sop::register_routes(state.clone());

    let public_routes = Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .route("/api/auth/login", post(login));

    #[cfg(debug_assertions)]
    let public_routes = public_routes.route("/api/dev-access/{role}", post(auth::dev_access));

    let app = public_routes
        .merge(sop_public_routes)
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
