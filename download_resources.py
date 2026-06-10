import os
import sys
import urllib.request
import tarfile
import zipfile
import shutil
import platform

# Resource target directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESOURCES_DIR = os.path.join(BASE_DIR, "src-tauri", "resources")

def create_dirs():
    os.makedirs(os.path.join(RESOURCES_DIR, "kokoro", "voices"), exist_ok=True)
    os.makedirs(os.path.join(RESOURCES_DIR, "piper"), exist_ok=True)
    os.makedirs(os.path.join(RESOURCES_DIR, "whisper"), exist_ok=True)
    os.makedirs(os.path.join(RESOURCES_DIR, "vad"), exist_ok=True)

def download_file(url, dest):
    if os.path.exists(dest):
        print(f"Already exists: {dest}")
        return True
    
    print(f"Downloading {url} to {dest}...")
    try:
        # Set User-Agent to avoid HTTP 403 on some CDNs (like GitHub releases or HF)
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req) as response, open(dest, 'wb') as out_file:
            shutil.copyfileobj(response, out_file)
        print("Download complete.")
        return True
    except Exception as e:
        print(f"Failed to download {url}: {e}")
        return False

def setup_vad():
    print("\n--- Setting up Silero VAD ---")
    vad_url = "https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx"
    dest = os.path.join(RESOURCES_DIR, "vad", "silero_vad.onnx")
    download_file(vad_url, dest)

def setup_whisper():
    print("\n--- Setting up Whisper.cpp ---")
    # Download tiny model
    model_url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin"
    model_dest = os.path.join(RESOURCES_DIR, "whisper", "ggml-tiny.en.bin")
    download_file(model_url, model_dest)
    
    system = platform.system()
    binary_name = "whisper-cli.exe" if system == "Windows" else "whisper-cli"
    dest_path = os.path.join(RESOURCES_DIR, "whisper", binary_name)
    if os.path.exists(dest_path):
        print(f"Already exists: {dest_path}")
        return
        
    print(f"{binary_name} not found. Building or downloading...")
    
    if system == "Windows":
        # On Windows, compiling is complex, so download the precompiled whisper-cli.exe directly
        # from the whisper.cpp v1.7.1 release (CPU-only build to avoid CUDA requirements)
        whisper_win_url = "https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.1/whisper-bin-x64.zip"
        zip_dest = os.path.join(RESOURCES_DIR, "whisper", "whisper_win.zip")
        if download_file(whisper_win_url, zip_dest):
            try:
                temp_extract = os.path.join(RESOURCES_DIR, "whisper", "temp_whisper")
                os.makedirs(temp_extract, exist_ok=True)
                with zipfile.ZipFile(zip_dest, "r") as zip_ref:
                    zip_ref.extractall(temp_extract)
                
                # In whisper.cpp releases, the executable is named 'main.exe'. Copy as 'whisper-cli.exe'
                main_exe = os.path.join(temp_extract, "main.exe")
                if os.path.exists(main_exe):
                    shutil.copy2(main_exe, dest_path)
                    os.chmod(dest_path, 0o755)
                    # Copy all .dll files (like libopenblas.dll)
                    for item in os.listdir(temp_extract):
                        if item.endswith(".dll"):
                            shutil.copy2(os.path.join(temp_extract, item), os.path.join(RESOURCES_DIR, "whisper", item))
                    print("whisper-cli (precompiled Windows) set up successfully.")
                else:
                    print("Could not find main.exe in the downloaded whisper release.")
                shutil.rmtree(temp_extract)
                os.remove(zip_dest)
            except Exception as e:
                print(f"Failed to extract precompiled whisper: {e}")
    else:
        # For Linux and macOS, compile from source
        import subprocess
        temp_dir = os.path.join(RESOURCES_DIR, "whisper", "temp_whisper_src")
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
            
        try:
            # Clone whisper.cpp tag v1.7.1
            subprocess.run(["git", "clone", "--depth", "1", "--branch", "v1.7.1", "https://github.com/ggml-org/whisper.cpp.git", temp_dir], check=True)
            # Run make main
            subprocess.run(["make", "main", "-C", temp_dir], check=True)
            # Copy main to resources/whisper/whisper-cli
            shutil.copy2(os.path.join(temp_dir, "main"), dest_path)
            os.chmod(dest_path, 0o755)
            print(f"whisper-cli built and copied to {dest_path}")
        except Exception as e:
            print(f"Failed to compile whisper.cpp: {e}")
        finally:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)

def setup_piper():
    print("\n--- Setting up Piper TTS ---")
    system = platform.system()
    machine = platform.machine().lower()

    is_mac_arm = system == "Darwin" and ("arm" in machine or "aarch64" in machine)

    if is_mac_arm:
        piper_url = "https://github.com/itsabhishekolkha/piper-arm-build/releases/download/v1.2.0/piper.arm64-no.deps.deps"
        dest = os.path.join(RESOURCES_DIR, "piper", "piper")
        if download_file(piper_url, dest):
            os.chmod(dest, 0o755)
            print("Piper static ARM64 binary configured successfully.")
    else:
        if system == "Linux":
            if "arm" in machine or "aarch64" in machine:
                piper_url = "https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_arm64.tar.gz"
            else:
                piper_url = "https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_amd64.tar.gz"
            archive_type = "tar.gz"
        elif system == "Darwin":
            # This is Intel Mac
            piper_url = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_macos_x64.tar.gz"
            archive_type = "tar.gz"
        elif system == "Windows":
            piper_url = "https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_windows_amd64.zip"
            archive_type = "zip"
        else:
            print(f"Unsupported system for Piper download: {system}")
            return

        # Download archive
        filename = "piper.tar.gz" if archive_type == "tar.gz" else "piper.zip"
        archive_dest = os.path.join(RESOURCES_DIR, "piper", filename)
        
        if download_file(piper_url, archive_dest):
            try:
                print(f"Extracting {filename}...")
                temp_extract = os.path.join(RESOURCES_DIR, "piper", "temp_extract")
                if os.path.exists(temp_extract):
                    shutil.rmtree(temp_extract)
                os.makedirs(temp_extract, exist_ok=True)
                
                if archive_type == "tar.gz":
                    with tarfile.open(archive_dest, "r:gz") as tar:
                        tar.extractall(temp_extract)
                else:
                    with zipfile.ZipFile(archive_dest, "r") as zip_ref:
                        zip_ref.extractall(temp_extract)
                
                # Copy piper files. In Rhasspy's release, everything is inside a 'piper/' subfolder.
                piper_extracted_dir = os.path.join(temp_extract, "piper")
                if not os.path.isdir(piper_extracted_dir):
                    piper_extracted_dir = temp_extract

                for item in os.listdir(piper_extracted_dir):
                    s = os.path.join(piper_extracted_dir, item)
                    d = os.path.join(RESOURCES_DIR, "piper", item)
                    if os.path.isdir(s):
                        if os.path.exists(d):
                            shutil.rmtree(d)
                        shutil.copytree(s, d)
                    else:
                        shutil.copy2(s, d)
                        if item in ["piper", "piper.exe"]:
                            os.chmod(d, 0o755)
                
                print("Piper extracted successfully.")
                shutil.rmtree(temp_extract)
                os.remove(archive_dest)
            except Exception as e:
                print(f"Failed to extract piper: {e}")
            
    # Download default voice model: en_US-lessac-medium
    voice_url = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
    voice_config_url = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
    download_file(voice_url, os.path.join(RESOURCES_DIR, "piper", "en_US-lessac-medium.onnx"))
    download_file(voice_config_url, os.path.join(RESOURCES_DIR, "piper", "en_US-lessac-medium.onnx.json"))

    # Download additional male voices for Phase 5
    piper_extra = [
        ("en/en_US/danny/low/en_US-danny-low.onnx", "en_US-danny-low.onnx"),
        ("en/en_US/danny/low/en_US-danny-low.onnx.json", "en_US-danny-low.onnx.json"),
        ("en/en_US/joe/medium/en_US-joe-medium.onnx", "en_US-joe-medium.onnx"),
        ("en/en_US/joe/medium/en_US-joe-medium.onnx.json", "en_US-joe-medium.onnx.json"),
        ("en/en_GB/alan/low/en_GB-alan-low.onnx", "en_GB-alan-low.onnx"),
        ("en/en_GB/alan/low/en_GB-alan-low.onnx.json", "en_GB-alan-low.onnx.json"),
    ]
    for src_path, dest_name in piper_extra:
        url = f"https://huggingface.co/rhasspy/piper-voices/resolve/main/{src_path}"
        download_file(url, os.path.join(RESOURCES_DIR, "piper", dest_name))

def setup_kokoro():
    print("\n--- Setting up Kokoro TTS ---")
    onnx_url = "https://huggingface.co/onnx-community/Kokoro-82M-ONNX/resolve/main/onnx/model.onnx"
    download_file(onnx_url, os.path.join(RESOURCES_DIR, "kokoro", "kokoro-82M.onnx"))
    
    # Download default voice: af_bella.bin
    voice_url = "https://huggingface.co/onnx-community/Kokoro-82M-ONNX/resolve/main/voices/af_bella.bin"
    download_file(voice_url, os.path.join(RESOURCES_DIR, "kokoro", "voices", "af_bella.bin"))

    # Download additional male voices for Phase 5
    kokoro_extra = ["bm_george.bin", "am_michael.bin", "am_adam.bin"]
    for voice in kokoro_extra:
        url = f"https://huggingface.co/onnx-community/Kokoro-82M-ONNX/resolve/main/voices/{voice}"
        download_file(url, os.path.join(RESOURCES_DIR, "kokoro", "voices", voice))
    
    print("Kokoro model and voice downloaded.")

def sync_to_build_targets():
    print("\n--- Syncing resources to active build targets ---")
    target_dirs = [
        os.path.join(BASE_DIR, "src-tauri", "target", "debug", "resources"),
        os.path.join(BASE_DIR, "src-tauri", "target", "release", "resources"),
    ]
    for target in target_dirs:
        if os.path.exists(target):
            print(f"Syncing resources to: {target}")
            try:
                for root, dirs, files in os.walk(RESOURCES_DIR):
                    rel_path = os.path.relpath(root, RESOURCES_DIR)
                    dest_dir = os.path.join(target, rel_path) if rel_path != "." else target
                    os.makedirs(dest_dir, exist_ok=True)
                    for file in files:
                        src_file = os.path.join(root, file)
                        dest_file = os.path.join(dest_dir, file)
                        shutil.copy2(src_file, dest_file)
            except Exception as e:
                print(f"Failed to sync to {target}: {e}")

def main():
    create_dirs()
    setup_vad()
    setup_whisper()
    setup_piper()
    setup_kokoro()
    sync_to_build_targets()
    print("\nResource download phase complete!")

if __name__ == "__main__":
    main()
