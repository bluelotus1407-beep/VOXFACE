# VOXFACE Widget Optimization & Refinement Plan

This implementation plan outlines a 6-phase roadmap to resolve the 11 visual, behavioral, and performance issues identified in the VOXFACE desktop widget. The plan prioritizes **ultra-low CPU and RAM loading** to ensure the widget runs quietly in the background without sacrificing its retro aesthetic.

---

## User Review Required

> [!IMPORTANT]
> **Performance Optimization Strategy (CPU & RAM):**
> 1. **Texture Pre-loading & Caching:** We will load all PNG textures *once* when the widget initializes. This will completely eliminate the millisecond white screen flash (caused by destroying and recreating the WebGL context/textures on every state change) and dramatically reduce CPU usage.
> 2. **Static WebGL Sleep:** We will pause the Three.js `requestAnimationFrame` loop when the widget is expanded but static (no active voice synthesis or eye gaze shifts). This reduces idle CPU usage to 0%.
> 3. **WebGL Bypass for Mini-Icon:** We will unmount the WebGL canvas completely when the widget is in its mini-icon (idle) state. The mini-icon will instead display styled, glowing HTML text ("VOX"), which drops CPU and RAM consumption to near-zero when collapsed.

> [!WARNING]
> **Keyboard Shortcut Handling:**
> Native OS global hotkey APIs (RegisterHotKey on Windows, Carbon/Cocoa on macOS, and X11 GrabKey on Linux) only trigger events on key-down. To implement a global **Hold-to-Talk** shortcut, we will use Tauri v2's native `tauri-plugin-global-shortcut` handler, which listens to key-release events. On macOS, this requires the application to have Accessibility permissions.

---

## Open Questions

> [!IMPORTANT]
> Please review the following design questions:
> 1. **Vowel Lip-Sync Algorithm:** Since the local audio stream does not contain phoneme-level timestamp metadata, we propose mapping the vowel sequence directly from the text of the reply. When the audio is active (RMS amplitude > 0), the mouth shape will cycle through the text vowels (A, E, I, O, U) sequentially. Does this text-based interpolation sound good, or would you prefer a different mechanism?
> 2. **Voice Selection:** We will download three new male voices. For Piper, we propose `en_US-danny-low` (gravelly/rusty), `en_US-joe-medium` (warm/soothing), and `en_GB-alan-low` (higher-pitch/mimic-mimicking). For Kokoro, we propose `bm_george` (older UK male) and `am_michael` (soothing). Do you want to review other voice samples?
> 3. **Mini-Icon Glow color:** When the mini-icon is hovered over, we will replace the pixelated square background with a circular glow matching the phosphor skin color. Do you have any preferences for the glow intensity?

---

## Proposed Changes

### Phase 1: Bezel Layout, Star Button & Rings Removal (Problems 1 & 2)
* **Goal**: Remove unnecessary outer lines and relocate the microphone button and status LED dot directly onto the physical CRT frame.
* **Proposed Changes**:
  - Remove `AudioRing.tsx` and all references to it in `App.tsx` and `App.css`. This saves GPU rendering cycles.
  - Modify `MicButton.tsx` to render a small, text-less circle of the exact same size as the printed star, located directly next to the star on the bottom-right of the CRT bezel.
  - Integrate the top-right `StatusDot` (mic status LED) directly into this new circular button. The button's glow color will reflect the microphone state (Green = Always Listening, Amber = Push-to-Talk, Red = Muted/Off) and show the standard hover text tooltip.

#### [MODIFY] [App.tsx](file:///home/ladominate/Documents/VOXFACE/src/App.tsx)
- Remove `AudioRing` imports and rendering.
- Update positioning layout for `MicButton` and `StatusDot` to place them on the bottom bezel.

#### [MODIFY] [MicButton.tsx](file:///home/ladominate/Documents/VOXFACE/src/components/MicButton.tsx)
- Remove text label rendering.
- Change button layout to a small circle with matching dimensions to the bezel star.
- Bind background color and glow styles to current state colors.

#### [DELETE] [AudioRing.tsx](file:///home/ladominate/Documents/VOXFACE/src/components/AudioRing.tsx)
- Delete the file since outer waveform rings are removed.

---

### Phase 2: Screen Size Expansion & Goggle Motion Tuning (Problems 5 & 6)
* **Goal**: Expand the inner CRT face display area and make eye/goggle shifts slow, randomized, and low-overhead.
* **Proposed Changes**:
  - Increase inner screen size: Update `CRTFrame.tsx` absolute percentage position (`left`, `top`, `width`, `height`) to expand the screen bounds, reducing black gap size.
  - Goggle shift tuning: Move the gaze shift calculation out of the fragment shader and into React state. We will pass the eye shifts to the shader via uniforms `uGazeShiftX` and `uGazeShiftY`.
  - Use a random timer in `Face.tsx` to trigger a gaze shift (under 5 seconds) after a random idle period, smoothly interpolating the position.
  - **CPU Optimizations**: If no gaze shift is active, the face state is static, and the TTS engine is idle, pause the WebGL render loop.

#### [MODIFY] [CRTFrame.tsx](file:///home/ladominate/Documents/VOXFACE/src/components/CRTFrame.tsx)
- Adjust the dimensions of the inner screen div to fit larger within the CRT bezel.

#### [MODIFY] [Face.tsx](file:///home/ladominate/Documents/VOXFACE/src/components/Face.tsx)
- Implement state-based variables for gaze offset.
- Add a timer/LERP loop for eye shifts.
- Throttle/pause the WebGL render loop when state is idle and gaze is stationary.

#### [MODIFY] [crt.frag.glsl](file:///home/ladominate/Documents/VOXFACE/src/shaders/crt.frag.glsl)
- Replace static `sin(uTime)` pupil shift with uniform-driven offsets `uGazeShiftX` and `uGazeShiftY`.

---

### Phase 3: Keyboard Hold-to-Talk & STT Mode Repair (Problem 3)
* **Goal**: Convert key shortcut to a true global Hold-to-Talk mechanism and ensure microphone commands work in the mini-icon state.
* **Proposed Changes**:
  - Update `stt.rs` to register the hotkey using `tauri-plugin-global-shortcut`.
  - Listen for both `ShortcutState::Pressed` (triggers `start_recording`) and `ShortcutState::Released` (triggers `stop_recording`) for a true hold-to-talk experience.
  - Map `Right Ctrl` on Windows/Linux and `Right Cmd` (`Code::MetaRight`) on macOS.
  - **Self-Listening Prevention**: Mute/discard mic input samples during TTS playback to avoid audio feedback loops.
  - Fix Tauri unlisten leaks by wrapping the frontend listeners in a clean, cancelable lifecycle ref.

#### [MODIFY] [stt.rs](file:///home/ladominate/Documents/VOXFACE/src-tauri/src/stt.rs)
- Refactor global shortcut builder callbacks to trigger on both key press and release states.
- Map shortcuts based on OS (ControlRight vs MetaRight).
- Skip CPAL audio capture buffer writing when `tts` state is active.

#### [MODIFY] [useTauriEvents.ts](file:///home/ladominate/Documents/VOXFACE/src/hooks/useTauriEvents.ts)
- Guard async subscriptions to ensure listeners are safely cleaned up if unmounted before resolution.

---

### Phase 4: Mini-Icon cleanup, Auto-Collapse & Transitions (Problems 9 & 10)
* **Goal**: Fix mini-icon boundary cuts, replace the face with glowing "VOX" text, reduce glitching CPU load, and implement a 10-second inactivity timer.
* **Proposed Changes**:
  - Mini-icon clipping: Increase the collapsed Tauri window size to `80x80` (retaining the circular widget at `56x56` with centered padding). This prevents the outer boundary from clipping the shadow glow or scale transitions.
  - Bypassing WebGL: If `state === "idle"`, render styled glowing HTML text ("VOX") inside the circle, unmounting the heavy Three.js canvas.
  - Glitching: Implement lightweight CSS keyframe filters (skew, flicker, text-shadow shifts) to trigger rare, random glitch effects instead of constant 60fps WebGL updates.
  - Inactivity timer: Add a hook that checks for 10 seconds of idle time (no user mouse/keyboard input, no TTS audio output, settings closed) and transitions the widget back to the mini-icon.
  - Transitions: Animate widget expansion and collapse using CSS scale and opacity transitions, rather than harsh OS window size snaps.

#### [MODIFY] [App.tsx](file:///home/ladominate/Documents/VOXFACE/src/App.tsx)
- Resize collapsed window to `80x80`.
- Replace `<Face>` in `state === "idle"` with a glowing HTML text component.
- Add window drag/transition CSS classes.

#### [MODIFY] [App.css](file:///home/ladominate/Documents/VOXFACE/src/App.css)
- Add styles for the mini-icon "VOX" text, circular hover shadow, and transition animations.

#### [MODIFY] [useWidgetState.ts](file:///home/ladominate/Documents/VOXFACE/src/hooks/useWidgetState.ts)
- Extend inactivity timer to 10 seconds.
- Add activity listeners (mouse move, clicks, hotkey inputs) to reset the collapse timer.

---

### Phase 5: Lip Sync Refinement & Male Voice Customization (Problems 4, 7 & 8)
* **Goal**: Refine vowel mouth animations without stutters, replace default female voices, and support character expressions.
* **Proposed Changes**:
  - Stutter/White Flash Fix: Refactor `Face.tsx` to load all textures *once* on initialization. Swap active textures using uniform texture bindings, preventing re-creations.
  - Vowel Lip-Sync: Implement character-based vowel extraction in the frontend. Match the active vowel shape to the current speaking segment, scaling shape opening with amplitude.
  - Voice Updates: Update `download_resources.py` to fetch:
    - Piper: `en_US-danny-low` (rusty), `en_US-joe-medium` (soothing), `en_GB-alan-low` (shrill).
    - Kokoro: `bm_george` (rusty UK), `am_michael` (soothing), `am_adam` (shrill/mimic).
  - Expressions: Parse the LLM text output for special tags (e.g. laughter, smiling expressions) and trigger corresponding expression frames (smile1, smile2, laugh) on the canvas.

#### [MODIFY] [download_resources.py](file:///home/ladominate/Documents/VOXFACE/download_resources.py)
- Download the selected male voices ONNX and config files.

#### [MODIFY] [SettingsPanel.tsx](file:///home/ladominate/Documents/VOXFACE/src/components/SettingsPanel.tsx)
- Update dropdown options for Kokoro and Piper voices to only expose the new male voices.

#### [MODIFY] [Face.tsx](file:///home/ladominate/Documents/VOXFACE/src/components/Face.tsx)
- Pre-load and cache all PNG textures on mount.
- Add vowel-interpolation logic based on speaking text and amplitude.
- Integrate smile/laugh expressions triggered by LLM responses.

---

### Phase 6: Right-Click Context Menu (Problem 11)
* **Goal**: Implement standard desktop controls via a styled, retro-themed context menu.
* **Proposed Changes**:
  - Add an `onContextMenu` React handler to both the mini-icon and the big widget.
  - Prevent default browser behaviors and display a glowing monospace dropdown menu.
  - Support context actions: **Reload Widget**, **System Setup (Settings)**, **Mute/Unmute**, and **Exit VOXFACE**.

#### [NEW] [ContextMenu.tsx](file:///home/ladominate/Documents/VOXFACE/src/components/ContextMenu.tsx)
- A reusable component rendering a styled context menu showing control options.

#### [MODIFY] [App.tsx](file:///home/ladominate/Documents/VOXFACE/src/App.tsx)
- Render the `ContextMenu` and bind it to the right-click mouse events.

---

## Verification Plan

### Automated Tests
- Run `npm run build` to verify Webpack compilation, TypeScript safety, and bundling.
- Run `cargo build` in `src-tauri` to verify Rust code correctness.

### Manual Verification
1. **Phase 1 Bezel & Rings**: Verify outer rings are removed. Check that the small circular button next to the star glows Green, Amber, or Red depending on STT mode.
2. **Phase 2 Screen Size & Gaze**: Verify the face screen occupies a larger frame size. Check that goggles make brief, random, slow shifts and pause rendering when stationary. Verify CPU usage drops to 0%.
3. **Phase 3 Hold-to-Talk & VAD**: Hold down `Right Ctrl` (or `Right Cmd` on macOS) in both expanded and mini-icon states. Verify that it records only while held and transcribes upon release. Speak to the mini-icon in Always Listening mode and verify it expands.
4. **Phase 4 Mini-Icon & Collapse**: Verify the mini-icon renders as a complete circle with no top/left clipping. Verify that the square hover shadow is replaced by a circular glow. Test that the widget collapses back to the mini-icon after 10 seconds of inactivity.
5. **Phase 5 Lip Sync & Male Voices**: Speak to the widget and verify that mouth shapes transition smoothly without white flashes, matching the vowel shapes. Verify that only male voices are listed in Settings and that they play successfully.
6. **Phase 6 Context Menu**: Right-click the widget and verify that the context menu appears, and that clicking "Reload Widget" or "Exit VOXFACE" functions correctly.
