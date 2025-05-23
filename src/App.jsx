import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import Scene from './components/Scene/Scene'
import ThemeToggle from './components/ThemeToggle/ThemeToggle'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import * as THREE from 'three'
import './App.css'

function CanvasContent() {
    const { theme } = useTheme()

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
                    toneMapping: THREE.ACESFilmicToneMapping
                }}
                style={{ cursor: 'pointer' }}
            >
                <Scene />
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
