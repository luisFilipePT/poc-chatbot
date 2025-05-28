import { useRef, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { flockingComputeShader } from '../../shaders/flockingCompute'
import { shapeFormationComputeShader } from '../../shaders/shapeFormationCompute'
import { particleRenderShader } from '../../shaders/particleRender'
import { ShapeGeometry } from '../ShapeFormation/ShapeGeometry'

const UnifiedParticleFBO = forwardRef(({ 
    particleCount = 2500,
    mode = 'flocking', // 'flocking', 'forming', 'formed', 'dispersing'
    targetShape = null,
    transitionProgress = 0.0,
    formationStrength = 1.0
}, ref) => {
    const meshRef = useRef()
    const timeRef = useRef(0)
    const targetTextureRef = useRef(null)
    const { gl, viewport, camera } = useThree()
    
    // Calculate dynamic boundaries based on viewport
    const boundaries = useMemo(() => {
        const distance = 10
        const vFOV = camera.fov * Math.PI / 180
        const height = 2 * Math.tan(vFOV / 2) * distance
        const width = height * camera.aspect
        
        const buffer = 1.02
        const halfWidth = (width * buffer) / 2
        const halfHeight = (height * buffer) / 2
        const depth = 15
        
        return {
            min: new THREE.Vector3(-halfWidth, -halfHeight, -depth),
            max: new THREE.Vector3(halfWidth, halfHeight, depth)
        }
    }, [camera.fov, camera.aspect])
    
    // CPU: Process target shape when it changes
    useEffect(() => {
        if (targetShape) {
            const loadTargetShape = async () => {
                try {
                    console.log('Loading target shape:', targetShape)
                    const { positions } = await ShapeGeometry.generateTargetPositions(
                        particleCount, 
                        20, 
                        targetShape
                    )
                    
                    const { texture } = ShapeGeometry.createTargetTexture(positions, particleCount)
                    targetTextureRef.current = texture
                    
                    console.log('Target shape loaded successfully:', targetShape)
                    console.log('Target positions count:', positions.length)
                } catch (error) {
                    console.error('Failed to load target shape:', error)
                }
            }
            
            loadTargetShape()
        } else {
            // Clear target texture when no target shape
            targetTextureRef.current = null
        }
    }, [targetShape, particleCount])
    
    // GPU-based unified particle system
    const { geometry, computeShader, renderMaterial, renderTargets } = useMemo(() => {
        if (!gl.capabilities.isWebGL2) {
            console.warn('WebGL2 not supported')
            return { geometry: null, computeShader: null, renderMaterial: null, renderTargets: null }
        }

        const textureSize = Math.ceil(Math.sqrt(particleCount))
        console.log('Creating FBO with texture size:', textureSize, 'for', particleCount, 'particles')
        
        // Create initial data within boundaries
        const initialPositionsData = new Float32Array(textureSize * textureSize * 4)
        const velocitiesData = new Float32Array(textureSize * textureSize * 4)
        
        // Initialize particles with random positions and velocities
        for (let i = 0; i < particleCount; i++) {
            const i4 = i * 4
            
            // Random positions within boundaries
            const spawnArea = 0.8
            initialPositionsData[i4] = (Math.random() - 0.5) * (boundaries.max.x - boundaries.min.x) * spawnArea
            initialPositionsData[i4 + 1] = (Math.random() - 0.5) * (boundaries.max.y - boundaries.min.y) * spawnArea
            initialPositionsData[i4 + 2] = (Math.random() - 0.5) * (boundaries.max.z - boundaries.min.z) * spawnArea
            initialPositionsData[i4 + 3] = 1.0
            
            // Random velocities
            const speed = 0.5 + Math.random() * 1.0
            const angle = Math.random() * Math.PI * 2
            const elevation = (Math.random() - 0.5) * 0.5
            
            velocitiesData[i4] = Math.cos(angle) * Math.cos(elevation) * speed
            velocitiesData[i4 + 1] = Math.sin(elevation) * speed
            velocitiesData[i4 + 2] = Math.sin(angle) * Math.cos(elevation) * speed
            velocitiesData[i4 + 3] = 0.0
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
            initialPositionsData, textureSize, textureSize, THREE.RGBAFormat, THREE.FloatType
        )
        positionTexture.needsUpdate = true
        
        const velocityTexture = new THREE.DataTexture(
            velocitiesData, textureSize, textureSize, THREE.RGBAFormat, THREE.FloatType
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
        
        // Create empty target texture (will be updated when target shape loads)
        const emptyTargetData = new Float32Array(textureSize * textureSize * 4)
        const emptyTargetTexture = new THREE.DataTexture(
            emptyTargetData, textureSize, textureSize, THREE.RGBAFormat, THREE.FloatType
        )
        emptyTargetTexture.needsUpdate = true
        
        // Start with flocking shader - will be updated dynamically
        const initialShader = flockingComputeShader
        
        // Create compute shader (will be updated dynamically)
        const computeShader = new THREE.ShaderMaterial({
            uniforms: {
                uPositions: { value: rtPosition1.texture },
                uVelocities: { value: rtVelocity1.texture },
                uTargetPositions: { value: emptyTargetTexture },
                uTime: { value: 0 },
                uDeltaTime: { value: 0 },
                uParticleCount: { value: particleCount },
                uTextureSize: { value: textureSize },
                uPass: { value: 0 },
                uTransitionProgress: { value: 0.0 },
                uFormationStrength: { value: 1.0 },
                uBoundaryMin: { value: boundaries.min },
                uBoundaryMax: { value: boundaries.max }
            },
            vertexShader: initialShader.vertexShader,
            fragmentShader: initialShader.fragmentShader
        })
        
        // Create geometry for particle rendering
        const geometry = new THREE.BufferGeometry()
        const indices = new Float32Array(particleCount)
        const positions = new Float32Array(particleCount * 3)
        
        for (let i = 0; i < particleCount; i++) {
            indices[i] = i
            positions[i * 3] = 0
            positions[i * 3 + 1] = 0
            positions[i * 3 + 2] = 0
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geometry.setAttribute('aIndex', new THREE.BufferAttribute(indices, 1))
        
        // Create render material
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

    // Update shader when mode changes
    useEffect(() => {
        if (!computeShader) return
        
        console.log('Switching shader mode to:', mode, 'with transition progress:', transitionProgress)
        
        let selectedShader
        switch(mode) {
            case 'flocking':
            case 'dispersing':
                selectedShader = flockingComputeShader
                break
            case 'forming':
            case 'formed':
                selectedShader = shapeFormationComputeShader
                break
            default:
                selectedShader = flockingComputeShader
        }
        
        // Update shader code
        computeShader.vertexShader = selectedShader.vertexShader
        computeShader.fragmentShader = selectedShader.fragmentShader
        computeShader.needsUpdate = true
        
        console.log('Shader updated to:', mode)
    }, [mode, computeShader, transitionProgress])

    // Update boundaries when viewport changes
    useEffect(() => {
        if (computeShader) {
            computeShader.uniforms.uBoundaryMin.value = boundaries.min
            computeShader.uniforms.uBoundaryMax.value = boundaries.max
        }
    }, [boundaries, computeShader])

    // Update target texture when it loads
    useEffect(() => {
        if (computeShader) {
            if (targetTextureRef.current) {
                console.log('Setting target texture in shader')
                computeShader.uniforms.uTargetPositions.value = targetTextureRef.current
            } else {
                console.log('Clearing target texture in shader')
                // Create empty texture
                const textureSize = Math.ceil(Math.sqrt(particleCount))
                const emptyData = new Float32Array(textureSize * textureSize * 4)
                const emptyTexture = new THREE.DataTexture(
                    emptyData, textureSize, textureSize, THREE.RGBAFormat, THREE.FloatType
                )
                emptyTexture.needsUpdate = true
                computeShader.uniforms.uTargetPositions.value = emptyTexture
            }
        }
    }, [computeShader, particleCount])

    // GPU: Real-time particle computation and rendering
    useFrame((state, delta) => {
        if (!meshRef.current || !computeShader || !geometry || !renderTargets) return
        
        timeRef.current += delta
        const deltaTime = Math.min(delta, 0.016)
        
        // Update compute shader uniforms
        computeShader.uniforms.uTime.value = timeRef.current
        computeShader.uniforms.uDeltaTime.value = deltaTime
        computeShader.uniforms.uTransitionProgress.value = transitionProgress
        computeShader.uniforms.uFormationStrength.value = formationStrength
        
        // Update target texture if it changed
        if (targetTextureRef.current && computeShader.uniforms.uTargetPositions.value !== targetTextureRef.current) {
            computeShader.uniforms.uTargetPositions.value = targetTextureRef.current
        }
        
        // Ping-pong render targets
        const posInput = renderTargets.position.current === 0 ? renderTargets.position.rt1 : renderTargets.position.rt2
        const posOutput = renderTargets.position.current === 0 ? renderTargets.position.rt2 : renderTargets.position.rt1
        const velInput = renderTargets.velocity.current === 0 ? renderTargets.velocity.rt1 : renderTargets.velocity.rt2
        const velOutput = renderTargets.velocity.current === 0 ? renderTargets.velocity.rt2 : renderTargets.velocity.rt1
        
        // Update shader inputs
        computeShader.uniforms.uPositions.value = posInput.texture
        computeShader.uniforms.uVelocities.value = velInput.texture
        
        // GPU: Render compute shaders
        const currentRenderTarget = gl.getRenderTarget()
        const scene = new THREE.Scene()
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
        scene.add(quad)
        quad.material = computeShader
        
        // Pass 0: Update positions
        computeShader.uniforms.uPass.value = 0
        gl.setRenderTarget(posOutput)
        gl.render(scene, camera)
        
        // Pass 1: Update velocities
        computeShader.uniforms.uPass.value = 1
        gl.setRenderTarget(velOutput)
        gl.render(scene, camera)
        
        gl.setRenderTarget(currentRenderTarget)
        
        // GPU: Update render material
        renderMaterial.uniforms.uPositions.value = posOutput.texture
        renderMaterial.uniforms.uTime.value = timeRef.current
        
        // Swap render targets
        renderTargets.position.current = 1 - renderTargets.position.current
        renderTargets.velocity.current = 1 - renderTargets.velocity.current
    })

    // Expose interface for ParticleSystem
    useImperativeHandle(ref, () => ({
        getRenderTargets: () => renderTargets,
        getCurrentMode: () => mode
    }), [renderTargets, mode])

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

UnifiedParticleFBO.displayName = 'UnifiedParticleFBO'

export default UnifiedParticleFBO 