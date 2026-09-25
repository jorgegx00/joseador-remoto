use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use std::time::Duration;

#[derive(Deserialize)]
pub struct HttpFetchRequest {
    pub url: String,
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    #[serde(default)]
    pub body: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpFetchResponse {
    pub status: u16,
    pub status_text: String,
    pub body: String,
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    // 300s: Apify run-sync calls block server-side for up to ~270s.
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .expect("failed to build HTTP client")
    })
}

/// General-purpose HTTP proxy for the renderer. Job-board APIs (SerpApi,
/// Apify) don't send CORS headers, so the WebView can't call them directly.
/// URLs and headers carry API keys — errors are stripped of the URL and
/// nothing here is ever logged.
#[tauri::command]
pub async fn http_fetch(req: HttpFetchRequest) -> Result<HttpFetchResponse, String> {
    let method = req.method.as_deref().unwrap_or("GET").to_uppercase();
    let method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|_| "invalid HTTP method".to_string())?;

    let mut builder = client().request(method, &req.url);
    for (name, value) in &req.headers {
        builder = builder.header(name.as_str(), value.as_str());
    }
    if let Some(body) = req.body {
        builder = builder.body(body);
    }

    let res = builder
        .send()
        .await
        .map_err(|e| e.without_url().to_string())?;

    let status = res.status();
    let body = res
        .text()
        .await
        .map_err(|e| e.without_url().to_string())?;

    Ok(HttpFetchResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        body,
    })
}
