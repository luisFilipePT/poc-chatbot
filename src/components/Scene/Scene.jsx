import { useState } from 'react'
import { useFrame } from '@react-three/fiber'
import ParticleSystem from '../ParticleSystem/ParticleSystem'

function Scene({ stats, onTextShow, onTextHide }) {
    const [targetShape, setTargetShape] = useState(null)

    // Update stats on each frame
    useFrame(() => {
        if (stats?.current) {
            stats.current.update()
        }
    })

    const handleClick = (event) => {
        // Hide text when clicking
        onTextHide()

        // Set the target shape with the click position
        setTargetShape({
            position: event.point,
            timestamp: Date.now()
        })
    }

    const handleShapeFormed = (position) => {
        console.log('Shape formed at:', position)
        // Show text after shape forms
        setTimeout(() => {
            onTextShow(position)
        }, 500)
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
                onShapeForm={handleShapeFormed}
                targetShape={targetShape}
                onDisperse={onTextHide}
            />
        </>
    )
}

export default Scene
