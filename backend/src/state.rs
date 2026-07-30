use std::{
    collections::HashMap,
    sync::{Arc, atomic::AtomicU64},
    time::Instant,
};

use sqlx::MySqlPool;
use tokio::sync::{Mutex, RwLock};

use crate::backup::BackupConfig;
use crate::drive::DriveClient;
use crate::models::DriveSyncProgress;

#[derive(Clone)]
pub struct AppState {
    pub database: MySqlPool,
    pub jwt_secret: Arc<str>,
    pub drive: DriveClient,
    pub backup_config: BackupConfig,
    pub backup_lock: Arc<Mutex<()>>,
    pub drive_sync_lock: Arc<Mutex<()>>,
    pub drive_sync_job: Arc<Mutex<Option<DriveSyncProgress>>>,
    pub drive_sync_next_id: Arc<AtomicU64>,
    pub rate_limiter: Arc<RwLock<HashMap<String, Vec<Instant>>>>,
    pub core_capacity: u64,
    pub max_upload_bytes: usize,
    pub max_string_length: usize,
    pub token_expiry_seconds: u64,
    pub login_rate_limit: usize,
    pub login_rate_max_ips: usize,
    pub login_rate_window_secs: u64,
    pub login_max_failed_attempts: u32,
    pub login_lockout_minutes: u32,
    pub trust_proxy_headers: bool,
}

impl AppState {
    pub async fn rate_limit_check(&self, ip: &str) -> bool {
        let now = Instant::now();
        let cutoff = now
            .checked_sub(std::time::Duration::from_secs(self.login_rate_window_secs))
            .unwrap_or(now);
        let mut guard = self.rate_limiter.write().await;

        // Bersihkan seluruh IP kedaluwarsa, bukan hanya IP request saat ini.
        guard.retain(|_, attempts| {
            attempts.retain(|timestamp| *timestamp > cutoff);
            !attempts.is_empty()
        });

        if !guard.contains_key(ip) && guard.len() >= self.login_rate_max_ips {
            return false;
        }

        let attempts = guard.entry(ip.to_owned()).or_default();
        if attempts.len() >= self.login_rate_limit {
            return false;
        }
        attempts.push(now);
        true
    }
}
