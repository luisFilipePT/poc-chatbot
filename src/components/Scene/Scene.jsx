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

        // Set the target shape to form the circle from the image
        setTargetShape('/circle-test.png')
    }

    const handleShapeFormed = () => {
        console.log('Shape formed!')
        // Show text after shape forms
        setTimeout(() => {
            onTextShow({ x: 0, y: 0, z: 0 }) // Center position
        }, 500)
    }

    const handleDisperse = () => {
        console.log('Shape dispersed!')
        // Clear the target shape to return to flocking
        setTargetShape(null)
        onTextHide()
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
                onDisperse={handleDisperse}
            />
        </>
    )
}

export default Scene
