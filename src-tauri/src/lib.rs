
mod settings;
mod proxy;
mod tts;
mod stt;

use tauri::{Manager, WindowEvent};
use std::fs::File;
use std::io::Write;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(serde::Serialize, serde::Deserialize)]
struct Position {
    x: i32,
    y: i32,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(proxy::ProxyState {
            task: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            settings::get_settings,
            settings::update_settings,
            tts::speak_text,
            stt::stt_start_recording,
            stt::stt_stop_recording,
        ])
        .setup(|app| {
            // Initialize and manage TTS queue state
            let tts_state = tts::init_tts(app.handle().clone());
            app.manage(tts_state);

            // Initialize and manage STT state
            let stt_state = stt::init_stt(app.handle().clone());
            app.manage(stt_state);
            stt::start_stt_loops(app.handle());

            // Load settings and start proxy server on startup
            let settings = settings::load_settings(app.handle());
            proxy::restart_proxy(app.handle(), settings.proxy_port);

            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    use objc::runtime::Object;
                    use objc::{class, msg_send, sel, sel_impl};
                    if let Ok(ptr) = window.ns_window() {
                        unsafe {
                            let ns_window = ptr as *mut Object;
                            let clear_color: *mut Object = msg_send![class!(NSColor), clearColor];
                            let _: () = msg_send![ns_window, setBackgroundColor: clear_color];
                            let _: () = msg_send![ns_window, setOpaque: false];
                            let _: () = msg_send![ns_window, setHasShadow: false];
                        }
                    }
                }

                let app_data_dir = app.path().app_data_dir().unwrap();
                let pos_file = app_data_dir.join("position.json");
                
                // Restore window position if saved
                if let Ok(file) = File::open(&pos_file) {
                    if let Ok(pos) = serde_json::from_reader::<_, Position>(file) {
                        let _ = window.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
                    }
                }
                
                // Track moves and save position
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::Moved(position) = event {
                        let app_data_dir = app_handle.path().app_data_dir().unwrap();
                        let _ = std::fs::create_dir_all(&app_data_dir);
                        let pos_file = app_data_dir.join("position.json");
                        if let Ok(mut file) = File::create(&pos_file) {
                            let pos = Position { x: position.x, y: position.y };
                            if let Ok(json) = serde_json::to_string(&pos) {
                                let _ = file.write_all(json.as_bytes());
                            }
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
