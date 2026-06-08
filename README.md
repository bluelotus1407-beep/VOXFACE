# VOXFACE — Floating Local LLM Voice & Face Desktop Widget

VOXFACE is an 80s-inspired retro CRT monitor desktop widget that serves as an animated interactive interface for local LLMs (like Ollama or LM Studio). It intercepts local LLM traffic via a built-in proxy server, speaks LLM responses using local text-to-speech (TTS), and renders a synchronized, real-time ASCII-style face. It also includes Speech-to-Text (STT) capabilities to type what you dictate directly into your active window.

---

## Preview

![VOXFACE Desktop Preview](assets/sample.png)

---

## Features
- **Retro CRT Shader**: Real-time WebGL/GLSL post-processing with scanlines, chromatic aberration, grain, phosphor bloom, and screen curvature.
- **Dynamic Lip-Syncing**: Mouth shapes (`u`, `o`, `i`, `e`, `a`, `a1`, `a2`) react in real-time to the audio volume amplitude of the speaker.
- **Speech-to-Text (STT) typing**: Dictate using Push-to-Talk (`Control + Space` hotkey) or Always Listening mode; it types the transcribed text directly into your active application.
- **Axum Proxy Server**: Runs a local API proxy on port `11430` that forwards completions to your local LLM backend.

---

## 1. Setup Prerequisites by Platform

Before compiling or running VOXFACE, install the system build tools and runtimes required for your OS.

### 🐧 Linux (Ubuntu / Mint / Debian)
Install compilation libraries and audio headers:
```bash
sudo apt-get update && sudo apt-get install -y \
  build-essential libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev \
  librsvg2-dev pkg-config libasound2-dev python3 git
```
Install Node.js (v20+) and Rust:
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 🍎 macOS
Install Xcode Command Line Tools:
```bash
xcode-select --install
```
Install Node.js, Rust, and Python via [Homebrew](https://brew.sh/):
```bash
brew install node rust python git
```

### 🪟 Windows
1. Install **Visual Studio C++ Build Tools** (Select "Desktop development with C++" workflow) or run via PowerShell:
   ```powershell
   winget install Microsoft.VisualStudio.2022.BuildTools --override "--passive --config includeRecommended"
   ```
2. Install **Node.js, Python 3, and Git**:
   ```powershell
   winget install OpenJS.NodeJS
   winget install Python.Python.3
   winget install Git.Git
   ```
3. Install **Rust**: Download and run [rustup-init.exe](https://rustup.rs/).

---

## 2. Clone the Repository & Install Packages
Run these commands in your terminal (or PowerShell on Windows):
```bash
git clone https://github.com/bluelotus1407-beep/VOXFACE.git
cd VOXFACE
npm install
```

---

## 3. Setup ML Models and Binaries

Run the setup script to download the ONNX voice models, VAD libraries, and compile `whisper.cpp` natively for your system architecture:
```bash
python3 download_resources.py
```

### ⚠️ Platform-Specific Engine Setup

The setup script downloads the **Linux** x86_64 binaries by default. If you are on **macOS** or **Windows**, you need to manually replace the Piper TTS engine binary with your platform's version:

#### For macOS:
1. Go to the [Rhasspy Piper Releases](https://github.com/rhasspy/piper/releases/tag/v1.2.0).
2. Download the package for your architecture:
   - Apple Silicon (M1/M2/M3/M4): `piper_macos_aarch64.tar.gz`
   - Intel: `piper_macos_x64.tar.gz`
3. Extract and place the `piper` executable and library files inside `src-tauri/resources/piper/` (overwriting the Linux files).

#### For Windows:
1. Go to the [Rhasspy Piper Releases](https://github.com/rhasspy/piper/releases/tag/v1.2.0).
2. Download `piper_windows_amd64.zip`.
3. Extract and copy `piper.exe`, `libonnxruntime.dll`, `libpiper_phonemize.dll`, and the `espeak-ng-data` folder into `src-tauri/resources/piper/` (overwriting the Linux files).
4. *Note for Whisper on Windows:* The setup script compiles Whisper using `make`. If you do not have Make/GCC on Windows, you can download a precompiled `whisper-cli` executable from [whisper.cpp Releases](https://github.com/ggerganov/whisper.cpp/releases) and place it as `src-tauri/resources/whisper/whisper-cli.exe`.

---

## 4. Running the Widget

1. Start the frontend developer server:
   ```bash
   npm run dev
   ```
2. Open a second terminal tab and start the desktop client:
   ```bash
   npm run tauri dev
   ```

---

## 5. Connecting to your Local LLM

1. Run your local model server (e.g. **LM Studio** or **Ollama** on port `11434` or `1234`).
2. Double-click the CRT screen bezel of the widget to slide down the **System Setup** panel.
3. Configure your LLM Port, model ID, and backend URL.
4. Point your LLM Client (or application) to communicate through the VOXFACE proxy port (`http://localhost:11430`) instead of calling the LLM directly. VOXFACE will capture the completions, speak them, and animate the face!
