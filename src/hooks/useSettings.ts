import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface Settings {
  proxyPort: number;
  backendUrl: string;
  llmModel: string;
  ttsEngine: string;
  ttsVoice: string;
  ttsSpeed: number;
  ttsPitch: number;
  sttMode: string;
  wakeWord: string;
  sttModel: string;
  pttHotkey: string;
  faceSkin: string;
  scanlines: boolean; // Rust uses bool, TS parses it
  curvature: boolean;
  chromaticAberration: boolean;
  grain: boolean;
  volume: number;
  mute: boolean;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    try {
      const data = await invoke<Settings>("get_settings");
      setSettings(data);
    } catch (err) {
      console.error("Failed to load settings from Tauri backend:", err);
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (newSettings: Settings) => {
    try {
      setSettings(newSettings);
      await invoke("update_settings", { settings: newSettings });
    } catch (err) {
      console.error("Failed to update settings:", err);
    }
  };

  useEffect(() => {
    fetchSettings();

    // Listen for updates from other parts of the app
    let unlistenFn: (() => void) | null = null;
    const setupListener = async () => {
      unlistenFn = await listen<Settings>("settings-updated", (event) => {
        setSettings(event.payload);
      });
    };
    setupListener();

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  return { settings, updateSettings, loading };
}
export type { Settings as ISettings };
