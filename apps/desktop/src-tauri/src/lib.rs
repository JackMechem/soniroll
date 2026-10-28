mod audio;
mod bridge;
mod downloads;
mod file_drop;
mod oauth;
mod recorder;

use tauri::plugin::{Builder as PluginBuilder, TauriPlugin};
use tauri::{Runtime, Url};
use tauri_plugin_opener::OpenerExt;

/// Pages inside the app load in the window; anything else (soniroll.com links, GitHub, Google
/// sign-in) opens in the system browser instead of replacing the app.
fn is_app_url(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "about" | "data" | "blob" => true,
        "http" | "https" => {
            matches!(url.host_str(), Some("tauri.localhost") | Some("localhost")) && url.port() != Some(80)
        }
        _ => false,
    }
}

fn external_links<R: Runtime>() -> TauriPlugin<R> {
    PluginBuilder::new("external-links")
        .on_navigation(|webview, url| {
            if is_app_url(url) {
                return true;
            }
            let _ = webview.opener().open_url(url.as_str(), None::<&str>);
            false
        })
        .build()
}

#[tauri::command]
fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Tells the page the audio sample rate before any of its own scripts run (see
/// `Bridge::init_script`).
fn native_audio<R: Runtime>(bridge: &bridge::Bridge) -> TauriPlugin<R> {
    PluginBuilder::new("native-audio").js_init_script(bridge.init_script()).build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let bridge = bridge::Bridge::new();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(external_links())
        .plugin(native_audio(&bridge))
        .manage(file_drop::DroppedFiles::default())
        .on_window_event(file_drop::on_window_event)
        .manage(audio::AudioState::default())
        .manage(recorder::RecorderState::default())
        .manage(bridge)
        .setup(|app| {
            bridge::spawn_clock(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_external,
            downloads::save_download,
            file_drop::read_dropped_file,
            oauth::oauth_listen,
            audio::audio_devices,
            audio::input_start,
            audio::input_stop,
            bridge::audio_status,
            bridge::audio_set_output,
            bridge::wa_init,
            bridge::wa_ops,
            bridge::wa_buffer,
            bridge::wa_decode,
            bridge::wa_analyser,
            recorder::recorder_open,
            recorder::recorder_begin,
            recorder::recorder_stop,
            recorder::recorder_take,
            recorder::recorder_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running soniroll");
}
