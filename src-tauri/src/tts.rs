use std::fs::File;
use std::io::{BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use rodio::{Decoder, OutputStream, Sink, Source};
use tauri::{AppHandle, Manager, Emitter};

// Custom rodio source to monitor amplitude in real-time
struct AmplitudeMonitoringSource<I> {
    input: I,
    app: AppHandle,
    samples_bucket: Vec<f32>,
    samples_per_window: usize,
}

impl<I> AmplitudeMonitoringSource<I>
where
    I: Source,
    I::Item: rodio::Sample + Into<f32>,
{
    fn new(input: I, app: AppHandle) -> Self {
        let sample_rate = input.sample_rate();
        // 33ms window for ~30fps visual updates
        let samples_per_window = (sample_rate as f32 * 0.033) as usize;
        Self {
            input,
            app,
            samples_bucket: Vec::with_capacity(samples_per_window),
            samples_per_window,
        }
    }
}

impl<I> Iterator for AmplitudeMonitoringSource<I>
where
    I: Source,
    I::Item: rodio::Sample + Into<f32>,
{
    type Item = I::Item;

    fn next(&mut self) -> Option<Self::Item> {
        let sample_opt = self.input.next();
        if let Some(sample) = sample_opt {
            let val: f32 = sample.into();
            self.samples_bucket.push(val);
            
            if self.samples_bucket.len() >= self.samples_per_window {
                // Calculate Root Mean Square (RMS)
                let sum_sq: f32 = self.samples_bucket.iter().map(|&x| x * x).sum();
                let rms = (sum_sq / self.samples_bucket.len() as f32).sqrt();
                
                // Map RMS to 8 levels (0 to 7)
                // Speech samples generally peak around 0.25 RMS
                let val_mapped = (rms * 32.0).min(7.0).max(0.0) as u8;
                
                let _ = self.app.emit("tts:amplitude", val_mapped);
                self.samples_bucket.clear();
            }
            Some(sample)
        } else {
            None
        }
    }
}

impl<I> Source for AmplitudeMonitoringSource<I>
where
    I: Source,
    I::Item: rodio::Sample + Into<f32>,
{
    fn current_frame_len(&self) -> Option<usize> {
        self.input.current_frame_len()
    }

    fn channels(&self) -> u16 {
        self.input.channels()
    }

    fn sample_rate(&self) -> u32 {
        self.input.sample_rate()
    }

    fn total_duration(&self) -> Option<std::time::Duration> {
        self.input.total_duration()
    }
}

pub struct TtsState {
    pub sender: tokio::sync::mpsc::UnboundedSender<String>,
}

#[derive(Clone)]
pub struct TtsManager {
    app: AppHandle,
}

impl TtsManager {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }

    // Resolves path of a resource binary, falling back to system path if not found
    fn find_binary(&self, engine: &str, binary_name: &str) -> Option<PathBuf> {
        let names = if cfg!(target_os = "windows") {
            vec![format!("{}.exe", binary_name), binary_name.to_string()]
        } else {
            vec![binary_name.to_string()]
        };

        // 1. Check Python user bin and Cargo bin directories first on macOS/Linux for speed
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        {
            if let Ok(home) = std::env::var("HOME") {
                let home_path = PathBuf::from(home);
                for name in &names {
                    for dir in [
                        home_path.join("Library/Python/3.9/bin"),
                        home_path.join("Library/Python/3.10/bin"),
                        home_path.join("Library/Python/3.11/bin"),
                        home_path.join("Library/Python/3.12/bin"),
                        home_path.join("Library/Python/3.13/bin"),
                        home_path.join("Library/Python/3.14/bin"),
                        home_path.join(".local/bin"),
                        home_path.join(".cargo/bin"),
                    ] {
                        let bin_path = dir.join(name);
                        if bin_path.exists() {
                            return Some(bin_path);
                        }
                    }
                }
            }
        }

        // 2. Check system PATH via which/where.exe
        let sys_name = if cfg!(target_os = "windows") {
            format!("{}.exe", binary_name)
        } else {
            binary_name.to_string()
        };

        if let Ok(output) = Command::new("which").arg(&sys_name).output() {
            if output.status.success() {
                let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                return Some(PathBuf::from(path_str));
            }
        }

        // Windows fallback for system command path lookup
        #[cfg(target_os = "windows")]
        {
            if let Ok(output) = Command::new("where.exe").arg(&sys_name).output() {
                if output.status.success() {
                    if let Some(first_line) = String::from_utf8_lossy(&output.stdout).lines().next() {
                        return Some(PathBuf::from(first_line.trim()));
                    }
                }
            }
        }

        // 3. Fall back to tauri resource directory (bundled resources/<engine>/<binary>)
        if let Ok(resource_path) = self.app.path().resource_dir() {
            for name in &names {
                for bin_path in [
                    resource_path.join(engine).join(name),
                    resource_path.join("resources").join(engine).join(name),
                ] {
                    if bin_path.exists() {
                        return Some(bin_path);
                    }
                }
            }
        }
        
        None
    }

    // Queue text for speaking
    pub fn speak(&self, text: String) {
        if let Some(state) = self.app.try_state::<TtsState>() {
            let _ = state.sender.send(text);
        }
    }

    // Synchronous speak handler (run inside worker thread)
    pub async fn speak_sync(&self, text: String) {
        let app_handle = self.app.clone();
        let settings = crate::settings::load_settings(&app_handle);
        
        let text_to_speak = text.trim().to_string();
        if text_to_speak.is_empty() {
            return;
        }

        if settings.mute {
            println!("Widget (muted): {}", text_to_speak);
            let _ = app_handle.emit("tts:done", ());
            return;
        }

        println!("Widget speaking: {}", text_to_speak);

        // Create cache output path
        let cache_dir = app_handle.path().app_cache_dir().unwrap_or_else(|_| PathBuf::from("."));
        let _ = std::fs::create_dir_all(&cache_dir);
        let wav_path = cache_dir.join("tts_output.wav");

        let mut success = false;

        println!("TTS Debug: Engine is '{}', Voice is '{}'", settings.tts_engine, settings.tts_voice);
        if settings.tts_engine == "Piper" {
            if let Some(piper_bin) = self.find_binary("piper", "piper") {
                let model_name = format!("{}.onnx", settings.tts_voice);
                let mut model_path = None;
                if let Ok(resource_path) = self.app.path().resource_dir() {
                    for dir in [
                        resource_path.join("piper"),
                        resource_path.join("resources").join("piper"),
                    ] {
                        let path = dir.join(&model_name);
                        if path.exists() {
                            model_path = Some(path);
                            break;
                        }
                    }
                }
                let model_path = model_path.unwrap_or_else(|| {
                    let model_dir = piper_bin.parent().unwrap_or(&piper_bin).to_path_buf();
                    model_dir.join(&model_name)
                });
                println!("TTS Debug: Found piper binary at {:?}", piper_bin);
                println!("TTS Debug: Using model path {:?}", model_path);
                
                let mut cmd = Command::new(&piper_bin);
                cmd.arg("--model").arg(&model_path)
                   .arg("--output_file").arg(&wav_path)
                   .stdin(Stdio::piped())
                   .stdout(Stdio::null())
                   .stderr(Stdio::piped());
                   
                if let Ok(mut child) = cmd.spawn() {
                    if let Some(mut stdin) = child.stdin.take() {
                        let _ = stdin.write_all(text_to_speak.as_bytes());
                    }
                    
                    // Capture stderr before waiting
                    let mut stderr_content = String::new();
                    if let Some(mut stderr) = child.stderr.take() {
                        use std::io::Read;
                        let _ = stderr.read_to_string(&mut stderr_content);
                    }

                    if let Ok(status) = child.wait() {
                        println!("TTS Debug: Piper exited with status success={}", status.success());
                        if status.success() {
                            success = true;
                        } else {
                            println!("TTS Debug: Piper stderr: {}", stderr_content.trim());
                        }
                    } else {
                        println!("TTS Debug: Failed to wait for piper child process");
                    }
                } else {
                    println!("TTS Debug: Failed to spawn piper command");
                }
            } else {
                println!("TTS Debug: Could not find piper binary!");
            }
        } else {
            // Default to Kokoro
            if let Some(kokoro_bin) = self.find_binary("kokoro", "kokoro-cli") {
                let mut kokoro_dir = None;
                if let Ok(resource_path) = self.app.path().resource_dir() {
                    for dir in [
                        resource_path.join("kokoro"),
                        resource_path.join("resources").join("kokoro"),
                    ] {
                        if dir.join("kokoro-82M.onnx").exists() {
                            kokoro_dir = Some(dir);
                            break;
                        }
                    }
                }
                let kokoro_dir = kokoro_dir.unwrap_or_else(|| {
                    kokoro_bin.parent().unwrap_or(&kokoro_bin).to_path_buf()
                });
                println!("TTS Debug: Found kokoro binary at {:?}", kokoro_bin);
                
                let mut cmd = Command::new(&kokoro_bin);
                cmd.arg("-m").arg(kokoro_dir.join("kokoro-82M.onnx"))
                   .arg("-v").arg(kokoro_dir.join("voices").join(format!("{}.bin", settings.tts_voice)))
                   .arg("-t").arg(&text_to_speak)
                   .arg("-o").arg(&wav_path)
                   .stdout(Stdio::null())
                   .stderr(Stdio::null());
                   
                if let Ok(mut child) = cmd.spawn() {
                    if let Ok(status) = child.wait() {
                        println!("TTS Debug: Kokoro exited with status success={}", status.success());
                        if status.success() {
                            success = true;
                        }
                    }
                }
            } else {
                println!("TTS Debug: Could not find kokoro-cli binary!");
            }
        }

        println!("TTS Debug: Generation result success={}, wav_exists={}", success, wav_path.exists());

        if success && wav_path.exists() {
            // We need to run playback in a blocking fashion so we wait for sinks to sleep
            let play_app_handle = app_handle.clone();
            let wav_path_clone = wav_path.clone();
            
            if let Some(stt_state) = app_handle.try_state::<crate::stt::SttState>() {
                *stt_state.tts_active.lock().unwrap() = true;
            }

            // Get duration of WAV file
            let mut duration_ms = 0;
            if let Ok(file) = File::open(&wav_path) {
                let reader = BufReader::new(file);
                if let Ok(source) = Decoder::new(reader) {
                    if let Some(d) = source.total_duration() {
                        duration_ms = d.as_millis() as u64;
                    }
                }
            }

            #[derive(Clone, serde::Serialize)]
            struct SpeakStartPayload {
                text: String,
                duration_ms: u64,
            }

            let payload = SpeakStartPayload {
                text: text_to_speak.clone(),
                duration_ms,
            };

            let _ = app_handle.emit("tts:speak_start", payload);

            let play_task = tokio::task::spawn_blocking(move || {
                println!("TTS Debug: Starting audio playback task");
                match OutputStream::try_default() {
                    Ok((_stream, stream_handle)) => {
                        println!("TTS Debug: Opened default audio output stream");
                        match File::open(&wav_path_clone) {
                            Ok(file) => {
                                let reader = BufReader::new(file);
                                match Decoder::new(reader) {
                                    Ok(source) => {
                                        match Sink::try_new(&stream_handle) {
                                            Ok(sink) => {
                                                sink.set_volume(settings.volume as f32 / 100.0);
                                                println!("TTS Debug: Created Sink, playing audio...");
                                                let monitored_source = AmplitudeMonitoringSource::new(source, play_app_handle);
                                                sink.append(monitored_source);
                                                sink.sleep_until_end();
                                                println!("TTS Debug: Audio playback finished");
                                            }
                                            Err(e) => println!("TTS Debug: Failed to create Sink: {:?}", e),
                                        }
                                    }
                                    Err(e) => println!("TTS Debug: Failed to decode WAV file: {:?}", e),
                                }
                            }
                            Err(e) => println!("TTS Debug: Failed to open WAV file for playback: {:?}", e),
                        }
                    }
                    Err(e) => {
                        println!("TTS Debug: Failed to open default audio output stream: {:?}", e);
                    }
                }
            });
            let _ = play_task.await;

            if let Some(stt_state) = app_handle.try_state::<crate::stt::SttState>() {
                *stt_state.tts_active.lock().unwrap() = false;
            }
        }

        let _ = std::fs::remove_file(wav_path);
        let _ = app_handle.emit("tts:done", ());
    }
}

pub fn init_tts(app: AppHandle) -> TtsState {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let app_clone = app.clone();
    
    tauri::async_runtime::spawn(async move {
        let manager = TtsManager::new(app_clone);
        while let Some(text) = rx.recv().await {
            manager.speak_sync(text).await;
        }
    });
    
    TtsState { sender: tx }
}

#[tauri::command]
pub fn speak_text(app: AppHandle, text: String) {
    let manager = TtsManager::new(app);
    manager.speak(text);
}
