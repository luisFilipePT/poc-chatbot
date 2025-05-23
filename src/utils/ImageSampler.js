export class ImageSampler {
    static async loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = reject
            img.src = url
        })
    }

    static getImageData(img) {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        return ctx.getImageData(0, 0, img.width, img.height)
    }

    static sampleDensity(imageData, x, y) {
        const px = Math.floor(x * imageData.width)
        const py = Math.floor(y * imageData.height)

        if (px < 0 || px >= imageData.width || py < 0 || py >= imageData.height) {
            return 0
        }

        const index = (py * imageData.width + px) * 4

        // Average RGB channels
        const r = imageData.data[index] / 255
        const g = imageData.data[index + 1] / 255
        const b = imageData.data[index + 2] / 255
        const avg = (r + g + b) / 3

        // Return as-is (no inversion since image is already inverted)
        return avg
    }


}
