import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { useTauriEvents } from "../hooks/useTauriEvents";
import { Settings } from "../hooks/useSettings";

// Import original PNG images directly (resolved by Vite)
import aPng from "../assets/a.png";
import a1Png from "../assets/a1.png";
import a2Png from "../assets/a2.png";
import ePng from "../assets/e.png";
import iPng from "../assets/i.png";
import oPng from "../assets/o.png";
import uPng from "../assets/u.png";
import neutralPng from "../assets/neutral.png";
import smile1Png from "../assets/smile1.png";
import smile2Png from "../assets/smile2.png";
import glitchPng from "../assets/glitch.png";
import glitchSmilePng from "../assets/glitch_smile.png";
import cloudyPng from "../assets/cloudy.png";

// Import Shaders as raw strings
import vertShader from "../shaders/face.vert.glsl?raw";
import fragShader from "../shaders/crt.frag.glsl?raw";

interface FaceProps {
  state: "idle" | "listening" | "speaking";
  settings: Settings | null;
}

const colorSwatches: Record<string, THREE.Color> = {
  Green: new THREE.Color(0.0, 1.0, 0.255), // #00FF41
  Amber: new THREE.Color(1.0, 0.69, 0.0),   // #FFB000
  White: new THREE.Color(1.0, 1.0, 1.0),   // #FFFFFF
  "Red-Glitch": new THREE.Color(1.0, 0.17, 0.17), // #FF2B2B
};

export const Face: React.FC<FaceProps> = ({ state, settings }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const currentAmplitudeRef = useRef<number>(0);
  
  // Glitch triggers
  const glitchIntensityRef = useRef<number>(0.0);
  const chromaticAberrationRef = useRef<number>(0.0);
  const isGlitchingRef = useRef<boolean>(false);
  
  // Gaze shift states
  const gazeTargetXRef = useRef<number>(0.0);
  const gazeCurrentXRef = useRef<number>(0.0);
  const gazeStateRef = useRef<"idle" | "scanning">("idle");
  const gazeTimerRef = useRef<number>(0.0);
  const gazeDurationRef = useRef<number>(0.0);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Word segments and speech timing tracking
  const wordSegmentsRef = useRef<any[]>([]);
  const speechStartPerfRef = useRef<number>(0);
  const expressionRef = useRef<"smile" | "laugh" | "glitch" | null>(null);

  // Helper to parse expressions from the LLM sentence
  const detectExpression = (text: string): "smile" | "laugh" | "glitch" | null => {
    const lower = text.toLowerCase();
    if (
      lower.includes("laugh") ||
      lower.includes("giggle") ||
      lower.includes("chuckle") ||
      lower.includes("hahaha") ||
      lower.includes("hehehe") ||
      lower.includes("lol") ||
      lower.includes("xd")
    ) {
      return "laugh";
    }
    if (lower.includes("glitch") || lower.includes("error") || lower.includes("corrupt")) {
      return "glitch";
    }
    if (
      lower.includes("smile") ||
      lower.includes("happy") ||
      lower.includes("glad") ||
      lower.includes(":)") ||
      lower.includes(":-)") ||
      lower.includes("(:")
    ) {
      return "smile";
    }
    return null;
  };

  // Subscribe to real-time TTS amplitude
  useTauriEvents<number>("tts:amplitude", (event) => {
    if (stateRef.current === "speaking") {
      currentAmplitudeRef.current = event.payload;
    } else {
      currentAmplitudeRef.current = 0;
    }
  });

  // Listen for the actual start of speech for each sentence from the backend
  useTauriEvents<any>("tts:speak_start", (event) => {
    const payload = event.payload;
    let text = "";
    let durationMs = 0;
    
    if (typeof payload === "string") {
      text = payload.toLowerCase();
    } else if (payload && typeof payload === "object") {
      text = (payload.text || "").toLowerCase();
      durationMs = payload.duration_ms || 0;
    }
    
    // Parse expression from text currently being spoken
    expressionRef.current = detectExpression(text);
    
    // Split into clean words and compute word segments with timings
    const parsedWords = text.split(/\s+/);
    const segments: any[] = [];
    let totalChars = 0;
    
    for (const rawWord of parsedWords) {
      const cleanWord = rawWord.replace(/[^a-z]/g, "");
      if (cleanWord.length === 0) continue;
      
      let vowels = cleanWord.split("").filter((char) => ["a", "e", "i", "o", "u"].includes(char));
      if (vowels.length === 0) {
        if (cleanWord.includes("y")) {
          vowels = ["a", "e"];
        } else {
          vowels = ["neutral"];
        }
      }
      
      segments.push({
        word: cleanWord,
        length: cleanWord.length,
        vowels,
      });
      totalChars += cleanWord.length;
    }
    
    const actualDurationMs = durationMs > 0 ? durationMs : totalChars * 150;
    let currentOffset = 0;
    
    wordSegmentsRef.current = segments.map((seg) => {
      const duration = totalChars > 0 ? (seg.length / totalChars) * actualDurationMs : 0;
      const start = currentOffset;
      currentOffset += duration;
      return {
        ...seg,
        startMs: start,
        endMs: start + duration,
      };
    });
    
    speechStartPerfRef.current = performance.now();
  });

  // Clear segments and expression when speech is complete
  useTauriEvents<void>("tts:done", () => {
    wordSegmentsRef.current = [];
    expressionRef.current = null;
  });

  // Subscribe to LLM response complete (triggers a brief visual glitch)
  useTauriEvents<void>("llm:response_complete", () => {
    glitchIntensityRef.current = 0.8;
    chromaticAberrationRef.current = 15.0;
    isGlitchingRef.current = true;
    setTimeout(() => {
      isGlitchingRef.current = false;
    }, 250);
  });

  // Select active texture key based on state, amplitude, active expression, and glitch triggers
  const getActiveKey = (): string => {
    if (isGlitchingRef.current || stateRef.current === "idle") {
      const randVal = Math.random();
      if (randVal < 0.3) return "glitch";
      if (randVal < 0.6) return "glitchSmile";
      return "cloudy";
    }

    if (stateRef.current === "listening") {
      return "neutral"; // Closed mouth, pupils will scan in shader
    }

    // Speaking state: select mouth texture based on amplitude (0 to 7) and active word segment timing
    const amp = currentAmplitudeRef.current;
    if (amp === 0) {
      // Pause in speech: display expression state if active
      if (expressionRef.current === "smile") return "smile1";
      if (expressionRef.current === "laugh") return "smile2";
      if (expressionRef.current === "glitch") return "glitch";
      return "neutral";
    }

    // High probability glitch override if glitch expression is active
    if (expressionRef.current === "glitch" && Math.random() < 0.3) {
      return "glitch";
    }

    // For very low volumes, keep mouth relatively closed/small
    if (amp <= 1) {
      return "neutral";
    }
    if (amp <= 2) {
      return "a"; // small open
    }

    // Determine current vowel from active word segment
    const elapsedMs = performance.now() - speechStartPerfRef.current;
    const activeSegment = wordSegmentsRef.current.find(
      (seg) => elapsedMs >= seg.startMs && elapsedMs < seg.endMs
    );

    let currentVowel = "neutral";
    if (activeSegment) {
      const wordElapsedMs = elapsedMs - activeSegment.startMs;
      const wordDurationMs = activeSegment.endMs - activeSegment.startMs;
      const vowelDurationMs = wordDurationMs / activeSegment.vowels.length;
      const vowelIndex = Math.floor(wordElapsedMs / vowelDurationMs) % activeSegment.vowels.length;
      currentVowel = activeSegment.vowels[vowelIndex];
    }

    if (currentVowel === "a") {
      if (amp <= 4) return "a1"; // medium open
      return "a2"; // large open
    }
    if (currentVowel === "neutral") {
      return "neutral";
    }
    return currentVowel; // e, i, o, u
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Three.js scene setup
    const scene = new THREE.Scene();
    
    // Orthographic camera for 2D screen plane alignment
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    
    const width = container.clientWidth || 196;
    const height = container.clientHeight || 244;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Allow drag clicks to pass through WebGL canvas to parent container
    renderer.domElement.style.pointerEvents = "none";
    
    // Clear any existing elements to prevent duplicate canvas issue
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Load PNG textures directly
    const loader = new THREE.TextureLoader();
    const textures: Record<string, THREE.Texture> = {
      a: loader.load(aPng),
      a1: loader.load(a1Png),
      a2: loader.load(a2Png),
      e: loader.load(ePng),
      i: loader.load(iPng),
      o: loader.load(oPng),
      u: loader.load(uPng),
      neutral: loader.load(neutralPng),
      smile1: loader.load(smile1Png),
      smile2: loader.load(smile2Png),
      glitch: loader.load(glitchPng),
      glitchSmile: loader.load(glitchSmilePng),
      cloudy: loader.load(cloudyPng),
    };

    // Apply filtering for crisp retro pixel-art rendering
    Object.values(textures).forEach((tex) => {
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.NearestFilter;
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const initialSettings = settingsRef.current;
    const skinColor = initialSettings ? colorSwatches[initialSettings.faceSkin] || colorSwatches.Green : colorSwatches.Green;
    
    const material = new THREE.ShaderMaterial({
      vertexShader: vertShader,
      fragmentShader: fragShader,
      uniforms: {
        uTexture: { value: textures.neutral },
        uResolution: { value: new THREE.Vector2(width, height) },
        uTime: { value: 0.0 },
        uGlitchIntensity: { value: 0.0 },
        uChromaticAberration: { value: initialSettings?.chromaticAberration ? 1.0 : 0.0 },
        uGrainIntensity: { value: 0.05 },
        uSkinColor: { value: skinColor },
        uScanlinesEnabled: { value: initialSettings?.scanlines ?? true },
        uCurvatureEnabled: { value: initialSettings?.curvature ?? true },
        uChromaticEnabled: { value: initialSettings?.chromaticAberration ?? true },
        uGrainEnabled: { value: initialSettings?.grain ?? true },
        uGlowEnabled: { value: true },
        uGazeShiftX: { value: 0.0 },
        uGazeShiftY: { value: 0.0 },
        uListeningState: { value: stateRef.current === "listening" },
      },
      transparent: true,
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    let animationFrameId = 0;
    const clock = new THREE.Clock();

    // Render loop
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      const time = clock.getElapsedTime();
      
      // Decay glitch parameters
      if (glitchIntensityRef.current > 0.0) {
        glitchIntensityRef.current -= 0.04;
        if (glitchIntensityRef.current < 0.0) glitchIntensityRef.current = 0.0;
      }
      if (chromaticAberrationRef.current > 0.0) {
        chromaticAberrationRef.current -= 0.5;
        const targetChromatic = settingsRef.current?.chromaticAberration ? 1.0 : 0.0;
        if (chromaticAberrationRef.current < targetChromatic) {
          chromaticAberrationRef.current = targetChromatic;
        }
      }

      // Random micro-glitches during runtime
      if (!isGlitchingRef.current && Math.random() < (stateRef.current === "idle" ? 0.001 : 0.004)) {
        glitchIntensityRef.current = 0.15 + Math.random() * 0.25;
        chromaticAberrationRef.current = 2.0 + Math.random() * 4.0;
        isGlitchingRef.current = true;
        setTimeout(() => {
          isGlitchingRef.current = false;
        }, 100 + Math.random() * 100);
      }

      // Update gaze shift controller (only active when expanded)
      const isWidgetExpanded = stateRef.current !== "idle";
      
      if (isWidgetExpanded) {
        gazeTimerRef.current -= delta;
        if (gazeTimerRef.current <= 0) {
          if (gazeStateRef.current === "idle") {
            gazeStateRef.current = "scanning";
            // Scanning duration: random under 5s (1.5s to 4.5s)
            gazeDurationRef.current = 1.5 + Math.random() * 3.0;
            gazeTimerRef.current = gazeDurationRef.current;
          } else {
            gazeStateRef.current = "idle";
            // Staring straight duration: random 2s to 6s
            gazeDurationRef.current = 2.0 + Math.random() * 4.0;
            gazeTimerRef.current = gazeDurationRef.current;
            gazeTargetXRef.current = 0.0; // Return to center
          }
        }

        if (gazeStateRef.current === "scanning") {
          // Slow horizontal sweep with a reduced distance (max 0.006 amplitude, well under the 0.008 limit)
          const sweep = Math.sin(time * 1.8) * 0.006;
          gazeTargetXRef.current = sweep;
        }

        // LERP current value towards target for smooth movement
        gazeCurrentXRef.current += (gazeTargetXRef.current - gazeCurrentXRef.current) * 0.08;
      } else {
        // Reset in mini-icon/idle state
        gazeCurrentXRef.current = 0.0;
        gazeTargetXRef.current = 0.0;
        gazeStateRef.current = "idle";
        gazeTimerRef.current = 0.0;
      }



      // Swap texture in material dynamically
      const activeKey = getActiveKey();
      const activeTexture = textures[activeKey] || textures.neutral;
      material.uniforms.uTexture.value = activeTexture;

      // Update shader uniforms
      material.uniforms.uTime.value = time;
      material.uniforms.uGlitchIntensity.value = glitchIntensityRef.current;
      material.uniforms.uChromaticAberration.value = chromaticAberrationRef.current;
      material.uniforms.uListeningState.value = stateRef.current === "listening";
      material.uniforms.uGazeShiftX.value = gazeCurrentXRef.current;
      material.uniforms.uGazeShiftY.value = 0.0;

      renderer.render(scene, camera);
    };

    animate();

    // Resize observer to handle dynamic layout and window scaling
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const w = container.clientWidth || entry.contentRect.width;
        const h = container.clientHeight || entry.contentRect.height;
        if (w === 0 || h === 0) continue;
        
        renderer.setSize(w, h);
        material.uniforms.uResolution.value.set(w, h);
      }
    });

    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      // Dispose of loaded textures
      Object.values(textures).forEach((tex) => tex.dispose());
    };
  }, []);

  // Sync settings modifications directly to material uniforms
  useEffect(() => {
    if (!materialRef.current || !settings) return;
    
    const skinColor = colorSwatches[settings.faceSkin] || colorSwatches.Green;
    materialRef.current.uniforms.uSkinColor.value = skinColor;
    materialRef.current.uniforms.uScanlinesEnabled.value = settings.scanlines;
    materialRef.current.uniforms.uCurvatureEnabled.value = settings.curvature;
    materialRef.current.uniforms.uChromaticEnabled.value = settings.chromaticAberration;
    materialRef.current.uniforms.uGrainEnabled.value = settings.grain;
  }, [settings]);

  const isIdle = state === "idle";
  const skin = settings?.faceSkin || "Green";
  const glowColorClass = `glow-${skin.toLowerCase()}`;

  return (
    <div
      ref={mountRef}
      className={`face-container ${isIdle ? "idle-pulse" : ""} ${glowColorClass}`}
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#000000",
        cursor: isIdle ? "pointer" : "grab",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        pointerEvents: isIdle ? "none" : "auto",
      }}
    />
  );
};
