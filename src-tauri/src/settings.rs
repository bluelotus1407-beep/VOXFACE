use std::fs::File;
use std::io::{Read, Write};
use std::path::PathBuf;
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Manager, Emitter};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub proxy_port: u16,
    pub backend_url: String,
    #[serde(default = "default_llm_model")]
    pub llm_model: String,
    pub tts_engine: String,
    pub tts_voice: String,
    pub tts_speed: f32,
    pub tts_pitch: i32,
    pub stt_mode: String,
    pub wake_word: String,
    pub stt_model: String,
    pub ptt_hotkey: String,
    pub face_skin: String,
    pub scanlines: bool,
    pub curvature: bool,
    pub chromatic_aberration: bool,
    pub grain: bool,
    pub volume: i32,
    pub mute: bool,
}

fn default_llm_model() -> String {
    "liquid/lfm2.5-1.2b".to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            proxy_port: 11430,
            backend_url: "http://127.0.0.1:1234".to_string(),
            llm_model: "liquid/lfm2.5-1.2b".to_string(),
            tts_engine: "Piper".to_string(),
            tts_voice: "en_US-lessac-medium".to_string(),
            tts_speed: 1.0,
            tts_pitch: 0,
            stt_mode: "Push to Talk".to_string(),
            wake_word: "hey vox".to_string(),
            stt_model: "tiny.en".to_string(),
            ptt_hotkey: "Ctrl + Space".to_string(),
            face_skin: "Green".to_string(),
            scanlines: true,
            curvature: true,
            chromatic_aberration: true,
            grain: true,
            volume: 80,
            mute: false,
        }
    }
}

pub fn get_settings_path(app: &AppHandle) -> PathBuf {
    let app_data_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    // Ensure directory exists
    let _ = std::fs::create_dir_all(&app_data_dir);
    app_data_dir.join("settings.json")
}

pub fn load_settings(app: &AppHandle) -> Settings {
    let path = get_settings_path(app);
    if let Ok(mut file) = File::open(&path) {
        let mut content = String::new();
        if file.read_to_string(&mut content).is_ok() {
            if let Ok(mut settings) = serde_json::from_str::<Settings>(&content) {
                if settings.ptt_hotkey == "Right Ctrl" {
                    settings.ptt_hotkey = "Ctrl + Space".to_string();
                    save_settings(app, &settings);
                }
                return settings;
            }
        }
    }
    // If loading fails, return default and save it
    let default_settings = Settings::default();
    save_settings(app, &default_settings);
    default_settings
}

pub fn save_settings(app: &AppHandle, settings: &Settings) {
    let path = get_settings_path(app);
    if let Ok(mut file) = File::create(&path) {
        if let Ok(json) = serde_json::to_string_pretty(settings) {
            let _ = file.write_all(json.as_bytes());
        }
    }
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    load_settings(&app)
}

#[tauri::command]
pub fn update_settings(app: AppHandle, settings: Settings) {
    let old_settings = load_settings(&app);
    let port_changed = old_settings.proxy_port != settings.proxy_port;
    
    save_settings(&app, &settings);
    
    if port_changed {
        crate::proxy::restart_proxy(&app, settings.proxy_port);
    }

    let stt_changed = old_settings.stt_mode != settings.stt_mode
        || old_settings.ptt_hotkey != settings.ptt_hotkey;
    if stt_changed {
        crate::stt::configure_ptt_shortcut(&app);
    }
    
    let _ = app.emit("settings-updated", settings);
}
