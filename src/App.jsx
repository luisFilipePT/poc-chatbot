import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import Scene from './components/Scene/Scene'
import ThemeToggle from './components/ThemeToggle/ThemeToggle'
import ShapeText from './components/ShapeText/ShapeText'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import * as THREE from 'three'
import Stats from 'stats.js'
import { useEffect, useRef, useState } from 'react'
import SystemMonitor from './components/Monitor'
import './App.css'

function CanvasContent() {
    const { theme } = useTheme()
    const statsRef = useRef()
    const [showText, setShowText] = useState(false)
    const [textPosition, setTextPosition] = useState({ x: 0, y: 0, z: 0 })

    useEffect(() => {
        // Initialize Stats
        const stats = new Stats()
        stats.showPanel(0)
        stats.dom.style.position = 'absolute'
        stats.dom.style.left = '10px'
        stats.dom.style.top = '10px'
        document.body.appendChild(stats.dom)
        statsRef.current = stats

        return () => {
            document.body.removeChild(stats.dom)
        }
    }, [])

    const handleTextShow = (position) => {
        setTextPosition(position)
        setShowText(true)
    }

    const handleTextHide = () => {
        setShowText(false)
    }

    return (
        <div style={{ width: '100%', height: '100%', background: theme.background, position: 'relative' }}>
            <Canvas
                camera={{
                    position: [0, 0, 50],
                    fov: 75,
                    near: 0.1,
                    far: 1000
                }}
                gl={{
                    antialias: false,  // Changed from true - big performance gain
                    alpha: true,
                    toneMapping: THREE.ACESFilmicToneMapping,
                    powerPreference: "high-performance",
                    stencil: false,    // Add this
                    depth: true
                }}
                style={{ cursor: 'pointer' }}
                frameloop="always"
                dpr={Math.min(window.devicePixelRatio, 2)}  // Add this - limit pixel ratio
                onCreated={({ gl }) => {
                    gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
                }}
            >
                <Scene
                    stats={statsRef}
                    onTextShow={handleTextShow}
                    onTextHide={handleTextHide}
                />
                <OrbitControls enableZoom={false} enablePan={false} />
                <EffectComposer>
                    <Bloom
                        intensity={0.2}
                        luminanceThreshold={0.8}  // Increased from 0.6
                        luminanceSmoothing={0.5}  // Reduced from 0.9
                        radius={0.2}              // Reduced from 0.4
                        levels={3}                // Add this - reduces blur passes
                        mipmapBlur={true}         // Add this - more efficient blur
                    />
                </EffectComposer>
            </Canvas>

            {/* Text overlay - Outside Canvas */}
            <ShapeText visible={showText} position={textPosition} />

            <ThemeToggle />
            <SystemMonitor />
        </div>
    )
}

function App() {
    return (
        <ThemeProvider>
            <CanvasContent />
        </ThemeProvider>
    )
}

export default App
