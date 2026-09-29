//! Fetches one public job page the user pasted the URL of (a company career
//! site), so its schema.org JobPosting can be read. Deliberately narrow:
//! - GET over HTTPS only, no cookies, no credentials, honest User-Agent;
//! - every hop (redirects followed manually, max 5) must resolve to public IPs
//!   only, and the connection is pinned to the checked address (no DNS
//!   rebinding into the LAN or localhost);
//! - HTML only, capped at 3 MB;
//! - sites whose terms forbid automated access (LinkedIn, Indeed, Glassdoor)
//!   are refused — for those, the user pastes the post's text instead.

use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

const MAX_BYTES: usize = 3 * 1024 * 1024;
const MAX_REDIRECTS: usize = 5;
const USER_AGENT: &str = "JoseadorRemoto/0.1 (desktop job tracker; fetches a single job page on user request)";
const BLOCKED_DOMAINS: &[&str] = &["linkedin.com", "indeed.com", "glassdoor.com", "google.com"];

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicPage {
    pub final_url: String,
    pub html: String,
}

fn is_public_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            !(v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || v4.is_documentation()
                || o[0] == 0
                || (o[0] == 100 && (o[1] & 0xC0) == 64) // CGNAT 100.64/10
                || (o[0] == 198 && (o[1] == 18 || o[1] == 19)) // benchmarking
                || o[0] >= 224) // multicast + reserved
        }
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_public_ip(&IpAddr::V4(v4));
            }
            let seg = v6.segments();
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (seg[0] & 0xfe00) == 0xfc00 // unique local
                || (seg[0] & 0xffc0) == 0xfe80 // link local
                // Addresses that embed an IPv4 one (NAT64, 6to4, IPv4-compatible)
                // could smuggle a private IPv4 target: refuse them outright.
                || (seg[0] == 0x64 && seg[1] == 0xff9b)
                || seg[0] == 0x2002
                || seg[..6].iter().all(|s| *s == 0))
        }
    }
}

fn host_blocked(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    BLOCKED_DOMAINS.iter().any(|d| {
        host == *d || host.ends_with(&format!(".{}", d)) || (d == &"indeed.com" && host.contains(".indeed."))
    })
}

async fn resolve_public(url: &reqwest::Url) -> Result<SocketAddr, String> {
    let host = url.host_str().ok_or("URL has no host")?;
    if host_blocked(host) {
        return Err("This site doesn't allow automated access. Paste the post's text instead.".into());
    }
    let port = url.port_or_known_default().unwrap_or(443);
    let addrs: Vec<SocketAddr> = tokio::net::lookup_host((host, port))
        .await
        .map_err(|_| "Could not resolve the host".to_string())?
        .collect();
    if addrs.is_empty() || addrs.iter().any(|a| !is_public_ip(&a.ip())) {
        return Err("Only public internet addresses can be fetched".into());
    }
    Ok(addrs[0])
}

#[tauri::command]
pub async fn fetch_public_page(url: String) -> Result<PublicPage, String> {
    let mut current = reqwest::Url::parse(&url).map_err(|_| "Invalid URL".to_string())?;
    for _ in 0..=MAX_REDIRECTS {
        if current.scheme() != "https" {
            return Err("Only https:// pages can be fetched".into());
        }
        let addr = resolve_public(&current).await?;
        let host = current.host_str().unwrap_or_default().to_string();
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(20))
            .user_agent(USER_AGENT)
            .resolve(&host, addr)
            // A proxy would connect on our behalf and bypass the address pinning.
            .no_proxy()
            .build()
            .map_err(|e| e.to_string())?;
        let mut res = client
            .get(current.clone())
            .header("Accept", "text/html,application/xhtml+xml")
            .send()
            .await
            .map_err(|e| e.without_url().to_string())?;

        if res.status().is_redirection() {
            let location = res
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or("Redirect without a location")?;
            current = current.join(location).map_err(|_| "Invalid redirect".to_string())?;
            continue;
        }
        if !res.status().is_success() {
            return Err(format!("The page answered HTTP {}", res.status().as_u16()));
        }
        let is_html = res
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|ct| ct.contains("html"))
            .unwrap_or(false);
        if !is_html {
            return Err("The URL is not an HTML page".into());
        }
        let mut body: Vec<u8> = Vec::new();
        while let Some(chunk) = res.chunk().await.map_err(|e| e.without_url().to_string())? {
            if body.len() + chunk.len() > MAX_BYTES {
                return Err("The page is too large".into());
            }
            body.extend_from_slice(&chunk);
        }
        return Ok(PublicPage {
            final_url: current.to_string(),
            html: String::from_utf8_lossy(&body).into_owned(),
        });
    }
    Err("Too many redirects".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_ips() {
        for ip in ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"] {
            assert!(is_public_ip(&ip.parse().unwrap()), "{ip}");
        }
        for ip in ["127.0.0.1", "10.0.0.1", "192.168.1.10", "172.16.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "64:ff9b::a00:1", "2002:a00:1::", "::10.0.0.1"] {
            assert!(!is_public_ip(&ip.parse().unwrap()), "{ip}");
        }
    }

    #[test]
    fn blocked_hosts() {
        assert!(host_blocked("www.linkedin.com"));
        assert!(host_blocked("do.indeed.com"));
        assert!(host_blocked("www.indeed.com.mx"));
        assert!(!host_blocked("careers.acme.example"));
        assert!(!host_blocked("notlinkedin.com"));
    }
}
