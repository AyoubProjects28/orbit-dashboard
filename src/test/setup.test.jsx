import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('outillage de test', () => {
  it('rend un composant React et applique les matchers jest-dom', () => {
    render(<p>orbit</p>)
    expect(screen.getByText('orbit')).toBeInTheDocument()
  })
})
