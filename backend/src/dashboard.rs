use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    Extension, Json,
    extract::{Query, State},
};
use chrono::{Datelike, NaiveDate};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::{
    error::ApiError,
    models::AuthUser,
    state::AppState,
    util::{parse_date, require_business_read},
};

#[derive(Deserialize)]
pub struct DashboardQuery {
    pub year: Option<i32>,
    pub growth_start_year: Option<i32>,
    pub growth_end_year: Option<i32>,
    pub core_trend_start_year: Option<i32>,
    pub core_trend_end_year: Option<i32>,
}

#[derive(Serialize)]
pub struct DashboardResponse {
    pub stats: DashboardStats,
    pub core_rincian: Vec<CoreRincianRow>,
    pub sharing_counts: HashMap<String, u64>,
    pub core_trend: Vec<CoreTrendPoint>,
    pub core_trend_yearly: Vec<CoreTrendYearlyPoint>,
    pub sharing_trend: Vec<SharingTrendSeries>,
    pub sharing_trend_yearly: Vec<SharingTrendSeries>,
    pub growth: GrowthData,
}

#[derive(Serialize)]
pub struct CoreRincianRow {
    pub nama_pelanggan: String,
    pub sharing_32: u64,
    pub sharing_16: u64,
    pub sharing_8: u64,
    pub sharing_4: u64,
    pub core: u64,
}

#[derive(Serialize)]
pub struct DashboardStats {
    pub total_pelanggan: u64,
    pub kontrak_aktif: u64,
    pub kapasitas_core: u64,
    pub core_tersewa: u64,
    pub core_tersedia: i64,
    pub kontrak_by_status: HashMap<String, u64>,
    pub core_dedicated_count: u64,
}

#[derive(Serialize)]
pub struct CoreTrendPoint {
    pub name: String,
    pub count: u64,
}

#[derive(Serialize)]
pub struct CoreTrendYearlyPoint {
    pub name: String,
    pub count: u64,
}

#[derive(Serialize)]
pub struct SharingTrendPoint {
    pub name: String,
    pub count: u64,
}

#[derive(Serialize)]
pub struct SharingTrendSeries {
    pub ratio: String,
    pub data: Vec<SharingTrendPoint>,
}

#[derive(Serialize)]
pub struct GrowthData {
    pub pelanggan: Vec<GrowthPoint>,
    pub kontrak: Vec<GrowthPoint>,
}

#[derive(Serialize)]
pub struct GrowthPoint {
    pub year: u32,
    pub count: u64,
}

pub async fn get_dashboard(
    State(state): State<Arc<AppState>>,
    Extension(auth): Extension<AuthUser>,
    Query(query): Query<DashboardQuery>,
) -> Result<Json<DashboardResponse>, ApiError> {
    require_business_read(&auth.role)?;
    let current_year = chrono::Local::now().format("%Y").to_string().parse::<i32>().unwrap_or(2026);
    let year = query.year.unwrap_or(current_year);
    let growth_start_year = query.growth_start_year.unwrap_or(current_year - 4);
    let growth_end_year = query.growth_end_year.unwrap_or(current_year);
    let core_trend_start_year = query.core_trend_start_year.unwrap_or(current_year - 1);
    let core_trend_end_year = query.core_trend_end_year.unwrap_or(current_year);
    let kapasitas_core = state.core_capacity;

    let total_pelanggan: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM pelanggan p \
         WHERE ? <> 'isp' OR EXISTS ( \
           SELECT 1 FROM user_pelanggan_access a \
           WHERE a.user_id = ? AND a.pelanggan_id = p.id \
         )",
    )
    .bind(&auth.role)
    .bind(auth.id)
    .fetch_one(&state.database)
    .await
    .map_err(ApiError::database)?;

    let kontrak_aktif: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM lokasi l \
         JOIN pelanggan p ON p.id = l.pelanggan_id \
         WHERE l.status_kontrak IN ('Beroperasi', 'Belum Beroperasi') \
           AND (? <> 'isp' OR EXISTS ( \
             SELECT 1 FROM user_pelanggan_access a \
             WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id \
           ))",
    )
    .bind(&auth.role)
    .bind(auth.id)
    .fetch_one(&state.database)
    .await
    .map_err(ApiError::database)?;

    let status_rows = sqlx::query(
        "SELECT l.status_kontrak, COUNT(*) as cnt \
         FROM lokasi l \
         JOIN pelanggan p ON p.id = l.pelanggan_id \
         WHERE ? <> 'isp' OR EXISTS ( \
           SELECT 1 FROM user_pelanggan_access a \
           WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id \
         ) \
         GROUP BY l.status_kontrak",
    )
    .bind(&auth.role)
    .bind(auth.id)
    .fetch_all(&state.database)
    .await
    .map_err(ApiError::database)?;

    let kontrak_by_status: HashMap<String, u64> = status_rows
        .into_iter()
        .map(|row| {
            let status: String = row.get(0);
            let cnt: i64 = row.get(1);
            (status, cnt as u64)
        })
        .collect();

    let core_tersewa: i64 = sqlx::query_scalar(
        "SELECT CAST(COALESCE(SUM(CAST(REPLACE(l.core, ' Core', '') AS UNSIGNED)), 0) AS SIGNED) \
         FROM lokasi l \
         JOIN pelanggan p ON p.id = l.pelanggan_id \
         WHERE l.status_kontrak IN ('Beroperasi', 'Belum Beroperasi') \
           AND l.core IS NOT NULL \
           AND (? <> 'isp' OR EXISTS ( \
             SELECT 1 FROM user_pelanggan_access a \
             WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id \
           ))",
    )
    .bind(&auth.role)
    .bind(auth.id)
    .fetch_one(&state.database)
    .await
    .map_err(ApiError::database)?;

    let core_dedicated_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM lokasi l \
         JOIN pelanggan p ON p.id = l.pelanggan_id \
         WHERE l.status_kontrak IN ('Beroperasi', 'Belum Beroperasi') \
           AND l.core IS NOT NULL \
           AND (? <> 'isp' OR EXISTS ( \
             SELECT 1 FROM user_pelanggan_access a \
             WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id \
           ))",
    )
    .bind(&auth.role)
    .bind(auth.id)
    .fetch_one(&state.database)
    .await
    .map_err(ApiError::database)?;

    let sharing_rows = sqlx::query(
        "SELECT l.sharing_core, COUNT(*) as cnt FROM lokasi l \
         JOIN pelanggan p ON p.id = l.pelanggan_id \
         WHERE l.status_kontrak IN ('Beroperasi', 'Belum Beroperasi') \
           AND l.sharing_core IS NOT NULL \
           AND (? <> 'isp' OR EXISTS ( \
             SELECT 1 FROM user_pelanggan_access a \
             WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id \
           )) \
         GROUP BY l.sharing_core",
    )
    .bind(&auth.role)
    .bind(auth.id)
    .fetch_all(&state.database)
    .await
    .map_err(ApiError::database)?;

    let sharing_counts: HashMap<String, u64> = sharing_rows
        .into_iter()
        .map(|row| {
            let label: String = row.get(0);
            let cnt: i64 = row.get(1);
            (label, cnt as u64)
        })
        .collect();

    let core_rincian = sqlx::query(
        "SELECT p.nama_pelanggan, \
                CAST(SUM(CASE WHEN l.sharing_core = '1/32' THEN 1 ELSE 0 END) AS SIGNED) AS sharing_32, \
                CAST(SUM(CASE WHEN l.sharing_core = '1/16' THEN 1 ELSE 0 END) AS SIGNED) AS sharing_16, \
                CAST(SUM(CASE WHEN l.sharing_core = '1/8' THEN 1 ELSE 0 END) AS SIGNED) AS sharing_8, \
                CAST(SUM(CASE WHEN l.sharing_core = '1/4' THEN 1 ELSE 0 END) AS SIGNED) AS sharing_4, \
                CAST(COALESCE(SUM(CASE WHEN l.core IS NOT NULL THEN CAST(REPLACE(l.core, ' Core', '') AS UNSIGNED) ELSE 0 END), 0) AS SIGNED) AS core \
         FROM lokasi l JOIN pelanggan p ON p.id = l.pelanggan_id \
         WHERE l.status_kontrak IN ('Beroperasi', 'Belum Beroperasi') \
           AND (? <> 'isp' OR EXISTS (SELECT 1 FROM user_pelanggan_access a WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id)) \
         GROUP BY p.id, p.nama_pelanggan \
         HAVING sharing_32 > 0 OR sharing_16 > 0 OR sharing_8 > 0 OR sharing_4 > 0 OR core > 0 \
         ORDER BY p.nama_pelanggan",
    )
    .bind(&auth.role)
    .bind(auth.id)
    .fetch_all(&state.database)
    .await
    .map_err(ApiError::database)?
    .into_iter()
    .map(|row| -> Result<CoreRincianRow, ApiError> {
        Ok(CoreRincianRow {
            nama_pelanggan: row.try_get("nama_pelanggan").map_err(ApiError::database)?,
            sharing_32: row.try_get::<i64, _>("sharing_32").map_err(ApiError::database)?.max(0) as u64,
            sharing_16: row.try_get::<i64, _>("sharing_16").map_err(ApiError::database)?.max(0) as u64,
            sharing_8: row.try_get::<i64, _>("sharing_8").map_err(ApiError::database)?.max(0) as u64,
            sharing_4: row.try_get::<i64, _>("sharing_4").map_err(ApiError::database)?.max(0) as u64,
            core: row.try_get::<i64, _>("core").map_err(ApiError::database)?.max(0) as u64,
        })
    })
    .collect::<Result<Vec<_>, _>>()?;

    let core_monthly_raw: Vec<(i64, NaiveDate, NaiveDate)> = sqlx::query(
        "SELECT \
            CAST(COALESCE(SUM(CAST(REPLACE(l.core, ' Core', '') AS UNSIGNED)), 0) AS SIGNED) as total_core, \
            CAST(l.periode_awal AS CHAR) as start_date_str, \
            CAST(l.periode_berakhir AS CHAR) as end_date_str \
         FROM lokasi l \
         JOIN pelanggan p ON p.id = l.pelanggan_id \
         WHERE l.core IS NOT NULL \
           AND l.status_kontrak IN ('Beroperasi', 'Belum Beroperasi') \
           AND l.periode_awal IS NOT NULL \
           AND l.periode_berakhir IS NOT NULL \
           AND (? <> 'isp' OR EXISTS ( \
             SELECT 1 FROM user_pelanggan_access a \
             WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id \
           )) \
         GROUP BY l.periode_awal, l.periode_berakhir",
    )
    .bind(&auth.role)
    .bind(auth.id)
    .fetch_all(&state.database)
    .await
    .map_err(ApiError::database)?
    .into_iter()
    .map(|row| {
        let total_core: i64 = row.get(0);
        let start_date_str: String = row.get(1);
        let end_date_str: String = row.get(2);
        (total_core, parse_date(&start_date_str).unwrap_or_else(|_| NaiveDate::from_ymd_opt(2026, 1, 1).unwrap()), parse_date(&end_date_str).unwrap_or_else(|_| NaiveDate::from_ymd_opt(2026, 1, 1).unwrap()))
    })
    .collect();

    let mut core_monthly_map: HashMap<(i64, i64), i64> = HashMap::new();
    let target_year = year;
    for (total_core, start_date, end_date) in core_monthly_raw {
        if start_date.year() > target_year || end_date.year() < target_year {
            continue;
        }
        let actual_start_mo = if start_date.year() == target_year { start_date.month() as i64 } else { 1 };
        let actual_end_mo = if end_date.year() == target_year { end_date.month() as i64 } else { 12 };
        for mo in actual_start_mo..=actual_end_mo {
            *core_monthly_map.entry((year as i64, mo)).or_insert(0) += total_core;
        }
    }

    let month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let core_trend: Vec<CoreTrendPoint> = (1..=12)
        .map(|mo| CoreTrendPoint {
            name: month_names[(mo - 1) as usize].to_string(),
            count: *core_monthly_map.get(&(target_year as i64, mo)).unwrap_or(&0) as u64,
        })
        .collect();

    let core_contracts_raw: Vec<(i64, NaiveDate, NaiveDate)> = sqlx::query(
        "SELECT \
            CAST(COALESCE(SUM(CAST(REPLACE(l.core, ' Core', '') AS UNSIGNED)), 0) AS SIGNED) as total_core, \
            CAST(l.periode_awal AS CHAR) as start_date_str, \
            CAST(l.periode_berakhir AS CHAR) as end_date_str \
         FROM lokasi l \
         JOIN pelanggan p ON p.id = l.pelanggan_id \
         WHERE l.core IS NOT NULL \
           AND l.status_kontrak IN ('Beroperasi', 'Belum Beroperasi') \
           AND l.periode_awal IS NOT NULL \
           AND l.periode_berakhir IS NOT NULL \
           AND (? <> 'isp' OR EXISTS ( \
             SELECT 1 FROM user_pelanggan_access a \
             WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id \
           )) \
         GROUP BY l.periode_awal, l.periode_berakhir",
    )
    .bind(&auth.role)
    .bind(auth.id)
    .fetch_all(&state.database)
    .await
    .map_err(ApiError::database)?
    .into_iter()
    .map(|row| {
        let total_core: i64 = row.get(0);
        let start_date_str: String = row.get(1);
        let end_date_str: String = row.get(2);
        (total_core, parse_date(&start_date_str).unwrap_or_else(|_| NaiveDate::from_ymd_opt(2026, 1, 1).unwrap()), parse_date(&end_date_str).unwrap_or_else(|_| NaiveDate::from_ymd_opt(2026, 1, 1).unwrap()))
    })
    .collect();

    let mut core_yearly_map: HashMap<i64, i64> = HashMap::new();
    let cs = core_trend_start_year;
    let ce = core_trend_end_year;
    for (total_core, start_date, end_date) in core_contracts_raw {
        let start_yr = start_date.year();
        let end_yr = end_date.year();
        for yr in start_yr..=end_yr {
            if yr >= cs && yr <= ce {
                *core_yearly_map.entry(yr as i64).or_insert(0) += total_core;
            }
        }
    }

    let core_trend_yearly: Vec<CoreTrendYearlyPoint> = (core_trend_start_year..=core_trend_end_year)
        .map(|yr| CoreTrendYearlyPoint {
            name: yr.to_string(),
            count: *core_yearly_map.get(&(yr as i64)).unwrap_or(&0) as u64,
        })
        .collect();

    let sharing_monthly_raw: Vec<(String, NaiveDate, NaiveDate)> = sqlx::query(
        "SELECT \
            l.sharing_core, \
            CAST(l.periode_awal AS CHAR) as start_date_str, \
            CAST(l.periode_berakhir AS CHAR) as end_date_str \
         FROM lokasi l \
         JOIN pelanggan p ON p.id = l.pelanggan_id \
         WHERE l.status_kontrak IN ('Beroperasi', 'Belum Beroperasi') \
           AND l.sharing_core IS NOT NULL \
           AND l.periode_awal IS NOT NULL \
           AND l.periode_berakhir IS NOT NULL \
           AND (? <> 'isp' OR EXISTS ( \
             SELECT 1 FROM user_pelanggan_access a \
             WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id \
           ))",
    )
    .bind(&auth.role)
    .bind(auth.id)
    .fetch_all(&state.database)
    .await
    .map_err(ApiError::database)?
    .into_iter()
    .map(|row| {
        let ratio: String = row.get(0);
        let start_date_str: String = row.get(1);
        let end_date_str: String = row.get(2);
        (ratio, parse_date(&start_date_str).unwrap_or_else(|_| NaiveDate::from_ymd_opt(2026, 1, 1).unwrap()), parse_date(&end_date_str).unwrap_or_else(|_| NaiveDate::from_ymd_opt(2026, 1, 1).unwrap()))
    })
    .collect();

    let mut sharing_monthly_map: HashMap<(String, i64), u64> = HashMap::new();
    let target_year = year;
    let month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (ratio, start_date, end_date) in sharing_monthly_raw {
        if start_date.year() > target_year || end_date.year() < target_year {
            continue;
        }
        let actual_start_mo = if start_date.year() == target_year { start_date.month() as i64 } else { 1 };
        let actual_end_mo = if end_date.year() == target_year { end_date.month() as i64 } else { 12 };
        for mo in actual_start_mo..=actual_end_mo {
            *sharing_monthly_map.entry((ratio.clone(), mo)).or_insert(0) += 1;
        }
    }

    let mut sharing_trend_by_ratio: HashMap<String, Vec<SharingTrendPoint>> = HashMap::new();
    for ((ratio, mo), count) in sharing_monthly_map {
        sharing_trend_by_ratio
            .entry(ratio)
            .or_default()
            .push(SharingTrendPoint {
                name: month_names[(mo - 1) as usize].to_string(),
                count,
            });
    }

    let sharing_trend: Vec<SharingTrendSeries> = {
        let mut series: Vec<SharingTrendSeries> = sharing_trend_by_ratio
            .into_iter()
            .map(|(ratio, mut data)| {
                data.sort_by(|a, b| {
                    let mo_a = month_names.iter().position(|&m| m == a.name).unwrap_or(0);
                    let mo_b = month_names.iter().position(|&m| m == b.name).unwrap_or(0);
                    mo_a.cmp(&mo_b)
                });
                SharingTrendSeries { ratio, data }
            })
            .collect();
        series.sort_by(|a, b| {
            let frac = |r: &str| -> f64 {
                let parts: Vec<&str> = r.split('/').collect();
                parts.first().unwrap_or(&"1").parse::<f64>().unwrap_or(1.0)
                    / parts.get(1).unwrap_or(&"1").parse::<f64>().unwrap_or(1.0)
            };
            frac(&a.ratio).partial_cmp(&frac(&b.ratio)).unwrap_or(std::cmp::Ordering::Equal)
        });
        series
    };

    let sharing_contracts_raw: Vec<(String, i64, i64)> = sqlx::query(
        "SELECT l.sharing_core, YEAR(l.periode_awal) as start_yr, YEAR(l.periode_berakhir) as end_yr
         FROM lokasi l
         JOIN pelanggan p ON p.id = l.pelanggan_id
         WHERE l.status_kontrak IN ('Beroperasi', 'Belum Beroperasi')
           AND l.sharing_core IS NOT NULL
           AND l.periode_awal IS NOT NULL
           AND l.periode_berakhir IS NOT NULL
           AND (? <> 'isp' OR EXISTS (
             SELECT 1 FROM user_pelanggan_access a
             WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id
           ))",
    )
    .bind(&auth.role)
    .bind(auth.id)
    .fetch_all(&state.database)
    .await
    .map_err(ApiError::database)?
    .into_iter()
    .map(|row| {
        let ratio: String = row.get(0);
        let start_yr: i32 = row.get(1);
        let end_yr: i32 = row.get(2);
        (ratio, start_yr as i64, end_yr as i64)
    })
    .collect();

    let mut count_map: HashMap<(String, i64), u64> = HashMap::new();
    for (ratio, start_yr, end_yr) in sharing_contracts_raw {
        for yr in start_yr..=end_yr {
            if yr >= core_trend_start_year as i64 && yr <= core_trend_end_year as i64 {
                *count_map.entry((ratio.clone(), yr)).or_insert(0) += 1;
            }
        }
    }

    let mut all_ratios: Vec<String> = count_map.keys().map(|(r, _)| r.clone()).collect();
    all_ratios.sort_by(|a, b| {
        let frac = |r: &str| -> f64 {
            let parts: Vec<&str> = r.split('/').collect();
            parts.first().unwrap_or(&"1").parse::<f64>().unwrap_or(1.0)
                / parts.get(1).unwrap_or(&"1").parse::<f64>().unwrap_or(1.0)
        };
        frac(a).partial_cmp(&frac(b)).unwrap_or(std::cmp::Ordering::Equal)
    });
    all_ratios.dedup();

    let sharing_trend_yearly: Vec<SharingTrendSeries> = all_ratios.into_iter().map(|ratio| {
        let start = core_trend_start_year as i64;
        let end = core_trend_end_year as i64;
        let data: Vec<SharingTrendPoint> = (start..=end).map(|yr| {
            SharingTrendPoint {
                name: yr.to_string(),
                count: *count_map.get(&(ratio.clone(), yr)).unwrap_or(&0),
            }
        }).collect();
        SharingTrendSeries { ratio, data }
    }).collect();

    let pelanggan_growth_rows = sqlx::query(
        "SELECT m.yr, COALESCE(cnt.cnt, 0) as cnt
         FROM (
           SELECT ? + n AS yr
           FROM (
             SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
             SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
             SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
           ) numbers
           WHERE ? + n <= ?
         ) m
         LEFT JOIN (
           SELECT CAST(yr AS SIGNED) as yr, COUNT(*) as cnt
           FROM (
             SELECT MIN(YEAR(l.periode_awal)) as yr
             FROM pelanggan p
             JOIN lokasi l ON l.pelanggan_id = p.id
             WHERE ? <> 'isp' OR EXISTS (
               SELECT 1 FROM user_pelanggan_access a
               WHERE a.user_id = ? AND a.pelanggan_id = p.id
             )
             GROUP BY p.id
           ) sub
           WHERE yr BETWEEN ? AND ?
           GROUP BY CAST(yr AS SIGNED)
         ) cnt ON m.yr = cnt.yr
         ORDER BY m.yr",
    )
    .bind(growth_start_year)
    .bind(growth_start_year)
    .bind(growth_end_year)
    .bind(&auth.role)
    .bind(auth.id)
    .bind(growth_start_year)
    .bind(growth_end_year)
    .fetch_all(&state.database)
    .await
    .map_err(ApiError::database)?;

    let pelanggan_growth: Vec<GrowthPoint> = pelanggan_growth_rows
        .into_iter()
        .map(|row| {
            let yr: i64 = row.get(0);
            let cnt: i64 = row.get(1);
            GrowthPoint { year: yr as u32, count: cnt as u64 }
        })
        .collect();

    let kontrak_raw: Vec<(i64, i64)> = sqlx::query(
        "SELECT YEAR(l.periode_awal) as start_yr, YEAR(l.periode_berakhir) as end_yr
         FROM lokasi l
         JOIN pelanggan p ON p.id = l.pelanggan_id
         WHERE l.periode_awal IS NOT NULL
           AND l.periode_berakhir IS NOT NULL
           AND (? <> 'isp' OR EXISTS (
             SELECT 1 FROM user_pelanggan_access a
             WHERE a.user_id = ? AND a.pelanggan_id = l.pelanggan_id
           ))",
    )
    .bind(&auth.role)
    .bind(auth.id)
    .fetch_all(&state.database)
    .await
    .map_err(ApiError::database)?
    .into_iter()
    .map(|row| {
        let start_yr: i32 = row.get(0);
        let end_yr: i32 = row.get(1);
        (start_yr as i64, end_yr as i64)
    })
    .collect();

    let mut kontrak_yearly_counts: HashMap<i64, u64> = HashMap::new();
    let gs = growth_start_year as i64;
    let ge = growth_end_year as i64;
    for (start_yr, end_yr) in kontrak_raw {
        for yr in start_yr..=end_yr {
            if yr >= gs && yr <= ge {
                *kontrak_yearly_counts.entry(yr).or_insert(0) += 1;
            }
        }
    }

    let kontrak_growth: Vec<GrowthPoint> = (gs..=ge)
        .map(|yr| GrowthPoint {
            year: yr as u32,
            count: *kontrak_yearly_counts.get(&yr).unwrap_or(&0),
        })
        .collect();

    let core_tersewa = core_tersewa.max(0) as u64;

    Ok(Json(DashboardResponse {
        stats: DashboardStats {
            total_pelanggan: total_pelanggan.max(0) as u64,
            kontrak_aktif: kontrak_aktif.max(0) as u64,
            kapasitas_core: kapasitas_core,
            core_tersewa,
            core_tersedia: (kapasitas_core as i64) - (core_tersewa as i64),
            kontrak_by_status,
            core_dedicated_count: core_dedicated_count.max(0) as u64,
        },
        core_rincian,
        sharing_counts,
        core_trend,
        core_trend_yearly,
        sharing_trend,
        sharing_trend_yearly,
        growth: GrowthData {
            pelanggan: pelanggan_growth,
            kontrak: kontrak_growth,
        },
    }))
}
