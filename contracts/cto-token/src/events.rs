//! NEP-297 event logs for the frontend and indexers: `EVENT_JSON:{"standard":"cto",...}`.

use near_sdk::{log, serde_json::{json, Value}};

pub fn emit(event: &str, data: Value) {
    log!(
        "EVENT_JSON:{}",
        json!({ "standard": "cto", "version": "1.0.0", "event": event, "data": [data] })
    );
}
