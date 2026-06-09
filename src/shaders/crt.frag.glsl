uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uTime;
uniform float uGlitchIntensity;
uniform float uChromaticAberration;
uniform float uGrainIntensity;
uniform vec3 uSkinColor;

uniform bool uScanlinesEnabled;
uniform bool uCurvatureEnabled;
uniform bool uChromaticEnabled;
uniform bool uGrainEnabled;
uniform bool uGlowEnabled;
uniform bool uListeningState;
uniform float uGazeShiftX;
uniform float uGazeShiftY;

varying vec2 vUv;

// Simple random generator
float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

// Curvature/barrel distortion
vec2 curve(vec2 uv) {
    uv = uv * 2.0 - 1.0;
    vec2 offset = abs(uv.yx) / vec2(8.0, 6.0); // subtle curvature
    uv = uv + uv * offset * offset;
    uv = uv * 0.5 + 0.5;
    return uv;
}

// Bloom blur helper
vec4 getBloomSample(sampler2D tex, vec2 uv, float radius) {
    vec4 sum = vec4(0.0);
    float total = 0.0;
    
    // Simple 3x3 blur box for performance in Tauri
    for (float x = -1.5; x <= 1.5; x += 1.5) {
        for (float y = -1.5; y <= 1.5; y += 1.5) {
            vec2 offset = vec2(x, y) * radius / uResolution;
            sum += texture2D(tex, uv + offset);
            total += 1.0;
        }
    }
    return sum / total;
}

void main() {
    vec2 uv = vUv;

    // 1. Glitch horizontal slice displacement
    if (uGlitchIntensity > 0.0) {
        // Horizontal slices
        float sliceY = floor(uv.y * 24.0 + sin(uTime * 30.0) * 12.0);
        float sliceNoise = rand(vec2(sliceY, 345.67));
        if (sliceNoise < uGlitchIntensity * 0.4) {
            uv.x += (rand(vec2(sliceY, uTime)) - 0.5) * 0.08 * uGlitchIntensity;
        }
        
        // Random overall horizontal offset jitter
        float jitterNoise = rand(vec2(uTime, 17.0));
        if (jitterNoise < uGlitchIntensity * 0.1) {
            uv.x += (rand(vec2(uTime, 99.0)) - 0.5) * 0.02 * uGlitchIntensity;
        }
    }

    // 2. Curvature (Barrel Distortion)
    if (uCurvatureEnabled) {
        uv = curve(uv);
        
        // Draw black border outside CRT screen edges
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }
    }

    // Aspect Ratio Cover mapping with zoom factor to fit inside the CRT screen
    float zoom = 0.88;
    vec2 texUv = uv;
    float V = uResolution.x / uResolution.y;
    float T = 2816.0 / 1536.0; // Texture aspect ratio

    if (V < T) {
        texUv.x = (uv.x - 0.5) * (V / T) * zoom + 0.5;
        texUv.y = (uv.y - 0.5) * zoom + 0.5;
    } else {
        texUv.x = (uv.x - 0.5) * zoom + 0.5;
        texUv.y = (uv.y - 0.5) * (T / V) * zoom + 0.5;
    }

    // Clip texture bounds
    if (texUv.x < 0.0 || texUv.x > 1.0 || texUv.y < 0.0 || texUv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // Goggle eye/pupil shift
    if (texUv.y > 0.45 && texUv.y < 0.65 && texUv.x > 0.25 && texUv.x < 0.75) {
        texUv.x += uGazeShiftX;
        texUv.y += uGazeShiftY;
    }

    // 3. Chromatic Aberration
    vec4 color = vec4(0.0);
    if (uChromaticEnabled && uChromaticAberration > 0.0) {
        float shift = uChromaticAberration / uResolution.x;
        float r = texture2D(uTexture, texUv + vec2(shift, 0.0)).r;
        float g = texture2D(uTexture, texUv).g;
        float b = texture2D(uTexture, texUv - vec2(shift, 0.0)).b;
        color = vec4(r, g, b, 1.0);
    } else {
        color = texture2D(uTexture, texUv);
    }

    // Colorize monochrome texture with the skin color
    float intensity = max(color.r, max(color.g, color.b));
    vec3 baseColor = intensity * uSkinColor;

    // 4. Phosphor Bloom/Glow (Add blurred highlight back in)
    if (uGlowEnabled) {
        vec4 blurred = getBloomSample(uTexture, texUv, 2.5);
        float bloomIntensity = (blurred.r + blurred.g + blurred.b) / 3.0;
        baseColor += bloomIntensity * uSkinColor * 0.6; // 60% bloom intensity
    }

    // 5. Scanlines (based on vertical viewport pixels)
    if (uScanlinesEnabled) {
        float scanline = sin(uv.y * uResolution.y * 1.5) * 0.12 + 0.88;
        baseColor *= scanline;
    }

    // 6. CRT Noise/Grain (animated Perlin/random grain)
    if (uGrainEnabled) {
        float grain = (rand(uv * uTime) - 0.5) * uGrainIntensity;
        baseColor += grain * uSkinColor;
    }

    // Add CRT screen background tint (subtle phosphor base glow)
    baseColor += uSkinColor * 0.03; // 3% constant background tint

    gl_FragColor = vec4(baseColor, 1.0);
}
