# Étape 1 — Coquille à onglets + onglet Infra · Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer un dashboard React à trois onglets avec le chat fixe à gauche, dont l'onglet Infra reprend intégralement les graphes temps réel et le carottage CPU du `monitor.html` d'Antoine.

**Architecture:** Le tampon de métriques VM vit dans un hook `useVmMetrics` monté dans `App.jsx`, au-dessus des onglets, et tourne à 1 Hz en permanence — sinon changer d'onglet viderait le tampon et le carottage raterait sa fenêtre. Le moteur de dessin (`orbitChart.js`) est un module pur sans React, appelé depuis une boucle `requestAnimationFrame` : les courbes se rafraîchissent à 60 fps sans provoquer un seul re-render React. Les calculs de carottage vivent dans `lib/sampling.js`, également pur, ce qui les rend testables sans DOM ni horloge réelle.

**Tech Stack:** React 19, Vite 8, Recharts 3 (onglets Usage/Logs uniquement), Canvas 2D natif (onglet Infra), Vitest + Testing Library.

**Spec de référence :** [`docs/superpowers/specs/2026-07-23-orbit-dashboard-fusion-design.md`](../specs/2026-07-23-orbit-dashboard-fusion-design.md)

## Global Constraints

- **Backend intouché.** Étape 1 ne modifie aucun fichier de `nasa-back/`. Elle consomme uniquement `/api/vm-metrics`, `/api/providers`, `/api/chat` et `/api/metrics` tels qu'ils existent aujourd'hui.
- **Palette Orbit uniquement.** Toute couleur passe par les variables de `src/index.css` (`--accent` `#ff2e88`, `--accent-2` `#23e6d1`, `--text`, `--text-h`, `--bg`, `--border`, `--panel-bg`, `--shadow`). Une seule couleur nouvelle est introduite : `--accent-3: #ffb63d` pour la bande de carottage.
- **Typographie** : `--heading` (Chakra Petch) pour les titres, `--sans` (Sora) pour le corps, `--mono` (JetBrains Mono) pour les valeurs chiffrées.
- **Aucune ressource externe** hors les Google Fonts déjà importées dans `src/index.css`.
- **VMs** : `llm` = LLM-TEST01 · Ollama · `172.18.53.7` · 4 cœurs · 32 Gio ; `mcp` = MCP-TEST01 · FastMCP · `172.18.53.9` · 2 cœurs · 8 Gio.
- **Constantes de carottage** : fenêtre visible 60 s, baseline 15 s, sondage 1000 ms. Valeurs reprises de `monitor.html`.
- **`nasa-front/monitor.html` reste en place** et fonctionnel jusqu'à l'étape 5.
- **Commits** : un par tâche, message en anglais, préfixe `feat:` / `test:` / `refactor:` / `chore:`.
- Travailler depuis `orbit-dashboard/` (le dépôt npm est à la racine de ce dossier, pas de la racine « Orbit Planner »).

---

## File Structure

| Fichier | Action | Responsabilité |
|---|---|---|
| `vite.config.js` | modifier | + bloc `test` Vitest |
| `package.json` | modifier | + devDeps de test, + script `test` |
| `src/test/setup.js` | créer | matchers `jest-dom` |
| `src/lib/sampling.js` | créer | calculs purs sur les tampons : moyenne, pic, CPU·secondes |
| `src/lib/mockVm.js` | créer | générateur de métriques simulées (repli hors ligne) |
| `src/api/vmMetrics.js` | créer | `GET /api/vm-metrics` |
| `src/api/providers.js` | créer | `GET /api/providers` |
| `src/api/chat.js` | modifier | envoie `provider`, renvoie `turnMetrics` |
| `src/hooks/useVmMetrics.js` | créer | sondage 1 Hz, tampon 60 s, `startSampling` / `endSampling` |
| `src/components/infra/orbitChart.js` | créer | moteur de dessin pur (repris d'Antoine) |
| `src/components/infra/VmChart.jsx` | créer | enveloppe React + boucle `requestAnimationFrame` |
| `src/components/infra/VmCard.jsx` | créer | en-tête VM, lectures, barres par cœur |
| `src/components/infra/InfraTab.jsx` | créer | les deux cartes + récap du dernier carottage |
| `src/components/Tabs.jsx` | créer | coquille à onglets |
| `src/components/usage/UsageTab.jsx` | créer | regroupe les panneaux existants |
| `src/components/usage/*.jsx` | déplacer | `SummaryBar`, `TokensPanel`, `LatencyPanel`, `CostPanel`, `HardwarePanel` |
| `src/components/logs/LogsTab.jsx` | créer | placeholder (étape 3) |
| `src/components/ChatPanel.jsx` | modifier | sélecteur de cible, carottage, métriques repliables |
| `src/App.jsx` | modifier | layout deux colonnes, hook global, onglets |
| `src/App.css` | modifier | layout, onglets, styles infra |
| `src/index.css` | modifier | + `--accent-3` |

---

## Task 1: Outillage de test

Le projet n'a aucun runner de test (`node_modules/.bin` ne contient ni vitest ni jest). Sans lui, aucune des tâches suivantes ne peut suivre un cycle TDD. Cette tâche est le prérequis de toutes les autres.

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`
- Create: `src/test/setup.js`
- Test: `src/test/setup.test.js`

**Interfaces:**
- Consumes: rien
- Produces: la commande `npm test` (Vitest en mode `run`), l'environnement `jsdom`, les matchers `@testing-library/jest-dom`, et `render` / `screen` / `renderHook` de `@testing-library/react` disponibles dans tous les tests suivants.

- [ ] **Step 1: Installer les dépendances de test**

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom
```

Si npm échoue sur la résolution des peer dependencies avec Vite 8, relancer avec `--legacy-peer-deps`.

- [ ] **Step 2: Ajouter le script de test**

Dans `package.json`, section `scripts`, ajouter la ligne `test` :

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "oxlint",
    "preview": "vite preview",
    "server": "node nasa-back/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 3: Créer le fichier de setup**

`src/test/setup.js` :

```js
// Charge les matchers DOM (toBeInTheDocument, toHaveTextContent…) dans Vitest.
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: Configurer Vitest**

Dans `vite.config.js`, ajouter le bloc `test` à l'objet passé à `defineConfig`, après `server` :

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Matches the folder name used on web-test01 (/opt/projects/nasa-front)
    // so local build output and the VM deployment path stay aligned.
    outDir: 'nasa-front',
  },
  server: {
    // Forward /api/* requests to the Express backend during local dev,
    // so the frontend can always call fetch('/api/metrics') with no
    // port number — same as it will behind nginx in production.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    // jsdom fournit document/window aux tests de composants ; les modules
    // purs (lib/, orbitChart) n'en dépendent pas mais partagent la config.
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    // Le build de production sort dans nasa-front/ — ne jamais y chercher de tests.
    exclude: ['node_modules/**', 'nasa-front/**', 'nasa-back/**'],
  },
})
```

- [ ] **Step 5: Écrire le test sentinelle**

`src/test/setup.test.js` :

```js
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('outillage de test', () => {
  it('rend un composant React et applique les matchers jest-dom', () => {
    render(<p>orbit</p>)
    expect(screen.getByText('orbit')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Lancer les tests**

Run: `npm test`
Expected: PASS — `1 passed`. Si l'erreur est `Cannot find module '@testing-library/jest-dom/vitest'`, l'installation de l'étape 1 a échoué : la relancer.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.js src/test/
git commit -m "test: set up Vitest + Testing Library for the dashboard frontend"
```

---

## Task 2: `lib/sampling.js` — calculs purs du carottage

**Files:**
- Create: `src/lib/sampling.js`
- Test: `src/lib/sampling.test.js`

**Interfaces:**
- Consumes: rien
- Produces:
  - `avgWindow(series, t0, t1) -> number` — moyenne des points de `series` dans `[t0, t1]`, `0` si aucun point
  - `peakWindow(series, t0, t1) -> number` — maximum, `0` si aucun point
  - `cpuSeconds(series, t0, t1, cores) -> number` — CPU·secondes par la méthode des trapèzes
  - `cpuIncreasePct(avg, base) -> number | null` — augmentation relative en %, `null` si `base < 0.5`
  - `summarizeVm(buffer, cores, t0, t1, baselineCpu) -> { cpu_avg, cpu_peak, cpu_base, mem_avg, cores, cpu_seconds }`
  - Une `series` est un tableau `[{ t: secondes, v: nombre }]` trié par `t` croissant.
  - Un `buffer` est `{ cpu: series, mem: series, rx: series, tx: series, cores: number[] }`.

- [ ] **Step 1: Écrire les tests qui échouent**

`src/lib/sampling.test.js` :

```js
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
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/lib/sampling.test.js`
Expected: FAIL — `Failed to resolve import "./sampling"`.

- [ ] **Step 3: Écrire l'implémentation**

`src/lib/sampling.js` :

```js
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
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/lib/sampling.test.js`
Expected: PASS — `12 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sampling.js src/lib/sampling.test.js
git commit -m "feat: add pure sampling-window maths (avg, peak, CPU-seconds)"
```

---

## Task 3: `lib/mockVm.js` — repli hors ligne

Antoine a prévu un mode démo qui simule des VM plausibles quand les agents psutil sont injoignables. On le reprend, en le rendant pur : l'état et la source d'aléa sont passés en paramètre, donc testable de façon déterministe.

**Files:**
- Create: `src/lib/mockVm.js`
- Test: `src/lib/mockVm.test.js`

**Interfaces:**
- Consumes: rien
- Produces:
  - `VM_PROFILES` — `{ llm: { cores, totalBytes, idleCpu, busyCpu, memFloor, memCeil }, mcp: {...} }`
  - `createMockState(vm) -> { cpu, mem }` — état mutable initial
  - `nextMockSample(vm, state, { inflight, t, rand }) -> sample` — **mute `state`** et renvoie un échantillon
  - Un `sample` est `{ t, cpu, mem, memUsed, memTotal, rx, tx, load, cores }`, `cores` étant un tableau de pourcentages par cœur. C'est exactement la forme que `useVmMetrics` pousse dans son tampon.

- [ ] **Step 1: Écrire les tests qui échouent**

`src/lib/mockVm.test.js` :

```js
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
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/lib/mockVm.test.js`
Expected: FAIL — `Failed to resolve import "./mockVm"`.

- [ ] **Step 3: Écrire l'implémentation**

`src/lib/mockVm.js` :

```js
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
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/lib/mockVm.test.js`
Expected: PASS — `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mockVm.js src/lib/mockVm.test.js
git commit -m "feat: add deterministic VM metrics mock for offline demos"
```

---

## Task 4: `useVmMetrics` — sondage, tampon et carottage

Le cœur de l'étape. Ce hook est monté une seule fois dans `App.jsx` et tourne en permanence : il ne doit **jamais** être remonté par un changement d'onglet, sinon le tampon repart de zéro et le carottage n'a plus de baseline.

**Files:**
- Create: `src/api/vmMetrics.js`
- Create: `src/hooks/useVmMetrics.js`
- Test: `src/hooks/useVmMetrics.test.js`

**Interfaces:**
- Consumes: `avgWindow`, `summarizeVm` (Task 2) ; `VM_PROFILES`, `createMockState`, `nextMockSample` (Task 3)
- Produces:
  - `fetchVmMetrics() -> Promise<{ llm, mcp }>` depuis `src/api/vmMetrics.js`
  - `VMS = ['llm', 'mcp']`, `WINDOW_S = 60`, `BASELINE_S = 15`
  - `useVmMetrics() -> { buffersRef, samplingRef, latest, online, lastSampling, startSampling, endSampling }`
    - `buffersRef.current` — `{ llm: buffer, mcp: buffer }`, **muté sans re-render**, lu par le canvas
    - `samplingRef.current` — `null` ou `{ start, end, active, base: { llm, mcp } }`, lu par le canvas
    - `latest` — état React `{ llm: sample|null, mcp: sample|null }`, rafraîchi à 1 Hz
    - `online` — état React `{ llm: bool, mcp: bool }`
    - `lastSampling` — état React `null` ou `{ window_s, vms: { llm, mcp } }`
    - `startSampling() -> void`
    - `endSampling() -> { window_s, vms } | null`

- [ ] **Step 1: Écrire le client d'API**

`src/api/vmMetrics.js` :

```js
// Récupère les métriques des agents psutil, agrégées côté backend.
// Le backend proxifie les deux agents (LLM + MCP) pour que le navigateur
// reste en même origine — voir nasa-back/index.js, route /api/vm-metrics.

export async function fetchVmMetrics() {
  const response = await fetch('/api/vm-metrics', { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to fetch VM metrics: ${response.status}`)
  }
  return response.json()
}
```

- [ ] **Step 2: Écrire les tests qui échouent**

`src/hooks/useVmMetrics.test.js` :

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useVmMetrics, VMS, WINDOW_S, BASELINE_S } from './useVmMetrics'

function agentPayload(cpu, mem) {
  return {
    cpu_percent: cpu,
    mem_percent: mem,
    mem_used_bytes: 1000,
    mem_total_bytes: 2000,
    net_rx_bps: 10,
    net_tx_bps: 20,
    load_avg: [1.5, 1.2, 1.0],
    per_cpu: [cpu, cpu, cpu, cpu],
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function mockOk(body) {
  globalThis.fetch.mockResolvedValue({ ok: true, json: async () => body })
}

describe('useVmMetrics — constantes', () => {
  it('expose les constantes de carottage reprises de monitor.html', () => {
    expect(VMS).toEqual(['llm', 'mcp'])
    expect(WINDOW_S).toBe(60)
    expect(BASELINE_S).toBe(15)
  })
})

describe('useVmMetrics — sondage', () => {
  it('marque les deux VM en ligne et remplit le tampon quand les agents répondent', async () => {
    mockOk({ llm: agentPayload(42, 61), mcp: agentPayload(7, 23) })
    const { result } = renderHook(() => useVmMetrics())

    await waitFor(() => expect(result.current.online.llm).toBe(true))
    expect(result.current.online.mcp).toBe(true)
    expect(result.current.latest.llm.cpu).toBe(42)
    expect(result.current.buffersRef.current.llm.cpu.length).toBeGreaterThan(0)
  })

  it('bascule sur le mock et marque hors ligne quand un agent renvoie une erreur', async () => {
    mockOk({ llm: { error: 'ECONNREFUSED' }, mcp: agentPayload(7, 23) })
    const { result } = renderHook(() => useVmMetrics())

    await waitFor(() => expect(result.current.latest.llm).not.toBeNull())
    expect(result.current.online.llm).toBe(false)
    expect(result.current.online.mcp).toBe(true)
    // le mock alimente quand même le tampon, pour que les courbes ne se figent pas
    expect(result.current.buffersRef.current.llm.cpu.length).toBeGreaterThan(0)
  })

  it('bascule sur le mock pour les deux VM quand le backend est injoignable', async () => {
    globalThis.fetch.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useVmMetrics())

    await waitFor(() => expect(result.current.latest.llm).not.toBeNull())
    expect(result.current.online.llm).toBe(false)
    expect(result.current.online.mcp).toBe(false)
  })
})

describe('useVmMetrics — carottage', () => {
  it('renvoie un résumé par VM entre startSampling et endSampling', async () => {
    mockOk({ llm: agentPayload(80, 70), mcp: agentPayload(20, 25) })
    const { result } = renderHook(() => useVmMetrics())
    await waitFor(() => expect(result.current.online.llm).toBe(true))

    act(() => result.current.startSampling())
    expect(result.current.samplingRef.current.active).toBe(true)

    let summary
    act(() => { summary = result.current.endSampling() })

    expect(summary).not.toBeNull()
    expect(summary.vms.llm).toHaveProperty('cpu_avg')
    expect(summary.vms.llm).toHaveProperty('cpu_seconds')
    expect(summary.vms.mcp).toHaveProperty('cpu_peak')
    expect(result.current.samplingRef.current.active).toBe(false)
    expect(result.current.lastSampling).toEqual(summary)
  })

  it('renvoie null si endSampling est appelé sans carottage en cours', async () => {
    mockOk({ llm: agentPayload(10, 60), mcp: agentPayload(5, 22) })
    const { result } = renderHook(() => useVmMetrics())
    await waitFor(() => expect(result.current.online.llm).toBe(true))

    let summary
    act(() => { summary = result.current.endSampling() })
    expect(summary).toBeNull()
  })

  it('efface le résumé précédent au démarrage d\'un nouveau carottage', async () => {
    mockOk({ llm: agentPayload(10, 60), mcp: agentPayload(5, 22) })
    const { result } = renderHook(() => useVmMetrics())
    await waitFor(() => expect(result.current.online.llm).toBe(true))

    act(() => result.current.startSampling())
    act(() => { result.current.endSampling() })
    expect(result.current.lastSampling).not.toBeNull()

    act(() => result.current.startSampling())
    expect(result.current.lastSampling).toBeNull()
  })
})

describe('useVmMetrics — cycle de vie', () => {
  it('arrête de sonder après démontage', async () => {
    mockOk({ llm: agentPayload(10, 60), mcp: agentPayload(5, 22) })
    const { result, unmount } = renderHook(() => useVmMetrics())
    await waitFor(() => expect(result.current.online.llm).toBe(true))

    const callsBefore = globalThis.fetch.mock.calls.length
    unmount()
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(globalThis.fetch.mock.calls.length).toBe(callsBefore)
  })
})
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/hooks/useVmMetrics.test.js`
Expected: FAIL — `Failed to resolve import "./useVmMetrics"`.

- [ ] **Step 4: Écrire l'implémentation**

`src/hooks/useVmMetrics.js` :

```js
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
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/hooks/useVmMetrics.test.js`
Expected: PASS — `8 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/api/vmMetrics.js src/hooks/useVmMetrics.js src/hooks/useVmMetrics.test.js
git commit -m "feat: add useVmMetrics hook with 1Hz polling, sliding buffer and CPU sampling"
```

---

## Task 5: `orbitChart.js` — moteur de dessin pur

Le code de dessin d'Antoine, extrait de `monitor.html`, débarrassé de ses accès aux variables globales (`buf`, `carot`, `now()`, `CFG`). Tout entre par les paramètres : c'est ce qui le rend testable avec un contexte espion, sans canvas réel.

**Files:**
- Create: `src/components/infra/orbitChart.js`
- Test: `src/components/infra/orbitChart.test.js`

**Interfaces:**
- Consumes: rien
- Produces:
  - `CHART_COLORS = { cpu, mem, sampling, grid, label }`
  - `drawChart(ctx, { buffer, sampling, now, width, height, windowS }) -> void`
    - `ctx` : un `CanvasRenderingContext2D` (ou tout objet exposant la même surface)
    - `sampling` : `null` ou `{ start, end }` — `end` à `null` signifie « en cours », la bande s'étend jusqu'à `now`

- [ ] **Step 1: Écrire les tests qui échouent**

`src/components/infra/orbitChart.test.js` :

```js
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
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/components/infra/orbitChart.test.js`
Expected: FAIL — `Failed to resolve import "./orbitChart"`.

- [ ] **Step 3: Écrire l'implémentation**

`src/components/infra/orbitChart.js` :

```js
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
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/components/infra/orbitChart.test.js`
Expected: PASS — `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/components/infra/orbitChart.js src/components/infra/orbitChart.test.js
git commit -m "feat: port Antoine's canvas chart engine as a pure, testable module"
```

---

## Task 6: `VmChart`, `VmCard`, `InfraTab`

**Files:**
- Create: `src/components/infra/VmChart.jsx`
- Create: `src/components/infra/VmCard.jsx`
- Create: `src/components/infra/InfraTab.jsx`
- Test: `src/components/infra/VmCard.test.jsx`
- Test: `src/components/infra/InfraTab.test.jsx`

**Interfaces:**
- Consumes: `drawChart` (Task 5) ; `WINDOW_S`, `VMS` (Task 4) ; `cpuIncreasePct` (Task 2) ; `VM_PROFILES` (Task 3)
- Produces:
  - `<VmChart vm buffersRef samplingRef />`
  - `<VmCard vm sample online buffersRef samplingRef />`
  - `<InfraTab latest online lastSampling buffersRef samplingRef />`
  - `VM_META = { llm: { name, role, ip, accent }, mcp: {...} }` exporté depuis `VmCard.jsx`

- [ ] **Step 1: Écrire les tests qui échouent**

`src/components/infra/VmCard.test.jsx` :

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import VmCard, { VM_META } from './VmCard'

const refs = {
  buffersRef: { current: { llm: { cpu: [], mem: [], rx: [], tx: [], cores: [] } } },
  samplingRef: { current: null },
}

const sample = {
  t: 1000, cpu: 42.4, mem: 61.6, memUsed: 0, memTotal: 0,
  rx: 2048, tx: 1048576, load: 1.53, cores: [40, 45, 38, 47],
}

describe('VmCard', () => {
  it('affiche le nom, le rôle et l\'IP de la VM', () => {
    render(<VmCard vm="llm" sample={sample} online {...refs} />)
    expect(screen.getByText(/LLM-TEST01/)).toBeInTheDocument()
    expect(screen.getByText(VM_META.llm.ip)).toBeInTheDocument()
  })

  it('affiche les lectures arrondies et le réseau formaté', () => {
    render(<VmCard vm="llm" sample={sample} online {...refs} />)
    expect(screen.getByTestId('reading-cpu')).toHaveTextContent('42 %')
    expect(screen.getByTestId('reading-mem')).toHaveTextContent('62 %')
    expect(screen.getByTestId('reading-load')).toHaveTextContent('1.53')
    expect(screen.getByTestId('reading-net')).toHaveTextContent('2.0 Ko/s')
    expect(screen.getByTestId('reading-net')).toHaveTextContent('1.0 Mo/s')
  })

  it('rend une barre par cœur', () => {
    render(<VmCard vm="llm" sample={sample} online {...refs} />)
    expect(screen.getAllByTestId('core-bar')).toHaveLength(4)
  })

  it('affiche des tirets tant qu\'aucun échantillon n\'est arrivé', () => {
    render(<VmCard vm="llm" sample={null} online={false} {...refs} />)
    expect(screen.getByTestId('reading-cpu')).toHaveTextContent('–')
  })

  it('reflète l\'état hors ligne sur la pastille', () => {
    const { rerender } = render(<VmCard vm="llm" sample={sample} online {...refs} />)
    expect(screen.getByTestId('vm-dot')).toHaveClass('dot-on')
    rerender(<VmCard vm="llm" sample={sample} online={false} {...refs} />)
    expect(screen.getByTestId('vm-dot')).toHaveClass('dot-off')
  })
})
```

`src/components/infra/InfraTab.test.jsx` :

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import InfraTab from './InfraTab'

function emptyBuffer() {
  return { cpu: [], mem: [], rx: [], tx: [], cores: [] }
}

const refs = {
  buffersRef: { current: { llm: emptyBuffer(), mcp: emptyBuffer() } },
  samplingRef: { current: null },
}
const latest = {
  llm: { t: 1, cpu: 40, mem: 60, rx: 0, tx: 0, load: 1, cores: [40, 40, 40, 40] },
  mcp: { t: 1, cpu: 5, mem: 24, rx: 0, tx: 0, load: 0.1, cores: [5, 5] },
}

describe('InfraTab', () => {
  it('rend une carte par VM', () => {
    render(<InfraTab latest={latest} online={{ llm: true, mcp: true }} lastSampling={null} {...refs} />)
    expect(screen.getByText(/LLM-TEST01/)).toBeInTheDocument()
    expect(screen.getByText(/MCP-TEST01/)).toBeInTheDocument()
  })

  it('invite à envoyer un prompt tant qu\'aucun carottage n\'a eu lieu', () => {
    render(<InfraTab latest={latest} online={{ llm: true, mcp: true }} lastSampling={null} {...refs} />)
    expect(screen.getByTestId('sampling-summary')).toHaveTextContent(/prompt/i)
  })

  it('résume le dernier carottage avec la hausse relative de CPU', () => {
    const lastSampling = {
      window_s: 12.4,
      vms: {
        llm: { cpu_avg: 80, cpu_peak: 94, cpu_base: 10, mem_avg: 71, cores: 4, cpu_seconds: 12.4 },
        mcp: { cpu_avg: 22, cpu_peak: 31, cpu_base: 4, mem_avg: 24, cores: 2, cpu_seconds: 1.1 },
      },
    }
    render(<InfraTab latest={latest} online={{ llm: true, mcp: true }} lastSampling={lastSampling} {...refs} />)
    const summary = screen.getByTestId('sampling-summary')
    expect(summary).toHaveTextContent('12.4 s')
    expect(summary).toHaveTextContent('+700%')
    expect(summary).toHaveTextContent('12.4 CPU·s')
  })

  it('affiche la valeur absolue quand la baseline est trop basse pour un ratio', () => {
    const lastSampling = {
      window_s: 3,
      vms: {
        llm: { cpu_avg: 60, cpu_peak: 70, cpu_base: 0.1, mem_avg: 60, cores: 4, cpu_seconds: 7.2 },
        mcp: { cpu_avg: 2, cpu_peak: 3, cpu_base: 0.1, mem_avg: 22, cores: 2, cpu_seconds: 0.1 },
      },
    }
    render(<InfraTab latest={latest} online={{ llm: true, mcp: true }} lastSampling={lastSampling} {...refs} />)
    expect(screen.getByTestId('sampling-summary')).toHaveTextContent('baseline trop basse')
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/components/infra/`
Expected: FAIL — `Failed to resolve import "./VmCard"`.

- [ ] **Step 3: Écrire `VmChart.jsx`**

```jsx
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
```

- [ ] **Step 4: Écrire `VmCard.jsx`**

```jsx
import VmChart from './VmChart'

export const VM_META = {
  llm: { name: 'LLM-TEST01', role: 'Ollama', ip: '172.18.53.7', accent: 'var(--accent-2)' },
  mcp: { name: 'MCP-TEST01', role: 'FastMCP', ip: '172.18.53.9', accent: 'var(--accent)' },
}

function formatBps(bps) {
  if (bps >= 1048576) return `${(bps / 1048576).toFixed(1)} Mo/s`
  if (bps >= 1024) return `${(bps / 1024).toFixed(1)} Ko/s`
  return `${Math.round(bps)} o/s`
}

function Reading({ id, label, children }) {
  return (
    <div className="vm-reading">
      <div className="vm-reading-label">{label}</div>
      <div className="vm-reading-value" data-testid={`reading-${id}`}>{children}</div>
    </div>
  )
}

function VmCard({ vm, sample, online, buffersRef, samplingRef }) {
  const meta = VM_META[vm]

  return (
    <article className="vm-card">
      <header className="vm-card-head">
        <span className="vm-card-name" style={{ color: meta.accent }}>
          <span className={`dot ${online ? 'dot-on' : 'dot-off'}`} data-testid="vm-dot" />
          {meta.name} · {meta.role}
        </span>
        <span className="vm-card-ip">{meta.ip}</span>
      </header>

      <VmChart vm={vm} buffersRef={buffersRef} samplingRef={samplingRef} />

      <div className="vm-legend">
        <span><i className="swatch" style={{ background: 'var(--accent-2)' }} />CPU %</span>
        <span><i className="swatch" style={{ background: 'var(--accent)' }} />RAM %</span>
        <span style={{ color: 'var(--accent-3)' }}>▮ fenêtre requête / réponse</span>
      </div>

      <div className="vm-readings">
        <Reading id="cpu" label="CPU">{sample ? `${sample.cpu.toFixed(0)} %` : '–'}</Reading>
        <Reading id="mem" label="RAM">{sample ? `${sample.mem.toFixed(0)} %` : '–'}</Reading>
        <Reading id="net" label="Réseau ↓/↑">
          {sample ? `↓${formatBps(sample.rx)} ↑${formatBps(sample.tx)}` : '–'}
        </Reading>
        <Reading id="load" label="Load 1m">{sample ? sample.load.toFixed(2) : '–'}</Reading>
      </div>

      <div className="vm-cores">
        {(sample?.cores ?? []).map((usage, index) => (
          // eslint-disable-next-line react/no-array-index-key -- les cœurs n'ont pas d'identité stable hors de leur rang
          <span className="vm-core" key={index} data-testid="core-bar">
            <i style={{ height: `${Math.max(3, usage)}%` }} />
          </span>
        ))}
      </div>
    </article>
  )
}

export default VmCard
```

- [ ] **Step 5: Écrire `InfraTab.jsx`**

```jsx
import { cpuIncreasePct } from '../../lib/sampling'
import { VMS } from '../../hooks/useVmMetrics'
import VmCard, { VM_META } from './VmCard'

function SamplingLine({ vm, stats }) {
  const increase = cpuIncreasePct(stats.cpu_avg, stats.cpu_base)
  return (
    <li>
      <b>{VM_META[vm].name}</b> — CPU moy. {stats.cpu_avg.toFixed(0)}% (pic {stats.cpu_peak.toFixed(0)}%),{' '}
      {increase === null
        ? `baseline trop basse pour un ratio (${stats.cpu_base.toFixed(1)}%)`
        : `soit ${increase >= 0 ? '+' : ''}${increase.toFixed(0)}% vs base ${stats.cpu_base.toFixed(1)}%`}
      {' · '}RAM {stats.mem_avg.toFixed(0)}% · <b>{stats.cpu_seconds.toFixed(1)} CPU·s</b>
    </li>
  )
}

function InfraTab({ latest, online, lastSampling, buffersRef, samplingRef }) {
  return (
    <div className="infra-tab">
      <div className="vm-grid">
        {VMS.map((vm) => (
          <VmCard
            key={vm}
            vm={vm}
            sample={latest[vm]}
            online={online[vm]}
            buffersRef={buffersRef}
            samplingRef={samplingRef}
          />
        ))}
      </div>

      <section className="sampling-summary" data-testid="sampling-summary">
        <h3>Dernier carottage</h3>
        {lastSampling ? (
          <>
            <p className="sampling-window">Fenêtre mesurée : {lastSampling.window_s.toFixed(1)} s</p>
            <ul>
              {VMS.map((vm) => (
                <SamplingLine key={vm} vm={vm} stats={lastSampling.vms[vm]} />
              ))}
            </ul>
          </>
        ) : (
          <p className="panel-empty">
            Envoie un prompt : la fenêtre requête → réponse s'allume sur les courbes et la
            consommation réelle est mesurée ici.
          </p>
        )}
      </section>
    </div>
  )
}

export default InfraTab
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/components/infra/`
Expected: PASS — `17 passed` (8 de `orbitChart` + 5 de `VmCard` + 4 de `InfraTab`).

Si les tests `VmCard` échouent sur `canvas.getContext is not a function` : jsdom ne fournit pas de contexte 2D. `VmChart` gère déjà ce cas (`if (ctx)`), mais si l'erreur persiste, vérifier que la garde est bien présente — ne **pas** installer le paquet `canvas`, il est inutile ici.

- [ ] **Step 7: Commit**

```bash
git add src/components/infra/
git commit -m "feat: add Infra tab with live VM charts, per-core bars and sampling recap"
```

---

## Task 7: `Tabs.jsx` — la coquille à onglets

**Files:**
- Create: `src/components/Tabs.jsx`
- Test: `src/components/Tabs.test.jsx`

**Interfaces:**
- Consumes: rien
- Produces: `<Tabs tabs={[{ id, label, content }]} active onChange />` — `onChange(id)` est appelé au clic. Les onglets ne connaissent pas leur conteneur : `content` est un nœud React déjà construit par l'appelant.

- [ ] **Step 1: Écrire les tests qui échouent**

`src/components/Tabs.test.jsx` :

```jsx
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
```

Ce test utilise `@testing-library/user-event`, à installer :

```bash
npm install -D @testing-library/user-event
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/components/Tabs.test.jsx`
Expected: FAIL — `Failed to resolve import "./Tabs"`.

- [ ] **Step 3: Écrire l'implémentation**

`src/components/Tabs.jsx` :

```jsx
// Coquille à onglets. Elle ne connaît que des libellés et des nœuds déjà
// construits : un onglet ignore totalement qu'il vit dans un onglet, ce qui
// permet de le tester et de le déplacer sans toucher à ce fichier.
function Tabs({ tabs, active, onChange }) {
  const current = tabs.find((tab) => tab.id === active)

  return (
    <div className="tabs">
      <div className="tab-bar" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            className={`tab${tab.id === active ? ' tab-active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel">
        {current?.content ?? null}
      </div>
    </div>
  )
}

export default Tabs
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/components/Tabs.test.jsx`
Expected: PASS — `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/Tabs.jsx src/components/Tabs.test.jsx
git commit -m "feat: add accessible tab shell component"
```

---

## Task 8: Réorganisation des panneaux existants + `UsageTab` + `LogsTab`

Déplacement pur, sans changement de comportement. Les panneaux d'Ayoub sont regroupés sous `usage/` et enveloppés dans un `UsageTab`. L'onglet Logs reçoit un placeholder honnête, qui annonce l'étape 3.

**Files:**
- Move: `src/components/SummaryBar.jsx` → `src/components/usage/SummaryBar.jsx`
- Move: `src/components/TokensPanel.jsx` → `src/components/usage/TokensPanel.jsx`
- Move: `src/components/LatencyPanel.jsx` → `src/components/usage/LatencyPanel.jsx`
- Move: `src/components/CostPanel.jsx` → `src/components/usage/CostPanel.jsx`
- Move: `src/components/HardwarePanel.jsx` → `src/components/usage/HardwarePanel.jsx`
- Create: `src/components/usage/UsageTab.jsx`
- Create: `src/components/logs/LogsTab.jsx`
- Test: `src/components/usage/UsageTab.test.jsx`

**Interfaces:**
- Consumes: le snapshot `/api/metrics` déjà consommé par `App.jsx`
- Produces: `<UsageTab data={metrics} />`, `<LogsTab />`

- [ ] **Step 1: Déplacer les panneaux**

```bash
mkdir -p src/components/usage src/components/logs
git mv src/components/SummaryBar.jsx src/components/usage/SummaryBar.jsx
git mv src/components/TokensPanel.jsx src/components/usage/TokensPanel.jsx
git mv src/components/LatencyPanel.jsx src/components/usage/LatencyPanel.jsx
git mv src/components/CostPanel.jsx src/components/usage/CostPanel.jsx
git mv src/components/HardwarePanel.jsx src/components/usage/HardwarePanel.jsx
```

Aucun de ces fichiers n'importe un module local : les chemins relatifs internes n'ont pas besoin d'être corrigés. Le vérifier avant de continuer :

Run: `grep -rn "from '\.\./" src/components/usage/`
Expected: aucune sortie.

- [ ] **Step 2: Écrire le test qui échoue**

`src/components/usage/UsageTab.test.jsx` :

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import UsageTab from './UsageTab'

const metrics = {
  timestamp: '2026-07-23T12:00:00.000Z',
  hardware: { gpu: [], cpu_pct: 30, ram_used_mb: 9000, ram_total_mb: 32000 },
  network: { latency_ms: 1200, throughput_rps: 6.2 },
  llm: { latency_ms: 900, overhead_ms: 300, calls_last_turn: 2, calls_total: 5 },
  tokens: { prompt: 120, completion: 80, total: 640 },
  cost: { per_request_usd: 0.001, total_usd: 0.0042, currency: 'USD' },
  series: { latency_ms: [['2026-07-23T12:00:00.000Z', 1200]], cost_per_request_usd: [['2026-07-23T12:00:00.000Z', 0.001]] },
}

describe('UsageTab', () => {
  it('rend les panneaux latence, tokens et coût', () => {
    render(<UsageTab data={metrics} />)
    expect(screen.getByRole('region', { name: 'Network latency' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Token usage' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Cost per request' })).toBeInTheDocument()
  })

  it('rend le bandeau de synthèse des coûts', () => {
    render(<UsageTab data={metrics} />)
    expect(screen.getByRole('region', { name: 'Cost summary' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- src/components/usage/UsageTab.test.jsx`
Expected: FAIL — `Failed to resolve import "./UsageTab"`.

- [ ] **Step 4: Écrire `UsageTab.jsx`**

```jsx
import SummaryBar from './SummaryBar'
// Les métriques matérielles sont mockées (aucune mesure réelle) — panneau
// désactivé jusqu'à ce qu'on sache mesurer la consommation réelle. Ne pas
// supprimer HardwarePanel.jsx : réactiver cet import quand les vraies données
// arriveront. L'onglet Infra couvre déjà le CPU/RAM des VM, lui pour de vrai.
// import HardwarePanel from './HardwarePanel'
import LatencyPanel from './LatencyPanel'
import TokensPanel from './TokensPanel'
import CostPanel from './CostPanel'

// Onglet « Usage » — les métriques côté LLM (tokens, latence, coût), par
// opposition à l'onglet « Infra » qui montre les ressources des VM.
// À l'étape 2, ces panneaux liront la session courante plutôt que l'état
// global du backend.
function UsageTab({ data }) {
  return (
    <div className="usage-tab">
      <SummaryBar data={data} />
      <div className="panels">
        {/* <HardwarePanel data={data} /> — désactivé, données mockées */}
        <LatencyPanel data={data} />
        <TokensPanel data={data} />
        <CostPanel data={data} />
      </div>
    </div>
  )
}

export default UsageTab
```

- [ ] **Step 5: Écrire `LogsTab.jsx`**

```jsx
// Onglet « Logs » — placeholder. L'implémentation arrive à l'étape 3, avec
// la persistance JSONL côté backend (voir spec §5.1 et §7, étape 3).
function LogsTab() {
  return (
    <div className="logs-tab">
      <section className="panel" aria-label="Session history">
        <h2>Historique des sessions</h2>
        <p className="panel-empty">
          L'historique de tous les prompts et de leurs métriques, conservé d'une session à
          l'autre, arrive à l'étape 3 : il demande la persistance JSONL côté backend.
        </p>
      </section>
    </div>
  )
}

export default LogsTab
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/components/usage/UsageTab.test.jsx`
Expected: PASS — `2 passed`.

À ce stade `src/App.jsx` importe encore les panneaux depuis leur ancien chemin et le build est cassé. C'est attendu : la Task 10 recâble `App.jsx`. Ne pas lancer `npm run build` ici.

- [ ] **Step 7: Commit**

```bash
git add src/components/usage/ src/components/logs/
git commit -m "refactor: group usage panels under usage/, add UsageTab and LogsTab placeholder"
```

---

## Task 9: `ChatPanel` — sélecteur de cible, carottage, métriques repliables

**Files:**
- Create: `src/api/providers.js`
- Modify: `src/api/chat.js`
- Modify: `src/components/ChatPanel.jsx`
- Test: `src/components/ChatPanel.test.jsx`

**Interfaces:**
- Consumes: `startSampling`, `endSampling` (Task 4)
- Produces:
  - `fetchProviders() -> Promise<Array<{ id, label, metrics, target, available }>>`
  - `sendChatMessage(message, { history, provider }) -> Promise<{ reply, turnMetrics }>`
  - `<ChatPanel onMessageSent startSampling endSampling />`
  - Clé `localStorage` : `orbit_provider`

- [ ] **Step 1: Écrire le client providers**

`src/api/providers.js` :

```js
// Liste des cibles LLM proposées dans le sélecteur du chat.
// Le backend renvoie un item par modèle Ollama installé, plus les cibles API
// (Claude, Lambda) avec leur disponibilité — voir nasa-back/providers.js.

export async function fetchProviders() {
  const response = await fetch('/api/providers', { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to fetch providers: ${response.status}`)
  }
  const data = await response.json()
  return data.providers ?? []
}
```

- [ ] **Step 2: Mettre à jour `src/api/chat.js`**

```js
// Envoie un message au backend et renvoie la réponse accompagnée des
// statistiques du tour (tokens / latences / coût).
//
// `provider` est l'identifiant de cible choisi dans le sélecteur (par ex.
// « ollama:qwen2.5:3b-instruct »). Omis, le backend retombe sur sa cible par défaut.

export async function sendChatMessage(message, { history = [], provider } = {}) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(provider ? { message, history, provider } : { message, history }),
  })
  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.status}`)
  }
  return response.json()
}
```

- [ ] **Step 3: Écrire les tests qui échouent**

`src/components/ChatPanel.test.jsx` :

```jsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatPanel from './ChatPanel'

const PROVIDERS = [
  { id: 'ollama:qwen2.5:3b', label: 'Local · qwen2.5:3b', metrics: 'infra', target: 'llm', available: true },
  { id: 'ollama:mistral:7b', label: 'Local · mistral:7b', metrics: 'infra', target: 'llm', available: true },
  { id: 'claude', label: 'Claude (clé API manquante)', metrics: 'tokens', target: 'api', available: false },
]

const TURN = {
  reply: 'Il y a 7 fichiers.',
  turnMetrics: {
    prompt_tokens: 120, completion_tokens: 40, total_tokens: 160,
    latency_ms: 2400, llm_latency_ms: 2100, overhead_ms: 300,
    load_ms: 100, prompt_eval_ms: 900, gen_ms: 1100,
    llm_calls: 2, cost_usd: 0.0008,
  },
}

function mockFetch() {
  globalThis.fetch = vi.fn(async (url) => {
    if (String(url).includes('/api/providers')) {
      return { ok: true, json: async () => ({ providers: PROVIDERS }) }
    }
    return { ok: true, json: async () => TURN }
  })
}

beforeEach(() => {
  mockFetch()
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const noop = () => {}

describe('ChatPanel — sélecteur de cible', () => {
  it('remplit le sélecteur depuis /api/providers', async () => {
    render(<ChatPanel onMessageSent={noop} startSampling={noop} endSampling={noop} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    expect(screen.getByRole('option', { name: 'Local · qwen2.5:3b' })).toBeInTheDocument()
  })

  it('désactive les cibles indisponibles', async () => {
    render(<ChatPanel onMessageSent={noop} startSampling={noop} endSampling={noop} />)
    await waitFor(() => expect(screen.getByRole('option', { name: /Claude/ })).toBeDisabled())
  })

  it('sélectionne la première cible disponible par défaut', async () => {
    render(<ChatPanel onMessageSent={noop} startSampling={noop} endSampling={noop} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('ollama:qwen2.5:3b'))
  })

  it('restaure la cible mémorisée dans localStorage', async () => {
    // Volontairement la DEUXIÈME cible disponible : si le composant retombait
    // bêtement sur la première, ce test le détecterait.
    window.localStorage.setItem('orbit_provider', 'ollama:mistral:7b')
    render(<ChatPanel onMessageSent={noop} startSampling={noop} endSampling={noop} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('ollama:mistral:7b'))
  })

  it('ignore une cible mémorisée devenue indisponible', async () => {
    window.localStorage.setItem('orbit_provider', 'claude')
    render(<ChatPanel onMessageSent={noop} startSampling={noop} endSampling={noop} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('ollama:qwen2.5:3b'))
  })
})

describe('ChatPanel — envoi', () => {
  it('encadre la requête par startSampling et endSampling', async () => {
    const startSampling = vi.fn()
    const endSampling = vi.fn()
    render(<ChatPanel onMessageSent={noop} startSampling={startSampling} endSampling={endSampling} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())

    await userEvent.type(screen.getByRole('textbox'), 'combien de fichiers ?')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(endSampling).toHaveBeenCalled())
    expect(startSampling).toHaveBeenCalledTimes(1)
  })

  it('envoie la cible choisie au backend', async () => {
    render(<ChatPanel onMessageSent={noop} startSampling={noop} endSampling={noop} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())

    await userEvent.type(screen.getByRole('textbox'), 'salut')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(screen.getByText('Il y a 7 fichiers.')).toBeInTheDocument())
    const chatCall = globalThis.fetch.mock.calls.find(([url]) => String(url).includes('/api/chat'))
    expect(JSON.parse(chatCall[1].body).provider).toBe('ollama:qwen2.5:3b')
  })

  it('appelle endSampling même quand la requête échoue', async () => {
    const endSampling = vi.fn()
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('/api/providers')) {
        return { ok: true, json: async () => ({ providers: PROVIDERS }) }
      }
      throw new Error('backend down')
    })
    render(<ChatPanel onMessageSent={noop} startSampling={noop} endSampling={endSampling} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())

    await userEvent.type(screen.getByRole('textbox'), 'salut')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(endSampling).toHaveBeenCalled())
  })
})

describe('ChatPanel — métriques repliables', () => {
  it('replie les métriques par défaut et les déplie au clic', async () => {
    render(<ChatPanel onMessageSent={noop} startSampling={noop} endSampling={noop} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())

    await userEvent.type(screen.getByRole('textbox'), 'salut')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByText('Il y a 7 fichiers.')).toBeInTheDocument())

    expect(screen.queryByText(/Génération/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByText(/métriques/))
    expect(screen.getByText(/Génération/)).toBeInTheDocument()
    expect(screen.getByText(/160 tokens/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/components/ChatPanel.test.jsx`
Expected: FAIL — `Unable to find role "combobox"`.

- [ ] **Step 5: Réécrire `src/components/ChatPanel.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { sendChatMessage } from '../api/chat'
import { fetchProviders } from '../api/providers'

const PROVIDER_STORAGE_KEY = 'orbit_provider'

function formatCost(usd) {
  return usd < 0.01 ? `$${usd.toFixed(6)}` : `$${usd.toFixed(2)}`
}

function seconds(ms) {
  return `${((ms ?? 0) / 1000).toFixed(1)} s`
}

// Détail replié sous chaque réponse : la décomposition qu'Antoine a débloquée
// côté Ollama (chargement / évaluation du prompt / génération) plus l'overhead
// MCP + backend. Replié par défaut pour ne pas noyer la conversation.
function TurnMetrics({ metrics }) {
  const [open, setOpen] = useState(false)
  const throughput = metrics.completion_tokens && metrics.gen_ms
    ? `${(metrics.completion_tokens / (metrics.gen_ms / 1000)).toFixed(1)} tok/s`
    : '–'

  return (
    <div className="turn-metrics">
      <button type="button" className="turn-metrics-toggle" onClick={() => setOpen((value) => !value)}>
        {open ? '⌄' : '›'} métriques · {metrics.total_tokens} tokens · {seconds(metrics.latency_ms)} ·{' '}
        {formatCost(metrics.cost_usd)}
      </button>
      {open && (
        <dl className="turn-metrics-detail">
          <div><dt>Prompt / complétion</dt><dd>{metrics.prompt_tokens} / {metrics.completion_tokens}</dd></div>
          <div><dt>Chargement</dt><dd>{seconds(metrics.load_ms)}</dd></div>
          <div><dt>Évaluation du prompt</dt><dd>{seconds(metrics.prompt_eval_ms)}</dd></div>
          <div><dt>Génération</dt><dd>{seconds(metrics.gen_ms)}</dd></div>
          <div><dt>Overhead MCP + backend</dt><dd>{seconds(metrics.overhead_ms)}</dd></div>
          <div><dt>Appels LLM</dt><dd>{metrics.llm_calls}</dd></div>
          <div><dt>Débit</dt><dd>{throughput}</dd></div>
        </dl>
      )}
    </div>
  )
}

// Envoie les messages à /api/chat et encadre chaque requête par le carottage :
// startSampling() juste avant l'appel, endSampling() dès la réponse (ou l'échec),
// pour que la fenêtre mesurée corresponde exactement à la requête.
function ChatPanel({ onMessageSent, startSampling, endSampling }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [providers, setProviders] = useState([])
  const [provider, setProvider] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchProviders()
      .then((list) => {
        if (cancelled) return
        setProviders(list)
        const saved = window.localStorage.getItem(PROVIDER_STORAGE_KEY)
        const isUsable = (id) => list.some((item) => item.id === id && item.available)
        setProvider(isUsable(saved) ? saved : (list.find((item) => item.available)?.id ?? ''))
      })
      .catch(() => {
        if (!cancelled) setProviders([])
      })
    return () => { cancelled = true }
  }, [])

  function handleProviderChange(event) {
    setProvider(event.target.value)
    window.localStorage.setItem(PROVIDER_STORAGE_KEY, event.target.value)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const text = input.trim()
    if (!text || sending) return

    const history = messages.map(({ role, content }) => ({ role, content }))
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setSending(true)
    setError(null)
    startSampling()

    try {
      const { reply, turnMetrics } = await sendChatMessage(text, { history, provider })
      setMessages((prev) => [...prev, { role: 'assistant', content: reply, turnMetrics }])
      onMessageSent?.()
    } catch (err) {
      setError(err.message)
    } finally {
      // Toujours refermer la fenêtre de carottage, même en échec : sinon la
      // bande ambrée resterait ouverte indéfiniment sur les courbes.
      endSampling()
      setSending(false)
    }
  }

  return (
    <section className="chat-panel" aria-label="Chat">
      <h2>Chat</h2>
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-empty">
            Envoie un message : la fenêtre requête → réponse s'allume sur les courbes de
            l'onglet Infra et les métriques du tour apparaissent sous la réponse.
          </p>
        )}
        {messages.map((message, index) => (
          // eslint-disable-next-line react/no-array-index-key -- les messages sont append-only, l'index est stable
          <div key={index} className={`chat-bubble chat-bubble-${message.role}`}>
            <p>{message.content}</p>
            {message.turnMetrics && <TurnMetrics metrics={message.turnMetrics} />}
          </div>
        ))}
        {sending && <div className="chat-bubble chat-bubble-assistant chat-pending">…</div>}
      </div>

      {error && <p className="status status-error">{error}</p>}

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <select
          className="chat-provider"
          aria-label="Cible LLM"
          value={provider}
          onChange={handleProviderChange}
        >
          {providers.length === 0 && <option value="">(cibles indisponibles)</option>}
          {providers.map((item) => (
            <option key={item.id} value={item.id} disabled={!item.available}>
              {item.label}
            </option>
          ))}
        </select>
        <input
          className="chat-input"
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask something..."
          disabled={sending}
        />
        <button type="submit" disabled={sending || !input.trim()}>Send</button>
      </form>
    </section>
  )
}

export default ChatPanel
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/components/ChatPanel.test.jsx`
Expected: PASS — `9 passed`.

- [ ] **Step 7: Commit**

```bash
git add src/api/providers.js src/api/chat.js src/components/ChatPanel.jsx src/components/ChatPanel.test.jsx
git commit -m "feat: add LLM target picker, sampling hooks and collapsible turn metrics to chat"
```

---

## Task 10: Câblage `App.jsx` + styles

Dernière tâche : le layout deux colonnes, le montage du hook au-dessus des onglets, et les styles. C'est ici que le build redevient vert.

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.css`
- Modify: `src/index.css`
- Test: `src/App.test.jsx`

**Interfaces:**
- Consumes: tout ce qui précède
- Produces: l'application complète de l'étape 1

- [ ] **Step 1: Ajouter la couleur de carottage**

Dans `src/index.css`, à l'intérieur du bloc `:root`, après la ligne `--accent-2: #23e6d1;` :

```css
  --accent-3: #ffb63d;
```

- [ ] **Step 2: Écrire le test qui échoue**

`src/App.test.jsx` :

```jsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

const METRICS = {
  timestamp: '2026-07-23T12:00:00.000Z',
  hardware: { gpu: [], cpu_pct: 30, ram_used_mb: 9000, ram_total_mb: 32000 },
  network: { latency_ms: 0, throughput_rps: 6.2 },
  llm: { latency_ms: 0, overhead_ms: 0, calls_last_turn: 0, calls_total: 0 },
  tokens: { prompt: 0, completion: 0, total: 0 },
  cost: { per_request_usd: 0, total_usd: 0, currency: 'USD' },
  series: { latency_ms: [], cost_per_request_usd: [] },
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async (url) => {
    const target = String(url)
    if (target.includes('/api/vm-metrics')) return { ok: true, json: async () => ({}) }
    if (target.includes('/api/providers')) return { ok: true, json: async () => ({ providers: [] }) }
    if (target.includes('/api/metrics')) return { ok: true, json: async () => METRICS }
    return { ok: true, json: async () => ({}) }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it('affiche le chat et les trois onglets', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('region', { name: 'Chat' })).toBeInTheDocument())
    expect(screen.getByRole('tab', { name: 'Infra' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Usage' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Logs' })).toBeInTheDocument()
  })

  it('ouvre sur l\'onglet Infra', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText(/LLM-TEST01/)).toBeInTheDocument())
    expect(screen.getByRole('tab', { name: 'Infra' })).toHaveAttribute('aria-selected', 'true')
  })

  it('bascule sur Usage sans démonter le chat', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText(/LLM-TEST01/)).toBeInTheDocument())

    await userEvent.click(screen.getByRole('tab', { name: 'Usage' }))
    // waitFor : /api/metrics peut ne pas encore avoir résolu au moment du clic,
    // auquel cas l'onglet affiche « Loading metrics… » une frame.
    await waitFor(() => expect(screen.getByRole('region', { name: 'Token usage' })).toBeInTheDocument())
    expect(screen.queryByText(/LLM-TEST01/)).not.toBeInTheDocument()
    // le chat reste monté quel que soit l'onglet
    expect(screen.getByRole('region', { name: 'Chat' })).toBeInTheDocument()
  })

  it('bascule sur Logs et y affiche le placeholder d\'étape 3', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText(/LLM-TEST01/)).toBeInTheDocument())

    await userEvent.click(screen.getByRole('tab', { name: 'Logs' }))
    expect(screen.getByRole('region', { name: 'Session history' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Chat' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- src/App.test.jsx`
Expected: FAIL — `Unable to find an accessible element with the role "tab"`.

- [ ] **Step 4: Réécrire `src/App.jsx`**

```jsx
import { useCallback, useEffect, useState } from 'react'
import { fetchMetrics } from './api/metrics'
import { useVmMetrics } from './hooks/useVmMetrics'
import Tabs from './components/Tabs'
import ChatPanel from './components/ChatPanel'
import InfraTab from './components/infra/InfraTab'
import UsageTab from './components/usage/UsageTab'
import LogsTab from './components/logs/LogsTab'
import './App.css'

const POLL_INTERVAL_MS = 12000

function App() {
  const [metrics, setMetrics] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('infra')

  // Monté ICI, au-dessus des onglets : le tampon de métriques doit survivre
  // aux changements d'onglet, sinon un prompt envoyé depuis Usage ou Logs
  // produirait un carottage sans baseline. Voir hooks/useVmMetrics.js.
  const vm = useVmMetrics()

  const refreshMetrics = useCallback(() => {
    fetchMetrics()
      .then((data) => {
        setMetrics(data)
        setError(null)
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    refreshMetrics()
    const interval = setInterval(refreshMetrics, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refreshMetrics])

  const tabs = [
    {
      id: 'infra',
      label: 'Infra',
      content: (
        <InfraTab
          latest={vm.latest}
          online={vm.online}
          lastSampling={vm.lastSampling}
          buffersRef={vm.buffersRef}
          samplingRef={vm.samplingRef}
        />
      ),
    },
    {
      id: 'usage',
      label: 'Usage',
      content: metrics ? <UsageTab data={metrics} /> : <p className="status">Loading metrics…</p>,
    },
    { id: 'logs', label: 'Logs', content: <LogsTab /> },
  ]

  return (
    <div className="app">
      <header className="app-header">
        <h1>Orbit Dashboard</h1>
        <p className="subtitle">LLM usage at a glance</p>
      </header>

      {error && <p className="status status-error">Could not load metrics: {error}</p>}

      <div className="layout">
        <ChatPanel
          onMessageSent={refreshMetrics}
          startSampling={vm.startSampling}
          endSampling={vm.endSampling}
        />
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>
    </div>
  )
}

export default App
```

- [ ] **Step 5: Étendre `src/App.css`**

Ajouter à la fin du fichier, sans toucher aux règles existantes :

```css
/* ---- Layout deux colonnes : chat fixe à gauche, onglets à droite ---- */
.app {
  max-width: 1500px;
}

.layout {
  display: grid;
  grid-template-columns: minmax(320px, 420px) 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 1000px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

/* ---- Onglets ---- */
.tab-bar {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
}

.tab {
  font-family: var(--heading);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text);
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 9px 18px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.tab:hover {
  color: var(--text-h);
}

.tab-active {
  color: var(--text-h);
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

/* ---- Cartes VM (onglet Infra) ---- */
.vm-grid {
  display: grid;
  gap: 16px;
}

.vm-card {
  background: var(--panel-bg);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow);
  padding: 16px 16px 12px;
}

.vm-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.vm-card-name {
  font-family: var(--heading);
  font-size: 15px;
  letter-spacing: 0.06em;
}

.vm-card-ip {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text);
}

.dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-right: 8px;
  vertical-align: middle;
}

.dot-on {
  background: var(--accent-2);
  box-shadow: 0 0 8px var(--accent-2);
}

.dot-off {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
}

.vm-chart {
  width: 100%;
  height: 150px;
  display: block;
}

.vm-legend {
  display: flex;
  gap: 14px;
  font-size: 11px;
  color: var(--text);
  margin-top: 6px;
}

.swatch {
  display: inline-block;
  width: 10px;
  height: 3px;
  border-radius: 2px;
  margin-right: 5px;
  vertical-align: middle;
}

.vm-readings {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 10px;
}

.vm-reading-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text);
}

.vm-reading-value {
  font-family: var(--mono);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-h);
  margin-top: 2px;
}

.vm-cores {
  display: flex;
  gap: 3px;
  margin-top: 10px;
}

.vm-core {
  flex: 1;
  min-width: 8px;
  height: 26px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
  position: relative;
  overflow: hidden;
}

.vm-core i {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: block;
  background: linear-gradient(180deg, var(--accent-2), rgba(35, 230, 209, 0.25));
}

/* ---- Récapitulatif de carottage ---- */
.sampling-summary {
  margin-top: 16px;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px 16px;
}

.sampling-summary h3 {
  font-family: var(--heading);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text);
  margin-bottom: 8px;
}

.sampling-window {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--accent-3);
  margin-bottom: 6px;
}

.sampling-summary ul {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 4px;
  font-size: 12.5px;
  line-height: 1.5;
}

.sampling-summary b {
  color: var(--text-h);
}

/* ---- Chat : sélecteur de cible et métriques repliables ---- */
.chat-provider {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-h);
  font-family: var(--sans);
  font-size: 12px;
  padding: 0 8px;
  max-width: 150px;
  cursor: pointer;
}

.turn-metrics-toggle {
  background: none;
  border: none;
  padding: 4px 0 0;
  color: var(--text);
  font-family: var(--mono);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
}

.turn-metrics-toggle:hover {
  color: var(--accent-2);
}

.turn-metrics-detail {
  margin-top: 6px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 12px;
  font-size: 11.5px;
}

.turn-metrics-detail > div {
  display: contents;
}

.turn-metrics-detail dt {
  color: var(--text);
}

.turn-metrics-detail dd {
  margin: 0;
  font-family: var(--mono);
  color: var(--text-h);
  text-align: right;
}
```

- [ ] **Step 6: Lancer toute la suite de tests**

Run: `npm test`
Expected: PASS — tous les fichiers verts, environ 60 tests.

- [ ] **Step 7: Vérifier le lint et le build**

Run: `npm run lint`
Expected: aucune erreur.

Run: `npm run build`
Expected: `built in …`, sortie dans `nasa-front/`.

⚠️ `npm run build` écrase `nasa-front/assets/`, qui est tracké depuis le commit `6ab9037` d'Antoine. Vérifier ce que le build a modifié avant de committer :

Run: `git status --short nasa-front/`

Si de nouveaux fichiers `assets/index-*.js` apparaissent, **ne pas les committer dans cette tâche** — le sort de `nasa-front/assets/` est un point ouvert du spec (§8.3) à trancher avec Antoine.

- [ ] **Step 8: Vérifier à l'œil**

```bash
npm run dev
```

Ouvrir `http://localhost:5173`. Sans backend lancé, le repli mock doit produire des courbes vivantes et deux pastilles rouges. Vérifier :
1. les trois onglets basculent, le chat reste à gauche
2. les courbes CPU/RAM défilent et les barres par cœur bougent
3. envoyer un message : la bande ambrée apparaît, s'étend, se fige à la réponse
4. le récap de carottage se remplit sous les graphes
5. `› métriques` sous la réponse se déplie

- [ ] **Step 9: Commit**

```bash
git add src/App.jsx src/App.test.jsx src/App.css src/index.css
git commit -m "feat: wire tabbed layout with fixed chat column and shared VM metrics hook"
```

---

## Definition of Done — Étape 1

- [ ] `npm test` — tous verts
- [ ] `npm run lint` — aucune erreur
- [ ] `npm run build` — succès
- [ ] Les trois onglets basculent, le chat reste monté en permanence
- [ ] Les courbes CPU/RAM défilent à 1 Hz, en réel comme en mock
- [ ] Un prompt allume la bande de carottage et remplit le récap
- [ ] `› métriques` se déplie sous chaque réponse
- [ ] Aucun fichier de `nasa-back/` modifié : `git diff --stat HEAD~10 -- nasa-back/` doit être vide
- [ ] `nasa-front/monitor.html` toujours en place et fonctionnel

## Étapes suivantes

Chacune fera l'objet de son propre plan, écrit au moment de l'attaquer :

- **Étape 2** — sessions nommées, onglet Usage abouti, `history` transmis au LLM
- **Étape 3** — `sessionLog.js`, persistance JSONL, onglet Logs
- **Étape 4** — refactor backend : `chatClient` façade + adaptateurs, meta-tool rebranché
- **Étape 5** — suppression de `monitor.html`, nettoyage, documentation
