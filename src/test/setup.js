// Charge les matchers DOM (toBeInTheDocument, toHaveTextContent…) dans Vitest.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
