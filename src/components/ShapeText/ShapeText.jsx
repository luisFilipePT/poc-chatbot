import { useRef, useEffect } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import './ShapeText.css'

function ShapeText({ visible, position }) {
    const { theme } = useTheme()
    const textRef = useRef()

    useEffect(() => {
        if (textRef.current && position) {
            // For now, just center it. In a real app, you'd convert 3D to screen coordinates
            // Since the shape forms at click position which is usually center, this works
            textRef.current.style.transform = `translate(-50%, -50%)`
        }
    }, [position])

    return (
        <div
            ref={textRef}
            className={`shape-text ${visible ? 'visible' : ''}`}
            style={{ color: theme.textColor }}
        >
            <h2 className="greeting">Good morning!</h2>
            <p className="subtitle">How may I help you today?</p>
        </div>
    )
}

export default ShapeText
