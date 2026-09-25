use serde_json::Value as JsonValue;
use sqlx::{Column, Executor, Row};
use tauri::State;

use crate::state::AppDatabase;

fn get_pool(db: &State<'_, AppDatabase>) -> Result<sqlx::SqlitePool, String> {
    let guard = db.pool.lock().map_err(|e| format!("Lock error: {}", e))?;
    guard
        .as_ref()
        .cloned()
        .ok_or_else(|| "Database not initialized".to_string())
}

#[tauri::command]
pub async fn execute_sql(
    db: State<'_, AppDatabase>,
    sql: String,
    params: Vec<JsonValue>,
) -> Result<JsonValue, String> {
    let pool = get_pool(&db)?;

    let trimmed = sql.trim().to_uppercase();
    let is_select = trimmed.starts_with("SELECT")
        || trimmed.starts_with("PRAGMA")
        || trimmed.starts_with("WITH");

    if is_select {
        let mut query = sqlx::query(&sql);
        for value in &params {
            if value.is_null() {
                query = query.bind(None::<String>);
            } else if let Some(s) = value.as_str() {
                query = query.bind(s.to_owned());
            } else if let Some(n) = value.as_number() {
                if let Some(i) = n.as_i64() {
                    query = query.bind(i);
                } else if let Some(f) = n.as_f64() {
                    query = query.bind(f);
                } else {
                    query = query.bind(n.to_string());
                }
            } else if let Some(b) = value.as_bool() {
                query = query.bind(b);
            } else {
                query = query.bind(value.to_string());
            }
        }

        let rows = pool
            .fetch_all(query)
            .await
            .map_err(|e| format!("SQL select error: {}", e))?;

        // Rows are returned as positional arrays so they match what
        // drizzle-orm/sqlite-proxy expects (its mapResultRow reads row[columnIndex]).
        let json_rows: Vec<JsonValue> = rows
            .iter()
            .map(|row| {
                let mut values: Vec<JsonValue> = Vec::with_capacity(row.columns().len());
                for (i, _column) in row.columns().iter().enumerate() {
                    let raw = row.try_get_raw(i);
                    let val = match raw {
                        Ok(raw_val) => {
                            use sqlx::ValueRef;
                            if raw_val.is_null() {
                                JsonValue::Null
                            } else if let Ok(v) = row.try_get::<i64, _>(i) {
                                JsonValue::Number(serde_json::Number::from(v))
                            } else if let Ok(v) = row.try_get::<f64, _>(i) {
                                serde_json::Number::from_f64(v)
                                    .map(JsonValue::Number)
                                    .unwrap_or(JsonValue::Null)
                            } else if let Ok(v) = row.try_get::<String, _>(i) {
                                JsonValue::String(v)
                            } else if let Ok(v) = row.try_get::<bool, _>(i) {
                                JsonValue::Bool(v)
                            } else if let Ok(v) = row.try_get::<Vec<u8>, _>(i) {
                                JsonValue::String(
                                    v.iter()
                                        .map(|b| format!("{:02x}", b))
                                        .collect::<String>(),
                                )
                            } else {
                                JsonValue::Null
                            }
                        }
                        Err(_) => JsonValue::Null,
                    };
                    values.push(val);
                }
                JsonValue::Array(values)
            })
            .collect();

        Ok(serde_json::json!({ "rows": json_rows }))
    } else {
        let mut query = sqlx::query(&sql);
        for value in &params {
            if value.is_null() {
                query = query.bind(None::<String>);
            } else if let Some(s) = value.as_str() {
                query = query.bind(s.to_owned());
            } else if let Some(n) = value.as_number() {
                if let Some(i) = n.as_i64() {
                    query = query.bind(i);
                } else if let Some(f) = n.as_f64() {
                    query = query.bind(f);
                } else {
                    query = query.bind(n.to_string());
                }
            } else if let Some(b) = value.as_bool() {
                query = query.bind(b);
            } else {
                query = query.bind(value.to_string());
            }
        }

        let result = pool
            .execute(query)
            .await
            .map_err(|e| format!("SQL execute error: {}", e))?;

        Ok(serde_json::json!({
            "changes": result.rows_affected(),
            "lastInsertRowId": result.last_insert_rowid()
        }))
    }
}

#[tauri::command]
pub async fn execute_batch(
    db: State<'_, AppDatabase>,
    statements: Vec<String>,
) -> Result<(), String> {
    let pool = get_pool(&db)?;

    for stmt in statements {
        let trimmed = stmt.trim();
        if trimmed.is_empty() {
            continue;
        }
        pool.execute(sqlx::query(trimmed))
            .await
            .map_err(|e| format!("SQL batch error on statement '{}': {}", trimmed, e))?;
    }

    Ok(())
}
