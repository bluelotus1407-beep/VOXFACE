# Walkthrough - VOXFACE Widget Refinements

This document summarizes the layout, visual, and behavioral improvements applied to the VOXFACE widget.

---

## Latest Updates: macOS Window Transparency and White Border Fix

We have successfully resolved the solid white background/border around the VOXFACE widget and mini-icon on macOS.

### 1. macOS Private APIs Configured
- Set `"macOSPrivateApi": true` in `tauri.conf.json` within the `"app"` section.
- Added the `macos-private-api` feature to the `tauri` dependency in `Cargo.toml`.
- Added the `objc = "0.2"` target-specific dependency for macOS in `Cargo.toml`.

### 2. Native macOS Transparency Applied
- Implemented an Objective-C runtime setup in `lib.rs` (compiled conditionally with `#[cfg(target_os = "macos")]`) that runs on startup.
- It retrieves the main window's `ns_window` pointer and programmatically calls:
  - `setBackgroundColor: NSColor.clearColor` (sets the underlying native macOS window background to fully transparent, removing the white border/canvas leaking around the edges).
  - `setOpaque: false` (notifies the macOS window server that the window is transparent).
  - `setHasShadow: false` (removes the default OS-level window shadow around the transparent bounding box).

---

## Historical Updates: Phase 4 — Mini-Icon Cleanup, Auto-Collapse & Transitions

We have successfully completed **Phase 4** of the plan:

### 1. Mini-Icon Clipping Resolution
- **Expanded Window Bounds**: Resized the collapsed Tauri window from `56x56` to `80x80`. This provides a transparent surrounding margin of `12px` that prevents the circular widget's shadow glows and scale animations from being cropped by native OS window boundaries.
- **Centered Layout**: Enclosed the circular widget in an `80x80` flexbox container to center it perfectly within the new transparent window frame.

### 2. WebGL Bypass (CPU/RAM Drop)
- **Unmounted Three.js Canvas**: Configured the widget to completely unmount the heavy Three.js `<Face />` component in the `"idle"` (collapsed) state.
- **Interactive CSS Mask Logo**: Replaced the canvas with a lightweight `div` displaying the `vox.png` logo utilizing CSS `mask-image`. 
  - Since it uses `backgroundColor: "currentColor"`, the logo automatically inherits the active phosphor skin color (Green, Amber, Red, White) and glows with `drop-shadow(0 0 4px currentColor)`.

### 3. Retro CSS Glitch Effect
- **GPU-Accelerated Glitches**: Implemented an 8-second looping keyframe animation (`logo-glitch`) on the inner logo mask. The animation stays completely static for 7.6 seconds, then executes a rapid 0.4-second retro glitch (random skews, scale shifts, and chromatic color shadows) using pure CSS, consuming virtually zero CPU.

### 4. 10-Second Inactivity Collapse Timer
- **Automatic Collapse Hook**: Added a window listener effect in `useWidgetState.ts` that triggers when the state is `"listening"`. If no user activity (mouse moves, clicks, keypresses) or TTS audio output is detected for 10 seconds (and the settings panel is closed), the widget automatically collapses to its `"idle"` mini-icon state.

### 5. Smooth Scaling Transitions
- **Slide-in / Slide-out Animations**: Added keyframe scale transitions for both window states:
  - Entering the expanded monitor state (`widget-enter`) scales it smoothly from `0.6` to `1.0` while fading in opacity.
  - Exiting to the collapsed state (`widget-exit`) scales the monitor down to `0.6` while fading it out.
- **Delayed Window Shrink**: Synchronized a deferred state `windowState` that waits 300ms for the collapse transition to finish playing before shrinking the OS window to `80x80`, avoiding clipping during the transition.

---

## Historical Updates: Phase 3 — Keyboard Hold-to-Talk & STT Mode Repair

We have successfully completed and polished **Phase 3** of the plan:

### 1. Global Keyboard Hold-to-Talk Implementation
- **Refactored Shortcut Handling**: Refactored `stt.rs` to register the `Ctrl + Space` combination via `tauri-plugin-global-shortcut`. This resolves X11/Linux OS-level mapping limitations that prevent bare modifier keys (like `Right Ctrl`) from registering as standalone global shortcuts.
- **True Hold-to-Talk Action**: Replaced the toggle model with a true Hold-to-Talk model by matching key-down events (`ShortcutState::Pressed` -> calls `start_recording`) and key-up events (`ShortcutState::Released` -> calls `stop_recording`).

### 2. Always Listening (VAD) Mode Repair
- **VAD Audio Draining Resolved**: Fixed a critical bug where the VAD loop continuously drained and discarded samples from `audio_buffer` for voice activity detection, leaving the buffer empty when Whisper transcription was triggered.
- **Pre-roll & Speech Buffers**: Implemented a 1.5-second pre-roll ring buffer (`pre_roll: VecDeque<f32>`) and a separate `speech_buffer: Vec<f32>`. When VAD detects speech, it prepends the pre-roll buffer to capture the beginning of the phrase, then collects all active speech, transcribing only the completed utterance upon 1.5 seconds of silence.
- **Silero VAD v5 ONNX Integration**: Resolved an ONNX session input error (`Invalid input name: h`) by migrating the inputs and outputs to match Silero VAD v5 specifications:
  - Inputs: `"input"` (`[1, 512]`), `"sr"` (scalar `16000`), and `"state"` (`[2, 1, 128]`).
  - Outputs: `"output"` (speech probability) and `"stateN"` (updated LSTM state).

### 3. Self-Listening Prevention
- **TTS Audio Interception**: Added `tts_active` flag inside `SttState` in Rust. When Kokoro/Piper voice generation plays audio on the default output stream in `tts.rs`, `tts_active` is locked and set to `true`.
- **Microphone Sample Muting**: Modified the `cpal` audio input capture stream callback inside `stt.rs` to immediately check `tts_active` and return/discard microphone samples if active. This prevents the agent from self-listening/feedback loops during verbal speech replies.

### 4. Lifecycle Guarding
- **Mount Guard for Tauri Event Subscriptions**: Refactored `useTauriEvents.ts` to keep track of hook mounting state. If the hook/component is unmounted before the async Tauri `listen` promise resolves, the registration is immediately aborted/unsubscribed, preventing ghost event listeners and memory leaks.

---

## Historical Updates: Phase 2 — Screen Size Expansion & Goggle Motion Tuning

We have successfully completed **Phase 2** of the plan:

### 1. Expanded Face Screen Boundaries
- **Adjusted Shader Zoom**: Zoomed in on the face texture inside `crt.frag.glsl` (adjusted `zoom` from `1.1` to `0.78`), making the face itself visually larger on the monitor and reducing the inner black borders. We preserved the original `CRTFrame.tsx` coordinates and z-indexes because the bezel background image (`crt.png`) has a solid black middle on X11, which would block the screen if layered on top.

### 2. Randomized Gaze Shifts & Subtle Amplitude
- **Created Uniform-based Shifts**: Added `uGazeShiftX` and `uGazeShiftY` uniforms to `crt.frag.glsl` and replaced the continuous high-speed sine wave scan with these controls.
- **Implemented Gaze State Machine**: Built a stateful gaze shifting loop in `Face.tsx` that alternates randomly between staring straight (2s - 6s duration) and scanning side-to-side (under 5s duration).
- **Reduced Amplitude**: Tuned the sweep amplitude to a maximum distance of `0.006` (under the `0.008` limit) and slowed down the cycle speed. Added smooth LERP transitions between states for a highly natural, subtle goggle shift.

---

## Historical Updates: Phase 1 — Bezel Layout, Star Button & Rings Removal

We have successfully completed **Phase 1** of the optimization and layout improvement plan:

### 1. Outer Audio Wave Rings Removal
- **Deleted `AudioRing.tsx`**: Removed the redundant SVG radial wave visualizer, saving CPU/GPU cycles during active speech.
- **Cleaned Up [App.tsx](file:///home/ladominate/Documents/VOXFACE/src/App.tsx)**: Removed all imports and rendering blocks of the `<AudioRing>` component.

### 2. Mic Status LED Dot Relocation
- **Repositioned [StatusDot.tsx](file:///home/ladominate/Documents/VOXFACE/src/components/StatusDot.tsx)**: Shifted the status LED indicator from `right: "26px"` to `right: "62px"`. This positions it directly on the plastic bezel in the top-right corner of the physical CRT monitor frame instead of floating in the outer margin.

### 3. Hold-to-Talk Button Re-design & Placement
- **Reshaped [MicButton.tsx](file:///home/ladominate/Documents/VOXFACE/src/components/MicButton.tsx)**: Transformed the PTT button into a text-less circle of size `14px` by `14px` (matching the bezel buttons, making it easy to hover and click, while remaining tiny and proportional to the star printed on the bottom-right bezel).
- **Relocated [MicButton.tsx](file:///home/ladominate/Documents/VOXFACE/src/components/MicButton.tsx)**: Placed the circular button at `top: "215px", left: "262px"`. This aligns it beside the star and directly overlays the printed green LED dot on the bottom-right bezel, creating a realistic, interactive hardware button.
- **Preserved Functionality**: Maintained the click/touch event handlers and tooltips (the hover messages explaining STT modes remain intact).

---

## Historical Walkthrough (Previous Drag, Focus & Sizing Fixes)

### 1. Drag Grab & Conflict Resolution
- **Removed Conflicting Native Drag Regions**: Removed `data-tauri-drag-region` from elements where programmatic drag hooks were active. This prevents dual native and programmatic drag-loops that were corrupting pointer grabbing.
- **Safety Mouse Checks**: Added `e.buttons !== 1` checks to the programmatic `onMove` event handler to prevent permanent X11 grab locks if the mouse is released mid-movement.

### 2. Focus-Lock Resolution (Click-through outside Widget)
- **Dynamic Window Focusability**: Toggled focusability dynamically based on hover and state. The window is non-focusable by default on startup. While settings are open, it accepts focus *only* when the cursor hovers inside the widget bounds.

### 3. Face & Frame Visual Alignment
- **Shader Zoom Adjustment**: Adjusted the zoom factor in `crt.frag.glsl` from `1.2` to `1.1` to scale the face larger inside the monitor bounds.
- **Bezel Layer Masking**: Placed the bezel artwork (`zIndex: 3`) on top of the main container and black screen (`zIndex: 2`) to mask screen boundaries cleanly.

### 4. Mouth Animation Vocal Sync Fix
- **Prevented Stale React Closures**: Used a `stateRef` synchronized to React state to allow the `"tts:amplitude"` Tauri event listener to correctly identify speaking states and map volume levels (0–7) to mouth shapes.

---

## Verification Results

### 1. Build Verification
- **Frontend Build**: `npm run build` compiles with 0 errors.
- **Tauri Bundle**: Checked TypeScript safety and Vite packaging; builds are fully correct.

### 2. Visual Alignment Check
- **Status Dot**: Neatly aligns on the top-right bezel corner.
- **PTT Button**: Neatly aligns to the left of the star, over the printed green LED, matching the star's visual size.
