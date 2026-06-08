# Implementation Plan — Fix Mouth Animation (Vocal/Mouth Shape Sync)

This plan addresses the issue where the mouth animation does not update during speech (remaining on the neutral closed face) even though the TTS engine is sending audio data.

## User Review Required

> [!IMPORTANT]
> **No Asset Changes Required**:
> The assets are already correctly named and in sync between the root `assets` folder and `src/assets`. The app builds successfully without missing files.
> The issue is entirely logical: a stale closure in React prevents the `tts:amplitude` subscription from reading the updated `state` (which transitions to `"speaking"`).

## Proposed Changes

### Component: Mouth Animation (Vocal Sync)

In `src/components/Face.tsx`, the Tauri event listener for `"tts:amplitude"` is subscribed using `useTauriEvents` with an empty dependency array. This causes the callback to capture the initial `state` (which is `"idle"`).
When the LLM starts speaking and `state` changes to `"speaking"`, the event callback is still executing with the stale `state === "idle"` reference, causing the amplitude value to be ignored and set to `0` continuously.

We will resolve this by tracking the `state` in a React Ref (`stateRef`). Because refs do not create closures and are updated on every render, the event listener can read the most up-to-date state without needing to re-subscribe to Tauri's event emitter.

#### [MODIFY] [Face.tsx](file:///home/ladominate/Documents/VOXFACE/src/components/Face.tsx)
- Add a `stateRef` that mirrors the current `state`.
- Update the `useEffect` to synchronize `stateRef.current = state`.
- Modify the `useTauriEvents` listener for `"tts:amplitude"` to check `stateRef.current` instead of `state`.

---

## Verification Plan

### Manual Verification
1. Run the Tauri application in dev mode: `npm run tauri dev`.
2. Connect to the local LLM and send a message.
3. Once the LLM starts responding and the voice speaks, verify that the face mouth shapes transition dynamically between `u`, `o`, `i`, `e`, `a`, `a1`, and `a2` based on the volume amplitude.
4. Verify that when speech finishes, the mouth returns to the closed `neutral` shape.
