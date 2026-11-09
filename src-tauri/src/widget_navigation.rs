use std::sync::Mutex;

use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct WidgetNavigation(Mutex<Vec<String>>);

fn allowed_link(url: &tauri::Url) -> bool {
    if url.scheme() != "todotracker"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return false;
    }
    match url.host_str() {
        Some("capture" | "today") => matches!(url.path(), "" | "/"),
        Some("task") => {
            let id = url.path().strip_prefix('/').unwrap_or_default();
            !id.is_empty()
                && id.len() <= 128
                && id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        }
        _ => false,
    }
}

pub fn receive(app: &tauri::AppHandle, urls: Vec<tauri::Url>) {
    let accepted: Vec<String> = urls
        .into_iter()
        .filter(allowed_link)
        .map(|url| url.to_string())
        .collect();
    if accepted.is_empty() {
        return;
    }
    let state = app.state::<WidgetNavigation>();
    if let Ok(mut pending) = state.0.lock() {
        pending.extend(accepted);
        if pending.len() > 16 {
            let excess = pending.len() - 16;
            pending.drain(..excess);
        }
    }
    let _ = app.emit_to("main", "widget-navigation", ());
    // Only an explicit widget link, never a snapshot refresh, can reveal the app.
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub fn take_widget_links(
    window: tauri::WebviewWindow,
    state: tauri::State<WidgetNavigation>,
) -> Result<Vec<String>, String> {
    if window.label() != "main" {
        return Err("Widget navigation belongs to the main window.".into());
    }
    state
        .0
        .lock()
        .map(|mut pending| std::mem::take(&mut *pending))
        .map_err(|_| "Widget navigation is busy.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permits_navigation_but_never_mutations_or_external_addresses() {
        for value in [
            "todotracker://capture",
            "todotracker://today/",
            "todotracker://task/1234-abcd",
        ] {
            assert!(allowed_link(&value.parse().unwrap()), "{value}");
        }
        for value in [
            "https://capture",
            "todotracker://complete/123",
            "todotracker://capture?text=hello",
            "todotracker://task/a/b",
            "todotracker://task/",
            "todotracker://user@capture",
            "todotracker://today#bad",
        ] {
            assert!(!allowed_link(&value.parse().unwrap()), "{value}");
        }
    }
}
