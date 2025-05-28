import * as THREE from 'three'

export class ShapeGeometry {
    static imageData = null
    static imageWidth = 0
    static imageHeight = 0
    static cachedTargetPositions = new Map() // Cache for different particle counts

    static async loadDensityMap(imagePath = '/circle-test.png') {
        if (this.imageData) return this.imageData

        const img = new Image()
        await new Promise((resolve, reject) => {
            img.onload = resolve
            img.onerror = reject
            img.src = imagePath
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

    // Enhanced method for GPU texture creation
    static async generateTargetPositions(particleCount, radius = 20, imagePath = '/circle-test.png') {
        const cacheKey = `${imagePath}_${particleCount}_${radius}`
        
        // Return cached result if available
        if (this.cachedTargetPositions.has(cacheKey)) {
            return this.cachedTargetPositions.get(cacheKey)
        }

        // Load image data
        const imageData = await this.loadDensityMap(imagePath)
        const data = imageData.data

        // Collect only the bright pixels (actual circle, not background)
        const brightPixels = []
        const step = 1 // Sample every pixel for maximum detail

        for (let y = 0; y < this.imageHeight; y += step) {
            for (let x = 0; x < this.imageWidth; x += step) {
                const i = (y * this.imageWidth + x) * 4
                const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3

                // Lower threshold to capture darker parts of rings, but avoid pure black background
                if (brightness > 32) { // Further reduced from 64 to 32 to capture darker ring areas
                    brightPixels.push({
                        x: x,
                        y: y,
                        brightness: brightness / 255
                    })
                }
            }
        }

        console.log(`Found ${brightPixels.length} bright pixels for ${particleCount} particles`)

        // If we have too many pixels, we can thin them out intelligently
        let finalPixels = brightPixels
        if (brightPixels.length > particleCount * 3) {
            // Sort by brightness (brightest first) and take a good distribution
            brightPixels.sort((a, b) => b.brightness - a.brightness)
            
            // Take every nth pixel to maintain distribution across all brightness levels
            const step = Math.floor(brightPixels.length / (particleCount * 2))
            finalPixels = []
            for (let i = 0; i < brightPixels.length; i += Math.max(1, step)) {
                finalPixels.push(brightPixels[i])
                if (finalPixels.length >= particleCount * 2) break
            }
        }

        // Shuffle for random distribution
        for (let i = finalPixels.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [finalPixels[i], finalPixels[j]] = [finalPixels[j], finalPixels[i]]
        }

        // Create target positions array for GPU texture
        const positions = new Float32Array(particleCount * 4) // RGBA format for GPU
        
        // Distribute particles across bright pixels
        for (let i = 0; i < particleCount; i++) {
            let pixel
            
            if (i < finalPixels.length) {
                pixel = finalPixels[i]
            } else {
                // If we need more particles than pixels, reuse pixels with small variation
                const baseIndex = i % finalPixels.length
                pixel = finalPixels[baseIndex]
            }

            // Convert pixel coordinates to world space
            const u = pixel.x / this.imageWidth
            const v = pixel.y / this.imageHeight

            // Map to world space centered at origin
            const worldX = (u - 0.5) * radius * 3
            const worldY = (0.5 - v) * radius * 3 // Flip Y

            // Small random offset for particles sharing the same pixel
            const offset = i >= finalPixels.length ? 0.3 : 0.1
            const offsetX = (Math.random() - 0.5) * offset
            const offsetY = (Math.random() - 0.5) * offset
            const offsetZ = (Math.random() - 0.5) * 0.2

            positions[i * 4] = worldX + offsetX
            positions[i * 4 + 1] = worldY + offsetY
            positions[i * 4 + 2] = offsetZ
            positions[i * 4 + 3] = pixel.brightness // Store brightness in alpha channel
        }

        const result = { positions, brightPixels: finalPixels }
        this.cachedTargetPositions.set(cacheKey, result)
        return result
    }

    // Create GPU texture from target positions
    static createTargetTexture(positions, particleCount) {
        const textureSize = Math.ceil(Math.sqrt(particleCount))
        const textureData = new Float32Array(textureSize * textureSize * 4)
        
        // Copy positions to texture data
        for (let i = 0; i < particleCount; i++) {
            const i4 = i * 4
            textureData[i4] = positions[i4]     // x
            textureData[i4 + 1] = positions[i4 + 1] // y
            textureData[i4 + 2] = positions[i4 + 2] // z
            textureData[i4 + 3] = positions[i4 + 3] // density/alpha
        }

        // Fill remaining texture space with zeros
        for (let i = particleCount; i < textureSize * textureSize; i++) {
            const i4 = i * 4
            textureData[i4] = 0
            textureData[i4 + 1] = 0
            textureData[i4 + 2] = 0
            textureData[i4 + 3] = 0
        }

        const texture = new THREE.DataTexture(
            textureData,
            textureSize,
            textureSize,
            THREE.RGBAFormat,
            THREE.FloatType
        )
        texture.needsUpdate = true
        texture.minFilter = THREE.NearestFilter
        texture.magFilter = THREE.NearestFilter

        return { texture, textureSize }
    }

    // Legacy method for backward compatibility
    static async generateCircularShape(center, particleCount, radius = 20) {
        const { positions } = await this.generateTargetPositions(particleCount, radius)
        
        // Convert from RGBA to RGB format for legacy compatibility
        const legacyPositions = new Float32Array(particleCount * 3)
        const sizes = new Float32Array(particleCount)
        
        for (let i = 0; i < particleCount; i++) {
            legacyPositions[i * 3] = positions[i * 4]
            legacyPositions[i * 3 + 1] = positions[i * 4 + 1]
            legacyPositions[i * 3 + 2] = positions[i * 4 + 2]
            
            // Calculate size based on density and position
            const density = positions[i * 4 + 3]
            const x = positions[i * 4]
            const y = positions[i * 4 + 1]
            const distFromCenter = Math.sqrt(x * x + y * y)
            const normalizedDist = distFromCenter / (radius * 1.5)
            
            if (normalizedDist > 0.8) {
                sizes[i] = 0.6 + density * 0.3
            } else if (normalizedDist > 0.5) {
                sizes[i] = 0.4 + density * 0.2
            } else {
                sizes[i] = 0.3 + density * 0.15
            }
        }

        return { positions: legacyPositions, sizes }
    }

    // Clear cache when needed
    static clearCache() {
        this.cachedTargetPositions.clear()
        this.imageData = null
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
