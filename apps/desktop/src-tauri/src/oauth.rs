//! Google sign-in. Google won't sign people in inside an embedded window, so the app opens the
//! system browser instead and listens on a one-off local address (127.0.0.1 and a random port)
//! for Convex Auth to send the browser back to with `?code=…`. The code is useless on its own:
//! finishing sign-in also needs the verifier the app kept when it started.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};

const PAGE: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>soniroll</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f4f6f9;color:#1d2433}
@media (prefers-color-scheme:dark){body{background:#12151c;color:#e6e9ef}}div{text-align:center}h1{font-size:1.4rem;margin:0 0 .5rem}p{margin:0;opacity:.7}</style>
</head><body><div><h1>__TITLE__</h1><p>__BODY__</p></div></body></html>"#;

fn page(title: &str, body: &str) -> String {
    PAGE.replace("__TITLE__", title).replace("__BODY__", body)
}

/// Starts listening and returns the port. Gives up after ten minutes.
#[tauri::command]
pub fn oauth_listen(app: AppHandle) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;

    thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(600);
        while Instant::now() < deadline {
            let (stream, _) = match listener.accept() {
                Ok(conn) => conn,
                Err(_) => {
                    thread::sleep(Duration::from_millis(100));
                    continue;
                }
            };
            let _ = stream.set_nonblocking(false);
            let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
            let mut reader = BufReader::new(&stream);
            let mut request_line = String::new();
            if reader.read_line(&mut request_line).is_err() {
                continue;
            }
            // "GET /?code=abc HTTP/1.1"
            let target = request_line.split_whitespace().nth(1).unwrap_or("/");
            let url = match url::Url::parse(&format!("http://127.0.0.1{target}")) {
                Ok(url) => url,
                Err(_) => continue,
            };
            if url.path() != "/" {
                let _ = (&stream).write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                continue;
            }
            let code = url.query_pairs().find(|(k, _)| k == "code").map(|(_, v)| v.into_owned());
            let body = match &code {
                Some(_) => page("Back to soniroll", "You can close this tab. soniroll is finishing signing you in."),
                None => page("Sign-in didn't finish", "Go back to soniroll and try again."),
            };
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = (&stream).write_all(response.as_bytes());
            match code {
                Some(code) => {
                    let _ = app.emit("oauth-code", code);
                }
                None => {
                    let _ = app.emit("oauth-error", ());
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            break;
        }
    });

    Ok(port)
}
