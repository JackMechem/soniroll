//! Files dropped on the window (`src/fileDrop.ts`). Tauri catches file drops natively and reports
//! their paths; the page then reads each one here to hand the website real `File`s. Only the
//! files of the latest drop can be read, so the page can't use this to read anything else.

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::ipc::Response;
use tauri::{DragDropEvent, Runtime, State, Window, WindowEvent};

#[derive(Default)]
pub struct DroppedFiles(Mutex<HashSet<PathBuf>>);

/// Remembers the paths of each drop (`Builder::on_window_event`).
pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
        use tauri::Manager;
        let state = window.state::<DroppedFiles>();
        let mut dropped = state.0.lock().unwrap();
        dropped.clear();
        dropped.extend(paths.iter().filter(|path| path.is_file()).cloned());
    }
}

/// The bytes of one file from the latest drop.
#[tauri::command]
pub async fn read_dropped_file(state: State<'_, DroppedFiles>, path: String) -> Result<Response, String> {
    let path = PathBuf::from(path);
    if !state.0.lock().unwrap().contains(&path) {
        return Err("That file wasn't dropped on the window.".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("Couldn't read {}: {e}", path.display()))?;
    Ok(Response::new(bytes))
}
