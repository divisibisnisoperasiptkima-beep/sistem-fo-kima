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

    let mut migrator = sqlx::migrate!("./migrations");
    // Snapshot produksi masih menyimpan histori versi 1–16, sedangkan source
    // migrasi yang tersedia di repo ini dimulai dari versi 17.
    migrator.set_ignore_missing(true);
    migrator.run(database).await?;
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
