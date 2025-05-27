import {useRef, useState, useEffect} from 'react'
import {useTheme} from '../../contexts/ThemeContext'
import FlockingFBO from '../FBO/FlockingFBO'
import ShapeFormationFBO from '../FBO/ShapeFormationFBO'
// Future imports for other FBO systems:
// import TransitionFBO from '../FBO/TransitionFBO'

function ParticleSystem({ onShapeForm, targetShape, onDisperse }) {
    const [particleState, setParticleState] = useState('flocking')
    const [isTransitioning, setIsTransitioning] = useState(false)
    const [transitionProgress, setTransitionProgress] = useState(0.0)
    const currentFBORef = useRef()
    const { theme, isDark } = useTheme()
    const particleCount = 2500

    // Handle shape formation state transitions
    useEffect(() => {
        if (targetShape && particleState === 'flocking') {
            setParticleState('forming')
            setIsTransitioning(true)
            
            // Animate transition progress from 0 to 1
            const startTime = Date.now()
            const duration = 3000 // 3 seconds
            
            const animateTransition = () => {
                const elapsed = Date.now() - startTime
                const progress = Math.min(elapsed / duration, 1.0)
                
                // Smooth easing function
                const easedProgress = 1 - (1 - progress) ** 3
                setTransitionProgress(easedProgress)
                
                if (progress < 1.0) {
                    requestAnimationFrame(animateTransition)
                } else {
                    setParticleState('formed')
                    setIsTransitioning(false)
                    if (onShapeForm) {
                        onShapeForm()
                    }
                }
            }
            
            requestAnimationFrame(animateTransition)
        }
    }, [targetShape, particleState, onShapeForm])

    // Handle disperse state transitions
    useEffect(() => {
        if (particleState === 'formed' && !targetShape) {
            setParticleState('dispersing')
            setIsTransitioning(true)
            
            // Animate transition progress from 1 to 0
            const startTime = Date.now()
            const duration = 2000 // 2 seconds
            
            const animateDispersion = () => {
                const elapsed = Date.now() - startTime
                const progress = Math.min(elapsed / duration, 1.0)
                
                // Smooth easing function (reverse)
                const easedProgress = 1 - (1 - (1 - progress) ** 3)
                setTransitionProgress(1.0 - easedProgress)
                
                if (progress < 1.0) {
                    requestAnimationFrame(animateDispersion)
                } else {
                    setParticleState('flocking')
                    setIsTransitioning(false)
                    setTransitionProgress(0.0)
                    if (onDisperse) {
                        onDisperse()
                    }
                }
            }
            
            requestAnimationFrame(animateDispersion)
        }
    }, [targetShape, particleState, onDisperse])

    // Render the appropriate FBO based on current state
    const renderCurrentFBO = () => {
        // Always use ShapeFormationFBO - it can handle both flocking and shape formation
        return (
            <ShapeFormationFBO 
                ref={currentFBORef} 
                particleCount={particleCount}
                targetShape={targetShape}
                transitionProgress={transitionProgress}
                formationStrength={1.0}
            />
        )
    }

    return renderCurrentFBO()
}

export default ParticleSystem
