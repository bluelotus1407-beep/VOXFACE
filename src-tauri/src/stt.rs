use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use ort::inputs;
use ort::session::Session;
use ort::value::Tensor;
use tauri::{AppHandle, Manager, Emitter};
use tauri_plugin_global_shortcut::{Code, Modifiers, GlobalShortcutExt, Shortcut, ShortcutState};

#[allow(dead_code)]
pub struct SendSyncStream(pub cpal::Stream);
unsafe impl Send for SendSyncStream {}
unsafe impl Sync for SendSyncStream {}

#[allow(dead_code)]
pub struct SttState {
    pub recording: Arc<Mutex<bool>>,
    pub audio_buffer: Arc<Mutex<Vec<f32>>>,
    pub stream: Arc<Mutex<Option<SendSyncStream>>>,
    pub tts_active: Arc<Mutex<bool>>,
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
    let _ = app.emit("stt:listening_stop", ());
    
    let samples = {
        let mut buffer = stt_state.audio_buffer.lock().unwrap();
        let s = buffer.clone();
        buffer.clear();
        s
    };
    
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        transcribe_and_inject_samples(&app_clone, samples).await;
    });
}

// Global PTT toggle hook called by keyboard shortcut handler (retained for reference)
#[allow(dead_code)]
pub fn handle_ptt_press(app: &AppHandle) {
    let state = app.state::<SttState>();
    let is_recording = *state.inner().recording.lock().unwrap();
    if is_recording {
        stop_recording(app);
    } else {
        start_recording(app);
    }
}

pub fn ptt_hotkey_string(_settings: &crate::settings::Settings) -> String {
    "Ctrl + Space".to_string()
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

    let shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::Space);
    let app_handle = app.clone();

    match gs.on_shortcut(shortcut, move |_app, _shortcut, event| {
        match event.state() {
            ShortcutState::Pressed => {
                start_recording(&app_handle);
            }
            ShortcutState::Released => {
                stop_recording(&app_handle);
            }
        }
    }) {
        Ok(_) => println!("STT: PTT hold-to-talk registered successfully (Ctrl + Space)"),
        Err(e) => eprintln!("STT: Failed to register PTT hold-to-talk shortcut: {}", e),
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
async fn transcribe_and_inject_samples(app: &AppHandle, samples: Vec<f32>) {
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
        let binary_name = if cfg!(target_os = "windows") { "whisper-cli.exe" } else { "whisper-cli" };
        [
            resource_path.join("whisper").join(binary_name),
            resource_path.join("resources").join(binary_name),
            resource_path.join("resources").join("whisper").join(binary_name),
        ]
        .into_iter()
        .find(|path| path.exists())
    } else {
        None
    };
    
    let default_bin = if cfg!(target_os = "windows") { "whisper-cli.exe" } else { "whisper-cli" };
    let whisper_bin = bin_path.unwrap_or_else(|| PathBuf::from(default_bin));
    let model_path = whisper_bin.parent().unwrap_or(&whisper_bin).join("ggml-tiny.en.bin");
    
    println!("STT: Running transcription of {} samples via {:?}", samples.len(), whisper_bin);
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
        
        println!("STT: VAD session inputs: {:?}", session.inputs());
        println!("STT: VAD session outputs: {:?}", session.outputs());
        
        let mut state_vec = vec![0.0f32; 2 * 1 * 128];
        
        let state = app.state::<SttState>();
        let stt_state = state.inner();
        let mut silence_start = Instant::now();
        let mut speech_detected = false;
        let mut was_always_listening = false;
        
        let mut pre_roll = std::collections::VecDeque::new();
        let max_pre_roll_samples = 24000; // 1.5 seconds of context at 16kHz
        let mut speech_buffer = Vec::new();
        
        loop {
            let settings = crate::settings::load_settings(&app);
            let is_always = settings.stt_mode == "Always Listening";
            
            if is_always != was_always_listening {
                was_always_listening = is_always;
                *stt_state.recording.lock().unwrap() = is_always;
                if is_always {
                    println!("STT: Always Listening enabled — monitoring background audio");
                    let _ = app.emit("stt:listening_start", ());
                    pre_roll.clear();
                    speech_buffer.clear();
                    speech_detected = false;
                    state_vec = vec![0.0f32; 2 * 1 * 128];
                } else {
                    println!("STT: Always Listening disabled");
                    stt_state.audio_buffer.lock().unwrap().clear();
                    let _ = app.emit("stt:listening_stop", ());
                }
            }
            
            if !is_always {
                tokio::time::sleep(Duration::from_millis(500)).await;
                continue;
            }
            
            let chunk_size = 512;
            let mut chunk = vec![0.0f32; chunk_size];
            
            let buffer_len = {
                let buffer = stt_state.audio_buffer.lock().unwrap();
                buffer.len()
            };
            
            if buffer_len < chunk_size {
                tokio::time::sleep(Duration::from_millis(10)).await;
                continue;
            }
            
            {
                let mut buffer = stt_state.audio_buffer.lock().unwrap();
                chunk.copy_from_slice(&buffer[..chunk_size]);
                buffer.drain(..chunk_size);
            }
            
            if !speech_detected {
                for &sample in &chunk {
                    pre_roll.push_back(sample);
                }
                while pre_roll.len() > max_pre_roll_samples {
                    pre_roll.pop_front();
                }
            }
            
            let input_tensor = Tensor::from_array((vec![1, chunk_size], chunk.clone())).unwrap();
            let sr_tensor = Tensor::from_array((vec![0i64; 0], vec![16000i64])).unwrap();
            let state_tensor = Tensor::from_array((vec![2, 1, 128], state_vec.clone())).unwrap();
            
            let outputs = match session.run(inputs![
                "input" => input_tensor,
                "sr" => sr_tensor,
                "state" => state_tensor
            ]) {
                Ok(out) => out,
                Err(e) => {
                    eprintln!("STT: Failed to run VAD session: {}", e);
                    continue;
                }
            };
            
            let output_prob: f32 = if let Some(out_val) = outputs.get("output") {
                if let Ok((_, data)) = out_val.try_extract_tensor::<f32>() {
                    data.iter().next().copied().unwrap_or(0.0)
                } else { 0.0 }
            } else { 0.0 };
            
            if let Some(state_val) = outputs.get("stateN") {
                if let Ok((_, data)) = state_val.try_extract_tensor::<f32>() {
                    state_vec = data.iter().copied().collect();
                }
            }
            
            let is_speech = output_prob > 0.55;
            
            if is_speech {
                if !speech_detected {
                    speech_detected = true;
                    println!("STT AlwaysListening: Speech detected (VAD prob={:.4})!", output_prob);
                    let _ = app.emit("stt:speech_detected", ());
                    speech_buffer = pre_roll.iter().copied().collect();
                    pre_roll.clear();
                }
                speech_buffer.extend_from_slice(&chunk);
                silence_start = Instant::now();
            } else {
                if speech_detected {
                    speech_buffer.extend_from_slice(&chunk);
                    if silence_start.elapsed() > Duration::from_millis(1500) {
                        speech_detected = false;
                        println!("STT AlwaysListening: Silence detected, processing transcript...");
                        let _ = app.emit("stt:listening_stop", ());
                        
                        let samples_to_transcribe = speech_buffer.clone();
                        speech_buffer.clear();
                        state_vec = vec![0.0f32; 2 * 1 * 128]; // Reset VAD state for next phrase
                        
                        let app_clone = app.clone();
                        tauri::async_runtime::spawn(async move {
                            transcribe_and_inject_samples(&app_clone, samples_to_transcribe).await;
                        });
                    }
                }
            }
        }
    });
}

// Initializes input audio capture stream
pub fn init_stt(_app: AppHandle) -> SttState {
    let recording = Arc::new(Mutex::new(false));
    let audio_buffer = Arc::new(Mutex::new(Vec::with_capacity(16000 * 10)));
    let tts_active = Arc::new(Mutex::new(false));
    
    let recording_clone = recording.clone();
    let audio_buffer_clone = audio_buffer.clone();
    let tts_active_clone = tts_active.clone();
    
    let host = cpal::default_host();
    let stream_opt = if let Some(device) = host.default_input_device() {
        let device_name = device.name().unwrap_or_else(|_| "unknown".to_string());
        println!("STT: Microphone found — {}", device_name);
        if let Ok(config) = device.default_input_config() {
            let sample_rate = config.sample_rate().0;
            let channels = config.channels();
            let ratio = sample_rate as f32 / 16000.0;
            
            println!("STT: CPAL default input config: sample_rate={}, channels={}, ratio={}", sample_rate, channels, ratio);
            
            let stream_res = device.build_input_stream(
                &config.into(),
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    let is_rec = *recording_clone.lock().unwrap();
                    let is_tts = *tts_active_clone.lock().unwrap();
                    
                    if !is_rec || is_tts {
                        return;
                    }
                    let mut buffer = audio_buffer_clone.lock().unwrap();
                    
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
    
    SttState {
        recording,
        audio_buffer,
        stream: Arc::new(Mutex::new(stream_opt)),
        tts_active,
    }
}

pub fn start_stt_loops(app: &AppHandle) {
    // Spawn always listening loop
    start_always_listening_loop(app.clone());
    configure_ptt_shortcut(app);

    let settings = crate::settings::load_settings(app);
    println!(
        "STT: Ready — mode: {} | PTT key: {} | hold the mic button on the widget to talk",
        settings.stt_mode,
        ptt_hotkey_string(&settings)
    );
}
