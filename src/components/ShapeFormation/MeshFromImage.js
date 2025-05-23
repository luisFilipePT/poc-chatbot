import * as THREE from 'three'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler'

export class MeshFromImage {
    static async createMeshFromDensityMap(densityMapUrl, size = 20) {
        // Load the image
        const loader = new THREE.TextureLoader()
        const texture = await loader.loadAsync(densityMapUrl)
        const image = texture.image

        // Create canvas to read pixel data
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(image, 0, 0)
        const imageData = ctx.getImageData(0, 0, image.width, image.height)

        // Create geometry from image
        const geometry = new THREE.BufferGeometry()
        const vertices = []
        const indices = []

        // Sample the image at regular intervals
        const step = 4 // Sample every 4 pixels for performance
        const threshold = 50 // Minimum brightness to create geometry

        // Create vertices based on bright pixels
        const vertexMap = new Map()
        let vertexIndex = 0

        for (let y = 0; y < image.height; y += step) {
            for (let x = 0; x < image.width; x += step) {
                const i = (y * image.width + x) * 4
                const brightness = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3

                if (brightness > threshold) {
                    const u = x / image.width
                    const v = y / image.height

                    // Convert to 3D coordinates
                    const px = (u - 0.5) * size
                    const py = (0.5 - v) * size
                    const pz = 0

                    vertices.push(px, py, pz)
                    vertexMap.set(`${x},${y}`, vertexIndex++)
                }
            }
        }

        // Create triangles between nearby bright pixels
        for (let y = 0; y < image.height - step; y += step) {
            for (let x = 0; x < image.width - step; x += step) {
                const key00 = `${x},${y}`
                const key10 = `${x + step},${y}`
                const key01 = `${x},${y + step}`
                const key11 = `${x + step},${y + step}`

                if (vertexMap.has(key00) && vertexMap.has(key10) && vertexMap.has(key01)) {
                    indices.push(
                        vertexMap.get(key00),
                        vertexMap.get(key10),
                        vertexMap.get(key01)
                    )
                }

                if (vertexMap.has(key10) && vertexMap.has(key01) && vertexMap.has(key11)) {
                    indices.push(
                        vertexMap.get(key10),
                        vertexMap.get(key11),
                        vertexMap.get(key01)
                    )
                }
            }
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
        geometry.setIndex(indices)
        geometry.computeVertexNormals()

        return new THREE.Mesh(geometry)
    }

    static sampleMeshSurface(mesh, particleCount) {
        const sampler = new MeshSurfaceSampler(mesh).build()
        const positions = new Float32Array(particleCount * 3)
        const tempVector = new THREE.Vector3()

        for (let i = 0; i < particleCount; i++) {
            sampler.sample(tempVector)
            tempVector.toArray(positions, i * 3)
        }

        return positions
    }
}
