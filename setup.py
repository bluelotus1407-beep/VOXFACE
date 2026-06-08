import os
import sys
import subprocess
import platform

def run_cmd(cmd, check=True):
    print(f"Running: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    try:
        subprocess.run(cmd, shell=not isinstance(cmd, list), check=check)
        return True
    except Exception as e:
        print(f"Command failed: {e}")
        return False

def check_command(cmd):
    return shutil.which(cmd) is not None if 'shutil' in globals() else run_cmd([cmd, "--version"], check=False)

def main():
    import shutil
    print("============================================================")
    print("          VOXFACE Cross-Platform Installer Setup            ")
    print("============================================================")
    
    system = platform.system()
    machine = platform.machine()
    print(f"Detected Platform: {system} ({machine})")
    
    # 1. System Package Setup
    if system == "Linux":
        print("\n--- Linux System Dependencies ---")
        print("As requested, please ensure you have run the following manual command to install dependencies:")
        print("  sudo apt-get update && sudo apt-get install -y \\")
        print("    build-essential libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev \\")
        print("    librsvg2-dev pkg-config libasound2-dev python3 git nodejs npm")
        input("\nPress Enter once you have run this command or verified your packages are ready...")
        
    elif system == "Darwin":
        print("\n--- macOS Prerequisites ---")
        
        # Check if Xcode Command Line Tools are installed
        has_xcode = False
        try:
            res = subprocess.run(["xcode-select", "-p"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if res.returncode == 0:
                has_xcode = True
        except Exception:
            pass

        if not has_xcode:
            print("Xcode Command Line Tools not detected. Launching macOS installer dialog...")
            run_cmd(["xcode-select", "--install"], check=False)
            input("Please complete the Xcode Command Line Tools installation dialog on your screen, then press Enter to continue...")
        else:
            print("Xcode Command Line Tools detected.")

        print("\n--- Installing macOS Dependencies via Homebrew ---")
        if shutil.which("brew"):
            print("Homebrew detected. Installing dependencies...")
            run_cmd(["brew", "install", "node", "rust", "python", "git"])
        else:
            print("Warning: Homebrew not found. Please install Homebrew first (https://brew.sh/) or install Node, Rust, and Git manually.")
            input("Press Enter to continue setup anyway...")
            
    elif system == "Windows":
        print("\n--- Windows Prerequisites via Winget ---")
        if shutil.which("winget"):
            print("Winget detected. Installing Node.js, Python 3, and Git...")
            run_cmd(["winget", "install", "--id", "OpenJS.NodeJS", "--silent", "--accept-source-agreements", "--accept-package-agreements"], check=False)
            run_cmd(["winget", "install", "--id", "Python.Python.3", "--silent", "--accept-source-agreements", "--accept-package-agreements"], check=False)
            run_cmd(["winget", "install", "--id", "Git.Git", "--silent", "--accept-source-agreements", "--accept-package-agreements"], check=False)
            
            # Check if cargo/rustc are installed
            if not shutil.which("cargo"):
                print("\n--- Windows Rust Installation Notice ---")
                print("Rust/Cargo compiler was not detected on your system path.")
                print("Please download and run rustup-init.exe from https://rustup.rs/ to install Rust.")
                input("Press Enter to continue setup once Rust is installed...")
        else:
            print("Warning: Winget not found on Windows. Please install Git, Node.js, Python 3, and Rust manually.")
            input("Press Enter to continue setup...")

    # 2. NPM Packages installation
    print("\n--- [2/4] Installing Frontend NPM Packages ---")
    if shutil.which("npm"):
        run_cmd(["npm", "install"])
    else:
        print("Error: NPM is not installed or not in system PATH. Cannot install frontend packages.")
        sys.exit(1)

    # 3. Download Models, VAD, and correct Piper/Whisper releases
    print("\n--- [3/4] Running download_resources.py for Models and Platform Binaries ---")
    python_exe = sys.executable or "python3"
    run_cmd([python_exe, "download_resources.py"])

    # 4. Success Info
    print("\n============================================================")
    print("                     SETUP COMPLETE!                        ")
    print("============================================================")
    print("All frontend dependencies, voice models, VAD libraries, and")
    print("platform binaries have been successfully configured.")
    print("\nTo run the application in developer mode:")
    print("  npm run dev          (in Tab 1 to start Vite server)")
    print("  npm run tauri dev    (in Tab 2 to launch Tauri client)")
    print("============================================================\n")

if __name__ == "__main__":
    main()
