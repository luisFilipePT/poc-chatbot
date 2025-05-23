import { useTheme } from '../../contexts/ThemeContext'
import './ThemeToggle.css'

function ThemeToggle() {
    const { isDark, setIsDark } = useTheme()

    return (
        <button
            className={`theme-toggle ${isDark ? 'dark' : 'light'}`}
            onClick={() => setIsDark(!isDark)}
            aria-label="Toggle theme"
        >
            <div className="toggle-track">
                <div className="toggle-thumb">
                    <svg className="sun-icon" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2"/>
                        <path d="M12 1v6m0 6v6m-9-9h6m6 0h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M20.5 7.5L16 12l4.5 4.5M3.5 7.5L8 12l-4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <svg className="moon-icon" viewBox="0 0 24 24" fill="none">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </div>
                <div className="stars">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <div className="clouds">
                    <span></span>
                    <span></span>
                </div>
            </div>
        </button>
    )
}

export default ThemeToggle
