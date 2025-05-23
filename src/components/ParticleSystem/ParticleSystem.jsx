import {useRef, useMemo, useState, useEffect} from 'react'
import {useFrame, useThree} from '@react-three/fiber'
import * as THREE from 'three'
import {useTheme} from '../../contexts/ThemeContext'
import {FlockingBehavior} from './FlockingBehavior'
import {ShapeGeometry} from '../ShapeFormation/ShapeGeometry'
import {particleVertexShader, particleFragmentShader} from './particleShader'


function ParticleSystem({onShapeForm, targetShape, onDisperse}) {
    const [targetSizes, setTargetSizes] = useState(null)
    const [targetPositions, setTargetPositions] = useState(null)
    const [formationStartTime, setFormationStartTime] = useState(null)
    const [particleState, setParticleState] = useState('flocking') // 'flocking', 'forming', 'formed', 'dispersing'
    const [assignedTargets, setAssignedTargets] = useState(null)
    const [lastTargetTimestamp, setLastTargetTimestamp] = useState(null)

    const meshRef = useRef()
    const {theme, isDark} = useTheme()
    const {viewport} = useThree()
    const particleCount = 2500
    const flocking = useRef(new FlockingBehavior(particleCount))

    // Boundary constraints
    const boundaries = {
        x: viewport.width * 0.7,
        y: viewport.height * 0.7,
        z: 20
    }

    useEffect(() => {
        // Only process if this is a new click (different timestamp)
        if (targetShape && targetShape.timestamp !== lastTargetTimestamp) {
            setLastTargetTimestamp(targetShape.timestamp)

            // If already in formed state, start dispersing back to flocking
            if (particleState === 'formed') {
                setParticleState('dispersing')
                setFormationStartTime(Date.now())
                flocking.current.endTransition()
                if (onDisperse) onDisperse() // Notify about dispersion
                return
            }

            // Only start formation if currently flocking
            if (particleState === 'flocking') {
                const setupFormation = async () => {
                    try {
                        const {positions: shapePositions, sizes: shapeSizes} =
                            await ShapeGeometry.generateCircularShape(
                                targetShape.position,
                                particleCount
                            )

                        // Pre-calculate particle-to-target assignments
                        const assignments = assignParticlesToTargets(
                            meshRef.current.geometry.attributes.position.array,
                            shapePositions
                        )

                        setAssignedTargets(assignments)
                        setTargetPositions(shapePositions)
                        setTargetSizes(shapeSizes)
                        setFormationStartTime(Date.now())
                        setParticleState('forming')

                        // Gradually reduce flocking forces
                        flocking.current.startTransition()
                    } catch (error) {
                        console.error('Failed to generate shape:', error)
                    }
                }
                setupFormation()
            }
        }
    }, [targetShape, particleCount, particleState, lastTargetTimestamp])

    // Function to assign particles to nearest target positions
    const assignParticlesToTargets = (currentPositions, targetPositions) => {
        const assignments = new Int32Array(particleCount)
        const used = new Set()

        // For each particle, find the nearest unused target
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3
            let minDist = Infinity
            let bestTarget = -1

            for (let j = 0; j < particleCount; j++) {
                if (used.has(j)) continue

                const j3 = j * 3
                const dx = currentPositions[i3] - targetPositions[j3]
                const dy = currentPositions[i3 + 1] - targetPositions[j3 + 1]
                const dz = currentPositions[i3 + 2] - targetPositions[j3 + 2]
                const dist = dx * dx + dy * dy + dz * dz

                if (dist < minDist) {
                    minDist = dist
                    bestTarget = j
                }
            }

            assignments[i] = bestTarget
            used.add(bestTarget)
        }

        return assignments
    }

    // Add this new useMemo for sizes
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

    // Generate initial positions with murmuration-like distribution
    const positions = useMemo(() => {
        const pos = new Float32Array(particleCount * 3)

        // Create a diagonal flowing murmuration shape with pointed edges
        for (let i = 0; i < particleCount; i++) {
            const t = i / particleCount

            // Main diagonal flow from bottom-left to top-right
            const baseX = -20 + t * 40
            const baseY = -10 + t * 20

            // Add wave patterns for organic flow
            const wave1 = Math.sin(t * Math.PI * 3) * 4
            const wave2 = Math.cos(t * Math.PI * 5) * 2

            // Create pointed edges - narrow at ends, wide in middle
            const envelope = Math.sin(t * Math.PI)
            const pointiness = Math.pow(envelope, 0.3)

            // Vary the spread based on position
            const spread = pointiness * 5 + 0.2

            // Random offset for natural clustering
            const angle = Math.random() * Math.PI * 2
            const radius = Math.random() * spread
            const offsetX = Math.cos(angle) * radius
            const offsetY = Math.sin(angle) * radius
            const offsetZ = (Math.random() - 0.5) * 2 * pointiness

            // Apply position
            pos[i * 3] = baseX + wave1 + offsetX
            pos[i * 3 + 1] = baseY + wave2 + offsetY
            pos[i * 3 + 2] = offsetZ

            // Add very few scattered particles
            if (Math.random() < 0.02 && t > 0.1 && t < 0.9) {
                pos[i * 3] += (Math.random() - 0.5) * 5
                pos[i * 3 + 1] += (Math.random() - 0.5) * 5
            }
        }

        return pos
    }, [particleCount])

    // Particle colors for glow effect
    const colors = useMemo(() => {
        const cols = new Float32Array(particleCount * 3)
        const color = new THREE.Color(theme.particleColor)

        for (let i = 0; i < particleCount; i++) {
            if (isDark) {
                // Light particles for dark theme
                const brightness = 0.8 + Math.random() * 0.4
                cols[i * 3] = color.r * brightness
                cols[i * 3 + 1] = color.g * brightness
                cols[i * 3 + 2] = color.b * brightness
            } else {
                // Dark particles for light theme with some variation
                const darkness = 0.1 + Math.random() * 0.3  // Very dark
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

    // Animation with smooth transitions
    useFrame((state, delta) => {
        if (!meshRef.current) return

        const positions = meshRef.current.geometry.attributes.position.array
        const time = Date.now() * 0.001

        if (particleState === 'flocking') {
            // Normal flocking behavior
            flocking.current.update(positions, Math.min(delta, 0.1))

        } else if (particleState === 'forming' && targetPositions && assignedTargets) {
            // Direct transition from current positions to target positions
            const elapsedTime = (Date.now() - formationStartTime) / 1000
            const formProgress = Math.min(elapsedTime / 4, 1) // 4 seconds to form
            const easedProgress = easeInOutCubic(formProgress)

            // Reduce flocking influence gradually
            if (formProgress < 0.5) {
                flocking.current.update(positions, Math.min(delta, 0.1) * (1 - formProgress * 2))
            }

            for (let i = 0; i < particleCount; i++) {
                const i3 = i * 3
                const targetIndex = assignedTargets[i]
                const t3 = targetIndex * 3

                // Current position
                const currentX = positions[i3]
                const currentY = positions[i3 + 1]
                const currentZ = positions[i3 + 2]

                // Target position
                const targetX = targetPositions[t3]
                const targetY = targetPositions[t3 + 1]
                const targetZ = targetPositions[t3 + 2]

                // Smooth interpolation
                positions[i3] = currentX + (targetX - currentX) * easedProgress * 0.05
                positions[i3 + 1] = currentY + (targetY - currentY) * easedProgress * 0.05
                positions[i3 + 2] = currentZ + (targetZ - currentZ) * easedProgress * 0.05

                // Update velocities to match movement
                flocking.current.velocities[i3] = (positions[i3] - currentX) / delta
                flocking.current.velocities[i3 + 1] = (positions[i3 + 1] - currentY) / delta
                flocking.current.velocities[i3 + 2] = (positions[i3 + 2] - currentZ) / delta
            }

            if (formProgress >= 1) {
                setParticleState('formed')
                if (onShapeForm) {
                    onShapeForm(targetShape.position)
                }
            }
        } else if (particleState === 'formed' && targetPositions && assignedTargets) {
            // Spiral wave effect
            const spiralTime = time * 0.8

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

                // Convert to polar coordinates
                const dx = targetX - centerX
                const dy = targetY - centerY
                const distance = Math.sqrt(dx * dx + dy * dy)
                const angle = Math.atan2(dy, dx)

                // Spiral wave
                const spiralOffset = angle * 2 + distance * 0.3 - spiralTime * 5
                const waveHeight = Math.sin(spiralOffset) * Math.exp(-distance / 20) * 0.5

                const finalX = targetX
                const finalY = targetY
                const finalZ = targetZ + waveHeight

                positions[i3] = positions[i3] * 0.9 + finalX * 0.1
                positions[i3 + 1] = positions[i3 + 1] * 0.9 + finalY * 0.1
                positions[i3 + 2] = positions[i3 + 2] * 0.9 + finalZ * 0.1
            }
        } else if (particleState === 'dispersing') {
            // Smooth transition back to flocking
            const elapsedTime = (Date.now() - formationStartTime) / 1000
            const disperseProgress = Math.min(elapsedTime / 3, 1) // 3 seconds to disperse

            // Gradually increase flocking behavior
            flocking.current.update(positions, Math.min(delta, 0.1) * disperseProgress)

            // Add gentle random forces to break formation
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
            }
        }

        // Always apply boundary constraints
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
    })

    return (
        <points ref={meshRef}>
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
                vertexShader={particleVertexShader}
                fragmentShader={particleFragmentShader}
                transparent={true}
                vertexColors={true}
                blending={isDark ? THREE.AdditiveBlending : THREE.NormalBlending}
                depthWrite={false}
                uniforms={{
                    isDarkTheme: {value: isDark}
                }}
            />

        </points>
    )
}

export default ParticleSystem
