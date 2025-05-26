import * as THREE from 'three'

export class FlockingBehavior {
    constructor(particleCount) {
        this.particleCount = particleCount
        this.velocities = new Float32Array(particleCount * 3)
        this.accelerations = new Float32Array(particleCount * 3)

        // Optimized parameters for fluid movement
        this.params = {
            // Zone radii
            separationDistance: 2.5,
            alignmentDistance: 5.0,
            cohesionDistance: 5.0,

            // Forces - balanced for smooth movement
            maxSpeed: 1.2,
            maxForce: 0.05,

            // Weights
            separationWeight: 1.8,
            alignmentWeight: 1.0,
            cohesionWeight: 0.8,

            // Movement parameters
            speedMultiplier: 8.0,
            damping: 0.98,
            verticalDamping: 0.95,

            // Subtle effects
            turbulence: 0.01,
            centerAttraction: 0.0002,

            // Predator
            predatorAvoidDistance: 20.0,
            predatorAvoidStrength: 2.0
        }

        // OPTIMIZED: Increase grid size based on largest zone radius
        this.gridSize = Math.max(
            this.params.separationDistance,
            this.params.alignmentDistance,
            this.params.cohesionDistance
        ) * 2  // Doubled for better performance

        this.grid = new Map()

        // OPTIMIZED: Pre-allocate typed arrays for better performance
        this.neighborCounts = new Uint16Array(particleCount)
        this.tempForces = {
            separation: new Float32Array(particleCount * 3),
            alignment: new Float32Array(particleCount * 3),
            cohesion: new Float32Array(particleCount * 3)
        }

        // Pre-allocate reusable vectors to avoid garbage collection
        this.tempVectors = {
            posI: new THREE.Vector3(),
            posJ: new THREE.Vector3(),
            diff: new THREE.Vector3(),
            velJ: new THREE.Vector3(),
            separation: new THREE.Vector3(),
            alignment: new THREE.Vector3(),
            cohesion: new THREE.Vector3(),
            vel: new THREE.Vector3(),
            centerOfMass: new THREE.Vector3()
        }

        // Pre-calculate squared distances
        this.separationDistanceSq = this.params.separationDistance * this.params.separationDistance
        this.alignmentDistanceSq = this.params.alignmentDistance * this.params.alignmentDistance
        this.cohesionDistanceSq = this.params.cohesionDistance * this.params.cohesionDistance

        // Predator system
        this.predators = []
        this.lastDisruptionTime = 0
        this.disruptionInterval = 15000
        this.disruptionDuration = 5000

        // OPTIMIZED: Frame counting for reduced update frequency
        this.frameCount = 0
        this.predatorUpdateInterval = 2 // Update predators every 2 frames
        this.centerUpdateInterval = 2 // Update center every 2 frames

        // Initialize with smooth velocities
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3
            const angle = Math.random() * Math.PI * 2
            const speed = 0.3 + Math.random() * 0.3

            this.velocities[i3] = Math.cos(angle) * speed
            this.velocities[i3 + 1] = Math.sin(angle) * speed * 0.3
            this.velocities[i3 + 2] = (Math.random() - 0.5) * speed * 0.1
        }

        this.updateZoneParameters()
    }

    updateZoneParameters() {
        this.params.zoneRadius = Math.max(
            this.params.separationDistance,
            this.params.alignmentDistance,
            this.params.cohesionDistance
        ) * 1.5
        this.params.zoneRadiusSquared = this.params.zoneRadius * this.params.zoneRadius

        // Update pre-calculated squared distances when parameters change
        this.separationDistanceSq = this.params.separationDistance * this.params.separationDistance
        this.alignmentDistanceSq = this.params.alignmentDistance * this.params.alignmentDistance
        this.cohesionDistanceSq = this.params.cohesionDistance * this.params.cohesionDistance
    }

    getGridKey(x, y, z) {
        const gx = Math.floor(x / this.gridSize)
        const gy = Math.floor(y / this.gridSize)
        const gz = Math.floor(z / this.gridSize)
        return `${gx},${gy},${gz}`
    }

    buildSpatialGrid(positions) {
        this.grid.clear()

        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3
            const key = this.getGridKey(positions[i3], positions[i3 + 1], positions[i3 + 2])

            if (!this.grid.has(key)) {
                this.grid.set(key, [])
            }
            this.grid.get(key).push(i)
        }
    }

    getNeighbors(x, y, z) {
        const neighbors = []
        const gx = Math.floor(x / this.gridSize)
        const gy = Math.floor(y / this.gridSize)
        const gz = Math.floor(z / this.gridSize)

        // Check surrounding cells - keeping original logic
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const key = `${gx + dx},${gy + dy},${gz + dz}`
                    const cell = this.grid.get(key)
                    if (cell) {
                        neighbors.push(...cell)
                    }
                }
            }
        }

        return neighbors
    }

    // OPTIMIZED: Calculate center of mass less frequently
    calculateCenterOfMass(positions) {
        const { centerOfMass } = this.tempVectors
        centerOfMass.set(0, 0, 0)

        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3
            centerOfMass.x += positions[i3]
            centerOfMass.y += positions[i3 + 1]
            centerOfMass.z += positions[i3 + 2]
        }
        centerOfMass.divideScalar(this.particleCount)
        return centerOfMass
    }

    updatePredators(currentTime, flockCenter) {
        if (currentTime - this.lastDisruptionTime > this.disruptionInterval) {
            this.createDisruption(flockCenter)
            this.lastDisruptionTime = currentTime
        }

        this.predators = this.predators.filter(predator => {
            const age = currentTime - predator.createdAt
            if (age > this.disruptionDuration) return false

            // Smooth movement
            predator.position.x += predator.velocity.x * 0.016
            predator.position.y += predator.velocity.y * 0.016
            predator.position.z += predator.velocity.z * 0.016

            // Smooth fade
            const t = age / this.disruptionDuration
            predator.strength = predator.initialStrength * (1 - t * t)

            return true
        })
    }

    createDisruption(flockCenter) {
        const angle = Math.random() * Math.PI * 2
        const distance = 25

        this.predators.push({
            position: new THREE.Vector3(
                flockCenter.x + Math.cos(angle) * distance,
                flockCenter.y,
                flockCenter.z + Math.sin(angle) * distance
            ),
            velocity: new THREE.Vector3(
                -Math.cos(angle) * 0.3,
                0,
                -Math.sin(angle) * 0.3
            ),
            initialStrength: 0.6,
            strength: 0.6,
            createdAt: Date.now()
        })
    }

    update(positions, deltaTime) {
        const currentTime = Date.now()
        deltaTime = Math.min(deltaTime, 0.033) // Cap at ~30fps minimum
        this.frameCount++

        // Build spatial grid for optimization
        this.buildSpatialGrid(positions)

        // OPTIMIZED: Reset arrays more efficiently
        this.accelerations.fill(0)
        this.neighborCounts.fill(0)
        this.tempForces.separation.fill(0)
        this.tempForces.alignment.fill(0)
        this.tempForces.cohesion.fill(0)

        // OPTIMIZED: Calculate center of mass less frequently
        let centerOfMass
        if (this.frameCount % this.centerUpdateInterval === 0 || !this.lastCenterOfMass) {
            centerOfMass = this.calculateCenterOfMass(positions)
            this.lastCenterOfMass = centerOfMass.clone()
        } else {
            centerOfMass = this.lastCenterOfMass
        }

        // OPTIMIZED: Update predators less frequently
        if (this.frameCount % this.predatorUpdateInterval === 0) {
            this.updatePredators(currentTime, centerOfMass)
        }

        // Use pre-allocated vectors instead of creating new ones
        const { posI, posJ, diff, velJ, separation, alignment, cohesion, vel } = this.tempVectors

        // OPTIMIZED: Calculate forces with batched operations
        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3
            posI.set(positions[i3], positions[i3 + 1], positions[i3 + 2])

            // Reset force vectors
            separation.set(0, 0, 0)
            alignment.set(0, 0, 0)
            cohesion.set(0, 0, 0)
            let neighborCount = 0

            // Get potential neighbors from spatial grid
            const neighbors = this.getNeighbors(positions[i3], positions[i3 + 1], positions[i3 + 2])

            // OPTIMIZED: Process neighbors with early exit and inline calculations
            for (let n = 0; n < neighbors.length; n++) {
                const j = neighbors[n]
                if (i === j) continue

                const j3 = j * 3

                // OPTIMIZED: Inline distance calculation
                const dx = positions[i3] - positions[j3]
                const dy = positions[i3 + 1] - positions[j3 + 1]
                const dz = positions[i3 + 2] - positions[j3 + 2]
                const distSquared = dx * dx + dy * dy + dz * dz

                // Skip if outside zone radius or too close
                if (distSquared > this.params.zoneRadiusSquared || distSquared < 0.01) continue

                neighborCount++

                // OPTIMIZED: Inline force calculations to avoid function calls
                // Separation
                if (distSquared < this.separationDistanceSq) {
                    const distance = Math.sqrt(distSquared)
                    const force = (this.params.separationDistance - distance) / this.params.separationDistance
                    const normalizedForce = force * force / distance

                    separation.x += dx * normalizedForce
                    separation.y += dy * normalizedForce
                    separation.z += dz * normalizedForce
                }

                // Alignment
                if (distSquared < this.alignmentDistanceSq) {
                    alignment.x += this.velocities[j3]
                    alignment.y += this.velocities[j3 + 1]
                    alignment.z += this.velocities[j3 + 2]
                }

                // Cohesion
                if (distSquared < this.cohesionDistanceSq) {
                    cohesion.x += positions[j3]
                    cohesion.y += positions[j3 + 1]
                    cohesion.z += positions[j3 + 2]
                }
            }

            this.neighborCounts[i] = neighborCount

            // Apply flocking rules
            if (neighborCount > 0) {
                // Separation
                if (separation.lengthSq() > 0) {
                    separation.normalize().multiplyScalar(this.params.separationWeight * this.params.maxForce)
                    this.accelerations[i3] += separation.x
                    this.accelerations[i3 + 1] += separation.y
                    this.accelerations[i3 + 2] += separation.z
                }

                // Alignment
                if (alignment.lengthSq() > 0) {
                    alignment.divideScalar(neighborCount)
                    alignment.normalize().multiplyScalar(this.params.alignmentWeight * this.params.maxForce)
                    this.accelerations[i3] += alignment.x
                    this.accelerations[i3 + 1] += alignment.y
                    this.accelerations[i3 + 2] += alignment.z
                }

                // Cohesion
                if (cohesion.lengthSq() > 0) {
                    cohesion.divideScalar(neighborCount)
                    cohesion.sub(posI)
                    cohesion.normalize().multiplyScalar(this.params.cohesionWeight * this.params.maxForce)
                    this.accelerations[i3] += cohesion.x
                    this.accelerations[i3 + 1] += cohesion.y
                    this.accelerations[i3 + 2] += cohesion.z
                }
            }

            // Predator avoidance
            for (const predator of this.predators) {
                diff.subVectors(posI, predator.position)
                const dist = diff.length()

                if (dist < this.params.predatorAvoidDistance && dist > 0.1) {
                    const force = (1 - dist / this.params.predatorAvoidDistance) *
                        predator.strength * this.params.predatorAvoidStrength
                    diff.normalize().multiplyScalar(force)
                    this.accelerations[i3] += diff.x
                    this.accelerations[i3 + 1] += diff.y
                    this.accelerations[i3 + 2] += diff.z
                }
            }

            // Center attraction
            diff.subVectors(centerOfMass, posI)
            const centerDist = diff.length()
            if (centerDist > 30) {
                diff.normalize().multiplyScalar(this.params.centerAttraction)
                this.accelerations[i3] += diff.x
                this.accelerations[i3 + 1] += diff.y
                this.accelerations[i3 + 2] += diff.z
            }

            // OPTIMIZED: Reduce turbulence calculations
            if (this.frameCount % 3 === 0) { // Apply turbulence every 3 frames
                this.accelerations[i3] += (Math.random() - 0.5) * this.params.turbulence
                this.accelerations[i3 + 1] += (Math.random() - 0.5) * this.params.turbulence * 0.7
                this.accelerations[i3 + 2] += (Math.random() - 0.5) * this.params.turbulence * 0.5
            }
        }

        // OPTIMIZED: Update velocities and positions with inline calculations
        const maxSpeedSq = this.params.maxSpeed * this.params.maxSpeed
        const speedMult = deltaTime * this.params.speedMultiplier

        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3

            // Update velocity with damping
            this.velocities[i3] = (this.velocities[i3] + this.accelerations[i3]) * this.params.damping
            this.velocities[i3 + 1] = (this.velocities[i3 + 1] + this.accelerations[i3 + 1]) * this.params.verticalDamping
            this.velocities[i3 + 2] = (this.velocities[i3 + 2] + this.accelerations[i3 + 2]) * this.params.damping

            // OPTIMIZED: Limit speed using squared comparison when possible
            const speedSq = this.velocities[i3] * this.velocities[i3] +
                this.velocities[i3 + 1] * this.velocities[i3 + 1] +
                this.velocities[i3 + 2] * this.velocities[i3 + 2]

            if (speedSq > maxSpeedSq) {
                const speed = Math.sqrt(speedSq)
                const scale = this.params.maxSpeed / speed
                this.velocities[i3] *= scale
                this.velocities[i3 + 1] *= scale
                this.velocities[i3 + 2] *= scale
            }

            // Update position
            positions[i3] += this.velocities[i3] * speedMult
            positions[i3 + 1] += this.velocities[i3 + 1] * speedMult
            positions[i3 + 2] += this.velocities[i3 + 2] * speedMult
        }
    }

    startTransition() {
        // Store original parameters
        this.originalParams = { ...this.params }

        // Gradually reduce flocking forces during transition
        this.transitioning = true
    }

    endTransition() {
        // Restore original parameters
        if (this.originalParams) {
            this.params = { ...this.originalParams }
        }
        this.transitioning = false

        // Re-randomize velocities for natural flocking restart
        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3
            const currentSpeed = Math.sqrt(
                this.velocities[i3] * this.velocities[i3] +
                this.velocities[i3 + 1] * this.velocities[i3 + 1] +
                this.velocities[i3 + 2] * this.velocities[i3 + 2]
            )

            // Add some randomness to break out of formation
            const angle = Math.random() * Math.PI * 2
            const speed = Math.max(currentSpeed, 0.5) + Math.random() * 0.5

            this.velocities[i3] += Math.cos(angle) * speed * 0.3
            this.velocities[i3 + 1] += Math.sin(angle) * speed * 0.3
            this.velocities[i3 + 2] += (Math.random() - 0.5) * speed * 0.1
        }
    }
}
