use sqlx::MySqlPool;

fn sanitize_identifier(value: &str) -> String {
    value.replace('`', "``")
}

pub async fn ensure_application_schema(database: &MySqlPool) -> Result<(), sqlx::Error> {
    sqlx::raw_sql(include_str!(
        "../migrations/000017_user_pelanggan_access.sql"
    ))
    .execute(database)
    .await?;
    reset_contract_status_constraints(database).await?;
    ensure_operational_columns(database).await?;
    sqlx::raw_sql(include_str!(
        "../migrations/000018_operational_schema_sync.sql"
    ))
    .execute(database)
    .await?;

    // Update billing status constraint sesuai dokumentasi
    sqlx::raw_sql(include_str!(
        "../migrations/000019_billing_status_constraint.sql"
    ))
    .execute(database)
    .await?;

    // Normalisasi format core column
    sqlx::raw_sql(include_str!(
        "../migrations/000020_normalize_core_format.sql"
    ))
    .execute(database)
    .await?;

    // Adjust titik_pelanggan to reference lokasi_id (per-contract)
    ensure_titik_peta_lokasi_migration(database).await?;

    // Titik ISP provider (kantor/cabang ISP)
    sqlx::raw_sql(include_str!("../migrations/000023_titik_isp.sql"))
        .execute(database)
        .await?;

    // Banyak titik detail untuk satu lokasi/kontrak.
    sqlx::raw_sql(include_str!("../migrations/000024_titik_lokasi_detail.sql"))
        .execute(database)
        .await?;

    sqlx::raw_sql(include_str!("../migrations/000025_backup_jobs.sql"))
        .execute(database)
        .await?;

    sqlx::raw_sql(include_str!("../migrations/000026_backup_restore_jobs.sql"))
        .execute(database)
        .await?;

    Ok(())
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

async fn ensure_titik_peta_lokasi_migration(database: &MySqlPool) -> Result<(), sqlx::Error> {
    let exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM information_schema.columns \
         WHERE table_schema = DATABASE() AND table_name = 'titik_pelanggan' AND column_name = 'lokasi_id'",
    )
    .fetch_one(database)
    .await?;

    if exists == 0 {
        sqlx::raw_sql(include_str!(
            "../migrations/000022_titik_peta_per_lokasi.sql"
        ))
        .execute(database)
        .await?;
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
