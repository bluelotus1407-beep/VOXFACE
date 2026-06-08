import os
import sys
import urllib.request
import tarfile
import zipfile
import shutil

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
        urllib.request.urlretrieve(url, dest)
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
    
    dest_path = os.path.join(RESOURCES_DIR, "whisper", "whisper-cli")
    if os.path.exists(dest_path):
        print(f"Already exists: {dest_path}")
        return
        
    print("whisper-cli not found. Building from source...")
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
    # Download piper standalone Linux x86_64 binary
    piper_url = "https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_amd64.tar.gz"
    tar_dest = os.path.join(RESOURCES_DIR, "piper", "piper.tar.gz")
    
    if download_file(piper_url, tar_dest):
        try:
            print("Extracting piper...")
            temp_extract = os.path.join(RESOURCES_DIR, "piper", "temp_tar")
            os.makedirs(temp_extract, exist_ok=True)
            with tarfile.open(tar_dest, "r:gz") as tar:
                tar.extractall(temp_extract)
            
            # Copy piper executable and libraries
            # Inside tar: piper/piper, piper/lib*, piper/voice*
            piper_extracted_dir = os.path.join(temp_extract, "piper")
            if os.path.exists(piper_extracted_dir):
                for item in os.listdir(piper_extracted_dir):
                    s = os.path.join(piper_extracted_dir, item)
                    d = os.path.join(RESOURCES_DIR, "piper", item)
                    if os.path.isdir(s):
                        if os.path.exists(d):
                            shutil.rmtree(d)
                        shutil.copytree(s, d)
                    else:
                        shutil.copy2(s, d)
                        if item == "piper":
                            os.chmod(d, 0o755)
                print("piper extracted successfully.")
            
            shutil.rmtree(temp_extract)
            os.remove(tar_dest)
        except Exception as e:
            print(f"Failed to extract piper tar: {e}")
            
    # Download default voice model: en_US-lessac-medium
    voice_url = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
    voice_config_url = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
    download_file(voice_url, os.path.join(RESOURCES_DIR, "piper", "en_US-lessac-medium.onnx"))
    download_file(voice_config_url, os.path.join(RESOURCES_DIR, "piper", "en_US-lessac-medium.onnx.json"))

def setup_kokoro():
    print("\n--- Setting up Kokoro TTS ---")
    onnx_url = "https://huggingface.co/onnx-community/Kokoro-82M-ONNX/resolve/main/onnx/model.onnx"
    download_file(onnx_url, os.path.join(RESOURCES_DIR, "kokoro", "kokoro-82M.onnx"))
    
    # Download default voice: af_bella.bin
    voice_url = "https://huggingface.co/onnx-community/Kokoro-82M-ONNX/resolve/main/voices/af_bella.bin"
    download_file(voice_url, os.path.join(RESOURCES_DIR, "kokoro", "voices", "af_bella.bin"))
    
    # We will write a placeholder shell script or download a precompiled kokoro-cli if available,
    # or compile it. Since kokoro C++ CLI builds are newer, we can also check if a precompiled
    # CLI binary exists, or tell the user how to place it.
    # In Option A, if the binary is missing, we fallback to system CLI or print instructions.
    print("Kokoro model and voice downloaded. If you want to use Kokoro as primary TTS,")
    print("please install kokoro C++ CLI locally or place kokoro-cli in resources/kokoro/.")

def main():
    create_dirs()
    setup_vad()
    setup_whisper()
    setup_piper()
    setup_kokoro()
    print("\nResource download phase complete!")

if __name__ == "__main__":
    main()
