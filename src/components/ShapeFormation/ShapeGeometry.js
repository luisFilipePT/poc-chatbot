import * as THREE from 'three'

export class ShapeGeometry {
    static generateCircularShape(center, particleCount, radius = 15) {
        const positions = new Float32Array(particleCount * 3)
        const sizes = new Float32Array(particleCount)

        // Define the shape layers clearly
        const layers = [
            // Outer ring - sparse, larger particles
            {
                startRadius: radius * 0.9,
                endRadius: radius * 1.1,
                ratio: 0.25,
                size: 0.8,
                density: 0.7
            },
            // Middle gap - very sparse
            {
                startRadius: radius * 0.7,
                endRadius: radius * 0.9,
                ratio: 0.05,
                size: 0.4,
                density: 0.3
            },
            // Inner dense ring
            {
                startRadius: radius * 0.4,
                endRadius: radius * 0.7,
                ratio: 0.5,
                size: 0.3,
                density: 1.0
            },
            // Inner gap
            {
                startRadius: radius * 0.3,
                endRadius: radius * 0.4,
                ratio: 0.05,
                size: 0.25,
                density: 0.2
            },
            // Center ring - smallest particles
            {
                startRadius: radius * 0.15,
                endRadius: radius * 0.3,
                ratio: 0.15,
                size: 0.2,
                density: 0.8
            }
        ]

        let particleIndex = 0

        for (const layer of layers) {
            const layerParticles = Math.floor(particleCount * layer.ratio)

            for (let i = 0; i < layerParticles && particleIndex < particleCount; i++) {
                // Use golden angle for better distribution
                const goldenAngle = Math.PI * (3 - Math.sqrt(5))
                const angle = i * goldenAngle

                // Add some randomness to angle for organic feel
                const angleVariation = (Math.random() - 0.5) * 0.2
                const finalAngle = angle + angleVariation

                // Random radius within layer bounds
                const r = layer.startRadius + Math.random() * (layer.endRadius - layer.startRadius)

                // Skip some particles based on density
                if (Math.random() > layer.density) {
                    continue
                }

                // Add slight wave to make it less perfect
                const wave = Math.sin(finalAngle * 5) * 0.5

                const idx = particleIndex * 3
                positions[idx] = center.x + Math.cos(finalAngle) * (r + wave)
                positions[idx + 1] = center.y + Math.sin(finalAngle) * (r + wave)
                positions[idx + 2] = center.z + (Math.random() - 0.5) * 0.5

                // Size with variation
                sizes[particleIndex] = layer.size + (Math.random() - 0.5) * 0.1

                particleIndex++
            }
        }

        // Fill any remaining particles in outer ring
        while (particleIndex < particleCount) {
            const angle = Math.random() * Math.PI * 2
            const r = radius + (Math.random() - 0.5) * radius * 0.2

            const idx = particleIndex * 3
            positions[idx] = center.x + Math.cos(angle) * r
            positions[idx + 1] = center.y + Math.sin(angle) * r
            positions[idx + 2] = center.z + (Math.random() - 0.5) * 0.5

            sizes[particleIndex] = 0.5
            particleIndex++
        }

        return { positions, sizes }
    }

    static calculateFormationForces(
        currentPositions,
        targetPositions,
        clickPoint,
        particleCount,
        elapsedTime
    ) {
        const forces = new Float32Array(particleCount * 3)
        const maxForce = 0.8
        const rippleSpeed = 30
        const rippleRadius = rippleSpeed * elapsedTime

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3

            // Calculate distance from click point
            const dx = currentPositions[i3] - clickPoint.x
            const dy = currentPositions[i3 + 1] - clickPoint.y
            const dz = currentPositions[i3 + 2] - clickPoint.z
            const distanceFromClick = Math.sqrt(dx * dx + dy * dy + dz * dz)

            // Ripple effect
            const rippleInfluence = Math.max(0, 1 - Math.abs(distanceFromClick - rippleRadius) / 10)

            if (rippleInfluence > 0 || elapsedTime > 1) { // After 1 second, all particles move
                const targetDx = targetPositions[i3] - currentPositions[i3]
                const targetDy = targetPositions[i3 + 1] - currentPositions[i3 + 1]
                const targetDz = targetPositions[i3 + 2] - currentPositions[i3 + 2]

                const influence = Math.max(rippleInfluence, elapsedTime > 1 ? 1 : 0)

                forces[i3] = targetDx * influence * maxForce
                forces[i3 + 1] = targetDy * influence * maxForce
                forces[i3 + 2] = targetDz * influence * maxForce
            }
        }

        return forces
    }
}
