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
            
            // Simple alpha based on distance from center
            float distFromCenter = length(pos.xy) / 30.0;
            vAlpha = 1.0 - smoothstep(0.8, 1.0, distFromCenter);
            
            // Transform to screen space
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            
            // Calculate point size
            float depth = -mvPosition.z;
            float sizeVariation = 0.8 + sin(uTime * 0.5 + aIndex * 0.1) * 0.2;
            gl_PointSize = uSize * sizeVariation * (300.0 / max(depth, 1.0));
            gl_PointSize = clamp(gl_PointSize, 1.0, 8.0);
        }
    `,
    fragmentShader: `
        varying float vAlpha;
        
        void main() {
            // Create circular particles
            vec2 center = gl_PointCoord - vec2(0.5);
            float dist = length(center);
            
            if (dist > 0.5) discard;
            
            // Soft edges
            float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
            
            // Bright center
            float brightness = 1.0 - smoothstep(0.0, 0.4, dist);
            brightness = pow(brightness, 0.8);
            
            // White particles
            vec3 color = vec3(1.0);
            
            // Final alpha
            float finalAlpha = alpha * brightness * vAlpha * 0.9;
            
            gl_FragColor = vec4(color, finalAlpha);
        }
    `
} 