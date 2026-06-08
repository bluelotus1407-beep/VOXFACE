use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use ort::inputs;
use ort::session::Session;
use ort::value::Tensor;
use tauri::{AppHandle, Manager, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[allow(dead_code)]
pub struct SendSyncStream(pub cpal::Stream);
unsafe impl Send for SendSyncStream {}
unsafe impl Sync for SendSyncStream {}

#[allow(dead_code)]
pub struct SttState {
    pub recording: Arc<Mutex<bool>>,
    pub audio_buffer: Arc<Mutex<Vec<f32>>>,
    pub stream: Arc<Mutex<Option<SendSyncStream>>>,
}

pub fn start_recording(app: &AppHandle) {
    let state = app.state::<SttState>();
    let stt_state = state.inner();
    let mut recording = stt_state.recording.lock().unwrap();
    if *recording {
        return;
    }
    *recording = true;
    println!("STT: Recording started — speak now");
    let _ = app.emit("stt:listening_start", ());
    stt_state.audio_buffer.lock().unwrap().clear();
}

pub fn stop_recording(app: &AppHandle) {
    let state = app.state::<SttState>();
    let stt_state = state.inner();
    let mut recording = stt_state.recording.lock().unwrap();
    if !*recording {
        return;
    }
    *recording = false;
    println!("STT: Recording stopped — transcribing...");
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        transcribe_and_inject(&app_clone).await;
    });
}

// Global PTT toggle hook called by keyboard shortcut handler
pub fn handle_ptt_press(app: &AppHandle) {
    let state = app.state::<SttState>();
    let is_recording = *state.inner().recording.lock().unwrap();
    if is_recording {
        stop_recording(app);
    } else {
        start_recording(app);
    }
}

pub fn ptt_hotkey_string(settings: &crate::settings::Settings) -> String {
    if settings.ptt_hotkey == "Right Ctrl" {
        "Control+Space".to_string()
    } else {
        settings.ptt_hotkey.clone()
    }
}

pub fn configure_ptt_shortcut(app: &AppHandle) {
    let settings = crate::settings::load_settings(app);
    let gs = app.global_shortcut();
    if let Err(e) = gs.unregister_all() {
        eprintln!("STT: Could not clear old hotkeys: {}", e);
    }

    if settings.stt_mode != "Push to Talk" {
        println!("STT: mode = {} (no PTT hotkey)", settings.stt_mode);
        return;
    }

    let hotkey_str = ptt_hotkey_string(&settings);
    match hotkey_str.parse::<Shortcut>() {
        Ok(shortcut) => {
            let app_handle = app.clone();
            match gs.on_shortcut(shortcut, move |_app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    handle_ptt_press(&app_handle);
                }
            }) {
                Ok(_) => println!("STT: PTT hotkey registered — {}", hotkey_str),
                Err(e) => eprintln!(
                    "STT: Failed to register PTT hotkey ({}): {} — use the mic button on the widget",
                    hotkey_str, e
                ),
            }
        }
        Err(e) => eprintln!("STT: Invalid PTT hotkey '{}': {}", hotkey_str, e),
    }
}

#[tauri::command]
pub fn stt_start_recording(app: AppHandle) {
    start_recording(&app);
}

#[tauri::command]
pub fn stt_stop_recording(app: AppHandle) {
    stop_recording(&app);
}

// Helper to write WAV file (16kHz, mono, 16-bit PCM) for whisper-cli input
fn write_wav_file(path: &PathBuf, samples: &[f32]) -> bool {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 16000,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    
    if let Ok(mut writer) = hound::WavWriter::create(path, spec) {
        for &sample in samples {
            let int_sample = (sample * 32767.0).max(-32768.0).min(32767.0) as i16;
            let _ = writer.write_sample(int_sample);
        }
        writer.finalize().is_ok()
    } else {
        false
    }
}

// Spawns whisper-cli to transcribe recorded audio and injects the text
async fn transcribe_and_inject(app: &AppHandle) {
    let state = app.state::<SttState>();
    let stt_state = state.inner();
    let samples = {
        let buffer = stt_state.audio_buffer.lock().unwrap();
        buffer.clone()
    };
    
    if samples.is_empty() {
        return;
    }
    
    // Save buffer to temporary WAV file
    let cache_dir = app.path().app_cache_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&cache_dir);
    let wav_path = cache_dir.join("stt_input.wav");
    
    if !write_wav_file(&wav_path, &samples) {
        eprintln!("STT: Failed to write WAV file.");
        return;
    }
    
    // Find whisper binary
    let bin_path = if let Ok(resource_path) = app.path().resource_dir() {
        [
            resource_path.join("whisper").join("whisper-cli"),
            resource_path.join("resources").join("whisper").join("whisper-cli"),
        ]
        .into_iter()
        .find(|path| path.exists())
    } else {
        None
    };
    
    let whisper_bin = bin_path.unwrap_or_else(|| PathBuf::from("whisper-cli"));
    let model_path = whisper_bin.parent().unwrap_or(&whisper_bin).join("ggml-tiny.en.bin");
    
    println!("STT: Running transcription via {:?}", whisper_bin);
    let output_res = Command::new(&whisper_bin)
        .arg("-m").arg(model_path)
        .arg("-f").arg(&wav_path)
        .arg("-nt")
        .output();
        
    let _ = std::fs::remove_file(wav_path);
    
    match output_res {
        Ok(output) => {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                println!("You said: {}", text);
                
                if !text.is_empty() {
                    let _ = app.emit("stt:transcription_complete", text.clone());
                    let app_clone = app.clone();
                    tauri::async_runtime::spawn(async move {
                        crate::proxy::submit_user_message(&app_clone, text).await;
                    });
                }
            } else {
                eprintln!("STT: whisper-cli returned error: {}", String::from_utf8_lossy(&output.stderr));
            }
        }
        Err(e) => {
            eprintln!("STT: Failed to execute whisper-cli: {}", e);
        }
    }
}

// Main background worker loop for Always Listening mode
pub fn start_always_listening_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let vad_model_path = if let Ok(resource_path) = app.path().resource_dir() {
            [
                resource_path.join("vad").join("silero_vad.onnx"),
                resource_path.join("resources").join("vad").join("silero_vad.onnx"),
            ]
            .into_iter()
            .find(|path| path.exists())
        } else {
            None
        };
        
        let model_path = match vad_model_path {
            Some(p) => p,
            None => {
                eprintln!("STT: Silero VAD model not found in resources. Always Listening disabled.");
                return;
            }
        };
        
        let mut session = match Session::builder().unwrap().commit_from_file(&model_path) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("STT: Failed to load VAD model session: {}", e);
                return;
            }
        };
        
        let mut h = vec![0.0f32; 2 * 1 * 64];
        let mut c = vec![0.0f32; 2 * 1 * 64];
        
        let state = app.state::<SttState>();
        let stt_state = state.inner();
        let mut silence_start = Instant::now();
        let mut speech_detected = false;
        let mut was_always_listening = false;
        
        loop {
            let settings = crate::settings::load_settings(&app);
            let is_always = settings.stt_mode == "Always Listening";
            
            if is_always != was_always_listening {
                was_always_listening = is_always;
                *stt_state.recording.lock().unwrap() = is_always;
                if is_always {
                    println!("STT: Always Listening — speak anytime");
                    let _ = app.emit("stt:listening_start", ());
                } else {
                    stt_state.audio_buffer.lock().unwrap().clear();
                }
            }
            
            if !is_always {
                tokio::time::sleep(Duration::from_millis(500)).await;
                continue;
            }
            
            let chunk_size = 512;
            let mut chunk = vec![0.0f32; chunk_size];
            
            let has_enough = {
                let buffer = stt_state.audio_buffer.lock().unwrap();
                buffer.len() >= chunk_size
            };
            
            if !has_enough {
                tokio::time::sleep(Duration::from_millis(10)).await;
                continue;
            }
            
            {
                let mut buffer = stt_state.audio_buffer.lock().unwrap();
                chunk.copy_from_slice(&buffer[..chunk_size]);
                buffer.drain(..chunk_size);
            }
            
            let input_tensor = Tensor::from_array((vec![1, chunk_size], chunk)).unwrap();
            let sr_tensor = Tensor::from_array((vec![1], vec![16000i64])).unwrap();
            let h_tensor = Tensor::from_array((vec![2, 1, 64], h.clone())).unwrap();
            let c_tensor = Tensor::from_array((vec![2, 1, 64], c.clone())).unwrap();
            
            let outputs = match session.run(inputs![
                "input" => input_tensor,
                "sr" => sr_tensor,
                "h" => h_tensor,
                "c" => c_tensor
            ]) {
                Ok(out) => out,
                Err(_) => continue,
            };
            
            let output_prob: f32 = if let Some(out_val) = outputs.get("output") {
                if let Ok((_, data)) = out_val.try_extract_tensor::<f32>() {
                    data.iter().next().copied().unwrap_or(0.0)
                } else { 0.0 }
            } else { 0.0 };
            
            if let Some(hn_val) = outputs.get("hn") {
                if let Ok((_, data)) = hn_val.try_extract_tensor::<f32>() {
                    h = data.iter().copied().collect();
                }
            }
            if let Some(cn_val) = outputs.get("cn") {
                if let Ok((_, data)) = cn_val.try_extract_tensor::<f32>() {
                    c = data.iter().copied().collect();
                }
            }
            
            let is_speech = output_prob > 0.5;
            
            if is_speech {
                if !speech_detected {
                    speech_detected = true;
                    println!("STT AlwaysListening: Speech detected!");
                    let _ = app.emit("stt:speech_detected", ());
                }
                silence_start = Instant::now();
            } else {
                if speech_detected && silence_start.elapsed() > Duration::from_millis(1500) {
                    speech_detected = false;
                    println!("STT AlwaysListening: Silence detected, processing transcript...");
                    transcribe_and_inject(&app).await;
                }
            }
        }
    });
}

// Initializes input audio capture stream
pub fn init_stt(app: AppHandle) -> SttState {
    let recording = Arc::new(Mutex::new(false));
    let audio_buffer = Arc::new(Mutex::new(Vec::with_capacity(16000 * 10)));
    
    let recording_clone = recording.clone();
    let audio_buffer_clone = audio_buffer.clone();
    
    let host = cpal::default_host();
    let stream_opt = if let Some(device) = host.default_input_device() {
        let device_name = device.name().unwrap_or_else(|_| "unknown".to_string());
        println!("STT: Microphone found — {}", device_name);
        if let Ok(config) = device.default_input_config() {
            let sample_rate = config.sample_rate().0;
            let channels = config.channels();
            
            let stream_res = device.build_input_stream(
                &config.into(),
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    let is_rec = *recording_clone.lock().unwrap();
                    if !is_rec {
                        return;
                    }
                    let mut buffer = audio_buffer_clone.lock().unwrap();
                    
                    let ratio = sample_rate as f32 / 16000.0;
                    let mut temp_mono = Vec::with_capacity(data.len() / channels as usize);
                    
                    for chunk in data.chunks_exact(channels as usize) {
                        let mono_sample: f32 = chunk.iter().sum::<f32>() / channels as f32;
                        temp_mono.push(mono_sample);
                    }
                    
                    let mut idx = 0.0f32;
                    while (idx as usize) < temp_mono.len() {
                        let base_idx = idx as usize;
                        let t = idx - base_idx as f32;
                        let next_idx = (base_idx + 1).min(temp_mono.len() - 1);
                        let sample = (1.0 - t) * temp_mono[base_idx] + t * temp_mono[next_idx];
                        
                        buffer.push(sample);
                        idx += ratio;
                    }
                },
                move |err| {
                    eprintln!("STT audio stream error: {}", err);
                },
                None
            );
            
            match stream_res {
                Ok(stream) => {
                    let _ = stream.play();
                    Some(SendSyncStream(stream))
                }
                Err(e) => {
                    eprintln!("STT: Failed to build input stream: {}", e);
                    None
                }
            }
        } else {
            eprintln!("STT: Failed to get default input config.");
            None
        }
    } else {
        eprintln!("STT: No default input device found.");
        None
    };
    
    // Spawn always listening loop
    start_always_listening_loop(app.clone());
    configure_ptt_shortcut(&app);

    let settings = crate::settings::load_settings(&app);
    println!(
        "STT: Ready — mode: {} | PTT key: {} | hold the mic button on the widget to talk",
        settings.stt_mode,
        ptt_hotkey_string(&settings)
    );

    SttState {
        recording,
        audio_buffer,
        stream: Arc::new(Mutex::new(stream_opt)),
    }
}
