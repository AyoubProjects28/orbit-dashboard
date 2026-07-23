import { describe, it, expect } from 'vitest'
import { avgWindow, peakWindow, cpuSeconds, cpuIncreasePct, summarizeVm } from './sampling'

const series = [
  { t: 100, v: 10 },
  { t: 101, v: 20 },
  { t: 102, v: 60 },
  { t: 103, v: 40 },
  { t: 104, v: 5 },
]

describe('avgWindow', () => {
  it('moyenne les points strictement dans la fenêtre, bornes incluses', () => {
    expect(avgWindow(series, 101, 103)).toBe(40)
  })

  it('renvoie 0 quand aucun point ne tombe dans la fenêtre', () => {
    expect(avgWindow(series, 200, 300)).toBe(0)
  })

  it('renvoie 0 sur une série vide', () => {
    expect(avgWindow([], 0, 10)).toBe(0)
  })
})

describe('peakWindow', () => {
  it('renvoie le maximum de la fenêtre, pas celui de la série entière', () => {
    expect(peakWindow(series, 100, 101)).toBe(20)
  })

  it('renvoie 0 quand la fenêtre est vide', () => {
    expect(peakWindow(series, 200, 300)).toBe(0)
  })
})

describe('cpuSeconds', () => {
  it('intègre par trapèzes : 100% sur 4 cœurs pendant 2 s = 8 CPU·s', () => {
    const flat = [
      { t: 0, v: 100 },
      { t: 1, v: 100 },
      { t: 2, v: 100 },
    ]
    expect(cpuSeconds(flat, 0, 2, 4)).toBe(8)
  })

  it('tient compte de la pente entre deux points', () => {
    // trapèze : (0 + 100) / 2 = 50% sur 1 s sur 2 cœurs = 1 CPU·s
    const ramp = [
      { t: 0, v: 0 },
      { t: 1, v: 100 },
    ]
    expect(cpuSeconds(ramp, 0, 1, 2)).toBe(1)
  })

  it('renvoie 0 quand la fenêtre contient moins de deux points', () => {
    expect(cpuSeconds(series, 100, 100, 4)).toBe(0)
    expect(cpuSeconds([], 0, 10, 4)).toBe(0)
  })
})

describe('cpuIncreasePct', () => {
  it('calcule la hausse relative par rapport à la baseline', () => {
    expect(cpuIncreasePct(80, 10)).toBe(700)
  })

  it('gère une baisse', () => {
    expect(cpuIncreasePct(5, 10)).toBe(-50)
  })

  it("renvoie null sous 0,5% de baseline, où le ratio n'a plus de sens", () => {
    expect(cpuIncreasePct(80, 0.2)).toBeNull()
  })
})

describe('summarizeVm', () => {
  it('produit le résumé de carottage attendu par le contrat JSONL', () => {
    const buffer = {
      cpu: [
        { t: 10, v: 20 },
        { t: 11, v: 80 },
        { t: 12, v: 80 },
      ],
      mem: [
        { t: 10, v: 60 },
        { t: 11, v: 70 },
        { t: 12, v: 62 },
      ],
      rx: [],
      tx: [],
      cores: [],
    }
    expect(summarizeVm(buffer, 4, 10, 12, 8.14)).toEqual({
      cpu_avg: 60,
      cpu_peak: 80,
      cpu_base: 8.1,
      mem_avg: 64,
      cores: 4,
      cpu_seconds: 5.2,
    })
  })
})
