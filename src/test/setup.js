// Charge les matchers DOM (toBeInTheDocument, toHaveTextContent…) dans Vitest.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

if (typeof globalThis.EventSource === 'undefined') {
  // jsdom ne fournit pas EventSource — useCallEvents() en a besoin pour se
  // monter sans planter dans les tests de composants qui rendent <App />.
  globalThis.EventSource = class EventSource {
    constructor(url) {
      this.url = url
      this.onmessage = null
      this.onerror = null
    }
    close() {}
  }
}

afterEach(() => {
  cleanup()
})
