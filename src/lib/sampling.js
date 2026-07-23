// Calculs du carottage — fonctions pures, sans I/O ni lecture d'horloge.
// Toutes les bornes temporelles sont passées en paramètre : c'est ce qui rend
// le carottage reproductible en test et indépendant du moment d'exécution.
//
// Une « série » est un tableau [{ t: secondes epoch, v: valeur }] trié par t.

function inWindow(series, t0, t1) {
  return series.filter((point) => point.t >= t0 && point.t <= t1)
}

function round1(value) {
  return Math.round(value * 10) / 10
}

export function avgWindow(series, t0, t1) {
  const points = inWindow(series, t0, t1)
  if (!points.length) return 0
  return points.reduce((sum, point) => sum + point.v, 0) / points.length
}

export function peakWindow(series, t0, t1) {
  const points = inWindow(series, t0, t1)
  if (!points.length) return 0
  return Math.max(...points.map((point) => point.v))
}

// CPU·secondes = intégrale de (cpu% / 100 × cœurs) dt sur la fenêtre.
// Approximée par la méthode des trapèzes : l'agent psutil échantillonne à 1 Hz,
// donc on interpole linéairement entre deux mesures plutôt que de supposer
// la charge constante sur toute la seconde.
export function cpuSeconds(series, t0, t1, cores) {
  const points = inWindow(series, t0, t1)
  if (points.length < 2) return 0
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    const dt = points[i].t - points[i - 1].t
    const meanPct = (points[i].v + points[i - 1].v) / 2
    total += (meanPct / 100) * cores * dt
  }
  return total
}

// Hausse du CPU par rapport à la baseline mesurée avant la requête.
// Sous 0,5 % de baseline, le dénominateur n'est plus que du bruit de fond et
// le ratio produirait des « +4000 % » absurdes : on renvoie null et l'appelant
// affiche la valeur absolue à la place.
export function cpuIncreasePct(avg, base) {
  if (base < 0.5) return null
  return ((avg - base) / base) * 100
}

// Résumé d'un carottage pour une VM — mêmes champs que la ligne "sampling"
// du contrat JSONL (voir spec §5.1), pour que l'étape 3 puisse le poster tel quel.
export function summarizeVm(buffer, cores, t0, t1, baselineCpu) {
  return {
    cpu_avg: round1(avgWindow(buffer.cpu, t0, t1)),
    cpu_peak: round1(peakWindow(buffer.cpu, t0, t1)),
    cpu_base: round1(baselineCpu),
    mem_avg: round1(avgWindow(buffer.mem, t0, t1)),
    cores,
    cpu_seconds: round1(cpuSeconds(buffer.cpu, t0, t1, cores)),
  }
}
