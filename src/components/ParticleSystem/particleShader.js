export const particleVertexShader = `
    attribute float size;
    attribute float filled;
    // color is automatically available when vertexColors is true
    
    varying float vFilled;
    varying vec3 vColor;
    varying float vDistance;
    varying float vPhase; // Add this varying
    
    uniform float uTime;
    uniform float uTransition;
    uniform float uFormationProgress;
    uniform vec3 uClickPosition;
    uniform float uSpiralTime;
    uniform bool uIsFormed;
    
    void main() {
        vec3 pos = position;
        
        // Calculate phase for organic movement
        vPhase = position.x * 0.1 + position.y * 0.1;
        
        // Add organic movement during transition
        float organicStrength = 1.0 - smoothstep(0.7, 1.0, uTransition);
        if (organicStrength > 0.0) {
            float breathX = sin(uTime * 0.5 + vPhase) * 0.5;
            float breathY = cos(uTime * 0.7 + vPhase * 1.3) * 0.5;
            float breathZ = sin(uTime * 0.9 + vPhase * 0.7) * 0.3;
            
            pos.x += breathX * organicStrength * (1.0 - uTransition);
            pos.y += breathY * organicStrength * (1.0 - uTransition);
            pos.z += breathZ * organicStrength * (1.0 - uTransition);
        }
        
        // Apply spiral wave effect when shape is formed
        if (uIsFormed && uClickPosition.x != 0.0) {
            vec2 centerOffset = pos.xy - uClickPosition.xy;
            float distance = length(centerOffset);
            float angle = atan(centerOffset.y, centerOffset.x);
            
            float spiralOffset = angle * 2.0 + distance * 0.3 - uSpiralTime * 5.0;
            float waveHeight = sin(spiralOffset) * exp(-distance / 20.0) * 0.5;
            
            pos.z += waveHeight * uTransition;
        }
        
        vColor = color; // color is automatically available
        vFilled = filled;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        vDistance = -mvPosition.z;
        
        // Adaptive point size
        float baseSize = size;
        if (uTransition > 0.0 && uTransition < 1.0) {
            baseSize *= mix(1.0, 0.7, uTransition);
        }
        
        gl_PointSize = clamp(baseSize * (300.0 / vDistance), 1.0, 64.0);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

export const particleFragmentShader = `
    varying vec3 vColor;
    varying float vFilled;
    varying float vDistance;
    varying float vPhase; // Receive the phase varying
    
    uniform bool isDarkTheme;
    uniform float uOpacity;
    uniform float uTransition;
    uniform float uTime;
    
    void main() {
        vec2 center = gl_PointCoord - 0.5;
        float dist = length(center);
        
        if (dist > 0.5) {
            discard;
        }
        
        // LOD - simpler rendering for distant particles
        if (vDistance > 80.0) {
            gl_FragColor = vec4(vColor, 0.5 * uOpacity);
            return;
        }
        
        float alpha = 1.0;
        
        if (vFilled < 0.5) {
            // Hollow circle
            if (dist < 0.4) {
                discard;
            }
        } else {
            // Filled circle with soft edges
            if (!isDarkTheme) {
                alpha = 1.0 - smoothstep(0.3, 0.5, dist);
            }
        }
        
        // Add subtle pulsing during formation using vPhase
        if (uTransition > 0.0 && uTransition < 1.0) {
            float pulse = sin(uTime * 3.0 + vPhase * 10.0) * 0.1 + 0.9;
            alpha *= pulse;
        }
        
        alpha *= uOpacity;
        gl_FragColor = vec4(vColor, alpha);
    }
`;
