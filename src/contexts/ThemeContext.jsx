import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext()

export const useTheme = () => useContext(ThemeContext)

export function ThemeProvider({ children }) {
    const [isDark, setIsDark] = useState(() => {
        const saved = localStorage.getItem('theme')
        if (saved) return saved === 'dark'
        return window.matchMedia('(prefers-color-scheme: dark)').matches
    })

    const themes = {
        dark: {
            background: '#000000',
            particleColor: '#e0e0e0',
            particleEmissive: '#ffffff',
            glowColor: '#ffffff',
            textColor: '#ffffff',
            accentColor: '#64b5f6',
            toggleBg: 'rgba(255, 255, 255, 0.1)',
            toggleHover: 'rgba(255, 255, 255, 0.2)'
        },
        light: {
            background: 'linear-gradient(to bottom, #f0f4f8 0%, #d9e2ec 100%)',  // Subtle gradient
            particleColor: '#000000',  // Pure black particles
            particleEmissive: '#000000',  // Black emissive
            glowColor: '#333333',
            textColor: '#000000',
            accentColor: '#0066cc',
            toggleBg: 'rgba(0, 0, 0, 0.05)',
            toggleHover: 'rgba(0, 0, 0, 0.1)'
        }
    }

    const currentTheme = isDark ? themes.dark : themes.light

    useEffect(() => {
        localStorage.setItem('theme', isDark ? 'dark' : 'light')
        document.body.style.backgroundColor = currentTheme.background
        document.body.style.transition = 'background-color 0.3s ease'
    }, [isDark, currentTheme.background])

    return (
        <ThemeContext.Provider value={{ isDark, setIsDark, theme: currentTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}
