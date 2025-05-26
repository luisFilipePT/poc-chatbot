import {useRef, useMemo, useState, useEffect} from 'react'
import {useFrame, useThree} from '@react-three/fiber'
import * as THREE from 'three'
import {useTheme} from '../../contexts/ThemeContext'
import {FlockingBehavior} from './FlockingBehavior'
import {ShapeGeometry} from '../ShapeFormation/ShapeGeometry'
import {particleVertexShader, particleFragmentShader} from './particleShader'
import FlockingFBO from '../FBO/FlockingFBO'


function ParticleSystem({ onShapeForm, targetShape, onDisperse }) {
    const [targetSizes, setTargetSizes] = useState(null)
    const [targetPositions, setTargetPositions] = useState(null)
    const [formationStartTime, setFormationStartTime] = useState(null)
    const [particleState, setParticleState] = useState('flocking')
    const [assignedTargets, setAssignedTargets] = useState(null)
    const [lastTargetTimestamp, setLastTargetTimestamp] = useState(null)

    const meshRef = useRef()
    const { theme, isDark } = useTheme()
    const { viewport } = useThree()
    const particleCount = 2500
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

    // Initialize shader uniforms
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uTransition: { value: 0 },
        uFormationProgress: { value: 0 },
        uClickPosition: { value: new THREE.Vector3() },
        uSpiralTime: { value: 0 },
        uIsFormed: { value: false },
        isDarkTheme: { value: isDark },
        uOpacity: { value: 1 }
    }), [])

    // Update theme uniform when it changes
    useEffect(() => {
        uniforms.isDarkTheme.value = isDark
    }, [isDark, uniforms])

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

    // Optimized particle assignment
    const assignParticlesToTargets = (currentPositions, targetPositions) => {
        const assignments = new Int32Array(particleCount)
        const particles = []
        const targets = []

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

        // Greedy assignment with early termination
        for (const particle of particles) {
            let minDistSq = Infinity
            let bestTarget = null

            for (const target of targets) {
                if (target.assigned) continue

                // Early termination if x distance is too large
                const xDist = Math.abs(target.x - particle.x)
                if (xDist * xDist > minDistSq) break

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

    // Initialize particle attributes
    const sizes = useMemo(() => {
        const s = new Float32Array(particleCount)
        for (let i = 0; i < particleCount; i++) {
            s[i] = 0.3 + Math.random() * 0.4
        }
        return s
    }, [particleCount])

    const filled = useMemo(() => {
        const f = new Float32Array(particleCount)
        for (let i = 0; i < particleCount; i++) {
            f[i] = Math.random() < 0.8 ? 1.0 : 0.0
        }
        return f
    }, [particleCount])

    // Initialize positions with murmuration shape
    const positions = useMemo(() => {
        const pos = new Float32Array(particleCount * 3)

        for (let i = 0; i < particleCount; i++) {
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

            pos[i * 3] = baseX + wave1 + offsetX
            pos[i * 3 + 1] = baseY + wave2 + offsetY
            pos[i * 3 + 2] = offsetZ

            if (Math.random() < 0.02 && t > 0.1 && t < 0.9) {
                pos[i * 3] += (Math.random() - 0.5) * 5
                pos[i * 3 + 1] += (Math.random() - 0.5) * 5
            }
        }

        return pos
    }, [particleCount])

    // Particle colors
    const colors = useMemo(() => {
        const cols = new Float32Array(particleCount * 3)
        const color = new THREE.Color(theme.particleColor)

        for (let i = 0; i < particleCount; i++) {
            if (isDark) {
                const brightness = 0.8 + Math.random() * 0.4
                cols[i * 3] = color.r * brightness
                cols[i * 3 + 1] = color.g * brightness
                cols[i * 3 + 2] = color.b * brightness
            } else {
                const darkness = 0.1 + Math.random() * 0.3
                cols[i * 3] = darkness
                cols[i * 3 + 1] = darkness
                cols[i * 3 + 2] = darkness
            }
        }
        return cols
    }, [particleCount, theme.particleColor, isDark])

    // Smooth easing function
    const easeInOutCubic = (t) => {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    }

    // Main animation loop
    useFrame((state, delta) => {
        if (!meshRef.current) return

        // FPS monitoring
        frameCount.current++
        const now = Date.now()
        if (now - lastFpsCheck.current > 1000) {
            const fps = frameCount.current
            if (fps < 30) {
                console.warn(`Low FPS: ${fps}`)
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
            flocking.current.update(positions, Math.min(delta, 0.1))
            uniforms.uTransition.value = 0
            uniforms.uFormationProgress.value = 0
            uniforms.uIsFormed.value = false

        } else if (particleState === 'forming' && targetPositions && assignedTargets) {
            const elapsedTime = (Date.now() - formationStartTime) / 1000
            const formProgress = Math.min(elapsedTime / 4, 1)
            const easedProgress = easeInOutCubic(formProgress)

            uniforms.uTransition.value = easedProgress
            uniforms.uFormationProgress.value = formProgress

            if (formProgress < 0.5) {
                flocking.current.update(positions, Math.min(delta, 0.1) * (1 - formProgress * 2))
            }

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

                positions[i3] = currentX + (targetX - currentX) * easedProgress * 0.05
                positions[i3 + 1] = currentY + (targetY - currentY) * easedProgress * 0.05
                positions[i3 + 2] = currentZ + (targetZ - currentZ) * easedProgress * 0.05

                flocking.current.velocities[i3] = (positions[i3] - currentX) / delta
                flocking.current.velocities[i3 + 1] = (positions[i3 + 1] - currentY) / delta
                flocking.current.velocities[i3 + 2] = (positions[i3 + 2] - currentZ) / delta
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

                positions[i3] = positions[i3] * 0.9 + finalX * 0.1
                positions[i3 + 1] = positions[i3 + 1] * 0.9 + finalY * 0.1
                positions[i3 + 2] = positions[i3 + 2] * 0.9 + finalZ * 0.1
            }

        } else if (particleState === 'dispersing') {
            const elapsedTime = (Date.now() - formationStartTime) / 1000
            const disperseProgress = Math.min(elapsedTime / 3, 1)

            uniforms.uTransition.value = Math.max(1 - disperseProgress, 0)
            uniforms.uFormationProgress.value = 1 - disperseProgress
            uniforms.uIsFormed.value = false

            flocking.current.update(positions, Math.min(delta, 0.1) * disperseProgress)

            if (disperseProgress < 0.5) {
                for (let i = 0; i < particleCount; i++) {
                    const i3 = i * 3
                    const randomForce = (1 - disperseProgress * 2) * 0.5

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
                vertexShader={particleVertexShader}
                fragmentShader={particleFragmentShader}
                transparent={true}
                vertexColors={true}
                blending={isDark ? THREE.AdditiveBlending : THREE.NormalBlending}
                depthWrite={false}
            />
        </points>
    )
}

export default ParticleSystem

