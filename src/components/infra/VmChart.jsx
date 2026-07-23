import { useEffect, useRef } from 'react'
import { drawChart } from './orbitChart'
import { WINDOW_S } from '../../hooks/useVmMetrics'

// Enveloppe React autour du moteur de dessin.
//
// Ce composant ne re-rend jamais après le montage : la boucle
// requestAnimationFrame lit directement buffersRef et samplingRef, qui sont
// mutés par useVmMetrics sans passer par le state. C'est ce qui permet 60 fps
// sans un seul re-render de l'arbre React.
function VmChart({ vm, buffersRef, samplingRef }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let frame = 0
    const loop = () => {
      const ratio = window.devicePixelRatio || 1
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      // Redimensionner le bitmap réinitialise le contexte : ne le faire que
      // si la taille CSS a réellement changé.
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
        canvas.width = width * ratio
        canvas.height = height * ratio
      }
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
        drawChart(ctx, {
          buffer: buffersRef.current[vm],
          sampling: samplingRef.current,
          now: Date.now() / 1000,
          width,
          height,
          windowS: WINDOW_S,
        })
      }
      frame = requestAnimationFrame(loop)
    }

    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [vm, buffersRef, samplingRef])

  return <canvas ref={canvasRef} className="vm-chart" data-testid={`vm-chart-${vm}`} />
}

export default VmChart
