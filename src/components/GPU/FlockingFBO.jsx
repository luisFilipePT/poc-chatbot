import { useRef, useMemo, useEffect } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const FlockingFBO = ({ particleCount = 2500, onPositionsReady }) => {
    const meshRef = useRef()
    const { gl } = useThree()

    // Calculate texture size (must be power of 2 for WebGL compatibility)
    const size = useMemo(() => Math.ceil(Math.sqrt(particleCount)), [particleCount])

    // Create render targets for ping-pong rendering
    const renderTargets = useMemo(() => {
        const options = {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            generateMipmaps: false,
            stencilBuffer: false,
            depthBuffer: false
        }

        return {
            position: {
                read: new THREE.WebGLRenderTarget(size, size, options),
                write: new THREE.WebGLRenderTarget(size, size, options)
            },
            velocity: {
                read: new THREE.WebGLRenderTarget(size, size, options),
                write: new THREE.WebGLRenderTarget(size, size, options)
            }
        }
    }, [size])

    // FBO scene and camera
    const scene = useMemo(() => new THREE.Scene(), [])
    const camera = useMemo(() =>
        new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []
    )

    // Position update shader
    const positionShader = useMemo(() => ({
        uniforms: {
            uPositionsTexture: { value: null },
            uVelocitiesTexture: { value: null },
            uDeltaTime: { value: 0 }
        },
        vertexShader: `
            void main() {
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D uPositionsTexture;
            uniform sampler2D uVelocitiesTexture;
            uniform float uDeltaTime;
            
            void main() {
                vec2 uv = gl_FragCoord.xy / vec2(${size}.0, ${size}.0);
                vec3 position = texture2D(uPositionsTexture, uv).xyz;
                vec3 velocity = texture2D(uVelocitiesTexture, uv).xyz;
                
                // Update position
                position += velocity * uDeltaTime * 8.0;
                
                // Boundaries
                if (abs(position.x) > 40.0) {
                    position.x = sign(position.x) * 40.0;
                }
                if (abs(position.y) > 30.0) {
                    position.y = sign(position.y) * 30.0;
                }
                if (abs(position.z) > 20.0) {
                    position.z = sign(position.z) * 20.0;
                }
                
                gl_FragColor = vec4(position, 1.0);
            }
        `
    }), [size])

    // Velocity update shader (flocking computation)
    const velocityShader = useMemo(() => ({
        uniforms: {
            uPositionsTexture: { value: null },
            uVelocitiesTexture: { value: null },
            uResolution: { value: new THREE.Vector2(size, size) },
            uDeltaTime: { value: 0 },
            uSeparationDistance: { value: 2.5 },
            uAlignmentDistance: { value: 5.0 },
            uCohesionDistance: { value: 5.0 },
            uMaxSpeed: { value: 1.2 },
            uMaxForce: { value: 0.05 },
            uSeparationWeight: { value: 1.8 },
            uAlignmentWeight: { value: 1.0 },
            uCohesionWeight: { value: 0.8 }
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
            uniform float uSeparationWeight;
            uniform float uAlignmentWeight;
            uniform float uCohesionWeight;
            
            void main() {
                vec2 uv = gl_FragCoord.xy / uResolution;
                vec3 position = texture2D(uPositionsTexture, uv).xyz;
                vec3 velocity = texture2D(uVelocitiesTexture, uv).xyz;
                
                vec3 separation = vec3(0.0);
                vec3 alignment = vec3(0.0);
                vec3 cohesion = vec3(0.0);
                float neighborCount = 0.0;
                
                // Optimized neighbor sampling
                float sampleStep = 1.0 / uResolution.x;
                int sampleRadius = 2; // Reduced for better performance
                
                for (int x = -sampleRadius; x <= sampleRadius; x++) {
                    for (int y = -sampleRadius; y <= sampleRadius; y++) {
                        if (x == 0 && y == 0) continue;
                        
                        vec2 sampleUV = uv + vec2(float(x), float(y)) * sampleStep;
                        if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) continue;
                        
                        vec3 otherPos = texture2D(uPositionsTexture, sampleUV).xyz;
                        vec3 otherVel = texture2D(uVelocitiesTexture, sampleUV).xyz;
                        
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
                    if (length(separation) > 0.0) {
                        separation = normalize(separation) * uMaxForce * uSeparationWeight;
                        acceleration += separation;
                    }
                    
                    if (length(alignment) > 0.0) {
                        alignment = normalize(alignment / neighborCount) * uMaxForce * uAlignmentWeight;
                        acceleration += alignment;
                    }
                    
                    if (length(cohesion) > 0.0) {
                        cohesion = normalize((cohesion / neighborCount) - position) * uMaxForce * uCohesionWeight;
                        acceleration += cohesion;
                    }
                }
                
                // Update velocity
                velocity += acceleration * uDeltaTime;
                
                // Limit speed
                float speed = length(velocity);
                if (speed > uMaxSpeed) {
                    velocity = normalize(velocity) * uMaxSpeed;
                }
                
                // Apply damping
                velocity *= 0.98;
                
                gl_FragColor = vec4(velocity, 1.0);
            }
        `
    }), [size])

    // Initialize textures
    useEffect(() => {
        const positions = new Float32Array(size * size * 4)
        const velocities = new Float32Array(size * size * 4)

        for (let i = 0; i < particleCount; i++) {
            const i4 = i * 4
            // Initialize with your murmuration shape
            const t = i / particleCount
            const baseX = -20 + t * 40
            const baseY = -10 + t * 20

            const wave1 = Math.sin(t * Math.PI * 3) * 4
            const wave2 = Math.cos(t * Math.PI * 5) * 2
            const envelope = Math.sin(t * Math.PI)
            const pointiness = Math.pow(envelope, 0.3)
            const spread = pointiness * 5 + 0.2

            const angle = Math.random() * Math.PI * 2
            const radius = Math.random() * spread
            const offsetX = Math.cos(angle) * radius
            const offsetY = Math.sin(angle) * radius
            const offsetZ = (Math.random() - 0.5) * 2 * pointiness

            positions[i4] = baseX + wave1 + offsetX
            positions[i4 + 1] = baseY + wave2 + offsetY
            positions[i4 + 2] = offsetZ
            positions[i4 + 3] = 1

            // Initial velocities
            const velAngle = Math.random() * Math.PI * 2
            const speed = 0.3 + Math.random() * 0.3
            velocities[i4] = Math.cos(velAngle) * speed
            velocities[i4 + 1] = Math.sin(velAngle) * speed * 0.3
            velocities[i4 + 2] = 0
            velocities[i4 + 3] = 1
        }

        // Create and initialize data textures
        const positionTexture = new THREE.DataTexture(
            positions, size, size, THREE.RGBAFormat, THREE.FloatType
        )
        const velocityTexture = new THREE.DataTexture(
            velocities, size, size, THREE.RGBAFormat, THREE.FloatType
        )

        positionTexture.needsUpdate = true
        velocityTexture.needsUpdate = true

        // Initialize render targets with data
        const tempMaterial = new THREE.ShaderMaterial({
            vertexShader: `
                void main() {
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uTexture;
                void main() {
                    vec2 uv = gl_FragCoord.xy / vec2(${size}.0, ${size}.0);
                    gl_FragColor = texture2D(uTexture, uv);
                }
            `,
            uniforms: { uTexture: { value: null } }
        })

        const tempMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), tempMaterial)
        const tempScene = new THREE.Scene()
        tempScene.add(tempMesh)

        // Initialize position render targets
        tempMaterial.uniforms.uTexture.value = positionTexture
        gl.setRenderTarget(renderTargets.position.read)
        gl.render(tempScene, camera)
        gl.setRenderTarget(renderTargets.position.write)
        gl.render(tempScene, camera)

        // Initialize velocity render targets
        tempMaterial.uniforms.uTexture.value = velocityTexture
        gl.setRenderTarget(renderTargets.velocity.read)
        gl.render(tempScene, camera)
        gl.setRenderTarget(renderTargets.velocity.write)
        gl.render(tempScene, camera)

        gl.setRenderTarget(null)

        // Cleanup
        tempMaterial.dispose()
        tempMesh.geometry.dispose()
    }, [size, particleCount, gl, camera, renderTargets])

    // Update simulation
    useFrame((state, delta) => {
        if (!meshRef.current) return

        const deltaTime = Math.min(delta, 0.033)

        // Update velocities (flocking computation)
        meshRef.current.material = new THREE.ShaderMaterial(velocityShader)
        meshRef.current.material.uniforms.uPositionsTexture.value = renderTargets.position.read.texture
        meshRef.current.material.uniforms.uVelocitiesTexture.value = renderTargets.velocity.read.texture
        meshRef.current.material.uniforms.uDeltaTime.value = deltaTime

        gl.setRenderTarget(renderTargets.velocity.write)
        gl.render(scene, camera)

        // Update positions
        meshRef.current.material = new THREE.ShaderMaterial(positionShader)
        meshRef.current.material.uniforms.uPositionsTexture.value = renderTargets.position.read.texture
        meshRef.current.material.uniforms.uVelocitiesTexture.value = renderTargets.velocity.write.texture
        meshRef.current.material.uniforms.uDeltaTime.value = deltaTime

        gl.setRenderTarget(renderTargets.position.write)
        gl.render(scene, camera)

        // Swap render targets (ping-pong)
        const tempPos = renderTargets.position.read
        renderTargets.position.read = renderTargets.position.write
        renderTargets.position.write = tempPos

        const tempVel = renderTargets.velocity.read
        renderTargets.velocity.read = renderTargets.velocity.write
        renderTargets.velocity.write = tempVel

        // Notify parent component of new positions
        if (onPositionsReady) {
            onPositionsReady(renderTargets.position.read.texture)
        }

        gl.setRenderTarget(null)
    })

    return createPortal(
        <mesh ref={meshRef}>
            <planeGeometry args={[2, 2]} />
            <shaderMaterial />
        </mesh>,
        scene
    )
}

export default FlockingFBO
