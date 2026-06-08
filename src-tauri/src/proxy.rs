use axum::{
    body::Bytes,
    extract::{State, Request},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
    body::Body,
};
use tauri::{AppHandle, Manager, Emitter};
use std::sync::Arc;
use reqwest::Client;
use futures_util::StreamExt;
use tokio::sync::{mpsc, Mutex};
use tokio_stream::wrappers::ReceiverStream;

#[derive(Clone)]
struct AppState {
    app: AppHandle,
    client: Client,
}

pub struct ProxyState {
    pub task: Arc<Mutex<Option<tauri::async_runtime::JoinHandle<()>>>>,
}

fn extract_token(line: &str) -> Option<String> {
    let line = line.trim();
    if !line.starts_with("data: ") {
        return None;
    }
    let data = &line[6..].trim();
    if *data == "[DONE]" {
        return None;
    }
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(data) {
        if let Some(choices) = val.get("choices").and_then(|c| c.as_array()) {
            if let Some(first) = choices.get(0) {
                if let Some(delta) = first.get("delta") {
                    if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                        return Some(content.to_string());
                    }
                } else if let Some(text) = first.get("text").and_then(|t| t.as_str()) {
                    return Some(text.to_string());
                }
            }
        }
    }
    None
}

async fn handle_completions(
    State(state): State<AppState>,
    req: Request,
) -> Response {
    let app = state.app.clone();
    let client = state.client.clone();
    
    let settings = crate::settings::load_settings(&app);
    let backend_url = settings.backend_url.trim_end_matches('/');
    
    let path = req.uri().path();
    let target_url = format!("{}{}", backend_url, path);
    
    let method = req.method().clone();
    let headers = req.headers().clone();
    
    let body_bytes = match axum::body::to_bytes(req.into_body(), 1024 * 1024 * 10).await {
        Ok(b) => b,
        Err(e) => return (StatusCode::BAD_REQUEST, format!("Failed to read body: {}", e)).into_response(),
    };
    
    let is_streaming = if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&body_bytes) {
        val.get("stream").and_then(|s| s.as_bool()).unwrap_or(false)
    } else {
        false
    };
    
    let mut upstream_req = client.request(method, &target_url)
        .body(body_bytes.clone());
        
    for (name, value) in headers.iter() {
        if name != "host" {
            upstream_req = upstream_req.header(name, value);
        }
    }
    
    let upstream_resp = match upstream_req.send().await {
        Ok(r) => r,
        Err(e) => return (StatusCode::BAD_GATEWAY, format!("LLM Backend connection error: {}", e)).into_response(),
    };
    
    let status = upstream_resp.status();
    let mut resp_headers = HeaderMap::new();
    for (name, value) in upstream_resp.headers().iter() {
        resp_headers.insert(name.clone(), value.clone());
    }
    
    if !status.is_success() {
        let error_bytes = upstream_resp.bytes().await.unwrap_or_default();
        let mut response = Response::new(Body::from(error_bytes));
        *response.status_mut() = status;
        *response.headers_mut() = resp_headers;
        return response;
    }
    
    if is_streaming {
        let (tx, rx) = mpsc::channel::<Result<Bytes, std::io::Error>>(100);
        let mut stream = upstream_resp.bytes_stream();
        
        let app_clone = app.clone();
        tokio::spawn(async move {
            let mut current_sentence = String::new();
            
            while let Some(chunk_res) = stream.next().await {
                match chunk_res {
                    Ok(bytes) => {
                        if tx.send(Ok(bytes.clone())).await.is_err() {
                            break;
                        }
                        
                        if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                            for line in text.lines() {
                                if let Some(token) = extract_token(line) {
                                    let _ = app_clone.emit("llm:token", token.clone());
                                    current_sentence.push_str(&token);
                                    
                                    let delimiters = ['.', '?', '!', '\n'];
                                    let mut search_idx = 0;
                                    while let Some(idx) = current_sentence[search_idx..].find(|c| delimiters.contains(&c)) {
                                        let abs_idx = search_idx + idx;
                                        let char_at = current_sentence.chars().nth(abs_idx).unwrap_or(' ');
                                        
                                        let is_newline = char_at == '\n';
                                        let followed_by_space = if abs_idx + 1 < current_sentence.len() {
                                            current_sentence.chars().nth(abs_idx + 1).map(|c| c.is_whitespace()).unwrap_or(true)
                                        } else {
                                            false
                                        };
                                        
                                        if is_newline || followed_by_space {
                                            let sentence = current_sentence[..=abs_idx].trim().to_string();
                                            if !sentence.is_empty() {
                                                let _ = app_clone.emit("llm:sentence_complete", sentence.clone());
                                                let tts = crate::tts::TtsManager::new(app_clone.clone());
                                                tts.speak(sentence);
                                            }
                                            current_sentence = current_sentence[abs_idx + 1..].to_string();
                                            search_idx = 0;
                                        } else {
                                            search_idx = abs_idx + 1;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(Err(std::io::Error::new(std::io::ErrorKind::Other, e))).await;
                        break;
                    }
                }
            }
            
            let remaining = current_sentence.trim().to_string();
            if !remaining.is_empty() {
                let _ = app_clone.emit("llm:sentence_complete", remaining.clone());
                let tts = crate::tts::TtsManager::new(app_clone.clone());
                tts.speak(remaining);
            }
            
            let _ = app_clone.emit("llm:response_complete", ());
        });
        
        let body = Body::from_stream(ReceiverStream::new(rx));
        let mut response = Response::new(body);
        *response.status_mut() = status;
        *response.headers_mut() = resp_headers;
        response
    } else {
        let resp_bytes = match upstream_resp.bytes().await {
            Ok(b) => b,
            Err(e) => return (StatusCode::BAD_GATEWAY, format!("Failed to read upstream response: {}", e)).into_response(),
        };
        
        if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&resp_bytes) {
            let mut text = String::new();
            if let Some(choices) = val.get("choices").and_then(|c| c.as_array()) {
                if let Some(first) = choices.get(0) {
                    if let Some(message) = first.get("message") {
                        if let Some(content) = message.get("content").and_then(|c| c.as_str()) {
                            text = content.to_string();
                        }
                    } else if let Some(t) = first.get("text").and_then(|t| t.as_str()) {
                        text = t.to_string();
                    }
                }
            }
            
            if !text.is_empty() {
                let _ = app.emit("llm:token", text.clone());
                for sentence in text.split(|c| c == '.' || c == '?' || c == '!') {
                    let s = sentence.trim().to_string();
                    if !s.is_empty() {
                        let _ = app.emit("llm:sentence_complete", s.clone());
                        let tts = crate::tts::TtsManager::new(app.clone());
                        tts.speak(s);
                    }
                }
                let _ = app.emit("llm:response_complete", ());
            }
        }
        
        let mut response = Response::new(Body::from(resp_bytes));
        *response.status_mut() = status;
        *response.headers_mut() = resp_headers;
        response
    }
}

async fn handle_models(
    State(state): State<AppState>,
    _req: Request,
) -> Response {
    let app = state.app.clone();
    let client = state.client.clone();
    let settings = crate::settings::load_settings(&app);
    let backend_url = settings.backend_url.trim_end_matches('/');
    let target_url = format!("{}/v1/models", backend_url);
    
    let upstream_req = client.get(&target_url);
    let upstream_resp = match upstream_req.send().await {
        Ok(r) => r,
        Err(e) => return (StatusCode::BAD_GATEWAY, format!("LLM Backend connection error: {}", e)).into_response(),
    };
    
    let status = upstream_resp.status();
    let mut resp_headers = HeaderMap::new();
    for (name, value) in upstream_resp.headers().iter() {
        resp_headers.insert(name.clone(), value.clone());
    }
    
    let bytes = upstream_resp.bytes().await.unwrap_or_default();
    let mut response = Response::new(Body::from(bytes));
    *response.status_mut() = status;
    *response.headers_mut() = resp_headers;
    response
}

pub async fn run_proxy_server(app: AppHandle, port: u16) {
    let client = Client::new();
    let state = AppState { app: app.clone(), client };
    
    let router = Router::new()
        .route("/v1/chat/completions", post(handle_completions))
        .route("/v1/completions", post(handle_completions))
        .route("/v1/models", get(handle_models))
        .with_state(state);
        
    let addr = format!("127.0.0.1:{}", port);
    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind proxy to {}: {}", addr, e);
            return;
        }
    };
    
    println!("Proxy server listening on http://{}", addr);
    
    if let Err(e) = axum::serve(listener, router).await {
        eprintln!("Error serving proxy: {}", e);
    }
}

/// Send transcribed speech through the local proxy → LM Studio → TTS pipeline.
pub async fn submit_user_message(app: &AppHandle, user_text: String) {
    let text = user_text.trim().to_string();
    if text.is_empty() {
        return;
    }

    let settings = crate::settings::load_settings(app);
    let url = format!(
        "http://127.0.0.1:{}/v1/chat/completions",
        settings.proxy_port
    );

    let body = serde_json::json!({
        "model": settings.llm_model,
        "messages": [{ "role": "user", "content": text }],
        "stream": true
    });

    println!("Voice chat: sending to LLM via proxy — \"{}\"", text);

    let client = Client::new();
    match client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
    {
        Ok(resp) => {
            if !resp.status().is_success() {
                let err = resp.text().await.unwrap_or_default();
                eprintln!("Voice chat: proxy returned error: {}", err);
            } else {
                // Drain the SSE stream so the proxy finishes token/TTS processing.
                let _ = resp.bytes().await;
            }
        }
        Err(e) => eprintln!("Voice chat: failed to reach proxy: {}", e),
    }
}

pub fn restart_proxy(app: &AppHandle, port: u16) {
    let state = app.state::<ProxyState>();
    let task_arc = state.task.clone();
    let app_clone = app.clone();
    
    tauri::async_runtime::spawn(async move {
        let mut guard = task_arc.lock().await;
        if let Some(handle) = guard.take() {
            handle.abort();
        }
        
        let new_handle = tauri::async_runtime::spawn(async move {
            run_proxy_server(app_clone, port).await;
        });
        *guard = Some(new_handle);
    });
}
