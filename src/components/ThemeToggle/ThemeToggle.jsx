import { useTheme } from '../../contexts/ThemeContext'
import './ThemeToggle.css'

function ThemeToggle() {
    const { isDark, setIsDark } = useTheme()

    return (
        <button
            className="theme-toggle"
            onClick={() => setIsDark(!isDark)}
            aria-label="Toggle theme"
        >
            {isDark ? '☀️' : '🌙'}
        </button>
    )
}

export default ThemeToggle
