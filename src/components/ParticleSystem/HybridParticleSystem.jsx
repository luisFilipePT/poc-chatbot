import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useTheme } from '../../contexts/ThemeContext'
import { FlockingBehavior } from './FlockingBehavior'
import { ShapeGeometry } from '../ShapeFormation/ShapeGeometry'

function OptimizedParticleSystem({ onShapeForm, targetShape, onDisperse }) {
    const [targetSizes, setTargetSizes] = useState(null)
    const [targetPositions, setTargetPositions] = useState(null)
    const [formationStartTime, setFormationStartTime] = useState(null)
    const [particleState, setParticleState] = useState('flocking')
    const [assignedTargets, setAssignedTargets] = useState(null)
    const [lastTargetTimestamp, setLastTargetTimestamp] = useState(null)

    const meshRef = useRef()
    const { theme, isDark } = useTheme()
    const { viewport } = useThree()

    // Increased particle count with optimizations
    const particleCount = 5000 // Doubled from original
    const flocking = useRef(new FlockingBehavior(particleCount))

    // Performance monitoring
    const frameCount = useRef(0)
    const lastFpsCheck = useRef(Date.now())

    // Boundary constraints
    const boundaries = {
        x: viewport.width * 0.7,
        y: viewport.height * 0.7,
        z: 20
    }

    // Optimized shader uniforms
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uTransition: { value: 0 },
        uFormationProgress: { value: 0 },
        uClickPosition: { value: new THREE.Vector3() },
        uSpiralTime: { value: 0 },
        uIsFormed: { value: false },
        isDarkTheme: { value: isDark },
        uOpacity: { value: 1 }
    }), [isDark])

    // Update theme uniform when it changes
    useEffect(() => {
        uniforms.isDarkTheme.value = isDark
    }, [isDark, uniforms])

    // Optimized vertex shader
    const optimizedVertexShader = `
        attribute float size;
        attribute float filled;
        
        varying float vFilled;
        varying vec3 vColor;
        varying float vDistance;
        varying float vPhase;
        
        uniform float uTime;
        uniform float uTransition;
        uniform float uFormationProgress;
        uniform vec3 uClickPosition;
        uniform float uSpiralTime;
        uniform bool uIsFormed;
        
        void main() {
            vec3 pos = position;
            
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
            
            vColor = color;
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
    `

    // Optimized fragment shader
    const optimizedFragmentShader = `
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
    `

    // Initialize particle attributes with optimizations
    const { sizes, filled, positions, colors } = useMemo(() => {
        const s = new Float32Array(particleCount)
        const f = new Float32Array(particleCount)
        const pos = new Float32Array(particleCount * 3)
        const cols = new Float32Array(particleCount * 3)

        const color = new THREE.Color(theme.particleColor)

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3

            // Particle properties
            s[i] = 0.3 + Math.random() * 0.4
            f[i] = Math.random() < 0.8 ? 1.0 : 0.0

            // Initialize with murmuration shape
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

            pos[i3] = baseX + wave1 + offsetX
            pos[i3 + 1] = baseY + wave2 + offsetY
            pos[i3 + 2] = offsetZ

            // Colors
            if (isDark) {
                const brightness = 0.8 + Math.random() * 0.4
                cols[i3] = color.r * brightness
                cols[i3 + 1] = color.g * brightness
                cols[i3 + 2] = color.b * brightness
            } else {
                const darkness = 0.1 + Math.random() * 0.3
                cols[i3] = darkness
                cols[i3 + 1] = darkness
                cols[i3 + 2] = darkness
            }

            if (Math.random() < 0.02 && t > 0.1 && t < 0.9) {
                pos[i3] += (Math.random() - 0.5) * 5
                pos[i3 + 1] += (Math.random() - 0.5) * 5
            }
        }

        return { sizes: s, filled: f, positions: pos, colors: cols }
    }, [particleCount, theme.particleColor, isDark])

    // Handle target shape formation
    useEffect(() => {
        if (targetShape && targetShape.timestamp !== lastTargetTimestamp) {
            setLastTargetTimestamp(targetShape.timestamp)

            if (particleState === 'formed') {
                setParticleState('dispersing')
                setFormationStartTime(Date.now())
                flocking.current.endTransition()
                uniforms.uClickPosition.value.set(0, 0, 0)
                if (onDisperse) onDisperse()
                return
            }

            if (particleState === 'flocking') {
                const setupFormation = async () => {
                    try {
                        const { positions: shapePositions, sizes: shapeSizes } =
                            await ShapeGeometry.generateCircularShape(
                                targetShape.position,
                                particleCount
                            )

                        const assignments = assignParticlesToTargets(
                            meshRef.current.geometry.attributes.position.array,
                            shapePositions
                        )

                        setAssignedTargets(assignments)
                        setTargetPositions(shapePositions)
                        setTargetSizes(shapeSizes)
                        setFormationStartTime(Date.now())
                        setParticleState('forming')
                        uniforms.uClickPosition.value.copy(targetShape.position)

                        flocking.current.startTransition()
                    } catch (error) {
                        console.error('Failed to generate shape:', error)
                    }
                }
                setupFormation()
            }
        }
    }, [targetShape, particleCount, particleState, lastTargetTimestamp, uniforms, onDisperse])

    // Optimized particle assignment with spatial hashing
    const assignParticlesToTargets = (currentPositions, targetPositions) => {
        const assignments = new Int32Array(particleCount)
        const particles = []
        const targets = []

        // Create particle and target arrays
        for (let i = 0; i < particleCount; i++) {
            particles.push({
                index: i,
                x: currentPositions[i * 3],
                y: currentPositions[i * 3 + 1],
                z: currentPositions[i * 3 + 2]
            })
            targets.push({
                index: i,
                x: targetPositions[i * 3],
                y: targetPositions[i * 3 + 1],
                z: targetPositions[i * 3 + 2],
                assigned: false
            })
        }

        // Sort by x coordinate for spatial locality
        particles.sort((a, b) => a.x - b.x)
        targets.sort((a, b) => a.x - b.x)

        // Optimized assignment with early termination
        for (const particle of particles) {
            let minDistSq = Infinity
            let bestTarget = null

            // Use spatial coherence to limit search
            for (const target of targets) {
                if (target.assigned) continue

                const xDist = Math.abs(target.x - particle.x)
                if (xDist * xDist > minDistSq) break // Early termination

                const dx = target.x - particle.x
                const dy = target.y - particle.y
                const dz = target.z - particle.z
                const distSq = dx * dx + dy * dy + dz * dz

                if (distSq < minDistSq) {
                    minDistSq = distSq
                    bestTarget = target
                }
            }

            if (bestTarget) {
                assignments[particle.index] = bestTarget.index
                bestTarget.assigned = true
            }
        }

        return assignments
    }

    // Smooth easing function
    const easeInOutCubic = (t) => {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    }

    // Main animation loop with optimizations
    useFrame((state, delta) => {
        if (!meshRef.current) return

        // FPS monitoring
        frameCount.current++
        const now = Date.now()
        if (now - lastFpsCheck.current > 1000) {
            const fps = frameCount.current
            if (fps < 30) {
                console.warn(`Performance warning: ${fps} FPS`)
            }
            frameCount.current = 0
            lastFpsCheck.current = now
        }

        const positions = meshRef.current.geometry.attributes.position.array
        const time = state.clock.elapsedTime

        // Update time uniform
        uniforms.uTime.value = time

        // State-based animations
        if (particleState === 'flocking') {
            // Use optimized flocking with capped delta time
            flocking.current.update(positions, Math.min(delta, 0.033))
            uniforms.uTransition.value = 0
            uniforms.uFormationProgress.value = 0
            uniforms.uIsFormed.value = false

        } else if (particleState === 'forming' && targetPositions && assignedTargets) {
            const elapsedTime = (Date.now() - formationStartTime) / 1000
            const formProgress = Math.min(elapsedTime / 3, 1) // Faster formation
            const easedProgress = easeInOutCubic(formProgress)

            uniforms.uTransition.value = easedProgress
            uniforms.uFormationProgress.value = formProgress

            // Reduce flocking influence during formation
            if (formProgress < 0.5) {
                flocking.current.update(positions, Math.min(delta, 0.033) * (1 - formProgress * 2))
            }

            // Interpolate to target positions
            for (let i = 0; i < particleCount; i++) {
                const i3 = i * 3
                const targetIndex = assignedTargets[i]
                const t3 = targetIndex * 3

                const currentX = positions[i3]
                const currentY = positions[i3 + 1]
                const currentZ = positions[i3 + 2]

                const targetX = targetPositions[t3]
                const targetY = targetPositions[t3 + 1]
                const targetZ = targetPositions[t3 + 2]

                // Faster interpolation
                const lerpFactor = easedProgress * 0.08
                positions[i3] = currentX + (targetX - currentX) * lerpFactor
                positions[i3 + 1] = currentY + (targetY - currentY) * lerpFactor
                positions[i3 + 2] = currentZ + (targetZ - currentZ) * lerpFactor

                // Update velocities for smooth transition
                if (delta > 0) {
                    flocking.current.velocities[i3] = (positions[i3] - currentX) / delta
                    flocking.current.velocities[i3 + 1] = (positions[i3 + 1] - currentY) / delta
                    flocking.current.velocities[i3 + 2] = (positions[i3 + 2] - currentZ) / delta
                }
            }

            if (formProgress >= 1) {
                setParticleState('formed')
                uniforms.uIsFormed.value = true
                if (onShapeForm) {
                    onShapeForm(targetShape.position)
                }
            }

        } else if (particleState === 'formed' && targetPositions && assignedTargets) {
            uniforms.uTransition.value = 1
            uniforms.uIsFormed.value = true
            uniforms.uSpiralTime.value = time

            let centerX = 0, centerY = 0, centerZ = 0
            if (targetShape && targetShape.position) {
                centerX = targetShape.position.x
                centerY = targetShape.position.y
                centerZ = targetShape.position.z
            }

            // Maintain formation with subtle animation
            for (let i = 0; i < particleCount; i++) {
                const i3 = i * 3
                const targetIndex = assignedTargets[i]
                const t3 = targetIndex * 3

                const targetX = targetPositions[t3]
                const targetY = targetPositions[t3 + 1]
                const targetZ = targetPositions[t3 + 2]

                const dx = targetX - centerX
                const dy = targetY - centerY
                const distance = Math.sqrt(dx * dx + dy * dy)
                const angle = Math.atan2(dy, dx)

                const spiralOffset = angle * 2 + distance * 0.3 - time * 5
                const waveHeight = Math.sin(spiralOffset) * Math.exp(-distance / 20) * 0.5

                const finalX = targetX
                const finalY = targetY
                const finalZ = targetZ + waveHeight

                // Smooth interpolation to maintain formation
                positions[i3] = positions[i3] * 0.95 + finalX * 0.05
                positions[i3 + 1] = positions[i3 + 1] * 0.95 + finalY * 0.05
                positions[i3 + 2] = positions[i3 + 2] * 0.95 + finalZ * 0.05
            }

        } else if (particleState === 'dispersing') {
            const elapsedTime = (Date.now() - formationStartTime) / 1000
            const disperseProgress = Math.min(elapsedTime / 2, 1) // Faster dispersal

            uniforms.uTransition.value = Math.max(1 - disperseProgress, 0)
            uniforms.uFormationProgress.value = 1 - disperseProgress
            uniforms.uIsFormed.value = false

            // Resume flocking with increasing influence
            flocking.current.update(positions, Math.min(delta, 0.033) * disperseProgress)

            // Add dispersal forces
            if (disperseProgress < 0.5) {
                for (let i = 0; i < particleCount; i++) {
                    const i3 = i * 3
                    const randomForce = (1 - disperseProgress * 2) * 0.8

                    flocking.current.velocities[i3] += (Math.random() - 0.5) * randomForce
                    flocking.current.velocities[i3 + 1] += (Math.random() - 0.5) * randomForce
                    flocking.current.velocities[i3 + 2] += (Math.random() - 0.5) * randomForce * 0.5
                }
            }

            if (disperseProgress >= 1) {
                setParticleState('flocking')
                setTargetPositions(null)
                setAssignedTargets(null)
                setTargetSizes(null)
                uniforms.uClickPosition.value.set(0, 0, 0)
            }
        }

        // Apply boundary constraints
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3

            if (Math.abs(positions[i3]) > boundaries.x) {
                positions[i3] = Math.sign(positions[i3]) * boundaries.x * 0.95
                flocking.current.velocities[i3] *= -0.5
            }
            if (Math.abs(positions[i3 + 1]) > boundaries.y) {
                positions[i3 + 1] = Math.sign(positions[i3 + 1]) * boundaries.y * 0.95
                flocking.current.velocities[i3 + 1] *= -0.5
            }
            if (Math.abs(positions[i3 + 2]) > boundaries.z) {
                positions[i3 + 2] = Math.sign(positions[i3 + 2]) * boundaries.z * 0.95
                flocking.current.velocities[i3 + 2] *= -0.5
            }
        }

        meshRef.current.geometry.attributes.position.needsUpdate = true

        // Update sizes during formation if needed
        if (targetSizes && particleState === 'forming') {
            const sizeAttribute = meshRef.current.geometry.attributes.size
            const formProgress = uniforms.uFormationProgress.value

            if (formProgress > 0.5) {
                for (let i = 0; i < particleCount; i++) {
                    const currentSize = sizeAttribute.array[i]
                    const targetSize = targetSizes[i]
                    sizeAttribute.array[i] = currentSize * 0.95 + targetSize * 0.05
                }
                sizeAttribute.needsUpdate = true
            }
        }
    })

    return (
        <points ref={meshRef} frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={particleCount}
                    array={positions}
                    itemSize={3}
                />
                <bufferAttribute
                    attach="attributes-color"
                    count={particleCount}
                    array={colors}
                    itemSize={3}
                />
                <bufferAttribute
                    attach="attributes-size"
                    count={particleCount}
                    array={sizes}
                    itemSize={1}
                />
                <bufferAttribute
                    attach="attributes-filled"
                    count={particleCount}
                    array={filled}
                    itemSize={1}
                />
            </bufferGeometry>
            <shaderMaterial
                uniforms={uniforms}
                vertexShader={optimizedVertexShader}
                fragmentShader={optimizedFragmentShader}
                transparent={true}
                vertexColors={true}
                blending={isDark ? THREE.AdditiveBlending : THREE.NormalBlending}
                depthWrite={false}
            />
        </points>
    )
}

export default OptimizedParticleSystem
