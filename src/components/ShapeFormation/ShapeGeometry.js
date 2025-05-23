import * as THREE from 'three'

export class ShapeGeometry {
    static imageData = null
    static imageWidth = 0
    static imageHeight = 0

    static async loadDensityMap() {
        if (this.imageData) return this.imageData

        const img = new Image()
        await new Promise((resolve, reject) => {
            img.onload = resolve
            img.onerror = reject
            //img.src = '/shape-density-map.png'
            img.src = '/circle-test.png'
        })

        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)

        this.imageData = ctx.getImageData(0, 0, img.width, img.height)
        this.imageWidth = img.width
        this.imageHeight = img.height

        return this.imageData
    }

    static async generateCircularShape(center, particleCount, radius = 20) {
        const positions = new Float32Array(particleCount * 3)
        const sizes = new Float32Array(particleCount)

        // Load image data
        const imageData = await this.loadDensityMap()
        const data = imageData.data

        // First pass: collect all bright pixels
        const brightPixels = []

        // Sample every few pixels for better performance
        const step = 2 // Sample every 2nd pixel

        for (let y = 0; y < this.imageHeight; y += step) {
            for (let x = 0; x < this.imageWidth; x += step) {
                const i = (y * this.imageWidth + x) * 4
                const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3

                if (brightness > 50) {
                    brightPixels.push({
                        x: x,
                        y: y,
                        brightness: brightness / 255
                    })
                }
            }
        }

        console.log(`Found ${brightPixels.length} bright pixels`)

        // Shuffle bright pixels for random distribution
        for (let i = brightPixels.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [brightPixels[i], brightPixels[j]] = [brightPixels[j], brightPixels[i]]
        }

        // Take only as many pixels as we have particles
        const selectedPixels = brightPixels.slice(0, particleCount)

        // Place particles
        for (let i = 0; i < Math.min(selectedPixels.length, particleCount); i++) {
            const pixel = selectedPixels[i]

            // Convert pixel coordinates to normalized coordinates (0-1)
            const u = pixel.x / this.imageWidth
            const v = pixel.y / this.imageHeight

            // Map to world space centered at origin
            // Increase the multiplier for larger shape
            const worldX = (u - 0.5) * radius * 3  // Increased from 2 to 3
            const worldY = (0.5 - v) * radius * 3  // Flip Y and increase scale

            // Add small random offset
            const offset = 0.1

            positions[i * 3] = worldX + (Math.random() - 0.5) * offset
            positions[i * 3 + 1] = worldY + (Math.random() - 0.5) * offset
            positions[i * 3 + 2] = (Math.random() - 0.5) * 0.5

            // Size based on brightness and distance from center
            const distFromCenter = Math.sqrt(worldX * worldX + worldY * worldY)
            const normalizedDist = distFromCenter / (radius * 1.5)

            if (normalizedDist > 0.8) {
                sizes[i] = 0.6 + pixel.brightness * 0.3
            } else if (normalizedDist > 0.5) {
                sizes[i] = 0.4 + pixel.brightness * 0.2
            } else {
                sizes[i] = 0.3 + pixel.brightness * 0.15
            }
        }

        // Fill any remaining particles (if needed)
        for (let i = selectedPixels.length; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2
            const r = Math.random() * radius * 0.5

            positions[i * 3] = Math.cos(angle) * r
            positions[i * 3 + 1] = Math.sin(angle) * r
            positions[i * 3 + 2] = 0

            sizes[i] = 0.25
        }

        return {positions, sizes}
    }

    static calculateFormationForces(
        currentPositions,
        targetPositions,
        clickPoint,
        particleCount,
        elapsedTime
    ) {
        const forces = new Float32Array(particleCount * 3)

        // For each particle, find the nearest target position
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3

            // Current particle position
            const px = currentPositions[i3]
            const py = currentPositions[i3 + 1]
            const pz = currentPositions[i3 + 2]

            // Find nearest target position
            let nearestDist = Infinity
            let nearestX = px
            let nearestY = py
            let nearestZ = pz

            // Only check nearby targets for performance
            const searchRadius = 20

            for (let j = 0; j < particleCount; j++) {
                const j3 = j * 3
                const tx = targetPositions[j3]
                const ty = targetPositions[j3 + 1]
                const tz = targetPositions[j3 + 2]

                const dx = tx - px
                const dy = ty - py
                const dz = tz - pz
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

                if (dist < nearestDist && dist < searchRadius) {
                    nearestDist = dist
                    nearestX = tx
                    nearestY = ty
                    nearestZ = tz
                }
            }

            // Very gentle force towards nearest target
            if (nearestDist < searchRadius && nearestDist > 0.1) {
                const strength = 0.1 * Math.min(elapsedTime / 3, 1)
                forces[i3] = (nearestX - px) / nearestDist * strength
                forces[i3 + 1] = (nearestY - py) / nearestDist * strength
                forces[i3 + 2] = (nearestZ - pz) / nearestDist * strength
            }
        }

        return forces
    }


}
