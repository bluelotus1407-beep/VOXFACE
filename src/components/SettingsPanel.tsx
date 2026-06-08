import React from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { Settings } from "../hooks/useSettings";

interface SettingsPanelProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  settings: Settings | null;
  updateSettings: (newSettings: Settings) => void;
}

const KOKORO_VOICES = [
  { value: "af_bella", label: "Bella (Female)" },
  { value: "af_sarah", label: "Sarah (Female)" },
  { value: "am_adam", label: "Adam (Male)" },
  { value: "bf_emma", label: "Emma (Female UK)" },
  { value: "bm_george", label: "George (Male UK)" },
];

const PIPER_VOICES = [
  { value: "en_US-lessac-medium", label: "Lessac (Medium)" },
  { value: "en_US-joe-medium", label: "Joe (Medium)" },
  { value: "en_US-amy-low", label: "Amy (Low)" },
  { value: "en_GB-alan-low", label: "Alan (Low UK)" },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  setIsOpen,
  settings,
  updateSettings,
}) => {
  if (!settings) return null;

  // Dynamically resize Tauri window when settings panel is toggled
  const togglePanel = async (nextOpen: boolean) => {
    try {
      const appWindow = getCurrentWindow();
      if (nextOpen) {
        // Expand window height to accommodate settings panel below bezel
        await appWindow.setSize(new LogicalSize(360, 530));
      } else {
        // Shrink window height back to bezel size
        await appWindow.setSize(new LogicalSize(360, 270));
      }
      setIsOpen(nextOpen);
    } catch (err) {
      console.error("Failed to resize Tauri window:", err);
    }
  };

  const handleFieldChange = (key: keyof Settings, value: any) => {
    const updated = { ...settings, [key]: value };
    // If voice engine is toggled, default the voice selection
    if (key === "ttsEngine") {
      updated.ttsVoice = value === "Kokoro" ? KOKORO_VOICES[0].value : PIPER_VOICES[0].value;
    }
    updateSettings(updated);
  };

  const activeVoices = settings.ttsEngine === "Kokoro" ? KOKORO_VOICES : PIPER_VOICES;
  const skins = ["Green", "Amber", "White", "Red-Glitch"];

  return (
    <div
      style={{
        width: "360px",
        height: "260px",
        backgroundColor: "#18181b",
        border: "3px solid #27272a",
        borderTop: "none",
        borderBottomLeftRadius: "12px",
        borderBottomRightRadius: "12px",
        padding: "12px",
        boxSizing: "border-box",
        fontFamily: "'Courier New', Courier, monospace",
        color: "#ffffff",
        fontSize: "11px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        overflowY: "auto",
        transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        transform: isOpen ? "translateY(0)" : "translateY(-10px)",
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? "auto" : "none",
        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
      }}
      className="settings-scrollbar"
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #3f3f46", paddingBottom: "4px" }}>
        <span style={{ fontWeight: "bold", color: "#a1a1aa" }}>SYSTEM SETUP</span>
        <button
          onClick={() => togglePanel(false)}
          style={{
            background: "none",
            border: "none",
            color: "#ef4444",
            cursor: "pointer",
            fontWeight: "bold",
            padding: "0 4px",
          }}
        >
          [X]
        </button>
      </div>

      {/* Row 1: Port and Backend */}
      <div style={{ display: "flex", gap: "8px" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
          <label>PORT</label>
          <input
            type="number"
            value={settings.proxyPort}
            onChange={(e) => handleFieldChange("proxyPort", parseInt(e.target.value) || 11430)}
            className="retro-input"
          />
        </div>
        <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: "2px" }}>
          <label>BACKEND URL</label>
          <input
            type="text"
            value={settings.backendUrl}
            onChange={(e) => handleFieldChange("backendUrl", e.target.value)}
            className="retro-input"
          />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <label>LLM MODEL (LM Studio model id)</label>
        <input
          type="text"
          value={settings.llmModel ?? ""}
          onChange={(e) => handleFieldChange("llmModel", e.target.value)}
          className="retro-input"
          placeholder="liquid/lfm2.5-1.2b"
        />
      </div>

      {/* Row 2: TTS Engine and Voice */}
      <div style={{ display: "flex", gap: "8px" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
          <label>TTS ENGINE</label>
          <select
            value={settings.ttsEngine}
            onChange={(e) => handleFieldChange("ttsEngine", e.target.value)}
            className="retro-select"
          >
            <option value="Kokoro">Kokoro</option>
            <option value="Piper">Piper</option>
          </select>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
          <label>VOICE</label>
          <select
            value={settings.ttsVoice}
            onChange={(e) => handleFieldChange("ttsVoice", e.target.value)}
            className="retro-select"
          >
            {activeVoices.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 3: TTS Speed & Pitch */}
      <div style={{ display: "flex", gap: "8px" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
          <label>SPEED: {settings.ttsSpeed.toFixed(1)}x</label>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={settings.ttsSpeed}
            onChange={(e) => handleFieldChange("ttsSpeed", parseFloat(e.target.value))}
            className="retro-slider"
          />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
          <label>PITCH: {settings.ttsPitch > 0 ? `+${settings.ttsPitch}` : settings.ttsPitch}</label>
          <input
            type="range"
            min="-10"
            max="10"
            step="1"
            value={settings.ttsPitch}
            onChange={(e) => handleFieldChange("ttsPitch", parseInt(e.target.value))}
            className="retro-slider"
          />
        </div>
      </div>

      {/* Row 4: STT Mode & Wake Word */}
      <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
          <label>STT MODE</label>
          <select
            value={settings.sttMode}
            onChange={(e) => handleFieldChange("sttMode", e.target.value)}
            className="retro-select"
          >
            <option value="Off">Off</option>
            <option value="Always Listening">Always Listening</option>
            <option value="Push to Talk">Push to Talk</option>
          </select>
        </div>
        
        {settings.sttMode === "Always Listening" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
            <label>WAKE WORD</label>
            <input
              type="text"
              value={settings.wakeWord}
              onChange={(e) => handleFieldChange("wakeWord", e.target.value)}
              className="retro-input"
            />
          </div>
        )}

        {settings.sttMode === "Push to Talk" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
            <label>PTT HOTKEY</label>
            <input
              type="text"
              value={settings.pttHotkey}
              readOnly
              placeholder="Right Ctrl (Fixed)"
              className="retro-input"
              style={{ opacity: 0.6, cursor: "not-allowed" }}
            />
          </div>
        )}
      </div>

      {/* Row 5: Volume & Mute */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: "2px" }}>
          <label>VOLUME: {settings.volume}%</label>
          <input
            type="range"
            min="0"
            max="100"
            value={settings.volume}
            onChange={(e) => handleFieldChange("volume", parseInt(e.target.value))}
            className="retro-slider"
          />
        </div>
        <div style={{ flex: 1, display: "flex", gap: "4px", justifyContent: "center", alignItems: "center", height: "30px", marginTop: "12px" }}>
          <input
            type="checkbox"
            id="mute"
            checked={settings.mute}
            onChange={(e) => handleFieldChange("mute", e.target.checked)}
            style={{ accentColor: "#ef4444" }}
          />
          <label htmlFor="mute" style={{ cursor: "pointer", fontWeight: "bold" }}>MUTE</label>
        </div>
      </div>

      {/* Row 6: Skin color swatches */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label>CRT PHOSPHOR SKIN</label>
        <div style={{ display: "flex", gap: "8px" }}>
          {skins.map((skin) => {
            const isActive = settings.faceSkin === skin;
            let bgColor = "#00ff41";
            if (skin === "Amber") bgColor = "#ffb000";
            if (skin === "White") bgColor = "#ffffff";
            if (skin === "Red-Glitch") bgColor = "#ff2b2b";
            return (
              <button
                key={skin}
                onClick={() => handleFieldChange("faceSkin", skin)}
                style={{
                  width: "18px",
                  height: "18px",
                  backgroundColor: bgColor,
                  borderRadius: "50%",
                  border: isActive ? "2px solid #ffffff" : "2px solid transparent",
                  cursor: "pointer",
                  boxShadow: isActive ? `0 0 6px ${bgColor}` : "none",
                  padding: 0,
                }}
                title={skin}
              />
            );
          })}
        </div>
      </div>

      {/* Row 7: Shaders checkboxes */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label>POST-PROCESSING SHADERS</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 12px" }}>
          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={settings.scanlines}
              onChange={(e) => handleFieldChange("scanlines", e.target.checked)}
            />
            Scanlines
          </label>
          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={settings.curvature}
              onChange={(e) => handleFieldChange("curvature", e.target.checked)}
            />
            Curvature
          </label>
          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={settings.chromaticAberration}
              onChange={(e) => handleFieldChange("chromaticAberration", e.target.checked)}
            />
            RGB Split
          </label>
          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={settings.grain}
              onChange={(e) => handleFieldChange("grain", e.target.checked)}
            />
            Grain
          </label>
        </div>
      </div>
    </div>
  );
};
