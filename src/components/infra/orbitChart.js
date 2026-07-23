// Moteur de dessin des courbes CPU/RAM — repris de nasa-front/monitor.html.
//
// Module pur : aucun import React, aucune lecture d'horloge ni de variable
// globale. Tout entre par les paramètres, ce qui rend le rendu déterministe et
// testable avec un contexte 2D espion.
//
// Les couleurs reprennent la palette Orbit de src/index.css. --accent-3 est la
// seule teinte ajoutée par l'onglet Infra (bande de carottage).

export const CHART_COLORS = {
  cpu: '#23e6d1',
  mem: '#ff2e88',
  sampling: 'rgba(255, 182, 61, .14)',
  samplingEdge: 'rgba(255, 182, 61, .7)',
  grid: 'rgba(255, 255, 255, .06)',
  label: '#6b5e8c',
}

const PADDING = { left: 30, right: 8, top: 8, bottom: 16 }
const GRID_LEVELS = [0, 25, 50, 75, 100]

export function drawChart(ctx, { buffer, sampling, now, width, height, windowS }) {
  ctx.clearRect(0, 0, width, height)

  const x0 = PADDING.left
  const x1 = width - PADDING.right
  const y0 = PADDING.top
  const y1 = height - PADDING.bottom
  const tMin = now - windowS

  const toX = (t) => x0 + ((t - tMin) / windowS) * (x1 - x0)
  const toY = (v) => y1 - (v / 100) * (y1 - y0)

  drawGrid(ctx, { x0, x1, toY })
  if (sampling) drawSamplingWindow(ctx, { sampling, now, tMin, toX, y0, y1 })
  drawSeries(ctx, buffer.cpu, { toX, toY, color: CHART_COLORS.cpu, fill: true })
  drawSeries(ctx, buffer.mem, { toX, toY, color: CHART_COLORS.mem, fill: false })
}

function drawGrid(ctx, { x0, x1, toY }) {
  ctx.strokeStyle = CHART_COLORS.grid
  ctx.lineWidth = 1
  ctx.fillStyle = CHART_COLORS.label
  ctx.font = '9px Sora, system-ui, sans-serif'
  for (const level of GRID_LEVELS) {
    const y = toY(level)
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
    ctx.stroke()
    ctx.fillText(`${level}%`, 4, y + 3)
  }
}

// Bande surlignée de la fenêtre requête→réponse. Un carottage en cours a
// end === null : la bande s'étend alors jusqu'à l'instant courant et grandit
// à chaque frame, ce qui donne le retour visuel « ça travaille ».
function drawSamplingWindow(ctx, { sampling, now, tMin, toX, y0, y1 }) {
  const start = Math.max(sampling.start, tMin)
  const end = Math.min(sampling.end ?? now, now)
  if (end <= tMin) return

  const xs = toX(start)
  const xe = toX(end)

  ctx.fillStyle = CHART_COLORS.sampling
  ctx.fillRect(xs, y0, xe - xs, y1 - y0)

  ctx.strokeStyle = CHART_COLORS.samplingEdge
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.moveTo(xs, y0)
  ctx.lineTo(xs, y1)
  ctx.moveTo(xe, y0)
  ctx.lineTo(xe, y1)
  ctx.stroke()
  ctx.setLineDash([])
}

function drawSeries(ctx, points, { toX, toY, color, fill }) {
  if (points.length < 2) return

  ctx.beginPath()
  points.forEach((point, index) => {
    const x = toX(point.t)
    const y = toY(point.v)
    if (index) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
  })
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.stroke()

  if (!fill) return
  const first = points[0]
  const last = points[points.length - 1]
  ctx.lineTo(toX(last.t), toY(0))
  ctx.lineTo(toX(first.t), toY(0))
  ctx.closePath()
  const gradient = ctx.createLinearGradient(0, 0, 0, 140)
  gradient.addColorStop(0, `${color}33`)
  gradient.addColorStop(1, `${color}00`)
  ctx.fillStyle = gradient
  ctx.fill()
}
