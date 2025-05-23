import * as THREE from 'three'

export class FlockingBehavior {
    constructor(particleCount) {
        this.particleCount = particleCount
        this.velocities = new Float32Array(particleCount * 3)
        this.accelerations = new Float32Array(particleCount * 3)

        // Adjusted for more cohesive flocking
        this.params = {
            separationDistance: 2.0,
            alignmentDistance: 5.0,
            cohesionDistance: 5.0,
            maxSpeed: 4.0,  // Much faster
            maxForce: 0.3,  // Stronger forces
            separationWeight: 2.5,
            alignmentWeight: 1.0,
            cohesionWeight: 1.0
        }

        // Initialize with more directional movement
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3
            const angle = Math.random() * Math.PI * 2
            const speed = 1.0 + Math.random() * 2.0  // Faster initial speed
            this.velocities[i3] = Math.cos(angle) * speed
            this.velocities[i3 + 1] = Math.sin(angle) * speed
            this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.5
        }
    }

    update(positions, deltaTime) {
        // Reset accelerations
        this.accelerations.fill(0)

        // Calculate flocking forces for each particle
        for (let i = 0; i < this.particleCount; i++) {
            const separation = new THREE.Vector3()
            const alignment = new THREE.Vector3()
            const cohesion = new THREE.Vector3()
            let separationCount = 0
            let alignmentCount = 0
            let cohesionCount = 0

            const i3 = i * 3
            const posI = new THREE.Vector3(
                positions[i3],
                positions[i3 + 1],
                positions[i3 + 2]
            )

            // Check neighbors
            for (let j = 0; j < this.particleCount; j++) {
                if (i === j) continue

                const j3 = j * 3
                const posJ = new THREE.Vector3(
                    positions[j3],
                    positions[j3 + 1],
                    positions[j3 + 2]
                )

                const distance = posI.distanceTo(posJ)

                // Separation
                if (distance < this.params.separationDistance && distance > 0) {
                    const diff = posI.clone().sub(posJ)
                    diff.divideScalar(distance) // Weight by distance
                    separation.add(diff)
                    separationCount++
                }

                // Alignment
                if (distance < this.params.alignmentDistance) {
                    alignment.add(new THREE.Vector3(
                        this.velocities[j3],
                        this.velocities[j3 + 1],
                        this.velocities[j3 + 2]
                    ))
                    alignmentCount++
                }

                // Cohesion
                if (distance < this.params.cohesionDistance) {
                    cohesion.add(posJ)
                    cohesionCount++
                }
            }

            // Apply separation
            if (separationCount > 0) {
                separation.divideScalar(separationCount)
                separation.normalize()
                separation.multiplyScalar(this.params.maxSpeed)
                separation.sub(new THREE.Vector3(
                    this.velocities[i3],
                    this.velocities[i3 + 1],
                    this.velocities[i3 + 2]
                ))
                separation.clampLength(0, this.params.maxForce)
                separation.multiplyScalar(this.params.separationWeight)

                this.accelerations[i3] += separation.x
                this.accelerations[i3 + 1] += separation.y
                this.accelerations[i3 + 2] += separation.z
            }

            // Apply alignment
            if (alignmentCount > 0) {
                alignment.divideScalar(alignmentCount)
                alignment.normalize()
                alignment.multiplyScalar(this.params.maxSpeed)
                alignment.sub(new THREE.Vector3(
                    this.velocities[i3],
                    this.velocities[i3 + 1],
                    this.velocities[i3 + 2]
                ))
                alignment.clampLength(0, this.params.maxForce)
                alignment.multiplyScalar(this.params.alignmentWeight)

                this.accelerations[i3] += alignment.x
                this.accelerations[i3 + 1] += alignment.y
                this.accelerations[i3 + 2] += alignment.z
            }

            // Apply cohesion
            if (cohesionCount > 0) {
                cohesion.divideScalar(cohesionCount)
                cohesion.sub(posI)
                cohesion.normalize()
                cohesion.multiplyScalar(this.params.maxSpeed)
                cohesion.sub(new THREE.Vector3(
                    this.velocities[i3],
                    this.velocities[i3 + 1],
                    this.velocities[i3 + 2]
                ))
                cohesion.clampLength(0, this.params.maxForce)
                cohesion.multiplyScalar(this.params.cohesionWeight)

                this.accelerations[i3] += cohesion.x
                this.accelerations[i3 + 1] += cohesion.y
                this.accelerations[i3 + 2] += cohesion.z
            }
        }

        // Update velocities and positions
        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3

            // Update velocity
            this.velocities[i3] += this.accelerations[i3]
            this.velocities[i3 + 1] += this.accelerations[i3 + 1]
            this.velocities[i3 + 2] += this.accelerations[i3 + 2]

            // Limit speed
            const vel = new THREE.Vector3(
                this.velocities[i3],
                this.velocities[i3 + 1],
                this.velocities[i3 + 2]
            )
            vel.clampLength(0, this.params.maxSpeed)

            this.velocities[i3] = vel.x
            this.velocities[i3 + 1] = vel.y
            this.velocities[i3 + 2] = vel.z

            // Update position
            positions[i3] += this.velocities[i3] * deltaTime
            positions[i3 + 1] += this.velocities[i3 + 1] * deltaTime
            positions[i3 + 2] += this.velocities[i3 + 2] * deltaTime
        }
    }
}
