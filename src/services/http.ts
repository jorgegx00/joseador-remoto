import { invoke } from "@tauri-apps/api/core";

interface HttpFetchResponse {
  status: number;
  statusText: string;
  body: string;
}

/**
 * fetch-shaped wrapper over the Rust `http_fetch` command. Job-board APIs
 * (SerpApi, Apify) don't send CORS headers, so the WebView can't call them
 * with plain `fetch`; routing through reqwest in the Rust process also keeps
 * API keys out of any browser-layer logging.
 */
export async function rustFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const headers: Array<[string, string]> = [];
  if (init?.headers) {
    new Headers(init.headers).forEach((value, name) => headers.push([name, value]));
  }

  const res = await invoke<HttpFetchResponse>("http_fetch", {
    req: {
      url,
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : null,
    },
  });

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
  });
}
