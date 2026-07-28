use std::{
    collections::BTreeSet,
    env,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::PathBuf,
    process::Stdio,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{Extension, Json, extract::State};
use base64::{Engine as _, engine::general_purpose};
use chrono::{DateTime, FixedOffset, NaiveDate, Timelike, Utc};
use flate2::read::GzDecoder;
use flate2::{Compression, write::GzEncoder};
use ring::{
    aead::{self, Aad, LessSafeKey, Nonce, UnboundKey},
    rand::{SecureRandom, SystemRandom},
};
use sha2::{Digest, Sha256};
use sqlx::{MySqlPool, Row};
use tokio::process::Command;
use url::Url;

use crate::{
    drive::{DriveError, DriveFile},
    error::ApiError,
    models::{AuthUser, BackupJobRow, BackupRestoreResult, RestoreBackupRequest},
    state::AppState,
    util::require_admin,
};

const BACKUP_MAGIC: &[u8] = b"FO-KIMA-BACKUP-V1\0";
const AES_GCM_NONCE_BYTES: usize = 12;

#[derive(Clone)]
pub struct BackupConfig {
    pub enabled: bool,
    pub timezone: Arc<str>,
    pub schedule_hour: u8,
    pub schedule_minute: u8,
    pub folder_name: Arc<str>,
    pub database_folder_name: Arc<str>,
    pub retention_daily: u64,
    pub database_url: Arc<str>,
    pub restore_database_url: Option<Arc<str>>,
    pub max_restore_bytes: u64,
    timezone_offset_seconds: i32,
    encryption_key: Option<[u8; 32]>,
}

#[derive(Debug, serde::Serialize)]
pub struct BackupResult {
    pub file_id: String,
    pub file_name: String,
    pub sha256: String,
    pub dump_bytes: usize,
    pub compressed_bytes: usize,
    pub encrypted_bytes: usize,
}

#[derive(Debug)]
pub enum BackupError {
    Config(String),
    Io(std::io::Error),
    Drive(DriveError),
    Dump(String),
    Crypto(String),
    Database,
    Restore(String),
}

impl std::fmt::Display for BackupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Config(message) => write!(f, "konfigurasi backup tidak valid: {message}"),
            Self::Io(error) => write!(f, "operasi file backup gagal: {error}"),
            Self::Drive(error) => write!(f, "operasi Google Drive gagal: {error}"),
            Self::Dump(message) => write!(f, "pembuatan dump database gagal: {message}"),
            Self::Crypto(message) => write!(f, "enkripsi backup gagal: {message}"),
            Self::Database => write!(f, "pencatatan status backup gagal"),
            Self::Restore(message) => write!(f, "validasi restore gagal: {message}"),
        }
    }
}

impl std::error::Error for BackupError {}

impl From<std::io::Error> for BackupError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<DriveError> for BackupError {
    fn from(value: DriveError) -> Self {
        Self::Drive(value)
    }
}

impl From<sqlx::Error> for BackupError {
    fn from(_: sqlx::Error) -> Self {
        Self::Database
    }
}

impl BackupConfig {
    pub fn from_env() -> Result<Self, String> {
        let enabled = crate::util::optional_env_bool("BACKUP_ENABLED", false);
        let database_url = env::var("DATABASE_URL")
            .map_err(|_| "DATABASE_URL wajib diatur untuk proses backup".to_owned())?;
        let restore_database_url = env::var("BACKUP_RESTORE_DATABASE_URL")
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty());
        let timezone = non_empty_env("BACKUP_TIMEZONE", "Asia/Makassar")?;
        let timezone_offset_seconds = timezone_offset_seconds(&timezone)?;
        let folder_name = non_empty_env("BACKUP_FOLDER_NAME", "Backup")?;
        let database_folder_name = non_empty_env("BACKUP_DATABASE_FOLDER_NAME", "Database")?;
        let schedule_hour = bounded_env_u8("BACKUP_SCHEDULE_HOUR", 2, 23)?;
        let schedule_minute = bounded_env_u8("BACKUP_SCHEDULE_MINUTE", 0, 59)?;
        let retention_daily = crate::util::optional_env_u64("BACKUP_RETENTION_DAILY", 7);
        if retention_daily == 0 {
            return Err("BACKUP_RETENTION_DAILY harus lebih besar dari 0".to_owned());
        }
        let max_restore_bytes =
            crate::util::optional_env_u64("BACKUP_MAX_RESTORE_BYTES", 2 * 1024 * 1024 * 1024);
        if max_restore_bytes == 0 {
            return Err("BACKUP_MAX_RESTORE_BYTES harus lebih besar dari 0".to_owned());
        }

        let encryption_key = if enabled {
            let encoded_key = env::var("BACKUP_ENCRYPTION_KEY")
                .map_err(|_| "BACKUP_ENCRYPTION_KEY wajib diatur saat backup aktif".to_owned())?;
            Some(parse_encryption_key(&encoded_key)?)
        } else {
            None
        };

        Ok(Self {
            enabled,
            timezone: timezone.into(),
            schedule_hour,
            schedule_minute,
            folder_name: folder_name.into(),
            database_folder_name: database_folder_name.into(),
            retention_daily,
            database_url: database_url.into(),
            restore_database_url: restore_database_url.map(Into::into),
            max_restore_bytes,
            timezone_offset_seconds,
            encryption_key,
        })
    }

    fn encryption_key(&self) -> Result<[u8; 32], BackupError> {
        self.encryption_key
            .ok_or_else(|| BackupError::Config("BACKUP_ENCRYPTION_KEY belum tersedia".to_owned()))
    }

    fn now_in_timezone(&self) -> DateTime<FixedOffset> {
        let offset = FixedOffset::east_opt(self.timezone_offset_seconds)
            .expect("timezone offset sudah divalidasi saat startup");
        Utc::now().with_timezone(&offset)
    }
}

fn non_empty_env(name: &str, default: &str) -> Result<String, String> {
    let value = env::var(name).unwrap_or_else(|_| default.to_owned());
    let value = value.trim();
    if value.is_empty() {
        return Err(format!("{name} tidak boleh kosong"));
    }
    if value.contains('\r') || value.contains('\n') {
        return Err(format!("{name} tidak boleh mengandung baris baru"));
    }
    Ok(value.to_owned())
}

fn bounded_env_u8(name: &str, default: u8, max: u8) -> Result<u8, String> {
    let Some(value) = env::var(name).ok() else {
        return Ok(default);
    };
    let parsed = value
        .trim()
        .parse::<u8>()
        .map_err(|_| format!("{name} harus berupa angka"))?;
    if parsed > max {
        return Err(format!("{name} harus berada pada rentang 0 sampai {max}"));
    }
    Ok(parsed)
}

fn timezone_offset_seconds(timezone: &str) -> Result<i32, String> {
    let offset = match timezone {
        "UTC" | "Etc/UTC" => 0,
        "Asia/Jakarta" => 7 * 60 * 60,
        "Asia/Makassar" | "Asia/Singapore" | "Asia/Kuala_Lumpur" => 8 * 60 * 60,
        "Asia/Jayapura" => 9 * 60 * 60,
        _ => {
            return Err(format!(
                "BACKUP_TIMEZONE '{timezone}' belum didukung; gunakan UTC, Asia/Jakarta, Asia/Makassar, atau Asia/Jayapura"
            ));
        }
    };
    Ok(offset)
}

fn parse_encryption_key(encoded: &str) -> Result<[u8; 32], String> {
    let encoded = encoded.trim();
    let decoded = [
        general_purpose::STANDARD.decode(encoded),
        general_purpose::URL_SAFE_NO_PAD.decode(encoded),
        general_purpose::URL_SAFE.decode(encoded),
    ]
    .into_iter()
    .find_map(Result::ok)
    .ok_or_else(|| "BACKUP_ENCRYPTION_KEY harus berupa Base64 yang valid".to_owned())?;

    if decoded.len() != 32 {
        return Err(format!(
            "BACKUP_ENCRYPTION_KEY harus menghasilkan tepat 32 byte, bukan {} byte",
            decoded.len()
        ));
    }

    let mut key = [0_u8; 32];
    key.copy_from_slice(&decoded);
    Ok(key)
}

struct DatabaseCredentials {
    host: String,
    port: u16,
    username: String,
    password: String,
    database: String,
}

impl DatabaseCredentials {
    fn from_url(database_url: &str) -> Result<Self, BackupError> {
        let url = Url::parse(database_url)
            .map_err(|_| BackupError::Config("DATABASE_URL tidak valid".to_owned()))?;
        if url.scheme() != "mysql" {
            return Err(BackupError::Config(
                "DATABASE_URL backup harus menggunakan scheme mysql://".to_owned(),
            ));
        }

        let host = url
            .host_str()
            .ok_or_else(|| BackupError::Config("DATABASE_URL tidak memiliki host".to_owned()))?;
        let username = decode_url_part(url.username(), "username DATABASE_URL")?;
        let password =
            decode_url_part(url.password().unwrap_or_default(), "password DATABASE_URL")?;
        let database = decode_url_part(
            url.path().trim_start_matches('/'),
            "nama database DATABASE_URL",
        )?;
        if username.is_empty() || database.is_empty() {
            return Err(BackupError::Config(
                "DATABASE_URL harus memiliki username dan nama database".to_owned(),
            ));
        }

        for (name, value) in [
            ("host", host),
            ("username", username.as_str()),
            ("password", password.as_str()),
            ("database", database.as_str()),
        ] {
            if value.contains('\r') || value.contains('\n') {
                return Err(BackupError::Config(format!(
                    "{name} DATABASE_URL tidak boleh mengandung baris baru"
                )));
            }
        }

        Ok(Self {
            host: host.to_owned(),
            port: url.port().unwrap_or(3306),
            username,
            password,
            database,
        })
    }
}

fn decode_url_part(value: &str, label: &str) -> Result<String, BackupError> {
    urlencoding::decode(value)
        .map(|decoded| decoded.into_owned())
        .map_err(|_| BackupError::Config(format!("{label} tidak valid")))
}

struct TemporaryFile {
    path: PathBuf,
}

impl TemporaryFile {
    fn create(prefix: &str) -> Result<(Self, File), BackupError> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| BackupError::Io(std::io::Error::other(error)))?
            .as_nanos();
        let process_id = std::process::id();

        for attempt in 0..10_u8 {
            let path = env::temp_dir().join(format!(
                "fo-kima-{prefix}-{process_id}-{timestamp}-{attempt}.tmp"
            ));
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            match options.open(&path) {
                Ok(file) => return Ok((Self { path }, file)),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(error.into()),
            }
        }

        Err(BackupError::Io(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            "tidak dapat membuat file sementara yang unik",
        )))
    }
}

impl Drop for TemporaryFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

async fn create_mysql_dump(credentials: &DatabaseCredentials) -> Result<Vec<u8>, BackupError> {
    let defaults_file = create_mysql_defaults_file(credentials)?;

    let output = Command::new("mysqldump")
        .arg(format!(
            "--defaults-extra-file={}",
            defaults_file.path.display()
        ))
        .arg("--single-transaction")
        .arg("--routines")
        .arg("--triggers")
        .arg("--events")
        .arg("--quick")
        .arg("--hex-blob")
        .arg("--no-tablespaces")
        .arg("--set-gtid-purged=OFF")
        .arg(&credentials.database)
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|error| {
            BackupError::Dump(format!("tidak dapat menjalankan mysqldump: {error}"))
        })?;

    if !output.status.success() {
        let code = output
            .status
            .code()
            .map(|value| value.to_string())
            .unwrap_or_else(|| "signal".to_owned());
        let detail: String = String::from_utf8_lossy(&output.stderr)
            .trim()
            .chars()
            .take(2000)
            .collect();
        let detail = if detail.is_empty() {
            String::new()
        } else {
            format!(": {detail}")
        };
        return Err(BackupError::Dump(format!(
            "mysqldump berhenti dengan kode {code}{detail}"
        )));
    }

    let dump_bytes = output.stdout;
    if dump_bytes.is_empty() {
        let detail: String = String::from_utf8_lossy(&output.stderr)
            .trim()
            .chars()
            .take(2000)
            .collect();
        let detail = if detail.is_empty() {
            String::new()
        } else {
            format!(": {detail}")
        };
        return Err(BackupError::Dump(format!(
            "mysqldump menghasilkan output kosong{detail}"
        )));
    }
    Ok(dump_bytes)
}

fn option_file_value(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn create_mysql_defaults_file(
    credentials: &DatabaseCredentials,
) -> Result<TemporaryFile, BackupError> {
    let (defaults_file, mut defaults_writer) = TemporaryFile::create("mysql")?;
    writeln!(defaults_writer, "[client]")?;
    writeln!(
        defaults_writer,
        "host=\"{}\"",
        option_file_value(&credentials.host)
    )?;
    writeln!(defaults_writer, "port={}", credentials.port)?;
    writeln!(
        defaults_writer,
        "user=\"{}\"",
        option_file_value(&credentials.username)
    )?;
    writeln!(
        defaults_writer,
        "password=\"{}\"",
        option_file_value(&credentials.password)
    )?;
    defaults_writer.sync_all()?;
    drop(defaults_writer);
    Ok(defaults_file)
}

fn compress_dump(dump: &[u8]) -> Result<Vec<u8>, BackupError> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(dump)?;
    encoder.finish().map_err(BackupError::Io)
}

fn encrypt_backup(compressed: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, BackupError> {
    let cipher = LessSafeKey::new(
        UnboundKey::new(&aead::AES_256_GCM, key)
            .map_err(|_| BackupError::Crypto("kunci AES-256 tidak valid".to_owned()))?,
    );
    let mut nonce = [0_u8; AES_GCM_NONCE_BYTES];
    SystemRandom::new()
        .fill(&mut nonce)
        .map_err(|_| BackupError::Crypto("gagal menghasilkan nonce acak".to_owned()))?;
    let mut encrypted = compressed.to_vec();
    cipher
        .seal_in_place_append_tag(
            Nonce::assume_unique_for_key(nonce),
            Aad::empty(),
            &mut encrypted,
        )
        .map_err(|_| BackupError::Crypto("AES-GCM menolak data backup".to_owned()))?;

    let mut artifact = Vec::with_capacity(BACKUP_MAGIC.len() + nonce.len() + encrypted.len());
    artifact.extend_from_slice(BACKUP_MAGIC);
    artifact.extend_from_slice(&nonce);
    artifact.extend_from_slice(&encrypted);
    Ok(artifact)
}

fn decrypt_backup(artifact: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, BackupError> {
    let nonce_start = BACKUP_MAGIC.len();
    let ciphertext_start = nonce_start + AES_GCM_NONCE_BYTES;
    if artifact.len() < ciphertext_start + 16 || !artifact.starts_with(BACKUP_MAGIC) {
        return Err(BackupError::Restore(
            "format file backup atau panjang data tidak valid".to_owned(),
        ));
    }

    let mut nonce = [0_u8; AES_GCM_NONCE_BYTES];
    nonce.copy_from_slice(&artifact[nonce_start..ciphertext_start]);
    let cipher = LessSafeKey::new(
        UnboundKey::new(&aead::AES_256_GCM, key)
            .map_err(|_| BackupError::Crypto("kunci AES-256 tidak valid".to_owned()))?,
    );
    let mut ciphertext = artifact[ciphertext_start..].to_vec();
    let plaintext = cipher
        .open_in_place(
            Nonce::assume_unique_for_key(nonce),
            Aad::empty(),
            &mut ciphertext,
        )
        .map_err(|_| BackupError::Restore("integritas atau kunci backup tidak valid".to_owned()))?;
    Ok(plaintext.to_vec())
}

fn decompress_to_file(
    compressed: &[u8],
    max_restore_bytes: u64,
) -> Result<(TemporaryFile, u64), BackupError> {
    let (sql_file, mut writer) = TemporaryFile::create("restore-sql")?;
    let mut decoder = GzDecoder::new(compressed);
    let mut buffer = [0_u8; 64 * 1024];
    let mut total = 0_u64;

    loop {
        let read = decoder.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        total = total
            .checked_add(read as u64)
            .ok_or_else(|| BackupError::Restore("ukuran dump restore terlalu besar".to_owned()))?;
        if total > max_restore_bytes {
            return Err(BackupError::Restore(format!(
                "dump restore melebihi batas {} byte",
                max_restore_bytes
            )));
        }
        writer.write_all(&buffer[..read])?;
    }
    writer.sync_all()?;
    drop(writer);
    if total == 0 {
        return Err(BackupError::Restore(
            "dump SQL hasil dekompresi kosong".to_owned(),
        ));
    }
    Ok((sql_file, total))
}

fn restore_database_name() -> String {
    format!(
        "fo_kima_restore_{}_{}",
        Utc::now().format("%Y%m%d%H%M%S"),
        std::process::id()
    )
}

fn is_safe_restore_database_name(name: &str) -> bool {
    let Some(suffix) = name.strip_prefix("fo_kima_restore_") else {
        return false;
    };
    let Some((timestamp, process_id)) = suffix.split_once('_') else {
        return false;
    };
    timestamp.len() == 14
        && timestamp
            .chars()
            .all(|character| character.is_ascii_digit())
        && !process_id.is_empty()
        && process_id
            .chars()
            .all(|character| character.is_ascii_digit())
        && name.len() <= 64
}

async fn run_mysql_statement(
    credentials: &DatabaseCredentials,
    statement: &str,
) -> Result<String, BackupError> {
    let defaults_file = create_mysql_defaults_file(credentials)?;
    let output = Command::new("mysql")
        .arg(format!(
            "--defaults-extra-file={}",
            defaults_file.path.display()
        ))
        .arg("--batch")
        .arg("--skip-column-names")
        .arg("--execute")
        .arg(statement)
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|error| BackupError::Restore(format!("tidak dapat menjalankan mysql: {error}")))?;
    if !output.status.success() {
        let code = output
            .status
            .code()
            .map(|value| value.to_string())
            .unwrap_or_else(|| "signal".to_owned());
        return Err(BackupError::Restore(format!(
            "mysql berhenti dengan kode {code}"
        )));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

async fn restore_sql_file(
    credentials: &DatabaseCredentials,
    database_name: &str,
    sql_file: &TemporaryFile,
) -> Result<u64, BackupError> {
    if !is_safe_restore_database_name(database_name) {
        return Err(BackupError::Restore(
            "nama database restore tidak aman".to_owned(),
        ));
    }

    let defaults_file = create_mysql_defaults_file(credentials)?;
    let (restore_input, mut restore_writer) = TemporaryFile::create("restore-input")?;
    writeln!(restore_writer, "USE `{database_name}`;")?;
    let mut source_file = File::open(&sql_file.path)?;
    std::io::copy(&mut source_file, &mut restore_writer)?;
    restore_writer.sync_all()?;
    drop(restore_writer);

    let input_file = File::open(&restore_input.path)?;
    let output = Command::new("mysql")
        .arg(format!(
            "--defaults-extra-file={}",
            defaults_file.path.display()
        ))
        .arg("--database")
        .arg(database_name)
        .arg("--one-database")
        .stdin(Stdio::from(input_file))
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|error| {
            BackupError::Restore(format!("tidak dapat menjalankan mysql restore: {error}"))
        })?;
    if !output.status.success() {
        let code = output
            .status
            .code()
            .map(|value| value.to_string())
            .unwrap_or_else(|| "signal".to_owned());
        return Err(BackupError::Restore(format!(
            "mysql restore berhenti dengan kode {code}"
        )));
    }

    let count = run_mysql_statement(
        credentials,
        &format!(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '{database_name}'"
        ),
    )
    .await?;
    count
        .parse::<u64>()
        .map_err(|_| BackupError::Restore("hasil verifikasi jumlah tabel tidak valid".to_owned()))
}

async fn run_backup_pipeline(state: &AppState) -> Result<BackupResult, BackupError> {
    let config = &state.backup_config;
    let key = config.encryption_key()?;
    let credentials = DatabaseCredentials::from_url(&config.database_url)?;
    let dump_bytes = create_mysql_dump(&credentials).await?;
    let compressed = compress_dump(&dump_bytes)?;
    let encrypted = encrypt_backup(&compressed, &key)?;
    let encrypted_bytes = encrypted.len();

    let digest = Sha256::digest(&encrypted);
    let sha256 = format!("{digest:x}");
    let file_name = format!(
        "fo-kima-db-{}.sql.gz.enc",
        chrono::Utc::now().format("%Y%m%d-%H%M%S")
    );

    let backup_folder_id = state
        .drive
        .ensure_folder(state.drive.root_folder_id.as_ref(), &config.folder_name)
        .await?;
    let database_folder_id = state
        .drive
        .ensure_folder(&backup_folder_id, &config.database_folder_name)
        .await?;
    state.drive.ensure_restricted(&backup_folder_id).await?;
    state.drive.ensure_restricted(&database_folder_id).await?;
    let drive_file = state
        .drive
        .upload_backup_file(
            &database_folder_id,
            &file_name,
            "application/octet-stream",
            encrypted,
        )
        .await?;

    Ok(BackupResult {
        file_id: drive_file.id,
        file_name,
        sha256,
        dump_bytes: dump_bytes.len(),
        compressed_bytes: compressed.len(),
        encrypted_bytes,
    })
}

fn is_duplicate_key(error: &sqlx::Error) -> bool {
    matches!(
        error,
        sqlx::Error::Database(database_error)
            if database_error.code().as_deref() == Some("1062")
    )
}

async fn create_backup_job(
    database: &MySqlPool,
    trigger_type: &str,
    scheduled_date: Option<&str>,
) -> Result<Option<u64>, BackupError> {
    let result = if let Some(scheduled_date) = scheduled_date {
        sqlx::query(
            "INSERT INTO backup_jobs \
             (trigger_type, scheduled_date, status, started_at) \
             VALUES (?, ?, 'running', NOW())",
        )
        .bind(trigger_type)
        .bind(scheduled_date)
        .execute(database)
        .await
    } else {
        sqlx::query(
            "INSERT INTO backup_jobs (trigger_type, status, started_at) \
             VALUES (?, 'running', NOW())",
        )
        .bind(trigger_type)
        .execute(database)
        .await
    };

    match result {
        Ok(result) => Ok(Some(result.last_insert_id())),
        Err(error) if is_duplicate_key(&error) => {
            let Some(scheduled_date) = scheduled_date else {
                return Ok(None);
            };
            let existing = sqlx::query(
                "SELECT id, status FROM backup_jobs \
                 WHERE trigger_type = ? AND scheduled_date = ? LIMIT 1",
            )
            .bind(trigger_type)
            .bind(scheduled_date)
            .fetch_optional(database)
            .await?;
            let Some(existing) = existing else {
                return Ok(None);
            };
            let existing_id: u64 = existing.try_get("id")?;
            let existing_status: String = existing.try_get("status")?;
            if existing_status == "failed" {
                sqlx::query(
                    "UPDATE backup_jobs SET status = 'running', started_at = NOW(), \
                     finished_at = NULL, error_message = NULL WHERE id = ?",
                )
                .bind(existing_id)
                .execute(database)
                .await?;
                Ok(Some(existing_id))
            } else {
                Ok(None)
            }
        }
        Err(error) => Err(error.into()),
    }
}

async fn mark_backup_success(
    database: &MySqlPool,
    job_id: u64,
    result: &BackupResult,
) -> Result<(), BackupError> {
    sqlx::query(
        "UPDATE backup_jobs SET status = 'succeeded', finished_at = NOW(), \
         drive_file_id = ?, file_name = ?, sha256 = ?, dump_bytes = ?, \
         compressed_bytes = ?, encrypted_bytes = ?, error_message = NULL WHERE id = ?",
    )
    .bind(&result.file_id)
    .bind(&result.file_name)
    .bind(&result.sha256)
    .bind(result.dump_bytes as u64)
    .bind(result.compressed_bytes as u64)
    .bind(result.encrypted_bytes as u64)
    .bind(job_id)
    .execute(database)
    .await?;
    Ok(())
}

async fn mark_backup_failed(
    database: &MySqlPool,
    job_id: u64,
    error: &BackupError,
) -> Result<(), BackupError> {
    let message: String = error.to_string().chars().take(2000).collect();
    sqlx::query(
        "UPDATE backup_jobs SET status = 'failed', finished_at = NOW(), \
         error_message = ? WHERE id = ?",
    )
    .bind(message)
    .bind(job_id)
    .execute(database)
    .await?;
    Ok(())
}

async fn run_backup_job(
    state: &AppState,
    trigger_type: &str,
    scheduled_date: Option<&str>,
) -> Result<Option<BackupResult>, BackupError> {
    let config = &state.backup_config;
    if !config.enabled {
        return Err(BackupError::Config(
            "BACKUP_ENABLED belum diaktifkan".to_owned(),
        ));
    }
    if state.drive.link_sharing_enabled() {
        return Err(BackupError::Config(
            "backup memerlukan GOOGLE_DRIVE_LINK_SHARING=false agar file tetap terbatas".to_owned(),
        ));
    }

    let _backup_guard = state.backup_lock.lock().await;
    let Some(job_id) = create_backup_job(&state.database, trigger_type, scheduled_date).await?
    else {
        return Ok(None);
    };

    let result = run_backup_pipeline(state).await;
    match result {
        Ok(result) => {
            if let Err(error) = mark_backup_success(&state.database, job_id, &result).await {
                tracing::error!(job_id, error = %error, "Gagal mencatat backup berhasil");
                return Err(error);
            }
            if let Err(error) = prune_old_backups(state).await {
                tracing::warn!(job_id, error = %error, "Backup berhasil tetapi retensi lama gagal dijalankan");
            }
            Ok(Some(result))
        }
        Err(error) => {
            if let Err(status_error) = mark_backup_failed(&state.database, job_id, &error).await {
                tracing::error!(job_id, error = %status_error, "Gagal mencatat backup gagal");
            }
            Err(error)
        }
    }
}

pub async fn run_backup_once(state: &AppState) -> Result<BackupResult, BackupError> {
    run_backup_job(state, "manual", None)
        .await?
        .ok_or_else(|| BackupError::Config("backup manual tidak dapat dibuat".to_owned()))
}

fn backup_date_from_name(name: &str) -> Option<NaiveDate> {
    let timestamp = name
        .strip_prefix("fo-kima-db-")?
        .strip_suffix(".sql.gz.enc")?;
    let date = timestamp.get(..8)?;
    NaiveDate::parse_from_str(date, "%Y%m%d").ok()
}

fn keep_backup_dates(
    dates: impl IntoIterator<Item = NaiveDate>,
    retention_daily: u64,
) -> BTreeSet<NaiveDate> {
    dates
        .into_iter()
        .collect::<BTreeSet<_>>()
        .iter()
        .rev()
        .take(usize::try_from(retention_daily).unwrap_or(usize::MAX))
        .copied()
        .collect()
}

async fn prune_old_backups(state: &AppState) -> Result<(), BackupError> {
    let config = &state.backup_config;
    let backup_folder_id = state
        .drive
        .ensure_folder(state.drive.root_folder_id.as_ref(), &config.folder_name)
        .await?;
    let database_folder_id = state
        .drive
        .ensure_folder(&backup_folder_id, &config.database_folder_name)
        .await?;
    let files = state.drive.list_child_files(&database_folder_id).await?;
    let dated_files: Vec<(DriveFile, NaiveDate)> = files
        .into_iter()
        .filter_map(|file| backup_date_from_name(&file.name).map(|date| (file, date)))
        .collect();

    let dates: BTreeSet<NaiveDate> = dated_files.iter().map(|(_, date)| *date).collect();
    let keep_dates = keep_backup_dates(dates, config.retention_daily);

    for (file, date) in dated_files {
        if !keep_dates.contains(&date)
            && let Err(error) = state.drive.delete_file(&file.id).await
        {
            tracing::warn!(file_id = %file.id, error = %error, "Gagal menghapus backup lama dari Drive");
        }
    }
    Ok(())
}

async fn run_scheduled_backup_if_due(state: &AppState) -> Result<(), BackupError> {
    let now = state.backup_config.now_in_timezone();
    if now.hour() != u32::from(state.backup_config.schedule_hour)
        || now.minute() != u32::from(state.backup_config.schedule_minute)
    {
        return Ok(());
    }

    let scheduled_date = now.date_naive();
    let scheduled_date_text = scheduled_date.format("%Y-%m-%d").to_string();
    match run_backup_job(state, "schedule", Some(&scheduled_date_text)).await? {
        Some(result) => {
            tracing::info!(
                file_name = %result.file_name,
                sha256 = %result.sha256,
                "Scheduled database backup completed"
            );
        }
        None => {
            tracing::debug!(%scheduled_date, "Scheduled database backup already attempted today");
        }
    }
    Ok(())
}

pub async fn run_backup_scheduler(state: std::sync::Arc<AppState>) {
    let mut ticker = tokio::time::interval(std::time::Duration::from_secs(15));
    loop {
        ticker.tick().await;
        if let Err(error) = run_scheduled_backup_if_due(&state).await {
            tracing::error!(%error, "Scheduled database backup failed");
        }
    }
}

pub async fn recover_interrupted_backup_jobs(database: &MySqlPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE backup_jobs SET status = 'failed', finished_at = NOW(), \
         error_message = 'Proses backup terhenti saat backend berhenti' \
         WHERE status = 'running'",
    )
    .execute(database)
    .await?;
    Ok(())
}

pub async fn list_backup_jobs(
    State(state): State<std::sync::Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
) -> Result<Json<Vec<BackupJobRow>>, ApiError> {
    require_admin(&auth.role)?;
    let rows = sqlx::query(
        "SELECT id, trigger_type, \
         DATE_FORMAT(scheduled_date, '%Y-%m-%d') AS scheduled_date, status, \
         DATE_FORMAT(started_at, '%Y-%m-%d %H:%i:%s') AS started_at, \
         DATE_FORMAT(finished_at, '%Y-%m-%d %H:%i:%s') AS finished_at, \
         drive_file_id, file_name, sha256, dump_bytes, compressed_bytes, \
         encrypted_bytes, error_message FROM backup_jobs \
         ORDER BY id DESC LIMIT 20",
    )
    .fetch_all(&state.database)
    .await
    .map_err(ApiError::database)?;

    let jobs = rows
        .into_iter()
        .map(|row| {
            Ok(BackupJobRow {
                id: row.try_get("id")?,
                trigger_type: row.try_get("trigger_type")?,
                scheduled_date: row.try_get("scheduled_date")?,
                status: row.try_get("status")?,
                started_at: row.try_get("started_at")?,
                finished_at: row.try_get("finished_at")?,
                drive_file_id: row.try_get("drive_file_id")?,
                file_name: row.try_get("file_name")?,
                sha256: row.try_get("sha256")?,
                dump_bytes: row.try_get("dump_bytes")?,
                compressed_bytes: row.try_get("compressed_bytes")?,
                encrypted_bytes: row.try_get("encrypted_bytes")?,
                error_message: row.try_get("error_message")?,
            })
        })
        .collect::<Result<Vec<BackupJobRow>, sqlx::Error>>()
        .map_err(ApiError::database)?;

    Ok(Json(jobs))
}

async fn create_restore_job(
    database: &MySqlPool,
    backup_job_id: u64,
    temporary_database: &str,
) -> Result<u64, BackupError> {
    let result = sqlx::query(
        "INSERT INTO backup_restore_jobs \
         (backup_job_id, temporary_database, status) VALUES (?, ?, 'running')",
    )
    .bind(backup_job_id)
    .bind(temporary_database)
    .execute(database)
    .await?;
    Ok(result.last_insert_id())
}

async fn mark_restore_success(
    database: &MySqlPool,
    restore_job_id: u64,
    table_count: u64,
) -> Result<(), BackupError> {
    sqlx::query(
        "UPDATE backup_restore_jobs SET status = 'succeeded', finished_at = NOW(), \
         table_count = ?, error_message = NULL WHERE id = ?",
    )
    .bind(table_count)
    .bind(restore_job_id)
    .execute(database)
    .await?;
    Ok(())
}

async fn mark_restore_failed(
    database: &MySqlPool,
    restore_job_id: u64,
    error: &BackupError,
) -> Result<(), BackupError> {
    let message: String = error.to_string().chars().take(2000).collect();
    sqlx::query(
        "UPDATE backup_restore_jobs SET status = 'failed', finished_at = NOW(), \
         error_message = ? WHERE id = ?",
    )
    .bind(message)
    .bind(restore_job_id)
    .execute(database)
    .await?;
    Ok(())
}

async fn run_restore_test(
    state: &AppState,
    request: RestoreBackupRequest,
) -> Result<BackupRestoreResult, BackupError> {
    let config = &state.backup_config;
    let key = config.encryption_key()?;
    let restore_database_url = config.restore_database_url.as_deref().ok_or_else(|| {
        BackupError::Config(
            "BACKUP_RESTORE_DATABASE_URL wajib diatur untuk pengujian restore".to_owned(),
        )
    })?;
    let production_credentials = DatabaseCredentials::from_url(&config.database_url)?;
    let restore_credentials = DatabaseCredentials::from_url(restore_database_url)?;
    if restore_credentials.host == production_credentials.host
        && restore_credentials.port == production_credentials.port
        && restore_credentials.database == production_credentials.database
    {
        return Err(BackupError::Config(
            "BACKUP_RESTORE_DATABASE_URL tidak boleh menunjuk database produksi".to_owned(),
        ));
    }

    let _backup_guard = state.backup_lock.lock().await;
    let backup = sqlx::query(
        "SELECT status, drive_file_id, file_name, sha256 FROM backup_jobs WHERE id = ? LIMIT 1",
    )
    .bind(request.backup_job_id)
    .fetch_optional(&state.database)
    .await?
    .ok_or_else(|| BackupError::Restore("backup yang dipilih tidak ditemukan".to_owned()))?;
    let status: String = backup.try_get("status")?;
    if status != "succeeded" {
        return Err(BackupError::Restore(
            "hanya backup berstatus succeeded yang boleh direstore".to_owned(),
        ));
    }
    let file_id: String = backup
        .try_get::<Option<String>, _>("drive_file_id")?
        .ok_or_else(|| BackupError::Restore("backup tidak memiliki Drive file ID".to_owned()))?;
    let file_name: Option<String> = backup.try_get("file_name")?;
    let expected_sha256: String = backup
        .try_get::<Option<String>, _>("sha256")?
        .ok_or_else(|| BackupError::Restore("backup tidak memiliki checksum".to_owned()))?;

    let temporary_database = restore_database_name();
    if !is_safe_restore_database_name(&temporary_database) {
        return Err(BackupError::Restore(
            "nama database sementara yang dihasilkan tidak aman".to_owned(),
        ));
    }
    let restore_job_id =
        create_restore_job(&state.database, request.backup_job_id, &temporary_database).await?;
    let result = async {
        let max_artifact_bytes = config.max_restore_bytes.saturating_add(64 * 1024 * 1024);
        let artifact = state
            .drive
            .download_backup_file(&file_id, max_artifact_bytes)
            .await?;
        let actual_sha256 = format!("{:x}", Sha256::digest(&artifact));
        if !actual_sha256.eq_ignore_ascii_case(&expected_sha256) {
            return Err(BackupError::Restore(format!(
                "checksum backup tidak cocok untuk {}",
                file_name.as_deref().unwrap_or("file tanpa nama")
            )));
        }

        let compressed = decrypt_backup(&artifact, &key)?;
        let (sql_file, _) = decompress_to_file(&compressed, config.max_restore_bytes)?;
        let create_statement = format!(
            "CREATE DATABASE `{temporary_database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        );
        let restore_result = async {
            run_mysql_statement(&restore_credentials, &create_statement).await?;
            let table_count = restore_sql_file(
                &restore_credentials,
                &temporary_database,
                &sql_file,
            )
            .await?;
            if table_count == 0 {
                return Err(BackupError::Restore(
                    "restore selesai tetapi tidak ada tabel yang ditemukan".to_owned(),
                ));
            }
            Ok(table_count)
        }
        .await;

        let drop_statement = format!("DROP DATABASE IF EXISTS `{temporary_database}`");
        let cleanup_result = run_mysql_statement(&restore_credentials, &drop_statement).await;
        if let Err(cleanup_error) = cleanup_result {
            if restore_result.is_ok() {
                return Err(BackupError::Restore(format!(
                    "restore berhasil tetapi database sementara gagal dihapus: {cleanup_error}"
                )));
            }
            tracing::error!(error = %cleanup_error, "Gagal menghapus database sementara setelah restore gagal");
        }

        let table_count = restore_result?;
        Ok(BackupRestoreResult {
            restore_job_id,
            backup_job_id: request.backup_job_id,
            status: "succeeded".to_owned(),
            table_count,
            sha256: actual_sha256,
        })
    }
    .await;

    match result {
        Ok(result) => {
            if let Err(error) =
                mark_restore_success(&state.database, restore_job_id, result.table_count).await
            {
                tracing::error!(restore_job_id, error = %error, "Gagal mencatat restore berhasil");
                return Err(error);
            }
            Ok(result)
        }
        Err(error) => {
            if let Err(status_error) =
                mark_restore_failed(&state.database, restore_job_id, &error).await
            {
                tracing::error!(restore_job_id, error = %status_error, "Gagal mencatat restore gagal");
            }
            Err(error)
        }
    }
}

pub async fn trigger_restore(
    State(state): State<std::sync::Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Json(request): Json<RestoreBackupRequest>,
) -> Result<Json<BackupRestoreResult>, ApiError> {
    require_admin(&auth.role)?;
    run_restore_test(&state, request)
        .await
        .map(Json)
        .map_err(|error| ApiError::internal(format!("Restore test gagal: {error}")))
}

pub async fn recover_interrupted_restore_jobs(state: &AppState) -> Result<(), BackupError> {
    let rows = sqlx::query(
        "SELECT id, temporary_database FROM backup_restore_jobs \
         WHERE status = 'running'",
    )
    .fetch_all(&state.database)
    .await?;

    for row in rows {
        let restore_job_id: u64 = row.try_get("id")?;
        let temporary_database: String = row.try_get("temporary_database")?;
        if let Some(restore_database_url) = state.backup_config.restore_database_url.as_deref()
            && is_safe_restore_database_name(&temporary_database)
        {
            match DatabaseCredentials::from_url(restore_database_url) {
                Ok(credentials) => {
                    let statement = format!("DROP DATABASE IF EXISTS `{temporary_database}`");
                    if let Err(error) = run_mysql_statement(&credentials, &statement).await {
                        tracing::error!(
                            restore_job_id,
                            error = %error,
                            "Gagal membersihkan database restore yang tertinggal"
                        );
                    }
                }
                Err(error) => {
                    tracing::error!(restore_job_id, error = %error, "URL database restore tidak valid saat recovery");
                }
            }
        }

        sqlx::query(
            "UPDATE backup_restore_jobs SET status = 'failed', finished_at = NOW(), \
             error_message = 'Proses restore terhenti saat backend berhenti' WHERE id = ?",
        )
        .bind(restore_job_id)
        .execute(&state.database)
        .await?;
    }
    Ok(())
}

pub async fn trigger_backup(
    State(state): State<std::sync::Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
) -> Result<Json<BackupResult>, ApiError> {
    require_admin(&auth.role)?;
    run_backup_once(&state)
        .await
        .map(Json)
        .map_err(|error| ApiError::internal(format!("Backup gagal: {error}")))
}

#[cfg(test)]
mod tests {
    use super::{
        BACKUP_MAGIC, backup_date_from_name, decrypt_backup, encrypt_backup,
        is_safe_restore_database_name, keep_backup_dates, parse_encryption_key,
        timezone_offset_seconds,
    };
    use base64::{Engine as _, engine::general_purpose};
    use chrono::NaiveDate;
    use ring::aead::{self, Aad, LessSafeKey, Nonce, UnboundKey};

    #[test]
    fn encryption_artifact_can_be_decrypted_with_same_key() {
        let key = [7_u8; 32];
        let original = b"backup test payload";
        let artifact = encrypt_backup(original, &key).expect("encrypt");
        assert!(artifact.starts_with(BACKUP_MAGIC));

        let nonce_start = BACKUP_MAGIC.len();
        let ciphertext_start = nonce_start + 12;
        let cipher = LessSafeKey::new(UnboundKey::new(&aead::AES_256_GCM, &key).expect("cipher"));
        let mut nonce = [0_u8; 12];
        nonce.copy_from_slice(&artifact[nonce_start..ciphertext_start]);
        let mut ciphertext = artifact[ciphertext_start..].to_vec();
        let decrypted = cipher
            .open_in_place(
                Nonce::assume_unique_for_key(nonce),
                Aad::empty(),
                &mut ciphertext,
            )
            .expect("decrypt");
        assert_eq!(decrypted, original);
        assert_eq!(
            decrypt_backup(&artifact, &key).expect("decrypt helper"),
            original
        );

        let mut tampered = artifact;
        *tampered.last_mut().expect("ciphertext") ^= 1;
        assert!(decrypt_backup(&tampered, &key).is_err());
    }

    #[test]
    fn encryption_key_requires_exactly_32_decoded_bytes() {
        let encoded = general_purpose::STANDARD.encode([3_u8; 32]);
        assert_eq!(parse_encryption_key(&encoded).expect("key"), [3_u8; 32]);
        assert!(parse_encryption_key("not-a-valid-key").is_err());
        assert!(parse_encryption_key(&general_purpose::STANDARD.encode([1_u8; 16])).is_err());
    }

    #[test]
    fn scheduler_timezone_and_retention_are_deterministic() {
        assert_eq!(
            timezone_offset_seconds("Asia/Makassar").expect("timezone"),
            8 * 60 * 60
        );
        assert!(timezone_offset_seconds("Europe/Amsterdam").is_err());

        let dates = [
            NaiveDate::from_ymd_opt(2026, 7, 25).expect("date"),
            NaiveDate::from_ymd_opt(2026, 7, 26).expect("date"),
            NaiveDate::from_ymd_opt(2026, 7, 27).expect("date"),
        ];
        let retained = keep_backup_dates(dates, 2);
        assert!(!retained.contains(&dates[0]));
        assert!(retained.contains(&dates[1]));
        assert!(retained.contains(&dates[2]));
    }

    #[test]
    fn retention_only_handles_backup_filename_format() {
        assert_eq!(
            backup_date_from_name("fo-kima-db-20260728-020000.sql.gz.enc"),
            NaiveDate::from_ymd_opt(2026, 7, 28)
        );
        assert!(backup_date_from_name("other-file.sql.gz.enc").is_none());
        assert!(is_safe_restore_database_name(
            "fo_kima_restore_20260728020000_123"
        ));
        assert!(!is_safe_restore_database_name("fo_kima_restore_prod-db"));
    }
}
