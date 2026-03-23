use std::sync::{Arc, Mutex};
use tauri::Manager;

#[derive(Clone, serde::Deserialize, Default)]
#[allow(dead_code)]
struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

struct ClickthroughState {
    bounds: Vec<Rect>,
    screen_height: f64,
    locked: bool,
}

#[tauri::command]
fn update_interactive_bounds(
    state: tauri::State<'_, Arc<Mutex<ClickthroughState>>>,
    rects: Vec<Rect>,
) {
    state.lock().unwrap().bounds = rects;
}

#[tauri::command]
fn set_clickthrough_lock(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Arc<Mutex<ClickthroughState>>>,
    locked: bool,
) -> Result<(), String> {
    let mut st = state.lock().unwrap();
    st.locked = locked;
    if locked {
        drop(st);
        window
            .set_ignore_cursor_events(false)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn start_clickthrough_monitor(app_handle: tauri::AppHandle, state: Arc<Mutex<ClickthroughState>>) {
    use objc::runtime::Class;
    use objc::sel;
    use objc::sel_impl;

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct NSPoint {
        x: f64,
        y: f64,
    }

    std::thread::spawn(move || {
        let ns_event_class = Class::get("NSEvent").unwrap();
        let mut was_interactive = false;

        loop {
            let point: NSPoint = unsafe { objc::msg_send![ns_event_class, mouseLocation] };

            let st = state.lock().unwrap();
            if !st.locked {
                let my_css = st.screen_height - point.y;
                let is_interactive = st.bounds.iter().any(|r| {
                    point.x >= r.x
                        && point.x <= r.x + r.width
                        && my_css >= r.y
                        && my_css <= r.y + r.height
                });
                drop(st);

                if is_interactive != was_interactive {
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.set_ignore_cursor_events(!is_interactive);
                    }
                    was_interactive = is_interactive;
                }
            } else {
                drop(st);
            }

            std::thread::sleep(std::time::Duration::from_millis(16));
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Arc::new(Mutex::new(ClickthroughState {
        bounds: vec![],
        screen_height: 0.0,
        locked: false,
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(state.clone())
        .invoke_handler(tauri::generate_handler![
            update_interactive_bounds,
            set_clickthrough_lock,
        ])
        .setup(move |app| {
            let window = app.get_webview_window("main").unwrap();
            if let Some(monitor) = window.current_monitor()? {
                let size = monitor.size();
                let scale = monitor.scale_factor();
                window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                    size.width,
                    size.height,
                )))?;
                window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
                    0, 0,
                )))?;
                state.lock().unwrap().screen_height = size.height as f64 / scale;
            }

            window.set_ignore_cursor_events(true)?;

            #[cfg(target_os = "macos")]
            start_clickthrough_monitor(app.handle().clone(), state.clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
