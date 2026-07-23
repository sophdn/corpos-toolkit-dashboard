import { useCallback, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

export function useTheme(initial: Theme = 'dark') {
  const [theme, setTheme] = useState<Theme>(initial)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(t => (t === 'light' ? 'dark' : 'light'))
  }, [])

  return { theme, toggleTheme }
}
