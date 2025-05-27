import {useRef, useState, useEffect} from 'react'
import {useTheme} from '../../contexts/ThemeContext'
import FlockingFBO from '../FBO/FlockingFBO'
// Future imports for other FBO systems:
// import ShapeFormationFBO from '../FBO/ShapeFormationFBO'
// import TransitionFBO from '../FBO/TransitionFBO'

function ParticleSystem({ onShapeForm, targetShape, onDisperse }) {
    const [particleState, setParticleState] = useState('flocking')
    const [isTransitioning, setIsTransitioning] = useState(false)
    const currentFBORef = useRef()
    const { theme, isDark } = useTheme()
    const particleCount = 2500

    // Handle shape formation state transitions
    useEffect(() => {
        if (targetShape && particleState === 'flocking') {
            setParticleState('forming')
            setIsTransitioning(true)
            
            if (currentFBORef.current) {
                currentFBORef.current.startTransition()
            }
            
            // Simulate transition duration
            setTimeout(() => {
                setParticleState('formed')
                setIsTransitioning(false)
                if (onShapeForm) {
                    onShapeForm()
                }
            }, 3000)
        }
    }, [targetShape, particleState, onShapeForm])

    // Handle disperse state transitions
    useEffect(() => {
        if (particleState === 'formed' && !targetShape) {
            setParticleState('dispersing')
            setIsTransitioning(true)
            
            if (currentFBORef.current) {
                currentFBORef.current.endTransition()
            }
            
            // Simulate transition duration
            setTimeout(() => {
                setParticleState('flocking')
                setIsTransitioning(false)
                if (onDisperse) {
                    onDisperse()
                }
            }, 2000)
        }
    }, [targetShape, particleState, onDisperse])

    // Render the appropriate FBO based on current state
    const renderCurrentFBO = () => {
        switch (particleState) {
            case 'flocking':
                return (
                    <FlockingFBO 
                        ref={currentFBORef} 
                        particleCount={particleCount}
                    />
                )
            
            case 'forming':
                // Future: Use TransitionFBO or ShapeFormationFBO
                return (
                    <FlockingFBO 
                        ref={currentFBORef} 
                        particleCount={particleCount}
                    />
                )
            
            case 'formed':
                // Future: Use ShapeFormationFBO
                return (
                    <FlockingFBO 
                        ref={currentFBORef} 
                        particleCount={particleCount}
                    />
                )
            
            case 'dispersing':
                // Future: Use TransitionFBO
                return (
                    <FlockingFBO 
                        ref={currentFBORef} 
                        particleCount={particleCount}
                    />
                )
            
            default:
                return (
                    <FlockingFBO 
                        ref={currentFBORef} 
                        particleCount={particleCount}
                    />
                )
        }
    }

    return renderCurrentFBO()
}

export default ParticleSystem
