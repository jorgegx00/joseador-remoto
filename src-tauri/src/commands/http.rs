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
            // Redirects must stay on the allowlist too.
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 5 || !host_allowed(attempt.url().as_str()) {
                    attempt.stop()
                } else {
                    attempt.follow()
                }
            }))
            .build()
            .expect("failed to build HTTP client")
    })
}

/// Hosts the proxy may reach (exact host or a subdomain of it). Job-source and
/// ATS APIs only: an open proxy would let a compromised renderer probe the LAN.
/// Add a host here when adding a job source. ATS hosts mirror ATS_API_HOSTS in
/// src/lib/job-capture/ats-api.ts.
const ALLOWED_HOSTS: &[&str] = &[
    "serpapi.com",
    "api.apify.com",
    // Public ATS posting APIs (one posting the user chose)
    "boards-api.greenhouse.io",
    "api.lever.co",
    "api.eu.lever.co",
    "api.ashbyhq.com",
    "api.smartrecruiters.com",
    "myworkdayjobs.com",
    // Job feeds (src/services/ingest/feed-sources.ts)
    "himalayas.app",
    "jobicy.com",
    "remotive.com",
    "getonbrd.com",
    "jooble.org",
    "api.adzuna.com",
];

fn host_allowed(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    if parsed.scheme() != "https" {
        return false;
    }
    let Some(host) = parsed.host_str() else {
        return false;
    };
    let host = host.to_ascii_lowercase();
    ALLOWED_HOSTS
        .iter()
        .any(|allowed| host == *allowed || host.ends_with(&format!(".{}", allowed)))
}

/// HTTP proxy for the renderer. Job-board APIs (SerpApi, Apify) don't send CORS
/// headers, so the WebView can't call them directly. Restricted to
/// {@link ALLOWED_HOSTS} over HTTPS. URLs and headers carry API keys — errors
/// are stripped of the URL and nothing here is ever logged.
#[tauri::command]
pub async fn http_fetch(req: HttpFetchRequest) -> Result<HttpFetchResponse, String> {
    if !host_allowed(&req.url) {
        return Err("Destination not allowed".to_string());
    }
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

#[cfg(test)]
mod tests {
    use super::host_allowed;

    #[test]
    fn allowlist() {
        assert!(host_allowed("https://serpapi.com/search.json?q=x"));
        assert!(host_allowed("https://api.apify.com/v2/acts"));
        assert!(!host_allowed("http://serpapi.com/search.json"));
        assert!(!host_allowed("https://evilserpapi.com/"));
        assert!(!host_allowed("https://serpapi.com.evil.net/"));
        assert!(!host_allowed("https://192.168.1.1/"));
        assert!(!host_allowed("file:///etc/passwd"));
        assert!(!host_allowed("not a url"));
    }
}
