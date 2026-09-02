use sqlx::MySqlPool;

fn sanitize_identifier(value: &str) -> String {
    value.replace('`', "``")
}

pub async fn ensure_application_schema(
    database: &MySqlPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Versi 17–26 dahulu dijalankan langsung saat setiap startup dan karenanya
    // mungkin belum tercatat. Persiapan ini hanya dibutuhkan sebelum versi 18
    // pertama kali dicatat oleh SQLx.
    if !migration_is_applied(database, 18).await? {
        reset_contract_status_constraints(database).await?;
        ensure_operational_columns(database).await?;
    }

    // Empat tabel ini berasal dari migrasi legacy sebelum migrasi SQLx backend
    // dimulai pada versi 17. Snapshot produksi tidak memilikinya, padahal migrasi
    // 29 sudah membuat FK ke sop_workflows. Bootstrap secara idempoten terlebih
    // dahulu agar migrasi 29 dan seterusnya dapat dijalankan dari snapshot lama.
    ensure_sop_base_schema(database).await?;

    // Migrasi legacy memakai BIGINT signed, sedangkan migrasi baru dan model Rust
    // memakai u64. Samakan sebelum SQLx membuat FK baru pada migrasi 29.
    reconcile_sop_id_types(database).await?;

    let mut migrator = sqlx::migrate!("./migrations");
    // Snapshot produksi masih menyimpan histori versi 1–16, sedangkan source
    // migrasi yang tersedia di repo ini dimulai dari versi 17.
    migrator.set_ignore_missing(true);
    migrator.run(database).await?;

    // Pertahankan pemeriksaan setelah migrasi sebagai pengaman untuk instalasi
    // lama yang mungkin mempunyai sebagian tabel dengan tipe yang berbeda.
    reconcile_sop_id_types(database).await?;
    Ok(())
}

async fn ensure_sop_base_schema(database: &MySqlPool) -> Result<(), sqlx::Error> {
    let existing_tables: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM information_schema.tables \
         WHERE table_schema = DATABASE() \
           AND table_name IN (\
             'sop_workflows',\
             'sop_step_history',\
             'sop_documents',\
             'registration_tokens'\
           )",
    )
    .fetch_one(database)
    .await?;

    if existing_tables < 4 {
        sqlx::raw_sql(include_str!(
            "../../migrations/001_create_sop_workflow_tables.sql"
        ))
        .execute(database)
        .await?;
    }

    Ok(())
}

/// Selaraskan tipe kolom id tabel SOP menjadi BIGINT UNSIGNED.
///
/// Migrasi awal membuat `sop_workflows`, `sop_step_history`, `sop_documents`, dan
/// `registration_tokens` dengan id **signed** BIGINT, sedangkan seluruh model Rust
/// memakai `u64` (BIGINT UNSIGNED) seperti tabel lain. Ketidakcocokan ini membuat
/// sqlx gagal mendekode kolom id/workflow_id. Fungsi ini idempoten: hanya melakukan
/// ALTER bila kolom masih signed, jadi aman dijalankan setiap startup.
async fn reconcile_sop_id_types(database: &MySqlPool) -> Result<(), sqlx::Error> {
    // (tabel, kolom, definisi target). Kolom pk/fk yang saling mereferensi harus
    // sama-sama UNSIGNED; FK anak (workflow_id) diselaraskan bersama pk induknya.
    let columns = [
        (
            "sop_workflows",
            "id",
            "BIGINT UNSIGNED NOT NULL AUTO_INCREMENT",
        ),
        (
            "sop_step_history",
            "id",
            "BIGINT UNSIGNED NOT NULL AUTO_INCREMENT",
        ),
        (
            "sop_step_history",
            "workflow_id",
            "BIGINT UNSIGNED NOT NULL",
        ),
        (
            "sop_documents",
            "id",
            "BIGINT UNSIGNED NOT NULL AUTO_INCREMENT",
        ),
        ("sop_documents", "workflow_id", "BIGINT UNSIGNED NOT NULL"),
        (
            "registration_tokens",
            "id",
            "BIGINT UNSIGNED NOT NULL AUTO_INCREMENT",
        ),
    ];

    // Cek apakah ada kolom yang masih signed. Bila tidak ada, lewati semuanya
    // (termasuk manipulasi FK) agar startup normal tidak menyentuh skema.
    let signed_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM information_schema.columns \
         WHERE table_schema = DATABASE() \
           AND ((table_name = 'sop_workflows' AND column_name = 'id') \
             OR (table_name = 'sop_step_history' AND column_name IN ('id','workflow_id')) \
             OR (table_name = 'sop_documents' AND column_name IN ('id','workflow_id')) \
             OR (table_name = 'registration_tokens' AND column_name = 'id')) \
           AND column_type = 'bigint'",
    )
    .fetch_one(database)
    .await?;
    if signed_count == 0 {
        return Ok(());
    }

    // FK yang mereferensi sop_workflows(id) harus dilepas dulu sebelum MODIFY,
    // lalu dibuat ulang. Nama constraint mengikuti default InnoDB dari migrasi.
    sqlx::query("SET FOREIGN_KEY_CHECKS = 0")
        .execute(database)
        .await?;

    for (constraint_table, constraint_name) in [
        ("sop_documents", "sop_documents_ibfk_1"),
        ("sop_step_history", "sop_step_history_ibfk_1"),
    ] {
        let exists: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.table_constraints \
             WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ?",
        )
        .bind(constraint_table)
        .bind(constraint_name)
        .fetch_one(database)
        .await?;
        if exists > 0 {
            sqlx::query(&format!(
                "ALTER TABLE `{}` DROP FOREIGN KEY `{}`",
                sanitize_identifier(constraint_table),
                sanitize_identifier(constraint_name)
            ))
            .execute(database)
            .await?;
        }
    }

    for (table, column, definition) in columns {
        sqlx::query(&format!(
            "ALTER TABLE `{}` MODIFY `{}` {}",
            sanitize_identifier(table),
            sanitize_identifier(column),
            definition
        ))
        .execute(database)
        .await?;
    }

    sqlx::query(
        "ALTER TABLE sop_step_history ADD CONSTRAINT sop_step_history_ibfk_1 \
         FOREIGN KEY (workflow_id) REFERENCES sop_workflows(id) ON DELETE CASCADE",
    )
    .execute(database)
    .await?;
    sqlx::query(
        "ALTER TABLE sop_documents ADD CONSTRAINT sop_documents_ibfk_1 \
         FOREIGN KEY (workflow_id) REFERENCES sop_workflows(id) ON DELETE CASCADE",
    )
    .execute(database)
    .await?;

    sqlx::query("SET FOREIGN_KEY_CHECKS = 1")
        .execute(database)
        .await?;

    Ok(())
}

async fn migration_is_applied(database: &MySqlPool, version: i64) -> Result<bool, sqlx::Error> {
    let table_exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM information_schema.tables \
         WHERE table_schema = DATABASE() AND table_name = '_sqlx_migrations'",
    )
    .fetch_one(database)
    .await?;
    if table_exists == 0 {
        return Ok(false);
    }

    sqlx::query_scalar(
        "SELECT COUNT(*) > 0 FROM _sqlx_migrations WHERE version = ? AND success = TRUE",
    )
    .bind(version)
    .fetch_one(database)
    .await
}

async fn ensure_operational_columns(database: &MySqlPool) -> Result<(), sqlx::Error> {
    let columns = [
        ("billing", "bulan_jatuh_tempo", "DATE NULL AFTER bulan"),
        (
            "billing",
            "tanggal_jatuh_tempo",
            "DATE NULL AFTER bulan_jatuh_tempo",
        ),
        (
            "billing",
            "harga_bulanan_snapshot",
            "DECIMAL(18,2) NULL AFTER nominal_tagihan",
        ),
        (
            "titik_pelanggan",
            "submitted_by_user_id",
            "BIGINT UNSIGNED NULL AFTER pending_points",
        ),
        (
            "titik_pelanggan",
            "submitted_at",
            "DATETIME NULL AFTER submitted_by_user_id",
        ),
        (
            "titik_pelanggan",
            "reviewed_by_user_id",
            "BIGINT UNSIGNED NULL AFTER submitted_at",
        ),
        (
            "titik_pelanggan",
            "reviewed_at",
            "DATETIME NULL AFTER reviewed_by_user_id",
        ),
        (
            "titik_pelanggan",
            "rejection_reason",
            "TEXT NULL AFTER reviewed_at",
        ),
        (
            "rute_fo",
            "submitted_by_user_id",
            "BIGINT UNSIGNED NULL AFTER pending_manual_points",
        ),
        (
            "rute_fo",
            "submitted_at",
            "DATETIME NULL AFTER submitted_by_user_id",
        ),
        (
            "rute_fo",
            "reviewed_by_user_id",
            "BIGINT UNSIGNED NULL AFTER submitted_at",
        ),
        (
            "rute_fo",
            "reviewed_at",
            "DATETIME NULL AFTER reviewed_by_user_id",
        ),
        ("rute_fo", "rejection_reason", "TEXT NULL AFTER reviewed_at"),
    ];

    for (table, column, definition) in columns {
        let exists: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.columns \
             WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
        )
        .bind(table)
        .bind(column)
        .fetch_one(database)
        .await?;
        if exists == 0 {
            sqlx::query(&format!(
                "ALTER TABLE `{}` ADD COLUMN `{}` {}",
                sanitize_identifier(table),
                sanitize_identifier(column),
                definition
            ))
            .execute(database)
            .await?;
        }
    }
    Ok(())
}

async fn reset_contract_status_constraints(database: &MySqlPool) -> Result<(), sqlx::Error> {
    let constraints: Vec<String> = sqlx::query_scalar(
        "SELECT constraint_name \
         FROM information_schema.table_constraints \
         WHERE table_schema = DATABASE() \
           AND table_name = 'lokasi' \
           AND constraint_type = 'CHECK' \
           AND constraint_name IN ('chk_lokasi_status', 'chk_lokasi_status_transitional')",
    )
    .fetch_all(database)
    .await?;

    for constraint in constraints {
        sqlx::query(&format!(
            "ALTER TABLE lokasi DROP CHECK `{}`",
            sanitize_identifier(&constraint)
        ))
        .execute(database)
        .await?;
    }
    Ok(())
}
