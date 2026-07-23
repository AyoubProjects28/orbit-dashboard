// Générateur de métriques VM simulées — repli quand les agents psutil sont
// injoignables, pour que le dashboard reste démontrable hors ligne.
// Repris de nasa-front/monitor.html (Antoine), rendu pur : l'état et la source
// d'aléa sont injectés, donc le comportement est reproductible en test.

const GIB = 1073741824

export const VM_PROFILES = {
  llm: { cores: 4, totalBytes: 32 * GIB, idleCpu: 9, busyCpu: 78, memFloor: 58, memCeil: 86 },
  mcp: { cores: 2, totalBytes: 8 * GIB, idleCpu: 4, busyCpu: 22, memFloor: 22, memCeil: 30 },
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function round1(value) {
  return Math.round(value * 10) / 10
}

export function createMockState(vm) {
  const profile = VM_PROFILES[vm]
  return { cpu: profile.idleCpu, mem: (profile.memFloor + profile.memCeil) / 2 }
}

// Fait avancer la simulation d'un pas. `state` est muté volontairement : c'est
// une chaîne de Markov, chaque échantillon part du précédent et converge à 25 %
// par pas vers la cible (repos ou charge), avec un bruit borné.
export function nextMockSample(vm, state, { inflight = false, t, rand = Math.random }) {
  const profile = VM_PROFILES[vm]
  const target = inflight ? profile.busyCpu : profile.idleCpu

  const cpu = clamp(state.cpu + (target - state.cpu) * 0.25 + (rand() - 0.5) * 6, 1, 99)
  const memDrift = (rand() - 0.5) * 0.6 + (inflight && vm === 'llm' ? 0.8 : -0.1)
  const mem = clamp(state.mem + memDrift, profile.memFloor, profile.memCeil)

  state.cpu = round1(cpu)
  state.mem = round1(mem)

  return {
    t,
    cpu: state.cpu,
    mem: state.mem,
    memUsed: (state.mem / 100) * profile.totalBytes,
    memTotal: profile.totalBytes,
    rx: inflight ? 40000 + rand() * 90000 : rand() * 4000,
    tx: inflight ? 20000 + rand() * 50000 : rand() * 3000,
    load: Math.round((state.cpu / 100) * profile.cores * 100) / 100,
    cores: Array.from({ length: profile.cores }, () => clamp(state.cpu + (rand() - 0.5) * 30, 1, 99)),
  }
}
