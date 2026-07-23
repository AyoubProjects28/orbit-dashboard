import { describe, it, expect } from 'vitest'
import { VM_PROFILES, createMockState, nextMockSample } from './mockVm'

// rand fixé à 0.5 => tous les termes (rand() - 0.5) s'annulent,
// ce qui rend la simulation parfaitement déterministe en test.
const noJitter = () => 0.5

describe('VM_PROFILES', () => {
  it('décrit les deux VM avec leur nombre de cœurs', () => {
    expect(VM_PROFILES.llm.cores).toBe(4)
    expect(VM_PROFILES.mcp.cores).toBe(2)
  })
})

describe('nextMockSample', () => {
  it('reste proche du repos quand aucune requête n\'est en vol', () => {
    const state = createMockState('llm')
    const sample = nextMockSample('llm', state, { inflight: false, t: 1000, rand: noJitter })
    expect(sample.cpu).toBeGreaterThan(1)
    expect(sample.cpu).toBeLessThan(15)
  })

  it('converge vers la charge haute quand une requête est en vol', () => {
    const state = createMockState('llm')
    let sample
    for (let i = 0; i < 20; i += 1) {
      sample = nextMockSample('llm', state, { inflight: true, t: 1000 + i, rand: noJitter })
    }
    expect(sample.cpu).toBeGreaterThan(70)
  })

  it('produit un pourcentage par cœur, au bon nombre', () => {
    const state = createMockState('mcp')
    const sample = nextMockSample('mcp', state, { inflight: false, t: 1000, rand: noJitter })
    expect(sample.cores).toHaveLength(2)
    sample.cores.forEach((core) => {
      expect(core).toBeGreaterThanOrEqual(1)
      expect(core).toBeLessThanOrEqual(99)
    })
  })

  it('borne le CPU entre 1 et 99 même avec un aléa extrême', () => {
    const state = createMockState('llm')
    const sample = nextMockSample('llm', state, { inflight: true, t: 1000, rand: () => 1 })
    expect(sample.cpu).toBeGreaterThanOrEqual(1)
    expect(sample.cpu).toBeLessThanOrEqual(99)
  })

  it('mute l\'état pour que l\'échantillon suivant reparte de là', () => {
    const state = createMockState('llm')
    const first = nextMockSample('llm', state, { inflight: true, t: 1000, rand: noJitter })
    expect(state.cpu).toBe(first.cpu)
  })

  it('reporte le timestamp fourni', () => {
    const state = createMockState('mcp')
    expect(nextMockSample('mcp', state, { inflight: false, t: 4242, rand: noJitter }).t).toBe(4242)
  })
})
