import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { MotionGlobalConfig } from 'framer-motion'
import { afterEach } from 'vitest'

// Animations jump straight to their end state so tests see final markup and styles.
MotionGlobalConfig.skipAnimations = true

afterEach(() => {
  cleanup()
  localStorage.clear()
})
