// Sondage des agents psutil, tampon glissant et carottage.
//
// Ce hook est monté UNE SEULE FOIS, dans App.jsx, au-dessus des onglets.
// S'il vivait dans InfraTab, changer d'onglet le démonterait : le tampon
// repartirait de zéro et un prompt envoyé depuis l'onglet Logs produirait un
// carottage sans baseline.
//
// Le tampon vit dans un ref, pas dans un state : il est réécrit chaque seconde
// et lu à 60 fps par le canvas. Le passer en state provoquerait un re-render
// par seconde de tout l'arbre pour rien.
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchVmMetrics } from '../api/vmMetrics'
import { avgWindow, summarizeVm } from '../lib/sampling'
import { VM_PROFILES, createMockState, nextMockSample } from '../lib/mockVm'

export const VMS = ['llm', 'mcp']
export const WINDOW_S = 60
export const BASELINE_S = 15
const POLL_MS = 1000
const SERIES_KEYS = ['cpu', 'mem', 'rx', 'tx']

function emptyBuffer() {
  return { cpu: [], mem: [], rx: [], tx: [], cores: [] }
}

// Traduit la charge utile d'un agent psutil en échantillon interne.
// Même forme que nextMockSample, pour que le tampon ignore l'origine.
function mapAgent(agent, t) {
  return {
    t,
    cpu: agent.cpu_percent,
    mem: agent.mem_percent,
    memUsed: agent.mem_used_bytes,
    memTotal: agent.mem_total_bytes,
    rx: agent.net_rx_bps,
    tx: agent.net_tx_bps,
    load: agent.load_avg?.[0] ?? 0,
    cores: agent.per_cpu ?? [],
  }
}

function isLive(agent) {
  return Boolean(agent) && !agent.error && typeof agent.cpu_percent === 'number'
}

export function useVmMetrics() {
  const buffersRef = useRef({ llm: emptyBuffer(), mcp: emptyBuffer() })
  const mockStatesRef = useRef({ llm: createMockState('llm'), mcp: createMockState('mcp') })
  const samplingRef = useRef(null)

  const [latest, setLatest] = useState({ llm: null, mcp: null })
  const [online, setOnline] = useState({ llm: false, mcp: false })
  const [lastSampling, setLastSampling] = useState(null)

  const push = useCallback((vm, sample) => {
    const buffer = buffersRef.current[vm]
    buffer.cpu.push({ t: sample.t, v: sample.cpu })
    buffer.mem.push({ t: sample.t, v: sample.mem })
    buffer.rx.push({ t: sample.t, v: sample.rx })
    buffer.tx.push({ t: sample.t, v: sample.tx })
    buffer.cores = sample.cores
    // On garde 2 s de marge au-delà de la fenêtre visible pour que la courbe
    // ne se coupe pas au bord gauche pendant l'interpolation du tracé.
    const cutoff = sample.t - WINDOW_S - 2
    for (const key of SERIES_KEYS) {
      while (buffer[key].length && buffer[key][0].t < cutoff) buffer[key].shift()
    }
  }, [])

  const poll = useCallback(async () => {
    const t = Date.now() / 1000
    let payload = null
    try {
      payload = await fetchVmMetrics()
    } catch {
      payload = null
    }

    const nextOnline = {}
    const nextLatest = {}
    for (const vm of VMS) {
      const agent = payload?.[vm]
      if (isLive(agent)) {
        nextOnline[vm] = true
        nextLatest[vm] = mapAgent(agent, t)
      } else {
        nextOnline[vm] = false
        nextLatest[vm] = nextMockSample(vm, mockStatesRef.current[vm], {
          inflight: samplingRef.current?.active ?? false,
          t,
        })
      }
      push(vm, nextLatest[vm])
    }
    setOnline(nextOnline)
    setLatest(nextLatest)
  }, [push])

  useEffect(() => {
    poll()
    const interval = setInterval(poll, POLL_MS)
    return () => clearInterval(interval)
  }, [poll])

  const startSampling = useCallback(() => {
    const t = Date.now() / 1000
    samplingRef.current = {
      start: t,
      end: null,
      active: true,
      base: Object.fromEntries(
        VMS.map((vm) => [vm, avgWindow(buffersRef.current[vm].cpu, t - BASELINE_S, t)]),
      ),
    }
    setLastSampling(null)
  }, [])

  const endSampling = useCallback(() => {
    const current = samplingRef.current
    if (!current?.active) return null

    const end = Date.now() / 1000
    current.end = end
    current.active = false

    const summary = {
      window_s: Math.round((end - current.start) * 10) / 10,
      vms: Object.fromEntries(
        VMS.map((vm) => {
          const buffer = buffersRef.current[vm]
          const cores = buffer.cores.length || VM_PROFILES[vm].cores
          return [vm, summarizeVm(buffer, cores, current.start, end, current.base[vm])]
        }),
      ),
    }
    setLastSampling(summary)
    return summary
  }, [])

  return { buffersRef, samplingRef, latest, online, lastSampling, startSampling, endSampling }
}
