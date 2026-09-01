//! Pengisian ringan template BAA berbasis OOXML.
//!
//! Template BAA yang dipakai KIMA tidak memiliki content-control atau placeholder
//! Word. Modul ini mempertahankan seluruh paket DOCX dan hanya mengganti teks
//! pada paragraf yang memiliki label form. Baris isian dinormalisasi menjadi
//! pasangan label-nilai dengan tab stop yang konsisten, sehingga format asli
//! template tetap dipakai saat dokumen dibuat tanpa meninggalkan tab atau teks
//! placeholder dari template.
use std::io::{Cursor, Read};

use flate2::read::DeflateDecoder;

const TEMPLATE: &[u8] = include_bytes!("../templates/baa_activation_template.docx");

#[derive(Debug, Clone, Default)]
pub struct BaaTemplateData {
    pub nomor_baa: String,
    pub nama_pic: String,
    pub alamat_pic: String,
    pub phone: String,
    pub tanggal_aktivasi: String,
    pub nama_pelanggan: String,
    pub alamat_pelanggan: String,
    pub paket: String,
    pub ont_onu: String,
    pub mac_address: String,
    pub switch_media_converter: String,
    pub serial_number_ip_switch: String,
    pub fiber_outlet_otb: String,
    pub patch_core: String,
    pub kabel_drop_wire_fo: String,
    pub koordinat: String,
    pub signal_input_cpe: String,
    pub vlan: String,
    pub core: String,
}

#[derive(Debug)]
struct ZipEntry {
    name: Vec<u8>,
    data: Vec<u8>,
}

/// Membuat salinan template BAA dengan data form yang sudah diisi.
pub fn render_baa(data: &BaaTemplateData) -> Result<Vec<u8>, String> {
    let mut entries = read_zip(TEMPLATE)?;
    let document = entries
        .iter_mut()
        .find(|entry| entry.name == b"word/document.xml")
        .ok_or_else(|| "Template BAA tidak memiliki word/document.xml".to_owned())?;
    let xml = String::from_utf8(document.data.clone())
        .map_err(|_| "Isi template BAA bukan XML UTF-8 yang valid.".to_owned())?;
    document.data = fill_document_xml(&xml, data).into_bytes();
    Ok(write_zip(&entries))
}

/// Membuat PDF ringan untuk tampilan dan distribusi BAA.
///
/// Template sumber tetap dipakai untuk arsip DOCX melalui [`render_baa`],
/// sedangkan PDF dibuat langsung agar dapat ditampilkan inline oleh browser
/// tanpa ketergantungan pada aplikasi Word/LibreOffice di server.
pub fn render_baa_pdf(data: &BaaTemplateData) -> Vec<u8> {
    let mut content = String::new();
    let mut y = 790.0_f32;
    pdf_text_line(
        &mut content,
        50.0,
        y,
        16.0,
        "BERITA ACARA AKTIVASI FIBERNET",
    );
    y -= 24.0;
    pdf_text_line(
        &mut content,
        50.0,
        y,
        10.0,
        &format!("Nomor: {}", data.nomor_baa),
    );
    y -= 30.0;

    let sections = [
        (
            "IDENTITAS",
            vec![
                ("Tanggal aktivasi", data.tanggal_aktivasi.as_str()),
                ("Nama PIC / provider", data.nama_pic.as_str()),
                ("Telepon PIC", data.phone.as_str()),
                ("Alamat PIC", data.alamat_pic.as_str()),
                ("Nama pelanggan / lokasi", data.nama_pelanggan.as_str()),
                ("Alamat pelanggan / lokasi", data.alamat_pelanggan.as_str()),
            ],
        ),
        (
            "SERVICE DAN PERANGKAT",
            vec![
                ("Paket", data.paket.as_str()),
                ("ONT / ONU", data.ont_onu.as_str()),
                ("MAC address", data.mac_address.as_str()),
                (
                    "Switch / media converter",
                    data.switch_media_converter.as_str(),
                ),
                (
                    "Serial number / IP switch",
                    data.serial_number_ip_switch.as_str(),
                ),
                ("Fiber outlet / OTB", data.fiber_outlet_otb.as_str()),
                ("Patch core", data.patch_core.as_str()),
                ("Kabel / drop wire FO", data.kabel_drop_wire_fo.as_str()),
            ],
        ),
        (
            "DATA TEKNIS AKTIVASI",
            vec![
                ("Koordinat", data.koordinat.as_str()),
                ("Signal input CPE", data.signal_input_cpe.as_str()),
                ("VLAN", data.vlan.as_str()),
                ("Core", data.core.as_str()),
            ],
        ),
    ];

    for (heading, fields) in sections {
        y -= 5.0;
        pdf_text_line(&mut content, 50.0, y, 9.0, heading);
        y -= 17.0;
        for (label, value) in fields {
            let value = if value.trim().is_empty() { "-" } else { value };
            let lines = wrap_pdf_text(&format!("{label}: {value}"), 88);
            for line in lines {
                pdf_text_line(&mut content, 58.0, y, 9.0, &line);
                y -= 15.0;
            }
        }
        y -= 5.0;
    }
    pdf_text_line(
        &mut content,
        50.0,
        34.0,
        8.0,
        "Dokumen ini dibuat dari data form BAA pada Sistem FO KIMA.",
    );

    build_single_page_pdf(content.as_bytes())
}

fn pdf_text_line(content: &mut String, x: f32, y: f32, size: f32, value: &str) {
    content.push_str(&format!(
        "BT /F1 {size:.1} Tf {x:.1} {y:.1} Td ({}) Tj ET\n",
        pdf_escape(value)
    ));
}

fn wrap_pdf_text(value: &str, max_chars: usize) -> Vec<String> {
    let value = pdf_ascii(value);
    if value.chars().count() <= max_chars {
        return vec![value];
    }
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in value.split_whitespace() {
        let next_len = if current.is_empty() {
            word.len()
        } else {
            current.len() + 1 + word.len()
        };
        if next_len > max_chars && !current.is_empty() {
            lines.push(current);
            current = String::new();
        }
        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(word);
    }
    if !current.is_empty() {
        lines.push(current);
    }
    lines
}

fn pdf_ascii(value: &str) -> String {
    value
        .chars()
        .map(|character| if character.is_ascii() { character } else { '?' })
        .collect()
}

fn pdf_escape(value: &str) -> String {
    pdf_ascii(value)
        .chars()
        .flat_map(|character| match character {
            '\\' => ['\\', '\\'].into_iter().collect::<Vec<_>>(),
            '(' => ['\\', '('].into_iter().collect::<Vec<_>>(),
            ')' => ['\\', ')'].into_iter().collect::<Vec<_>>(),
            '\r' | '\n' => [' '].into_iter().collect::<Vec<_>>(),
            character => [character].into_iter().collect::<Vec<_>>(),
        })
        .collect()
}

fn build_single_page_pdf(content: &[u8]) -> Vec<u8> {
    let objects = vec![
        b"<< /Type /Catalog /Pages 2 0 R >>".to_vec(),
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_vec(),
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>".to_vec(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>".to_vec(),
        format!("<< /Length {} >>\nstream\n{}\nendstream", content.len(), String::from_utf8_lossy(content)).into_bytes(),
    ];
    let mut pdf = b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n".to_vec();
    let mut offsets = Vec::with_capacity(objects.len() + 1);
    offsets.push(0_usize);
    for (index, object) in objects.into_iter().enumerate() {
        offsets.push(pdf.len());
        pdf.extend_from_slice(format!("{} 0 obj\n", index + 1).as_bytes());
        pdf.extend_from_slice(&object);
        pdf.extend_from_slice(b"\nendobj\n");
    }
    let xref_offset = pdf.len();
    pdf.extend_from_slice(format!("xref\n0 {}\n", offsets.len()).as_bytes());
    pdf.extend_from_slice(b"0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        pdf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    pdf.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n",
            offsets.len(),
            xref_offset
        )
        .as_bytes(),
    );
    pdf
}

fn fill_document_xml(xml: &str, data: &BaaTemplateData) -> String {
    let mut output = String::with_capacity(xml.len() + 1024);
    let mut cursor = 0;
    let mut nama_lengkap_seen = 0u8;
    while let Some(start) = find_paragraph_start(xml, cursor) {
        let Some(end_rel) = xml[start..].find("</w:p>") else {
            output.push_str(&xml[cursor..]);
            return output;
        };
        let end = start + end_rel + "</w:p>".len();
        output.push_str(&xml[cursor..start]);
        let paragraph = &xml[start..end];
        let text = paragraph_text(paragraph);
        let field = field_for_paragraph(&text, data, &mut nama_lengkap_seen);
        output.push_str(
            match field {
                Some((label, value)) => {
                    // Field pada template dibuat sebagai satu baris dengan kolom label dan
                    // nilai. Tab eksplisit membuat seluruh nilai mulai dari posisi yang sama,
                    // sedangkan NOMOR tetap dirender sebagai teks terpusat seperti template asli.
                    let replacement = if label == "NOMOR" {
                        format!("{label}: {value}")
                    } else {
                        format!("{label}\t:\t{value}")
                    };
                    replace_text_nodes(paragraph, &replacement)
                }
                None => paragraph.to_owned(),
            }
            .as_str(),
        );
        cursor = end;
    }
    output.push_str(&xml[cursor..]);
    output
}

fn field_for_paragraph<'a>(
    text: &str,
    data: &'a BaaTemplateData,
    nama_lengkap_seen: &mut u8,
) -> Option<(&'static str, String)> {
    let normalized = text.replace('\u{00a0}', " ").trim().to_ascii_lowercase();
    let value = |value: &str| clean_value(value);
    if normalized.starts_with("nomor") {
        return Some(("NOMOR", value(&data.nomor_baa)));
    }
    if normalized.starts_with("nama lengkap") {
        *nama_lengkap_seen = nama_lengkap_seen.saturating_add(1);
        return if *nama_lengkap_seen == 1 {
            Some(("Nama Lengkap", value(&data.nama_pic)))
        } else if *nama_lengkap_seen == 2 {
            Some(("Nama Lengkap", value(&data.nama_pelanggan)))
        } else {
            None
        };
    }
    let matches = [
        ("alamat", "Alamat", &data.alamat_pic),
        ("phone", "Phone", &data.phone),
        (
            "tanggal aktivasi",
            "Tanggal Aktivasi",
            &data.tanggal_aktivasi,
        ),
        ("paket", "Paket", &data.paket),
        ("ont/onu", "ONT/ONU", &data.ont_onu),
        ("mac address", "MAC ADDRESS", &data.mac_address),
        (
            "switch / media converter",
            "Switch / Media Converter",
            &data.switch_media_converter,
        ),
        (
            "serial number / ip switch",
            "Serial Number / IP Switch",
            &data.serial_number_ip_switch,
        ),
        (
            "fiber outlet / otb",
            "Fiber Outlet / OTB",
            &data.fiber_outlet_otb,
        ),
        ("patch core", "Patch Core", &data.patch_core),
        (
            "kabel / drop wire fo",
            "Kabel / Drop Wire FO",
            &data.kabel_drop_wire_fo,
        ),
        ("koordinat", "Koordinat", &data.koordinat),
        (
            "signal input cpe",
            "Signal Input CPE",
            &data.signal_input_cpe,
        ),
        ("vlan", "Vlan", &data.vlan),
        ("core", "Core", &data.core),
    ];
    for (prefix, label, field_value) in matches {
        if normalized.starts_with(prefix) {
            // Label Alamat kedua berada di bagian DATA PELANGGAN.
            if prefix == "alamat" && *nama_lengkap_seen >= 2 {
                return Some((label, value(&data.alamat_pelanggan)));
            }
            return Some((label, value(field_value)));
        }
    }
    None
}

fn clean_value(value: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        "-".to_owned()
    } else {
        value.replace(['\r', '\n'], " / ")
    }
}

fn find_paragraph_start(xml: &str, from: usize) -> Option<usize> {
    let mut offset = from;
    while let Some(rel) = xml[offset..].find("<w:p") {
        let start = offset + rel;
        let next = xml.as_bytes().get(start + 4).copied();
        if matches!(
            next,
            Some(b'>') | Some(b' ') | Some(b'\t') | Some(b'\r') | Some(b'\n')
        ) {
            return Some(start);
        }
        offset = start + 4;
    }
    None
}

fn paragraph_text(paragraph: &str) -> String {
    let mut text = String::new();
    let mut cursor = 0;
    while let Some(start) = find_text_start(paragraph, cursor) {
        let Some(open_end_rel) = paragraph[start..].find('>') else {
            break;
        };
        let content_start = start + open_end_rel + 1;
        let Some(close_rel) = paragraph[content_start..].find("</w:t>") else {
            break;
        };
        text.push_str(&xml_unescape(
            &paragraph[content_start..content_start + close_rel],
        ));
        cursor = content_start + close_rel + "</w:t>".len();
    }
    text
}

fn replace_text_nodes(paragraph: &str, replacement: &str) -> String {
    let Some(first_run_start) = find_run_start(paragraph, 0) else {
        return paragraph.to_owned();
    };
    let Some(first_run_open_end_rel) = paragraph[first_run_start..].find('>') else {
        return paragraph.to_owned();
    };
    let first_run_open_end = first_run_start + first_run_open_end_rel + 1;
    let Some(first_run_close_rel) = paragraph[first_run_open_end..].find("</w:r>") else {
        return paragraph.to_owned();
    };
    let first_run_close = first_run_open_end + first_run_close_rel;
    let first_run = &paragraph[first_run_start..first_run_close + "</w:r>".len()];
    let run_open = &paragraph[first_run_start..first_run_open_end];
    let run_properties = extract_run_properties(first_run).unwrap_or_default();

    let mut output = String::with_capacity(paragraph.len() + replacement.len() + 128);
    let paragraph_properties_end = paragraph
        .find("</w:pPr>")
        .map(|end| end + "</w:pPr>".len())
        .unwrap_or(first_run_start);
    if replacement.contains('\t') {
        output.push_str(&compact_row_properties(
            &paragraph[..paragraph_properties_end],
        ));
    } else {
        output.push_str(&paragraph[..paragraph_properties_end]);
    }

    output.push_str(run_open);
    output.push_str(&run_properties);
    let mut first_part = true;
    for part in replacement.split('\t') {
        if !first_part {
            output.push_str("<w:tab/>");
        }
        output.push_str("<w:t xml:space=\"preserve\">");
        output.push_str(&xml_escape(part));
        output.push_str("</w:t>");
        first_part = false;
    }
    output.push_str("</w:r></w:p>");
    output
}

fn find_run_start(xml: &str, from: usize) -> Option<usize> {
    let mut offset = from;
    while let Some(relative) = xml[offset..].find("<w:r") {
        let start = offset + relative;
        let next = xml.as_bytes().get(start + 4).copied();
        if matches!(
            next,
            Some(b'>') | Some(b' ') | Some(b'\t') | Some(b'\r') | Some(b'\n')
        ) {
            return Some(start);
        }
        offset = start + 4;
    }
    None
}

fn extract_run_properties(run: &str) -> Option<String> {
    let start = run.find("<w:rPr")?;
    let end = run[start..].find("</w:rPr>")? + start + "</w:rPr>".len();
    Some(run[start..end].to_owned())
}

fn compact_row_properties(paragraph_properties: &str) -> String {
    let Some(close_start) = paragraph_properties.rfind("</w:pPr>") else {
        return paragraph_properties.to_owned();
    };
    let mut properties = paragraph_properties.to_owned();
    remove_ppr_element(&mut properties, "spacing");
    remove_ppr_element(&mut properties, "ind");
    remove_ppr_element(&mut properties, "tabs");
    let insert_at = properties
        .find("<w:rPr")
        .unwrap_or_else(|| properties.rfind("</w:pPr>").unwrap_or(close_start));
    properties.insert_str(
        insert_at,
        "<w:spacing w:after=\"40\" w:line=\"240\" w:lineRule=\"auto\"/><w:ind w:left=\"2600\" w:hanging=\"2600\"/><w:tabs><w:tab w:val=\"right\" w:pos=\"2500\"/><w:tab w:val=\"left\" w:pos=\"2600\"/></w:tabs>",
    );
    properties
}

fn remove_ppr_element(properties: &mut String, element: &str) {
    let open = format!("<w:{element}");
    let Some(start) = properties.find(&open) else {
        return;
    };
    let Some(close_rel) = properties[start..].find('>') else {
        return;
    };
    let close = start + close_rel + 1;
    if properties[..close].ends_with("/>") {
        properties.replace_range(start..close, "");
        return;
    }
    let closing = format!("</w:{element}>");
    let Some(end_rel) = properties[close..].find(&closing) else {
        return;
    };
    properties.replace_range(start..close + end_rel + closing.len(), "");
}

fn find_text_start(xml: &str, from: usize) -> Option<usize> {
    let mut offset = from;
    while let Some(rel) = xml[offset..].find("<w:t") {
        let start = offset + rel;
        let next = xml.as_bytes().get(start + 4).copied();
        if matches!(
            next,
            Some(b'>') | Some(b' ') | Some(b'\t') | Some(b'\r') | Some(b'\n')
        ) {
            return Some(start);
        }
        offset = start + 4;
    }
    None
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn xml_unescape(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn read_zip(bytes: &[u8]) -> Result<Vec<ZipEntry>, String> {
    let eocd = bytes
        .windows(4)
        .rposition(|window| window == b"PK\x05\x06")
        .ok_or_else(|| "Template BAA bukan ZIP/DOCX yang valid.".to_owned())?;
    let count = read_u16(bytes, eocd + 10)? as usize;
    let directory_offset = read_u32(bytes, eocd + 16)? as usize;
    let mut cursor = directory_offset;
    let mut entries = Vec::with_capacity(count);
    for _ in 0..count {
        if read_u32(bytes, cursor)? != 0x0201_4b50 {
            return Err("Central directory template BAA tidak valid.".to_owned());
        }
        let method = read_u16(bytes, cursor + 10)?;
        let compressed_size = read_u32(bytes, cursor + 20)? as usize;
        let uncompressed_size = read_u32(bytes, cursor + 24)? as usize;
        let name_len = read_u16(bytes, cursor + 28)? as usize;
        let extra_len = read_u16(bytes, cursor + 30)? as usize;
        let comment_len = read_u16(bytes, cursor + 32)? as usize;
        let local_offset = read_u32(bytes, cursor + 42)? as usize;
        let name_start = cursor + 46;
        let name = bytes
            .get(name_start..name_start + name_len)
            .ok_or_else(|| "Nama entry ZIP tidak lengkap.".to_owned())?
            .to_vec();
        if read_u32(bytes, local_offset)? != 0x0403_4b50 {
            return Err("Local header template BAA tidak valid.".to_owned());
        }
        let local_name_len = read_u16(bytes, local_offset + 26)? as usize;
        let local_extra_len = read_u16(bytes, local_offset + 28)? as usize;
        let data_start = local_offset + 30 + local_name_len + local_extra_len;
        let compressed = bytes
            .get(data_start..data_start + compressed_size)
            .ok_or_else(|| "Data entry ZIP tidak lengkap.".to_owned())?;
        let data = match method {
            0 => compressed.to_vec(),
            8 => {
                let mut decoder = DeflateDecoder::new(Cursor::new(compressed));
                let mut data = Vec::with_capacity(uncompressed_size);
                decoder
                    .read_to_end(&mut data)
                    .map_err(|error| format!("Gagal membuka template BAA: {error}"))?;
                data
            }
            _ => return Err(format!("Metode kompresi DOCX tidak didukung: {method}")),
        };
        entries.push(ZipEntry { name, data });
        cursor = name_start + name_len + extra_len + comment_len;
    }
    Ok(entries)
}

fn write_zip(entries: &[ZipEntry]) -> Vec<u8> {
    let mut output = Vec::new();
    let mut central = Vec::new();
    for entry in entries {
        let offset = output.len() as u32;
        let crc = crc32(&entry.data);
        push_u32(&mut output, 0x0403_4b50);
        push_u16(&mut output, 20);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u32(&mut output, crc);
        push_u32(&mut output, entry.data.len() as u32);
        push_u32(&mut output, entry.data.len() as u32);
        push_u16(&mut output, entry.name.len() as u16);
        push_u16(&mut output, 0);
        output.extend_from_slice(&entry.name);
        output.extend_from_slice(&entry.data);

        push_u32(&mut central, 0x0201_4b50);
        push_u16(&mut central, 20);
        push_u16(&mut central, 20);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u32(&mut central, crc);
        push_u32(&mut central, entry.data.len() as u32);
        push_u32(&mut central, entry.data.len() as u32);
        push_u16(&mut central, entry.name.len() as u16);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u32(&mut central, 0);
        push_u32(&mut central, offset);
        central.extend_from_slice(&entry.name);
    }
    let central_offset = output.len() as u32;
    output.extend_from_slice(&central);
    push_u32(&mut output, 0x0605_4b50);
    push_u16(&mut output, 0);
    push_u16(&mut output, 0);
    push_u16(&mut output, entries.len() as u16);
    push_u16(&mut output, entries.len() as u16);
    push_u32(&mut output, central.len() as u32);
    push_u32(&mut output, central_offset);
    push_u16(&mut output, 0);
    output
}

fn read_u16(bytes: &[u8], offset: usize) -> Result<u16, String> {
    let bytes = bytes
        .get(offset..offset + 2)
        .ok_or_else(|| "Header ZIP terpotong.".to_owned())?;
    Ok(u16::from_le_bytes([bytes[0], bytes[1]]))
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let bytes = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| "Header ZIP terpotong.".to_owned())?;
    Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

fn push_u16(output: &mut Vec<u8>, value: u16) {
    output.extend_from_slice(&value.to_le_bytes());
}
fn push_u32(output: &mut Vec<u8>, value: u32) {
    output.extend_from_slice(&value.to_le_bytes());
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in bytes {
        crc ^= *byte as u32;
        for _ in 0..8 {
            crc = if crc & 1 != 0 {
                (crc >> 1) ^ 0xedb8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

#[cfg(test)]
mod tests {
    use super::{BaaTemplateData, render_baa, render_baa_pdf};

    #[test]
    fn template_can_be_rendered_and_remains_a_docx_zip() {
        let mut data = BaaTemplateData::default();
        data.nomor_baa = "BAA-TEST-001".to_owned();
        data.nama_pic = "PIC Test".to_owned();
        data.nama_pelanggan = "Lokasi Test".to_owned();
        let rendered = render_baa(&data).expect("template dapat dirender");
        assert_eq!(&rendered[..4], b"PK\x03\x04");
        assert!(rendered.len() > 1000);
        let entries = super::read_zip(&rendered).expect("DOCX hasil tetap dapat dibaca");
        let document = entries
            .iter()
            .find(|entry| entry.name == b"word/document.xml")
            .expect("document.xml tersedia");
        let xml = String::from_utf8_lossy(&document.data);
        assert!(xml.contains("BAA-TEST-001"));
        assert!(xml.contains("PIC Test"));
        assert!(xml.contains("Lokasi Test"));
        assert!(xml.contains("w:ind w:left=\"2600\" w:hanging=\"2600\""));
        assert!(xml.contains("w:val=\"right\" w:pos=\"2500\""));
        assert!(xml.contains("w:val=\"left\" w:pos=\"2600\""));
        assert!(xml.contains("<w:t xml:space=\"preserve\">Nama Lengkap</w:t><w:tab/><w:t xml:space=\"preserve\">:</w:t><w:tab/><w:t xml:space=\"preserve\">PIC Test</w:t>"));
        assert!(!xml.contains("<w:tab/><w:tab/>"));
        assert!(!xml.contains("<w:t><w:t"));
    }

    #[test]
    fn baa_pdf_is_a_valid_single_page_pdf() {
        let mut data = BaaTemplateData::default();
        data.nomor_baa = "BAA-TEST-001".to_owned();
        data.paket = "8 Core".to_owned();
        data.core = "8 Core".to_owned();
        let rendered = render_baa_pdf(&data);
        assert!(rendered.starts_with(b"%PDF-1.4"));
        assert!(String::from_utf8_lossy(&rendered).contains("BAA-TEST-001"));
        assert!(String::from_utf8_lossy(&rendered).contains("Paket: 8 Core"));
        assert!(String::from_utf8_lossy(&rendered).contains("Core: 8 Core"));
        assert!(String::from_utf8_lossy(&rendered).contains("%%EOF"));
    }
}
