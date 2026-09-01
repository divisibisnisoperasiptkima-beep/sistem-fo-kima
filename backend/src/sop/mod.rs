pub mod handlers;
pub mod models;

use axum::{Router, routing::post};
use std::sync::Arc;

use crate::state::AppState;

// ============================================
// ROUTE CONFIGURATION (Public Routes Only)
// ============================================
// Protected routes are registered in main.rs under the protected router
pub fn register_routes(state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new()
        // Portal (Customer) routes - public registration
        .route("/api/portal/register", post(handlers::portal_register))
        .route("/api/portal/lacak", post(handlers::track_service_request))
        .route(
            "/api/portal/batalkan",
            post(handlers::cancel_service_request),
        )
        .route(
            "/api/portal/penawaran/respond",
            post(handlers::respond_offer),
        )
        .route("/api/portal/po/submit", post(handlers::submit_po))
        .route(
            "/api/portal/baa/accept",
            post(handlers::accept_portal_registration_baa),
        )
        .route(
            "/api/portal/payment/confirm",
            post(handlers::confirm_portal_registration_payment),
        )
        .with_state(state)
}
