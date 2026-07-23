import { describe, it, expect } from 'vitest'
import { drawChart, CHART_COLORS } from './orbitChart'

// Contexte 2D espion : enregistre chaque appel et chaque affectation de style,
// ce qui permet d'asserter sur ce qui a été dessiné sans canvas réel.
function spyCtx() {
  const calls = []
  const record = (name) => (...args) => calls.push([name, ...args])
  return {
    calls,
    clearRect: record('clearRect'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    closePath: record('closePath'),
    stroke: record('stroke'),
    fill: record('fill'),
    fillRect: record('fillRect'),
    fillText: record('fillText'),
    setLineDash: record('setLineDash'),
    createLinearGradient: () => ({ addColorStop() {} }),
    set strokeStyle(value) { calls.push(['strokeStyle', value]) },
    set fillStyle(value) { calls.push(['fillStyle', value]) },
    set lineWidth(value) { calls.push(['lineWidth', value]) },
    set lineJoin(value) { calls.push(['lineJoin', value]) },
    set font(value) { calls.push(['font', value]) },
  }
}

const buffer = {
  cpu: [{ t: 950, v: 10 }, { t: 960, v: 50 }, { t: 970, v: 30 }],
  mem: [{ t: 950, v: 60 }, { t: 960, v: 62 }, { t: 970, v: 61 }],
  rx: [], tx: [], cores: [],
}
const base = { buffer, now: 1000, width: 400, height: 150, windowS: 60 }

function names(ctx) {
  return ctx.calls.map((call) => call[0])
}

describe('drawChart', () => {
  it('efface la surface avant de dessiner', () => {
    const ctx = spyCtx()
    drawChart(ctx, { ...base, sampling: null })
    expect(ctx.calls[0]).toEqual(['clearRect', 0, 0, 400, 150])
  })

  it('trace la grille avec ses libellés de pourcentage', () => {
    const ctx = spyCtx()
    drawChart(ctx, { ...base, sampling: null })
    const labels = ctx.calls.filter((call) => call[0] === 'fillText').map((call) => call[1])
    expect(labels).toEqual(['0%', '25%', '50%', '75%', '100%'])
  })

  it('trace les deux séries CPU et RAM', () => {
    const ctx = spyCtx()
    drawChart(ctx, { ...base, sampling: null })
    const styles = ctx.calls.filter((call) => call[0] === 'strokeStyle').map((call) => call[1])
    expect(styles).toContain(CHART_COLORS.cpu)
    expect(styles).toContain(CHART_COLORS.mem)
  })

  it('ne dessine aucune bande de carottage quand sampling est null', () => {
    const ctx = spyCtx()
    drawChart(ctx, { ...base, sampling: null })
    const fills = ctx.calls.filter((call) => call[0] === 'fillStyle').map((call) => call[1])
    expect(fills.some((fill) => String(fill).includes('182, 61'))).toBe(false)
  })

  it('dessine la bande ambrée quand un carottage est fourni', () => {
    const ctx = spyCtx()
    drawChart(ctx, { ...base, sampling: { start: 960, end: 970 } })
    expect(names(ctx)).toContain('fillRect')
    expect(names(ctx)).toContain('setLineDash')
  })

  it('étend la bande jusqu\'à maintenant quand le carottage est en cours', () => {
    const ctx = spyCtx()
    drawChart(ctx, { ...base, sampling: { start: 990, end: null } })
    const rect = ctx.calls.find((call) => call[0] === 'fillRect')
    expect(rect).toBeDefined()
    // start=990 et now=1000 sur une fenêtre de 60 s : la bande couvre le
    // dernier sixième du graphe, donc elle est large et calée à droite.
    const [, x, , width] = rect
    expect(x + width).toBeGreaterThan(base.width * 0.9)
  })

  it('ne trace rien quand une série a moins de deux points', () => {
    const ctx = spyCtx()
    const thin = { cpu: [{ t: 999, v: 10 }], mem: [], rx: [], tx: [], cores: [] }
    drawChart(ctx, { ...base, buffer: thin, sampling: null })
    const styles = ctx.calls.filter((call) => call[0] === 'strokeStyle').map((call) => call[1])
    expect(styles).not.toContain(CHART_COLORS.cpu)
  })

  it('ignore un carottage entièrement sorti de la fenêtre visible', () => {
    const ctx = spyCtx()
    drawChart(ctx, { ...base, sampling: { start: 100, end: 200 } })
    expect(names(ctx)).not.toContain('fillRect')
  })
})
