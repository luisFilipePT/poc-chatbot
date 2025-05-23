import { useState } from 'react'
import ParticleSystem from '../ParticleSystem/ParticleSystem'

function Scene() {
    const [targetShape, setTargetShape] = useState(null)

    const handleClick = (event) => {
        // Set the target shape with the click position
        setTargetShape({
            position: event.point,
            timestamp: Date.now()
        })
    }

    return (
        <>
            <ambientLight intensity={0.5} />

            {/* Invisible plane for click detection */}
            <mesh
                position={[0, 0, 0]}
                onPointerDown={handleClick}
            >
                <planeGeometry args={[200, 200]} />
                <meshBasicMaterial visible={false} />
            </mesh>

            <ParticleSystem
                onShapeForm={(clickPoint) => {
                    console.log('Shape formed at:', clickPoint)
                }}
                targetShape={targetShape}
            />
        </>
    )
}

export default Scene
