# Walkthrough - VOXFACE Widget Size, Face Sizing, Focus Lock, and Drag Fixes

We have successfully resolved the focus lock issues, stabilized dragging, and fine-tuned visual alignment:

### 1. Drag Grab & Conflict Resolution
- **Removed Conflicting Native Drag Regions (`src/App.tsx`, `src/components/CRTFrame.tsx`)**: Removed `data-tauri-drag-region` from all elements where our custom programmatic drag hooks were active. This prevents dual native and programmatic drag-loops that were corrupting the X11 window manager's pointer grab and lockup.
- **Safety Mouse Checks (`src/hooks/useWindowDrag.ts`)**: Added `e.buttons !== 1` checks to the programmatic `onMove` event handler. If the mouse button is already released when the event is processed, the programmatic drag is aborted immediately. This prevents calling `startDragging()` with a released pointer, which causes permanent X11 grab locks.

### 2. Focus-Lock Resolution (Click-through outside Widget)
- **Dynamic Window Focusability (`src/App.tsx`)**: Toggled accepting focus dynamically based on both state and hover:
  - Configure the window to be non-focusable (`focusable: false`, `focus: false`) by default in [tauri.conf.json](file:///home/ladominate/Documents/VOXFACE/src-tauri/tauri.conf.json) on startup.
  - While settings are open, the window is set to **focusable** (`setFocusable(true)`) *only* when the cursor hovers inside the widget bounds.
  - When the cursor leaves the widget bounds (or settings are closed), the window is immediately set back to **non-focusable** (`setFocusable(false)`).
  - This prevents the widget from holding a focus lock when the user's cursor is elsewhere, allowing other windows to be focused and clicked immediately.

### 3. Face & Frame Visual Alignment
- **Shader Zoom Adjustment (`src/shaders/crt.frag.glsl`)**: Adjusted the zoom factor in `crt.frag.glsl` from `1.2` to `1.1` to reduce the black space around the face. The green face is now slightly larger and occupies more screen space while retaining its central placement inside the monitor bounds.
- **Bezel Layer Masking (`src/components/CRTFrame.tsx`)**: Changed the z-index layers so that the bezel artwork (`zIndex: 3`) sits on top of the main content container and the black screen (`zIndex: 2`). Since the bezel has a transparent screen cutout, the face renders correctly inside the CRT window, while the opaque plastic frame perfectly masks any bottom screen container overlap (preventing the black overlay from oozing over the bottom buttons).

### 4. Mouth Animation Vocal Sync Fix
- **Prevented Stale React Closures (`src/components/Face.tsx`)**: The Tauri event listener for `"tts:amplitude"` was capturing the initial `"idle"` state due to an empty dependency array. We added a `stateRef` which is synchronized to `state` on every render. The callback now reads from `stateRef.current` dynamically, allowing it to correctly identify when the state becomes `"speaking"`. This successfully maps incoming volume amplitudes (0–7) to the appropriate mouth shapes (`u`, `o`, `i`, `e`, `a`, `a1`, `a2`), producing a fluid lip-sync animation.

---

## Verification Results

### 1. Build Verification
- **Frontend Build**: `npm run build` compiles successfully.
- **Rust compilation**: `cargo check` compiles successfully.

### 2. Geometry & State Transitions
- **Idle State**: Correctly maps to `56x56` geometry on startup and is set to non-focusable.
- **Settings State**: Successfully expands to `360x530` geometry and accepts focus for inputs only when hovered.
