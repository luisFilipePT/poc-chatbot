import { useRef, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { flockingComputeShader } from '../../shaders/flockingCompute'
import { particleRenderShader } from '../../shaders/particleRender'

const FlockingFBO = forwardRef(({ particleCount = 2500 }, ref) => {
    const meshRef = useRef()
    const timeRef = useRef(0)
    const { gl, viewport, camera } = useThree()
    
    // Calculate dynamic boundaries based on viewport + 2% buffer
    const boundaries = useMemo(() => {
        // Get the camera's frustum at a reasonable depth
        const distance = 10 // Distance from camera where particles exist
        
        // Calculate visible area at that distance
        const vFOV = camera.fov * Math.PI / 180 // Convert to radians
        const height = 2 * Math.tan(vFOV / 2) * distance
        const width = height * camera.aspect
        
        // Add 2% buffer to hide boundaries
        const buffer = 1.02
        const halfWidth = (width * buffer) / 2
        const halfHeight = (height * buffer) / 2
        const depth = 15 // Reasonable depth for 3D movement
        
        return {
            min: new THREE.Vector3(-halfWidth, -halfHeight, -depth),
            max: new THREE.Vector3(halfWidth, halfHeight, depth)
        }
    }, [camera.fov, camera.aspect])
    
    // GPU-only flocking system with dynamic boundaries
    const { geometry, computeShader, renderMaterial, renderTargets } = useMemo(() => {
        // Check WebGL2 support
        if (!gl.capabilities.isWebGL2) {
            console.warn('WebGL2 not supported')
            return { geometry: null, computeShader: null, renderMaterial: null, renderTargets: null }
        }

        // Calculate texture size (square texture to hold all particles)
        const textureSize = Math.ceil(Math.sqrt(particleCount))
        
        // Create initial data within the dynamic boundaries
        const initialPositions = new Float32Array(textureSize * textureSize * 4)
        const velocities = new Float32Array(textureSize * textureSize * 4)
        
        for (let i = 0; i < particleCount; i++) {
            const i4 = i * 4
            
            // Random positions within dynamic boundaries (80% of available space)
            const spawnArea = 0.8
            initialPositions[i4] = (Math.random() - 0.5) * (boundaries.max.x - boundaries.min.x) * spawnArea
            initialPositions[i4 + 1] = (Math.random() - 0.5) * (boundaries.max.y - boundaries.min.y) * spawnArea
            initialPositions[i4 + 2] = (Math.random() - 0.5) * (boundaries.max.z - boundaries.min.z) * spawnArea
            initialPositions[i4 + 3] = 1.0
            
            // Random velocities
            const speed = 0.5 + Math.random() * 1.0
            const angle = Math.random() * Math.PI * 2
            const elevation = (Math.random() - 0.5) * 0.5
            
            velocities[i4] = Math.cos(angle) * Math.cos(elevation) * speed
            velocities[i4 + 1] = Math.sin(elevation) * speed
            velocities[i4 + 2] = Math.sin(angle) * Math.cos(elevation) * speed
            velocities[i4 + 3] = 0.0
        }
        
        // Create render targets for ping-pong
        const rtPosition1 = new THREE.WebGLRenderTarget(textureSize, textureSize, {
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter
        })
        
        const rtPosition2 = new THREE.WebGLRenderTarget(textureSize, textureSize, {
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter
        })
        
        const rtVelocity1 = new THREE.WebGLRenderTarget(textureSize, textureSize, {
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter
        })
        
        const rtVelocity2 = new THREE.WebGLRenderTarget(textureSize, textureSize, {
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter
        })
        
        // Initialize textures
        const positionTexture = new THREE.DataTexture(
            initialPositions, textureSize, textureSize, THREE.RGBAFormat, THREE.FloatType
        )
        positionTexture.needsUpdate = true
        
        const velocityTexture = new THREE.DataTexture(
            velocities, textureSize, textureSize, THREE.RGBAFormat, THREE.FloatType
        )
        velocityTexture.needsUpdate = true
        
        // Copy initial data to render targets
        const scene = new THREE.Scene()
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
        scene.add(quad)
        
        // Copy position data
        quad.material = new THREE.MeshBasicMaterial({ map: positionTexture })
        gl.setRenderTarget(rtPosition1)
        gl.render(scene, camera)
        gl.setRenderTarget(rtPosition2)
        gl.render(scene, camera)
        
        // Copy velocity data
        quad.material = new THREE.MeshBasicMaterial({ map: velocityTexture })
        gl.setRenderTarget(rtVelocity1)
        gl.render(scene, camera)
        gl.setRenderTarget(rtVelocity2)
        gl.render(scene, camera)
        
        gl.setRenderTarget(null)
        
        // Create unified compute shader with dynamic boundaries
        const computeShader = new THREE.ShaderMaterial({
            uniforms: {
                uPositions: { value: rtPosition1.texture },
                uVelocities: { value: rtVelocity1.texture },
                uTime: { value: 0 },
                uDeltaTime: { value: 0 },
                uParticleCount: { value: particleCount },
                uTextureSize: { value: textureSize },
                uPass: { value: 0 }, // 0 = positions, 1 = velocities
                uBoundaryMin: { value: boundaries.min },
                uBoundaryMax: { value: boundaries.max }
            },
            vertexShader: flockingComputeShader.vertexShader,
            fragmentShader: flockingComputeShader.fragmentShader
        })
        
        // Create geometry for particle rendering
        const geometry = new THREE.BufferGeometry()
        const indices = new Float32Array(particleCount)
        const positions = new Float32Array(particleCount * 3) // Dummy positions for Three.js
        
        for (let i = 0; i < particleCount; i++) {
            indices[i] = i
            // Set dummy positions (will be overridden by shader)
            positions[i * 3] = 0
            positions[i * 3 + 1] = 0
            positions[i * 3 + 2] = 0
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geometry.setAttribute('aIndex', new THREE.BufferAttribute(indices, 1))
        
        // Create material that renders particles using imported shaders
        const renderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uPositions: { value: rtPosition1.texture },
                uTime: { value: 0 },
                uSize: { value: 2.0 },
                uTextureSize: { value: textureSize },
                uParticleCount: { value: particleCount }
            },
            vertexShader: particleRenderShader.vertexShader,
            fragmentShader: particleRenderShader.fragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true
        })
        
        const renderTargets = {
            position: { rt1: rtPosition1, rt2: rtPosition2, current: 0 },
            velocity: { rt1: rtVelocity1, rt2: rtVelocity2, current: 0 },
            computeShader
        }
        
        return { geometry, computeShader, renderMaterial, renderTargets }
    }, [particleCount, gl, boundaries])

    // Update boundaries when viewport changes
    useEffect(() => {
        if (computeShader) {
            computeShader.uniforms.uBoundaryMin.value = boundaries.min
            computeShader.uniforms.uBoundaryMax.value = boundaries.max
        }
    }, [boundaries, computeShader])

    // Update loop - pure GPU computation with dynamic boundaries
    useFrame((state, delta) => {
        if (!meshRef.current || !computeShader || !geometry || !renderTargets) return
        
        timeRef.current += delta
        const deltaTime = Math.min(delta, 0.016)
        
        // Update compute shader uniforms
        computeShader.uniforms.uTime.value = timeRef.current
        computeShader.uniforms.uDeltaTime.value = deltaTime
        
        // Ping-pong render targets
        const posInput = renderTargets.position.current === 0 ? renderTargets.position.rt1 : renderTargets.position.rt2
        const posOutput = renderTargets.position.current === 0 ? renderTargets.position.rt2 : renderTargets.position.rt1
        const velInput = renderTargets.velocity.current === 0 ? renderTargets.velocity.rt1 : renderTargets.velocity.rt2
        const velOutput = renderTargets.velocity.current === 0 ? renderTargets.velocity.rt2 : renderTargets.velocity.rt1
        
        // Update shader inputs
        computeShader.uniforms.uPositions.value = posInput.texture
        computeShader.uniforms.uVelocities.value = velInput.texture
        
        // Render compute shaders
        const currentRenderTarget = gl.getRenderTarget()
        const scene = new THREE.Scene()
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
        scene.add(quad)
        quad.material = computeShader
        
        // Pass 0: Update positions (forces calculated once here)
        computeShader.uniforms.uPass.value = 0
        gl.setRenderTarget(posOutput)
        gl.render(scene, camera)
        
        // Pass 1: Update velocities (reuses same force calculation)
        computeShader.uniforms.uPass.value = 1
        gl.setRenderTarget(velOutput)
        gl.render(scene, camera)
        
        gl.setRenderTarget(currentRenderTarget)
        
        // Update render material to use new position texture
        renderMaterial.uniforms.uPositions.value = posOutput.texture
        renderMaterial.uniforms.uTime.value = timeRef.current
        
        // Swap render targets
        renderTargets.position.current = 1 - renderTargets.position.current
        renderTargets.velocity.current = 1 - renderTargets.velocity.current
    })

    // Expose interface for ParticleSystem
    useImperativeHandle(ref, () => ({
        startTransition: () => {
            // Future: transition to shape formation
        },
        endTransition: () => {
            // Future: transition back to flocking
        },
        update: () => {
            // Future: manual update trigger
        },
        velocities: new Float32Array(particleCount * 3),
        positions: new Float32Array(particleCount * 3)
    }), [particleCount])

    if (!geometry || !computeShader || !renderMaterial) {
        return null
    }

    return (
        <points 
            ref={meshRef}
            geometry={geometry} 
            material={renderMaterial} 
            frustumCulled={false} 
        />
    )
})

FlockingFBO.displayName = 'FlockingFBO'

export default FlockingFBO
