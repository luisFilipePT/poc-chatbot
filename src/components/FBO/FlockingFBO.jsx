import { useRef, useMemo, useEffect } from 'react'
import { createPortal, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const FlockingFBO = ({ particleCount = 2500 }) => {
    const meshRef = useRef()
    const size = Math.ceil(Math.sqrt(particleCount))

    // Create render targets for positions and velocities
    const [positionRT, velocityRT] = useMemo(() => {
        const options = {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        }

        return [
            new THREE.WebGLRenderTarget(size, size, options),
            new THREE.WebGLRenderTarget(size, size, options)
        ]
    }, [size])

    // FBO scene and camera
    const scene = useMemo(() => new THREE.Scene(), [])
    const camera = useMemo(() =>
        new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []
    )

    // Initialize positions and velocities
    useEffect(() => {
        const positions = new Float32Array(size * size * 4)
        const velocities = new Float32Array(size * size * 4)

        for (let i = 0; i < particleCount; i++) {
            const i4 = i * 4
            // Initial positions (your murmuration shape)
            const t = i / particleCount
            const baseX = -20 + t * 40
            const baseY = -10 + t * 20
            // ... your position initialization
            positions[i4] = baseX
            positions[i4 + 1] = baseY
            positions[i4 + 2] = 0
            positions[i4 + 3] = 1

            // Initial velocities
            const angle = Math.random() * Math.PI * 2
            const speed = 0.3 + Math.random() * 0.3
            velocities[i4] = Math.cos(angle) * speed
            velocities[i4 + 1] = Math.sin(angle) * speed * 0.3
            velocities[i4 + 2] = 0
            velocities[i4 + 3] = 1
        }

        // Create data textures
        const positionTexture = new THREE.DataTexture(
            positions, size, size, THREE.RGBAFormat, THREE.FloatType
        )
        const velocityTexture = new THREE.DataTexture(
            velocities, size, size, THREE.RGBAFormat, THREE.FloatType
        )

        positionTexture.needsUpdate = true
        velocityTexture.needsUpdate = true

        // Store in uniforms
        if (meshRef.current) {
            meshRef.current.material.uniforms.uPositionsTexture.value = positionTexture
            meshRef.current.material.uniforms.uVelocitiesTexture.value = velocityTexture
        }
    }, [size, particleCount])

    // Flocking shader that runs on GPU
    const flockingShader = useMemo(() => ({
        uniforms: {
            uPositionsTexture: { value: null },
            uVelocitiesTexture: { value: null },
            uResolution: { value: new THREE.Vector2(size, size) },
            uDeltaTime: { value: 0 },
            uSeparationDistance: { value: 2.5 },
            uAlignmentDistance: { value: 5.0 },
            uCohesionDistance: { value: 5.0 },
            uMaxSpeed: { value: 1.2 },
            uMaxForce: { value: 0.05 }
        },
        vertexShader: `
            void main() {
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D uPositionsTexture;
            uniform sampler2D uVelocitiesTexture;
            uniform vec2 uResolution;
            uniform float uDeltaTime;
            uniform float uSeparationDistance;
            uniform float uAlignmentDistance;
            uniform float uCohesionDistance;
            uniform float uMaxSpeed;
            uniform float uMaxForce;
            
            void main() {
                vec2 uv = gl_FragCoord.xy / uResolution;
                vec3 position = texture2D(uPositionsTexture, uv).xyz;
                vec3 velocity = texture2D(uVelocitiesTexture, uv).xyz;
                
                vec3 separation = vec3(0.0);
                vec3 alignment = vec3(0.0);
                vec3 cohesion = vec3(0.0);
                float neighborCount = 0.0;
                
                // Check neighbors (optimized sampling)
                for (float y = 0.0; y < 1.0; y += 0.02) {
                    for (float x = 0.0; x < 1.0; x += 0.02) {
                        vec2 ref = vec2(x, y);
                        vec3 otherPos = texture2D(uPositionsTexture, ref).xyz;
                        vec3 otherVel = texture2D(uVelocitiesTexture, ref).xyz;
                        
                        vec3 diff = position - otherPos;
                        float dist = length(diff);
                        
                        if (dist > 0.0 && dist < uCohesionDistance) {
                            neighborCount += 1.0;
                            
                            // Separation
                            if (dist < uSeparationDistance) {
                                separation += normalize(diff) / dist;
                            }
                            
                            // Alignment
                            if (dist < uAlignmentDistance) {
                                alignment += otherVel;
                            }
                            
                            // Cohesion
                            cohesion += otherPos;
                        }
                    }
                }
                
                vec3 acceleration = vec3(0.0);
                
                if (neighborCount > 0.0) {
                    // Apply flocking rules
                    separation = normalize(separation) * uMaxForce * 1.5;
                    alignment = normalize(alignment / neighborCount) * uMaxForce;
                    cohesion = normalize((cohesion / neighborCount) - position) * uMaxForce * 0.8;
                    
                    acceleration = separation + alignment + cohesion;
                }
                
                // Update velocity
                velocity += acceleration * uDeltaTime;
                
                // Limit speed
                float speed = length(velocity);
                if (speed > uMaxSpeed) {
                    velocity = normalize(velocity) * uMaxSpeed;
                }
                
                // Update position
                position += velocity * uDeltaTime * 8.0;
                
                // Boundaries
                if (abs(position.x) > 40.0) {
                    position.x = sign(position.x) * 40.0;
                    velocity.x *= -0.5;
                }
                if (abs(position.y) > 30.0) {
                    position.y = sign(position.y) * 30.0;
                    velocity.y *= -0.5;
                }
                if (abs(position.z) > 20.0) {
                    position.z = sign(position.z) * 20.0;
                    velocity.z *= -0.5;
                }
                
                gl_FragColor = vec4(position, 1.0);
            }
        `
    }), [size])

    // Update positions every frame
    useFrame((state, delta) => {
        if (!meshRef.current) return

        meshRef.current.material.uniforms.uDeltaTime.value = delta

        // Render to position texture
        state.gl.setRenderTarget(positionRT)
        state.gl.render(scene, camera)

        // Update uniform
        meshRef.current.material.uniforms.uPositionsTexture.value = positionRT.texture

        // Reset render target
        state.gl.setRenderTarget(null)
    })

    return createPortal(
        <mesh ref={meshRef}>
            <planeGeometry args={[2, 2]} />
            <shaderMaterial {...flockingShader} />
        </mesh>,
        scene,
        { camera }
    )
}

export default FlockingFBO
