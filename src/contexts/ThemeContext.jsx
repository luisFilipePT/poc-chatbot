import { createContext, useContext, useState } from 'react'

const ThemeContext = createContext()

export const useTheme = () => useContext(ThemeContext)

export function ThemeProvider({ children }) {
    const [isDark, setIsDark] = useState(true)

    const themes = {
        dark: {
            background: '#000000',
            particleColor: '#e0e0e0',
            particleEmissive: '#ffffff',
            glowColor: '#ffffff',
            textColor: '#ffffff'
        },
        light: {
            background: '#f5f5f5',
            particleColor: '#1e40af',  // Much darker blue
            particleEmissive: '#1e3a8a',  // Even darker for contrast
            glowColor: '#1e40af',
            textColor: '#000000'
        }
    }

    const currentTheme = isDark ? themes.dark : themes.light

    return (
        <ThemeContext.Provider value={{ isDark, setIsDark, theme: currentTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}
