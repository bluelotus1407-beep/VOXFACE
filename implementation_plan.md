# Implementation Plan — Universal One-Click Setup Script (setup.py)

This plan outlines the creation of a unified `setup.py` bootstrapping script that automates the installation of all system libraries, compiler tools, runtime dependencies (Node.js, Rust), NPM packages, and machine learning models across Linux, macOS, and Windows with a single command.

## Proposed Changes

### Component 1: Automatic OS-Specific Resource Downloader

Currently, `download_resources.py` only downloads the Linux x86_64 binary for Piper TTS, requiring macOS and Windows users to manually fetch and extract zip/tar releases.
We will update `download_resources.py` to detect the OS and CPU architecture and download the corresponding correct precompiled binary (Mac Apple Silicon, Mac Intel, Windows x64, or Linux).

#### [MODIFY] [download_resources.py](file:///home/ladominate/Documents/VOXFACE/download_resources.py)
- Import `platform` and `zipfile`.
- Detect OS (`platform.system()`) and CPU arch (`platform.machine()`).
- Select the appropriate Piper release package from Rhasspy's GitHub repository:
  - **Linux x86_64**: `piper_amd64.tar.gz`
  - **macOS Apple Silicon (M1/M2/M3)**: `piper_macos_aarch64.tar.gz`
  - **macOS Intel**: `piper_macos_x64.tar.gz`
  - **Windows x64**: `piper_windows_amd64.zip`
- Extract tar.gz (on Linux/macOS) or zip (on Windows) programmatically, and copy the executable, dynamic libraries (`.so`, `.dylib`, or `.dll`), and voice support folders to `src-tauri/resources/piper/`.
- For Whisper on Windows: If compilation fails or `make` is missing, fallback to downloading the precompiled `whisper-cli.exe` from whisper.cpp releases.

---

### Component 2: Unified Bootstrapper Script (setup.py)

We will create a root-level `setup.py` script. Since Python 3 is pre-installed on Linux/macOS and easy to invoke, this script will act as the single command entry point.

#### [NEW] [setup.py](file:///home/ladominate/Documents/VOXFACE/setup.py)
A Python script that executes the following sequence:
1. **Detect OS**: Identifies Linux, macOS, or Windows.
2. **Install System Dependencies**:
   - **Linux**: Spawns `apt-get` to install build tools, WebKit, GTK, OpenSSL, and ALSA headers (prompts for `sudo` password).
   - **macOS**: Installs Homebrew packages (`node`, `rust`, `python`) if Homebrew is available.
   - **Windows**: Invokes `winget` to install Git, Node.js, Python, and Visual Studio C++ Build Tools.
3. **Install Rust (rustup)**: If Cargo is not installed on Linux/macOS, download and run the official `rustup` installer non-interactively (`sh -s -- -y`).
4. **Install NPM Packages**: Runs `npm install` to set up frontend packages.
5. **Download Models & Binaries**: Invokes the updated `download_resources.py` to download the VAD model, Whisper model, compile `whisper-cli` from source (or download precompiled for Windows), and extract the correct Piper TTS files.

---

## Verification Plan

### Manual Verification
1. Delete the `node_modules/` and `src-tauri/resources/` directories to simulate a clean clone.
2. Run the single command in terminal/PowerShell:
   ```bash
   python3 setup.py
   ```
3. Verify that:
   - System package managers are invoked correctly.
   - NPM packages are installed (`node_modules` is populated).
   - `src-tauri/resources/` is fully populated with the correct platform binaries (Whisper, Silero VAD, and the correct macOS/Windows/Linux version of Piper TTS).
   - The application builds and runs successfully via `npm run tauri dev`.
