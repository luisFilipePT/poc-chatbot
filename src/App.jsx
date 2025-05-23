import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import Scene from './components/Scene/Scene'
import ThemeToggle from './components/ThemeToggle/ThemeToggle'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import * as THREE from 'three'
import Stats from 'stats.js'
import { useEffect, useRef } from 'react'
import './App.css'

function CanvasContent() {
    const { theme } = useTheme()
    const statsRef = useRef()

    useEffect(() => {
        // Initialize Stats
        const stats = new Stats()
        stats.showPanel(0) // 0: fps, 1: ms, 2: mb, 3+: custom
        stats.dom.style.position = 'absolute'
        stats.dom.style.left = '10px'
        stats.dom.style.top = '10px'
        document.body.appendChild(stats.dom)
        statsRef.current = stats

        return () => {
            document.body.removeChild(stats.dom)
        }
    }, [])

    return (
        <div style={{ width: '100%', height: '100%', background: theme.background }}>
            <Canvas
                camera={{
                    position: [0, 0, 50],
                    fov: 75,
                    near: 0.1,
                    far: 1000
                }}
                gl={{
                    antialias: true,
                    alpha: true,
                    toneMapping: THREE.ACESFilmicToneMapping,
                    powerPreference: "high-performance"
                }}
                style={{ cursor: 'pointer' }}
                frameloop="always"
                onCreated={({ gl }) => {
                    gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
                }}
            >
                <Scene stats={statsRef} />
                <OrbitControls enableZoom={false} enablePan={false} />
                <EffectComposer>
                    <Bloom
                        intensity={0.2}
                        luminanceThreshold={0.6}
                        luminanceSmoothing={0.9}
                        radius={0.4}
                    />
                </EffectComposer>
            </Canvas>
            <ThemeToggle />
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
