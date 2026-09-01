use chrono::NaiveDate;

use super::client::{DriveClient, DriveError};

pub const DOC_CATEGORIES: &[&str] = &[
    "Kontrak",
    "BAK-PKS",
    "Dokumen Lain",
    "Nota Dinas",
    "Dokumen Survey",
    "Surat Penawaran",
    "Surat PO",
    "Akte Pendirian",
    "Izin Pelanggan",
    "BAA",
    "Invoice",
    "Faktur Pajak",
    "Bukti Pembayaran",
];

const PORTAL_REQUEST_TOP_LEVEL_FOLDERS: &[&str] = &[
    "01 Pengajuan",
    "02 Survei",
    "03 Penawaran",
    "04 PO dan Legalitas",
    "06 BAK-PKS",
    "07 BAA",
    "08 Invoice",
    "09 Pembayaran",
    "10 Kontrak",
    "Internal",
];

pub fn sanitize_folder_name(name: &str) -> String {
    let cleaned = name
        .trim()
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c if c.is_control() => '-',
            other => other,
        })
        .collect::<String>();
    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        "Tanpa Nama".to_owned()
    } else {
        collapsed.chars().take(180).collect()
    }
}

pub fn format_periode_folder(awal: &str, akhir: &str) -> Result<String, DriveError> {
    let start = parse_date(awal)?;
    let end = parse_date(akhir)?;
    Ok(format!(
        "{} s.d. {}",
        start.format("%d-%m-%Y"),
        end.format("%d-%m-%Y")
    ))
}

fn parse_date(value: &str) -> Result<NaiveDate, DriveError> {
    let trimmed = value.trim();
    NaiveDate::parse_from_str(trimmed, "%Y-%m-%d")
        .or_else(|_| NaiveDate::parse_from_str(trimmed, "%d-%m-%Y"))
        .map_err(|_| DriveError::Message(format!("Format tanggal tidak valid: {value}")))
}

pub fn parse_drive_folder_id(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    if let Some(idx) = value.find("/folders/") {
        let rest = &value[idx + "/folders/".len()..];
        let id = rest
            .split(['?', '/', '#', '&'])
            .next()
            .unwrap_or_default()
            .trim();
        if is_valid_drive_id(id) {
            return Some(id.to_owned());
        }
    }
    if is_valid_drive_id(value) {
        return Some(value.to_owned());
    }
    None
}

fn is_valid_drive_id(value: &str) -> bool {
    value.len() >= 10
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        && !value.contains(' ')
        && !value.contains("://")
}

pub fn folder_url(folder_id: &str) -> String {
    format!("https://drive.google.com/drive/folders/{folder_id}")
}

pub async fn ensure_pelanggan_tree(
    drive: &DriveClient,
    kode_pelanggan: &str,
    nama_pelanggan: &str,
) -> Result<(String, String), DriveError> {
    let root = drive.root_folder_id.as_ref();
    let pelanggan_name = sanitize_folder_name(nama_pelanggan);
    // Format: [KODE] Nama Pelanggan
    let folder_name = if kode_pelanggan.is_empty() {
        pelanggan_name.clone()
    } else {
        format!("[{}] {}", kode_pelanggan, pelanggan_name)
    };
    // Buat folder customer, lalu langsung kategori di dalamnya (tanpa wrapper "Berkas Pelanggan").
    // Struktur baru:
    //   [KODE] Nama Pelanggan/
    //     Kontrak/
    //     BAK-PKS/
    //     Dokumen Lain/
    //     Lokasi/
    let pelanggan_id = drive.ensure_folder(root, &folder_name).await?;
    for category in DOC_CATEGORIES {
        let _ = drive.ensure_folder(&pelanggan_id, category).await?;
    }
    let _ = drive.ensure_folder(&pelanggan_id, "Lokasi").await?;
    // Return (customer_folder_id, customer_folder_id) — link_folder_berkas menunjuk ke root customer
    Ok((pelanggan_id.clone(), pelanggan_id))
}

pub async fn ensure_kontrak_tree(
    drive: &DriveClient,
    parent_folder_id: &str,
    nama_lokasi: &str,
    periode_awal: &str,
    periode_berakhir: &str,
) -> Result<(String, String), DriveError> {
    let lokasi_name = sanitize_folder_name(nama_lokasi);
    let periode_name = format_periode_folder(periode_awal, periode_berakhir)?;

    let lokasi_root_id = drive.ensure_folder(parent_folder_id, "Lokasi").await?;
    let lokasi_id = drive.ensure_folder(&lokasi_root_id, &lokasi_name).await?;
    let periode_id = drive.ensure_folder(&lokasi_id, &periode_name).await?;
    for category in DOC_CATEGORIES {
        let _ = drive.ensure_folder(&periode_id, category).await?;
    }
    let url = folder_url(&periode_id);
    Ok((periode_id, url))
}

/// Membuat struktur folder final untuk satu permohonan portal.
///
/// Parent folder adalah folder ISP/pelanggan yang telah dipetakan KIMA.
/// Nama perusahaan menjadi folder lokasi, sedangkan kode registrasi menjadi
/// folder permohonan yang unik. Dengan demikian semua berkas satu pengajuan
/// tetap berada di bawah ISP yang dipilih tanpa mencampur pengajuan lain.
pub async fn ensure_portal_registration_tree(
    drive: &DriveClient,
    isp_parent_folder_id: &str,
    nama_perusahaan: &str,
    kode_registrasi: &str,
) -> Result<(String, String), DriveError> {
    let lokasi_root_id = drive.ensure_folder(isp_parent_folder_id, "Lokasi").await?;
    let perusahaan_id = drive
        .ensure_folder(&lokasi_root_id, &sanitize_folder_name(nama_perusahaan))
        .await?;
    let permohonan_root_id = drive.ensure_folder(&perusahaan_id, "Permohonan").await?;
    let request_name = if kode_registrasi.trim().is_empty() {
        "Permohonan".to_owned()
    } else {
        sanitize_folder_name(kode_registrasi)
    };
    let request_folder_id = drive
        .ensure_folder(&permohonan_root_id, &request_name)
        .await?;

    for folder_name in PORTAL_REQUEST_TOP_LEVEL_FOLDERS {
        let _ = drive.ensure_folder(&request_folder_id, folder_name).await?;
    }

    Ok((request_folder_id.clone(), folder_url(&request_folder_id)))
}

/// Mengembalikan path folder dokumen SOP relatif terhadap folder permohonan.
/// Beberapa dokumen legal memiliki subfolder sendiri agar tiga berkas PO tidak
/// kembali tercampur dalam satu folder generik.
pub fn portal_document_folder_path(kategori: &str) -> Option<Vec<&'static str>> {
    match kategori {
        "Dokumen Survey" => Some(vec!["02 Survei"]),
        "Surat Penawaran" => Some(vec!["03 Penawaran"]),
        "Surat PO" => Some(vec!["04 PO dan Legalitas", "Surat PO"]),
        "Akte Pendirian" => Some(vec!["04 PO dan Legalitas", "Akte Pendirian"]),
        "Izin Pelanggan" => Some(vec!["04 PO dan Legalitas", "Izin Pelanggan"]),
        "BAK-PKS" => Some(vec!["06 BAK-PKS"]),
        "BAA" => Some(vec!["07 BAA"]),
        "Invoice" | "Faktur Pajak" => Some(vec!["08 Invoice"]),
        "Bukti Pembayaran" => Some(vec!["09 Pembayaran"]),
        "Kontrak" => Some(vec!["10 Kontrak"]),
        "Nota Dinas" => Some(vec!["Internal", "Nota Dinas"]),
        // Dokumen lama yang belum memiliki kategori khusus tetap dapat
        // diunggah tanpa mengganggu folder SOP yang sudah terstruktur.
        "Dokumen Lain" => Some(vec!["01 Pengajuan"]),
        _ => None,
    }
}

pub async fn ensure_portal_document_folder(
    drive: &DriveClient,
    request_folder_id: &str,
    kategori: &str,
) -> Result<String, DriveError> {
    let path = portal_document_folder_path(kategori).ok_or_else(|| {
        DriveError::Message(format!("Kategori dokumen portal tidak valid: {kategori}"))
    })?;
    let mut parent_id = request_folder_id.to_owned();
    for folder_name in path {
        parent_id = drive.ensure_folder(&parent_id, folder_name).await?;
    }
    Ok(parent_id)
}

pub async fn ensure_category_folder(
    drive: &DriveClient,
    parent_folder_id: &str,
    kategori: &str,
) -> Result<String, DriveError> {
    if !DOC_CATEGORIES.contains(&kategori) {
        return Err(DriveError::Message(format!(
            "Kategori dokumen tidak valid: {kategori}"
        )));
    }
    drive.ensure_folder(parent_folder_id, kategori).await
}

/// Delete kontrak period folder and optionally the parent location folder.
///
/// Given the Drive folder ID of the period folder (from `link_folder_berkas`),
/// deletes it and checks if the parent location folder is now empty.
pub async fn delete_kontrak_tree(
    drive: &DriveClient,
    period_folder_id: &str,
) -> Result<(), DriveError> {
    // Get the parent (location) folder ID before deleting
    let parent_id = drive
        .get_parent_folder_id(period_folder_id)
        .await
        .unwrap_or(None);

    // Delete the period folder
    drive.delete_file(period_folder_id).await?;

    // Check if the location folder has other child folders
    if let Some(ref parent_id) = parent_id {
        match drive.list_child_folders(parent_id).await {
            Ok(children) if children.is_empty() => {
                let _ = drive.delete_file(parent_id).await;
            }
            _ => {}
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::portal_document_folder_path;

    #[test]
    fn portal_document_categories_stay_in_expected_request_sections() {
        assert_eq!(
            portal_document_folder_path("Dokumen Survey"),
            Some(vec!["02 Survei"])
        );
        assert_eq!(
            portal_document_folder_path("Surat Penawaran"),
            Some(vec!["03 Penawaran"])
        );
        assert_eq!(
            portal_document_folder_path("Surat PO"),
            Some(vec!["04 PO dan Legalitas", "Surat PO"])
        );
        assert_eq!(
            portal_document_folder_path("Akte Pendirian"),
            Some(vec!["04 PO dan Legalitas", "Akte Pendirian"])
        );
        assert_eq!(
            portal_document_folder_path("Izin Pelanggan"),
            Some(vec!["04 PO dan Legalitas", "Izin Pelanggan"])
        );
        assert_eq!(
            portal_document_folder_path("Bukti Pembayaran"),
            Some(vec!["09 Pembayaran"])
        );
        assert_eq!(portal_document_folder_path("Kategori Tidak Ada"), None);
    }
}
