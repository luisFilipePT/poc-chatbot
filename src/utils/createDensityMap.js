export function createDensityMap() {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')

    // Black background
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, 512, 512)

    const centerX = 256
    const centerY = 256

    // Outer ring - white
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 30
    ctx.beginPath()
    ctx.arc(centerX, centerY, 200, 0, Math.PI * 2)
    ctx.stroke()

    // Add some noise to outer ring
    for (let i = 0; i < 100; i++) {
        const angle = Math.random() * Math.PI * 2
        const r = 190 + Math.random() * 20
        const x = centerX + Math.cos(angle) * r
        const y = centerY + Math.sin(angle) * r
        ctx.fillStyle = 'white'
        ctx.beginPath()
        ctx.arc(x, y, Math.random() * 5 + 2, 0, Math.PI * 2)
        ctx.fill()
    }

    // Inner ring - gray
    ctx.strokeStyle = 'rgb(150, 150, 150)'
    ctx.lineWidth = 40
    ctx.beginPath()
    ctx.arc(centerX, centerY, 120, 0, Math.PI * 2)
    ctx.stroke()

    // Very inner ring - lighter gray
    ctx.strokeStyle = 'rgb(100, 100, 100)'
    ctx.lineWidth = 20
    ctx.beginPath()
    ctx.arc(centerX, centerY, 60, 0, Math.PI * 2)
    ctx.stroke()

    // Convert to data URL and download for reference
    const dataURL = canvas.toDataURL('image/png')

    // Optionally save it
    const link = document.createElement('a')
    link.download = 'density-map.png'
    link.href = dataURL
    // link.click() // Uncomment to auto-download

    return canvas
}
