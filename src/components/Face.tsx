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

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Subscribe to real-time TTS amplitude
  useTauriEvents<number>("tts:amplitude", (event) => {
    if (stateRef.current === "speaking") {
      currentAmplitudeRef.current = event.payload;
    } else {
      currentAmplitudeRef.current = 0;
    }
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

  // Select active texture key based on state, amplitude, and glitch triggers
  const getActiveKey = (): string => {
    if (isGlitchingRef.current || state === "idle") {
      const randVal = Math.random();
      if (randVal < 0.3) return "glitch";
      if (randVal < 0.6) return "glitchSmile";
      return "cloudy";
    }

    if (state === "listening") {
      return "neutral"; // Closed mouth, pupils will scan in shader
    }

    // Speaking state: select mouth texture based on amplitude (0 to 7)
    const amp = currentAmplitudeRef.current;
    if (amp === 0) return "neutral";
    if (amp === 1) return "u";
    if (amp === 2) return "o";
    if (amp === 3) return "i";
    if (amp === 4) return "e";
    if (amp === 5) return "a";
    if (amp === 6) return "a1";
    return "a2";
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
    const skinColor = settings ? colorSwatches[settings.faceSkin] || colorSwatches.Green : colorSwatches.Green;
    
    const material = new THREE.ShaderMaterial({
      vertexShader: vertShader,
      fragmentShader: fragShader,
      uniforms: {
        uTexture: { value: textures.neutral },
        uResolution: { value: new THREE.Vector2(width, height) },
        uTime: { value: 0.0 },
        uGlitchIntensity: { value: 0.0 },
        uChromaticAberration: { value: settings?.chromaticAberration ? 1.0 : 0.0 },
        uGrainIntensity: { value: 0.05 },
        uSkinColor: { value: skinColor },
        uScanlinesEnabled: { value: settings?.scanlines ?? true },
        uCurvatureEnabled: { value: settings?.curvature ?? true },
        uChromaticEnabled: { value: settings?.chromaticAberration ?? true },
        uGrainEnabled: { value: settings?.grain ?? true },
        uGlowEnabled: { value: true },
        uListeningState: { value: state === "listening" },
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

      const time = clock.getElapsedTime();
      
      // Decay glitch parameters
      if (glitchIntensityRef.current > 0.0) {
        glitchIntensityRef.current -= 0.04;
        if (glitchIntensityRef.current < 0.0) glitchIntensityRef.current = 0.0;
      }
      if (chromaticAberrationRef.current > 0.0) {
        chromaticAberrationRef.current -= 0.5;
        if (chromaticAberrationRef.current < (settings?.chromaticAberration ? 1.0 : 0.0)) {
          chromaticAberrationRef.current = settings?.chromaticAberration ? 1.0 : 0.0;
        }
      }

      // Random micro-glitches during runtime
      if (!isGlitchingRef.current && Math.random() < (state === "idle" ? 0.001 : 0.004)) {
        glitchIntensityRef.current = 0.15 + Math.random() * 0.25;
        chromaticAberrationRef.current = 2.0 + Math.random() * 4.0;
        isGlitchingRef.current = true;
        setTimeout(() => {
          isGlitchingRef.current = false;
        }, 100 + Math.random() * 100);
      }

      // Swap texture in material dynamically
      const activeKey = getActiveKey();
      const activeTexture = textures[activeKey] || textures.neutral;
      material.uniforms.uTexture.value = activeTexture;

      // Update shader uniforms
      material.uniforms.uTime.value = time;
      material.uniforms.uGlitchIntensity.value = glitchIntensityRef.current;
      material.uniforms.uChromaticAberration.value = chromaticAberrationRef.current;
      material.uniforms.uListeningState.value = state === "listening";

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
  }, [state, settings]);

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
