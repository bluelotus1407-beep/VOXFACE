# VOXFACE — Floating Local LLM Voice & Face Desktop Widget

VOXFACE is an 80s-inspired retro CRT monitor desktop widget that serves as a face for your local LLMs (like Ollama or LM Studio). It intercepts LLM traffic, plays spoken responses in real-time with synchronized mouth animations, and simulates keyboard typing from speech-to-text.

## Features
- **Retro CRT Shader**: Real-time GLSL post-processing with scanlines, chromatic aberration, grain, and screen curvature.
- **Dynamic Lip-Syncing**: Mouth shapes (`u`, `o`, `i`, `e`, `a`, `a1`, `a2`) react dynamically to the volume level of the TTS voice.
- **Speech-to-Text (STT) typing**: Dictate with Push-to-Talk (`Control + Space` hotkey) or Always Listening mode; it types the transcribed text directly into your active window.
- **Axum Proxy Server**: Operates a local API proxy on port `11430` that forwards completions to your local LLM backend.

---

## Setup Guide (Linux & macOS)

### 1. Install System Prerequisites
Before running the application, ensure you have the required build tools and runtimes.

#### On macOS:
Open terminal and install Xcode Command Line Tools:
```bash
xcode-select --install
```
Make sure you have Node.js (v20+ or v22+) and Python 3 installed. You can install them via [Homebrew](https://brew.sh/):
```bash
brew install node rust python
```

#### On Linux (Ubuntu / Mint / Debian):
```bash
sudo apt-get update && sudo apt-get install -y \
  build-essential libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev \
  librsvg2-dev pkg-config libasound2-dev python3
```
Install Node.js (v20+) and Rust:
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

---

### 2. Clone the Repository & Install Dependencies
```bash
git clone https://github.com/bluelotus1407-beep/VOXFACE.git
cd VOXFACE
npm install
```

---

### 3. Download Models and Binaries
Run the setup script to download the ONNX voice models, VAD libraries, and compile `whisper.cpp` natively for your system architecture (Intel/Apple Silicon/x86):
```bash
python3 download_resources.py
```

#### ⚠️ macOS Specific Step (Piper TTS Binary)
The download script fetches the default Linux x86_64 version of the Piper speech binary. To run speech on a Mac:
1. Go to the [Rhasspy Piper Releases Page](https://github.com/rhasspy/piper/releases/tag/v1.2.0).
2. Download the package for your Mac architecture:
   - For Apple Silicon (M1/M2/M3/M4): `piper_macos_aarch64.tar.gz`
   - For Intel Macs: `piper_macos_x64.tar.gz`
3. Extract the tarball, copy the `piper` executable and library files, and place them inside the `src-tauri/resources/piper/` directory (overwriting the Linux placeholder).

---

### 4. Running the Widget
Once the models and binaries are in place, launch the widget in developer mode:
```bash
npm run dev
```

And in a separate terminal tab, start the Tauri desktop client:
```bash
npm run tauri dev
```

### 5. Connecting to your Local LLM
1. Run your local model server (e.g. **LM Studio** or **Ollama** on port `11434` or `1234`).
2. Double-click the CRT screen bezel to slide down the **System Setup** panel.
3. Configure your LLM Port, model name, and backend URL.
4. Set your LLM Client to communicate through the VOXFACE proxy port (`http://localhost:11430`) instead of the direct LLM port. VOXFACE will capture the streaming completions, speak them, and animate the face!
