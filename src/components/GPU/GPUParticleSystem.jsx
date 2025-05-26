import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useTheme } from '../../contexts/ThemeContext'
import FlockingFBO from './FlockingFBO'

const GPUParticleSystem = ({ particleCount = 2500, onShapeForm, targetShape, onDisperse }) => {
    const meshRef = useRef()
    const fboRef = useRef()
    const { theme, isDark } = useTheme()
    const currentPositionsTexture = useRef(null)

    // Create geometry for GPU particles
    const geometry = useMemo(() => {
        const geo = new THREE.BufferGeometry()
        const positions = new Float32Array(particleCount * 3)
        const uvs = new Float32Array(particleCount * 2)
        const sizes = new Float32Array(particleCount)
        const filled = new Float32Array(particleCount)

        const textureSize = Math.ceil(Math.sqrt(particleCount))

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3
            const i2 = i * 2

            // Position in texture coordinates (will be used to sample FBO texture)
            positions[i3] = (i % textureSize) / textureSize
            positions[i3 + 1] = Math.floor(i / textureSize) / textureSize
            positions[i3 + 2] = 0

            // UV coordinates for texture sampling
            uvs[i2] = (i % textureSize) / textureSize
            uvs[i2 + 1] = Math.floor(i / textureSize) / textureSize

            // Particle properties
            sizes[i] = 0.3 + Math.random() * 0.4
            filled[i] = Math.random() < 0.8 ? 1.0 : 0.0
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
        geo.setAttribute('filled', new THREE.BufferAttribute(filled, 1))

        return geo
    }, [particleCount])

    // GPU particle shader
    const shaderMaterial = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                uPositionsTexture: { value: null },
                uTime: { value: 0 },
                uTransition: { value: 0 },
                uFormationProgress: { value: 0 },
                uClickPosition: { value: new THREE.Vector3() },
                uSpiralTime: { value: 0 },
                uIsFormed: { value: false },
                isDarkTheme: { value: isDark },
                uOpacity: { value: 1 }
            },
            vertexShader: `
                attribute float size;
                attribute float filled;
                attribute vec2 uv;
                
                uniform sampler2D uPositionsTexture;
                uniform float uTime;
                uniform float uTransition;
                uniform float uFormationProgress;
                uniform vec3 uClickPosition;
                uniform float uSpiralTime;
                uniform bool uIsFormed;
                
                varying float vFilled;
                varying vec3 vColor;
                varying float vDistance;
                varying float vPhase;
                
                void main() {
                    // Sample position from FBO texture
                    vec3 pos = texture2D(uPositionsTexture, uv).xyz;
                    
                    // Calculate phase for organic movement
                    vPhase = pos.x * 0.1 + pos.y * 0.1;
                    
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
                    
                    vColor = vec3(1.0); // Will be themed in fragment shader
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
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vFilled;
                varying float vDistance;
                varying float vPhase;
                
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
                        vec3 color = isDarkTheme ? vec3(0.9) : vec3(0.1);
                        gl_FragColor = vec4(color, 0.5 * uOpacity);
                        return;
                    }
                    
                    float alpha = 1.0;
                    vec3 color = isDarkTheme ? vec3(0.9) : vec3(0.1);
                    
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
                    gl_FragColor = vec4(color, alpha);
                }
            `,
            transparent: true,
            blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
            depthWrite: false
        })
    }, [isDark])

    // Handle FBO position updates
    const handlePositionsReady = (positionsTexture) => {
        currentPositionsTexture.current = positionsTexture
        if (meshRef.current) {
            meshRef.current.material.uniforms.uPositionsTexture.value = positionsTexture
        }
    }

    // Update uniforms
    useFrame((state) => {
        if (!meshRef.current) return

        meshRef.current.material.uniforms.uTime.value = state.clock.elapsedTime
        meshRef.current.material.uniforms.isDarkTheme.value = isDark
    })

    return (
        <>
            {/* FBO for GPU flocking computation */}
            <FlockingFBO
                ref={fboRef}
                particleCount={particleCount}
                onPositionsReady={handlePositionsReady}
            />

            {/* GPU particle renderer */}
            <points ref={meshRef} geometry={geometry} material={shaderMaterial} frustumCulled={false} />
        </>
    )
}

export default GPUParticleSystem
