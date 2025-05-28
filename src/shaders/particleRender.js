// Particle rendering shaders - handle visual appearance

export const particleRenderShader = {
    vertexShader: `
        uniform sampler2D uPositions;
        uniform float uTime;
        uniform float uSize;
        uniform float uTextureSize;
        uniform float uParticleCount;
        attribute float aIndex;
        varying float vAlpha;
        varying float vGrayVariation;
        
        void main() {
            // Skip particles beyond our count
            if (aIndex >= uParticleCount) {
                gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
                return;
            }
            
            // Convert particle index to texture UV
            float y = floor(aIndex / uTextureSize);
            float x = aIndex - y * uTextureSize;
            vec2 uv = (vec2(x, y) + 0.5) / uTextureSize;
            
            // Read position from GPU texture
            vec4 positionData = texture2D(uPositions, uv);
            vec3 pos = positionData.xyz;
            
            // All particles are fully visible regardless of position
            vAlpha = 1.0;
            
            // Create gray variation based on particle index and subtle time variation
            float baseGray = 0.1 + (sin(aIndex * 0.1) * 0.5 + 0.5) * 0.9; // Range: 0.1 to 1.0
            float timeVariation = sin(uTime * 0.3 + aIndex * 0.05) * 0.15; // Increased time-based variation
            vGrayVariation = clamp(baseGray + timeVariation, 0.05, 1.0); // Final range: 0.05 to 1.0
            
            // Transform to screen space
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            
            // Calculate perspective-correct point size
            // Camera is at z=50, particles range from z=-10 to z=+10
            // Distance from camera = 50 - particle.z
            // Closer particles (higher Z) = smaller distance = bigger size
            float distanceFromCamera = 30.0 - pos.z; // Distance from camera to particle
            float sizeVariation = 0.8 + sin(uTime * 0.5 + aIndex * 0.1) * 0.2;
            
            // Perspective scaling: closer = bigger, farther = smaller
            float perspectiveScale = 50.0 / max(distanceFromCamera, 1.0);
            gl_PointSize = uSize * sizeVariation * perspectiveScale;
            gl_PointSize = clamp(gl_PointSize, 0.5, 12.0);
        }
    `,
    fragmentShader: `
        varying float vAlpha;
        varying float vGrayVariation;
        
        void main() {
            // Create circular particles
            vec2 center = gl_PointCoord - vec2(0.5);
            float dist = length(center);
            
            if (dist > 0.5) discard;
            
            // Soft edges
            float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
            
            // Bright center
            float brightness = 1.0 - smoothstep(0.0, 0.4, dist);
            brightness = pow(brightness, 0.6);
            
            // Create subtle color variations for better visibility
            float hue = vGrayVariation;
            vec3 baseColor = vec3(0.8 + hue * 0.2, 0.9 + hue * 0.1, 1.0); // Subtle blue-white tint
            
            // Add some warm highlights for depth
            float warmth = sin(vGrayVariation * 3.14159) * 0.3;
            baseColor.r += warmth * 0.4;
            baseColor.g += warmth * 0.2;
            
            // Ensure minimum brightness for visibility
            baseColor = max(baseColor, vec3(0.4));
            
            // Final alpha - enhanced visibility
            float finalAlpha = alpha * brightness * vAlpha * 0.9;
            
            gl_FragColor = vec4(baseColor, finalAlpha);
        }
    `
} 