use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use reqwest::Client;
use serde::Deserialize;
use serde_json::json;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct DriveClient {
    http: Client,
    client_id: Arc<str>,
    client_secret: Arc<str>,
    refresh_token: Arc<str>,
    pub root_folder_id: Arc<str>,
    link_sharing: bool,
    token: Arc<Mutex<CachedToken>>,
}

struct CachedToken {
    access_token: Option<String>,
    expires_at: Instant,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: Option<u64>,
}

#[derive(Deserialize)]
struct DriveListResponse {
    files: Option<Vec<DriveFileMeta>>,
}

#[derive(Deserialize)]
struct DriveFileMeta {
    id: String,
    #[serde(default, rename = "webViewLink")]
    web_view_link: Option<String>,
}

#[derive(Debug, Clone)]
pub struct DriveFile {
    pub id: String,
    pub web_view_link: Option<String>,
}

#[derive(Debug)]
pub enum DriveError {
    Message(String),
    Http(reqwest::Error),
}

impl std::fmt::Display for DriveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Message(message) => write!(f, "{message}"),
            Self::Http(error) => write!(f, "{error}"),
        }
    }
}

impl From<reqwest::Error> for DriveError {
    fn from(value: reqwest::Error) -> Self {
        Self::Http(value)
    }
}

impl DriveClient {
    pub fn from_env() -> Result<Self, String> {
        let client_id = std::env::var("GOOGLE_CLIENT_ID")
            .map_err(|_| "GOOGLE_CLIENT_ID wajib diatur pada backend/.env".to_owned())?;
        let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
            .map_err(|_| "GOOGLE_CLIENT_SECRET wajib diatur pada backend/.env".to_owned())?;
        let refresh_token = std::env::var("GOOGLE_REFRESH_TOKEN")
            .map_err(|_| "GOOGLE_REFRESH_TOKEN wajib diatur pada backend/.env".to_owned())?;
        let root_folder_id = std::env::var("PELANGGAN_ROOT_FOLDER_ID")
            .map_err(|_| "PELANGGAN_ROOT_FOLDER_ID wajib diatur pada backend/.env".to_owned())?;
        let link_sharing = crate::util::optional_env_bool("GOOGLE_DRIVE_LINK_SHARING", true);

        Ok(Self {
            http: Client::builder()
                .timeout(Duration::from_secs(30))
                .connect_timeout(Duration::from_secs(10))
                .build()
                .map_err(|e| format!("Gagal membuat HTTP client: {e}"))?,
            client_id: client_id.into(),
            client_secret: client_secret.into(),
            refresh_token: refresh_token.into(),
            root_folder_id: root_folder_id.into(),
            link_sharing,
            token: Arc::new(Mutex::new(CachedToken {
                access_token: None,
                expires_at: Instant::now(),
            })),
        })
    }

    async fn access_token(&self) -> Result<String, DriveError> {
        let mut guard = self.token.lock().await;
        if let Some(token) = &guard.access_token
            && Instant::now() < guard.expires_at
        {
            return Ok(token.clone());
        }

        let response = self
            .http
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("client_id", self.client_id.as_ref()),
                ("client_secret", self.client_secret.as_ref()),
                ("refresh_token", self.refresh_token.as_ref()),
                ("grant_type", "refresh_token"),
            ])
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            return Err(DriveError::Message(format!(
                "Gagal refresh token Google OAuth: HTTP {status}"
            )));
        }

        let payload: TokenResponse = response.json().await?;
        let expires_in = payload.expires_in.unwrap_or(3600).saturating_sub(60);
        guard.access_token = Some(payload.access_token.clone());
        guard.expires_at = Instant::now() + Duration::from_secs(expires_in);
        Ok(payload.access_token)
    }

    pub async fn find_child_folder(
        &self,
        parent_id: &str,
        name: &str,
    ) -> Result<Option<String>, DriveError> {
        let token = self.access_token().await?;
        let escaped_name = name.replace('\\', "\\\\").replace('\'', "\\'");
        let query = format!(
            "mimeType = 'application/vnd.google-apps.folder' and name = '{escaped_name}' and '{parent_id}' in parents and trashed = false"
        );
        let url = format!(
            "https://www.googleapis.com/drive/v3/files?q={}&fields=files(id,name)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true",
            urlencoding::encode(&query)
        );
        let response = self
            .http
            .get(url)
            .bearer_auth(token)
            .send()
            .await?;
        if !response.status().is_success() {
            let status = response.status();
            return Err(DriveError::Message(format!(
                "Gagal mencari folder Drive: HTTP {status}"
            )));
        }
        let payload: DriveListResponse = response.json().await?;
        Ok(payload.files.and_then(|files| files.into_iter().next().map(|f| f.id)))
    }

    pub async fn create_folder(
        &self,
        parent_id: &str,
        name: &str,
    ) -> Result<String, DriveError> {
        let token = self.access_token().await?;
        let response = self
            .http
            .post("https://www.googleapis.com/drive/v3/files?fields=id,webViewLink&supportsAllDrives=true")
            .bearer_auth(&token)
            .json(&json!({
                "name": name,
                "mimeType": "application/vnd.google-apps.folder",
                "parents": [parent_id],
            }))
            .send()
            .await?;
        if !response.status().is_success() {
            let status = response.status();
            return Err(DriveError::Message(format!(
                "Gagal membuat folder Drive: HTTP {status}"
            )));
        }
        let file: DriveFileMeta = response.json().await?;
        if self.link_sharing {
            let _ = self.set_link_sharing(&file.id).await;
        }
        Ok(file.id)
    }

    pub async fn ensure_folder(
        &self,
        parent_id: &str,
        name: &str,
    ) -> Result<String, DriveError> {
        if let Some(id) = self.find_child_folder(parent_id, name).await? {
            return Ok(id);
        }
        match self.create_folder(parent_id, name).await {
            Ok(id) => Ok(id),
            Err(_) => {
                if let Some(id) = self.find_child_folder(parent_id, name).await? {
                    Ok(id)
                } else {
                    Err(DriveError::Message(format!(
                        "Gagal memastikan folder '{name}' di parent {parent_id}"
                    )))
                }
            }
        }
    }

    pub async fn upload_file(
        &self,
        parent_id: &str,
        name: &str,
        mime_type: &str,
        bytes: Vec<u8>,
    ) -> Result<DriveFile, DriveError> {
        let token = self.access_token().await?;
        let metadata = json!({
            "name": name,
            "parents": [parent_id],
        });
        let metadata_part = reqwest::multipart::Part::bytes(metadata.to_string().into_bytes())
            .mime_str("application/json; charset=UTF-8")
            .map_err(|e| DriveError::Message(e.to_string()))?;
        let file_part = reqwest::multipart::Part::bytes(bytes)
            .file_name(name.to_owned())
            .mime_str(if mime_type.is_empty() {
                "application/octet-stream"
            } else {
                mime_type
            })
            .map_err(|e| DriveError::Message(e.to_string()))?;
        let form = reqwest::multipart::Form::new()
            .part("metadata", metadata_part)
            .part("file", file_part);

        let response = self
            .http
            .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true")
            .bearer_auth(&token)
            .multipart(form)
            .send()
            .await?;
        if !response.status().is_success() {
            let status = response.status();
            return Err(DriveError::Message(format!(
                "Gagal mengunggah file ke Drive: HTTP {status}"
            )));
        }
        let file: DriveFileMeta = response.json().await?;
        if self.link_sharing {
            let _ = self.set_link_sharing(&file.id).await;
        }
        Ok(DriveFile {
            id: file.id,
            web_view_link: file.web_view_link,
        })
    }

    /// Delete folder or file in Google Drive
    pub async fn delete_file(&self, file_id: &str) -> Result<(), DriveError> {
        let token = self.access_token().await?;
        let response = self
            .http
            .delete(format!(
                "https://www.googleapis.com/drive/v3/files/{file_id}?supportsAllDrives=true"
            ))
            .bearer_auth(token)
            .send()
            .await?;
        if response.status().as_u16() == 404 {
            return Ok(());
        }
        if !response.status().is_success() {
            let status = response.status();
            return Err(DriveError::Message(format!(
                "Gagal menghapus file Drive: HTTP {status}"
            )));
        }
        Ok(())
    }

    pub async fn get_parent_folder_id(&self, file_id: &str) -> Result<Option<String>, DriveError> {
        let token = self.access_token().await?;
        let response = self
            .http
            .get(format!(
                "https://www.googleapis.com/drive/v3/files/{file_id}?fields=parents&supportsAllDrives=true"
            ))
            .bearer_auth(token)
            .send()
            .await?;
        if response.status().as_u16() == 404 {
            return Ok(None);
        }
        if !response.status().is_success() {
            let status = response.status();
            return Err(DriveError::Message(format!(
                "Gagal mendapatkan parent folder Drive: HTTP {status}"
            )));
        }
        #[derive(serde::Deserialize)]
        struct Parents {
            parents: Option<Vec<String>>,
        }
        let parents: Parents = response.json().await?;
        Ok(parents.parents.and_then(|p| p.into_iter().next()))
    }

    /// List all child folders of a parent folder
    pub async fn list_child_folders(
        &self,
        parent_id: &str,
    ) -> Result<Vec<DriveFile>, DriveError> {
        let token = self.access_token().await?;
        let query = format!(
            "mimeType = 'application/vnd.google-apps.folder' and '{parent_id}' in parents and trashed = false"
        );
        let url = format!(
            "https://www.googleapis.com/drive/v3/files?q={}&fields=files(id,name,webViewLink)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true",
            urlencoding::encode(&query)
        );
        let response = self
            .http
            .get(url)
            .bearer_auth(token)
            .send()
            .await?;
        if !response.status().is_success() {
            let status = response.status();
            return Err(DriveError::Message(format!(
                "Gagal list folder Drive: HTTP {status}"
            )));
        }
        let payload: DriveListResponse = response.json().await?;
        Ok(payload
            .files
            .unwrap_or_default()
            .into_iter()
            .map(|f| DriveFile {
                id: f.id,
                web_view_link: f.web_view_link,
            })
            .collect())
    }

    /// Rename folder atau file di Google Drive
    pub async fn rename(&self, file_id: &str, new_name: &str) -> Result<(), DriveError> {
        let token = self.access_token().await?;
        let body = serde_json::json!({ "name": new_name });
        let response = self
            .http
            .patch(format!(
                "https://www.googleapis.com/drive/v3/files/{file_id}?supportsAllDrives=true"
            ))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await?;
        if !response.status().is_success() {
            let status = response.status();
            return Err(DriveError::Message(format!(
                "Gagal rename Drive: HTTP {status}"
            )));
        }
        Ok(())
    }

    async fn set_link_sharing(&self, file_id: &str) -> Result<(), DriveError> {
        let token = self.access_token().await?;
        let response = self
            .http
            .post(format!(
                "https://www.googleapis.com/drive/v3/files/{file_id}/permissions?supportsAllDrives=true"
            ))
            .bearer_auth(token)
            .json(&json!({
                "role": "reader",
                "type": "anyone",
            }))
            .send()
            .await?;
        if !response.status().is_success() {
            let status = response.status();
            tracing::warn!(file_id, %status, "Gagal mengatur link sharing Drive");
        }
        Ok(())
    }
}
