import {useRef, useMemo, useState, useEffect} from 'react'
import {useFrame, useThree} from '@react-three/fiber'
import * as THREE from 'three'
import {useTheme} from '../../contexts/ThemeContext'
import {FlockingBehavior} from './FlockingBehavior'
import {ShapeGeometry} from '../ShapeFormation/ShapeGeometry'
import { particleVertexShader, particleFragmentShader } from './particleShader'


function ParticleSystem({onShapeForm, targetShape}) {
    const [clickPosition, setClickPosition] = useState(null)
    const [targetSizes, setTargetSizes] = useState(null)
    const [targetPositions, setTargetPositions] = useState(null)
    const [formationStartTime, setFormationStartTime] = useState(null)
    const [particleState, setParticleState] = useState('flocking') // 'flocking', 'forming', 'formed'

    const meshRef = useRef()
    const { theme, isDark } = useTheme()
    const {viewport} = useThree()
    const particleCount = 2500
    const flocking = useRef(new FlockingBehavior(particleCount))

    // Boundary constraints
    const boundaries = {
        x: viewport.width * 0.7,  // 70% of viewport width
        y: viewport.height * 0.7, // 70% of viewport height
        z: 20
    }

    useEffect(() => {
        if (targetShape) {
            // Generate target positions - now returns positions and sizes
            const { positions: shapePositions, sizes: shapeSizes } = ShapeGeometry.generateCircularShape(
                { x: 0, y: 0, z: 0 }, // Center on screen
                particleCount
            )
            setTargetPositions(shapePositions)
            setTargetSizes(shapeSizes) // Add this state
            setFormationStartTime(Date.now())
            setParticleState('forming')
            setClickPosition(targetShape.position)
        }
    }, [targetShape, particleCount])


    // Add this new useMemo for sizes
    const sizes = useMemo(() => {
        const s = new Float32Array(particleCount)
        for (let i = 0; i < particleCount; i++) {
            // Vary sizes for depth perception
            s[i] = 0.3 + Math.random() * 0.4
        }
        return s
    }, [particleCount])

    const filled = useMemo(() => {
        const f = new Float32Array(particleCount)
        for (let i = 0; i < particleCount; i++) {
            // 80% filled, 20% hollow
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
            const envelope = Math.sin(t * Math.PI) // 0 at edges, 1 at center
            const pointiness = Math.pow(envelope, 0.3) // Make the curve sharper

            // Vary the spread based on position - very narrow at tips
            const spread = pointiness * 5 + 0.2 // 0.2 to 5.2 range

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
            if (Math.random() < 0.02 && t > 0.1 && t < 0.9) { // 2% scattered, not at edges
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
            // Less variation for more uniform grey
            const brightness = 0.8 + Math.random() * 0.4
            cols[i * 3] = color.r * brightness
            cols[i * 3 + 1] = color.g * brightness
            cols[i * 3 + 2] = color.b * brightness
        }
        return cols
    }, [particleCount, theme.particleColor])


    // Animation with boundary checking
    useFrame((state, delta) => {
        if (!meshRef.current) return

        const positions = meshRef.current.geometry.attributes.position.array

        if (particleState === 'flocking') {
            // Apply flocking behavior
            flocking.current.update(positions, Math.min(delta, 0.1))
        } else if (particleState === 'forming' && targetPositions && clickPosition) {
            // Calculate elapsed time since formation started
            const elapsedTime = (Date.now() - formationStartTime) / 1000

            // Get formation forces
            const formationForces = ShapeGeometry.calculateFormationForces(
                positions,
                targetPositions,
                clickPosition,
                particleCount,
                elapsedTime
            )

            // Apply formation forces
            let allParticlesInPlace = true
            for (let i = 0; i < particleCount; i++) {
                const i3 = i * 3

                // Apply force
                flocking.current.velocities[i3] += formationForces[i3] * delta
                flocking.current.velocities[i3 + 1] += formationForces[i3 + 1] * delta
                flocking.current.velocities[i3 + 2] += formationForces[i3 + 2] * delta

                // Damping for smooth arrival
                flocking.current.velocities[i3] *= 0.95
                flocking.current.velocities[i3 + 1] *= 0.95
                flocking.current.velocities[i3 + 2] *= 0.95

                // Update position
                positions[i3] += flocking.current.velocities[i3] * delta
                positions[i3 + 1] += flocking.current.velocities[i3 + 1] * delta
                positions[i3 + 2] += flocking.current.velocities[i3 + 2] * delta

                // Check if particle is close to target
                const distance = Math.sqrt(
                    Math.pow(positions[i3] - targetPositions[i3], 2) +
                    Math.pow(positions[i3 + 1] - targetPositions[i3 + 1], 2) +
                    Math.pow(positions[i3 + 2] - targetPositions[i3 + 2], 2)
                )

                if (distance > 0.5) allParticlesInPlace = false
            }

            // Check if formation is complete
            if (allParticlesInPlace || elapsedTime > 5) {
                setParticleState('formed')

                // Update particle sizes to target sizes
                if (targetSizes) {
                    const sizeAttribute = meshRef.current.geometry.attributes.size
                    for (let i = 0; i < particleCount; i++) {
                        sizeAttribute.array[i] = targetSizes[i]
                    }
                    sizeAttribute.needsUpdate = true
                }

                if (onShapeForm) onShapeForm({ x: 0, y: 0, z: 0 })
            }
        }

        // Always apply boundary constraints
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3

            if (Math.abs(positions[i3]) > boundaries.x) {
                flocking.current.velocities[i3] *= 0.9
                flocking.current.velocities[i3] -= Math.sign(positions[i3]) * 0.1
            }
            if (Math.abs(positions[i3 + 1]) > boundaries.y) {
                flocking.current.velocities[i3 + 1] *= 0.9
                flocking.current.velocities[i3 + 1] -= Math.sign(positions[i3 + 1]) * 0.1
            }
            if (Math.abs(positions[i3 + 2]) > boundaries.z) {
                flocking.current.velocities[i3 + 2] *= 0.9
                flocking.current.velocities[i3 + 2] -= Math.sign(positions[i3 + 2]) * 0.05
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
                blending={isDark ? THREE.AdditiveBlending : THREE.NormalBlending}  // Different blending for light mode
                depthWrite={false}
            />
        </points>
    )
}

export default ParticleSystem
