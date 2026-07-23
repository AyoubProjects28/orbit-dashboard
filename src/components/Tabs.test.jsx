import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Tabs from './Tabs'

const tabs = [
  { id: 'infra', label: 'Infra', content: <p>contenu infra</p> },
  { id: 'usage', label: 'Usage', content: <p>contenu usage</p> },
  { id: 'logs', label: 'Logs', content: <p>contenu logs</p> },
]

describe('Tabs', () => {
  it('rend un bouton par onglet', () => {
    render(<Tabs tabs={tabs} active="infra" onChange={() => {}} />)
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('n\'affiche que le contenu de l\'onglet actif', () => {
    render(<Tabs tabs={tabs} active="usage" onChange={() => {}} />)
    expect(screen.getByText('contenu usage')).toBeInTheDocument()
    expect(screen.queryByText('contenu infra')).not.toBeInTheDocument()
  })

  it('marque l\'onglet actif pour les lecteurs d\'écran', () => {
    render(<Tabs tabs={tabs} active="logs" onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Logs' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Infra' })).toHaveAttribute('aria-selected', 'false')
  })

  it('remonte l\'identifiant de l\'onglet cliqué', async () => {
    const onChange = vi.fn()
    render(<Tabs tabs={tabs} active="infra" onChange={onChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Logs' }))
    expect(onChange).toHaveBeenCalledWith('logs')
  })

  it('ne rend aucun contenu si l\'identifiant actif est inconnu', () => {
    render(<Tabs tabs={tabs} active="inexistant" onChange={() => {}} />)
    expect(screen.queryByText('contenu infra')).not.toBeInTheDocument()
  })
})
