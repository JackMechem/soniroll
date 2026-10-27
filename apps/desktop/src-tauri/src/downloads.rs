//! Saving downloads (`src/downloads.ts`): the page sends the file's bytes and name, this asks
//! where to save it with the system's Save dialog (starting in Downloads) and writes it there.

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request};
use tauri::{Manager, Runtime, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

/// Returns the saved path, or `None` if the dialog was cancelled.
#[tauri::command]
pub async fn save_download<R: Runtime>(window: WebviewWindow<R>, request: Request<'_>) -> Result<Option<String>, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected the file's bytes".into());
    };
    let bytes = bytes.clone();
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|value| value.to_str().ok())
        .map(|value| percent_decode_str(value).decode_utf8_lossy().into_owned())
        .unwrap_or_default();
    // Only a file name, never a path from the page.
    let name = name.rsplit(['/', '\\']).next().unwrap_or_default().trim().to_string();
    let name = if name.is_empty() { "download".to_string() } else { name };

    let mut dialog = window.dialog().file().set_file_name(name).set_parent(&window);
    if let Ok(dir) = window.path().download_dir() {
        dialog = dialog.set_directory(dir);
    }
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_save_file())
        .await
        .map_err(|e| e.to_string())?;
    let Some(picked) = picked else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| format!("Couldn't save {}: {e}", path.display()))?;
    Ok(Some(path.display().to_string()))
}
