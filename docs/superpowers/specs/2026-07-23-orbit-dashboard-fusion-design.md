# Orbit Dashboard — fusion du travail d'Antoine dans le front React

**Date** : 2026-07-23
**Auteur** : Ayoub (owner dashboard)
**Statut** : design validé, prêt pour plan d'implémentation

---

## 1. Contexte

Le `git pull` du 23/07/2026 a apporté deux commits d'Antoine (`6ab9037`, `2cae341`) puis
un rattrapage (`88237c6`). Ils ajoutent un dashboard mono-fichier `nasa-front/monitor.html`
et réécrivent le backend en orchestrateur multi-provider.

Son dashboard est excellent visuellement et introduit des idées qu'on n'avait pas
(carottage CPU, décomposition fine de la latence Ollama, sélecteur de cible LLM).
Sa mise en œuvre, en revanche, court-circuite l'architecture définie dans
`ARCHITECTURE_Orbit_synthese.md` et `CLAUDE.md`.

**Objectif de ce spec** : absorber 100 % de ses apports fonctionnels dans le front
React (`src/`), en remettant le backend en conformité, et livrer un dashboard à
trois onglets avec persistance multi-sessions.

---

## 2. Audit de l'existant

### 2.1 Ce que le pull a apporté

| Fichier | Δ | Nature |
|---|---|---|
| `nasa-front/monitor.html` | +432 | Dashboard vanilla d'Antoine |
| `nasa-front/assets/` | nouveau | Build Vite, désormais tracké (`.gitignore` modifié) |
| `nasa-back/docAnswer.js` | +165 | Routeur documentaire d'Antoine |
| `nasa-back/index.js` | −136 | Réécrit en orchestrateur multi-provider |
| `nasa-back/chatClient.js` | ~ | Ajout `load_ms` / `prompt_eval_ms` / `gen_ms` |
| `nasa-back/mcpClient.js` | −24 | `callToolJson()` supprimé |
| `nasa-back/provider{s,Ollama,Claude,Lambda}.js` | +~200 | Arrivés en `88237c6` |

### 2.2 Écarts constatés

| # | Constat | Gravité |
|---|---|---|
| 1 | `index.js` importait `providers.js` absent du dépôt → backend non démarrable | **résolu** en `88237c6` |
| 2 | `meta-tool.js` n'est plus importé nulle part — invariant CLAUDE.md hors du flux | bloquant |
| 3 | `docAnswer.js` est du code mort (aucun import) | à supprimer |
| 4 | `docAnswer.js` viole l'invariant : `extractQuery()` devine un argument de recherche depuis du texte libre par regex | à supprimer |
| 5 | `GET /api/models` supprimé ; contrat `/api/chat` passé de `{message, model}` à `{message, provider}` | à assumer |
| 6 | `chatClient.js` est devenu code mort : `providerOllama.js` duplique intégralement sa logique | bloquant |
| 7 | Boucle de tool-calling dupliquée (`MAX_HOPS` = 4 dans Ollama, 5 dans Claude) | à unifier |
| 8 | Aucun provider ne passe par `meta-tool.js` | bloquant |
| 9 | `mcpClient.callToolJson()` supprimé — nécessaire au chemin déterministe | à restaurer |
| 10 | Coût Ollama local codé en dur à 0,000005 $/token — un LLM local ne coûte pas de dollars | à corriger |
| 11 | `providerClaude` pose `llm_latency_ms = total` et `overhead_ms = 0` : le temps MCP est compté comme du temps LLM. Incomparable avec `providerOllama`. | à corriger |
| 12 | `providerLambda` ne reçoit ni `tools` ni `callTool` : cette cible court-circuite complètement le MCP | **bug, à corriger** |
| 13 | `history` envoyé par le front est ignoré depuis `edc62dc` → aucune mémoire conversationnelle | à corriger |
| 14 | `meta-tool.js` est anglophone : « combien de documents ? » matche `list` mais pas `count` → **liste au lieu de compter**, réponse silencieusement fausse (détail §8.1) | à corriger |

### 2.3 Apports d'Antoine à conserver intégralement

- Décomposition Ollama `load_duration` / `prompt_eval_duration` / `eval_duration`
- Graphes canvas CPU/RAM sur fenêtre glissante 60 s, 1 Hz
- Barres d'occupation par cœur, réseau ↓/↑, load 1 min, pastilles online/offline
- **Le carottage** : fenêtre requête→réponse surlignée sur la courbe + delta CPU moyen/pic
  contre une baseline de 15 s
- Sélecteur de cible LLM alimenté par `/api/providers`, persisté en `localStorage`
- Bascule d'affichage selon la nature du provider (`infra` vs `tokens`)
- Fallback mock quand le backend est injoignable (démo hors ligne)

### 2.4 Compatibilité visuelle

Les palettes sont déjà quasi identiques : `#ff2e88`/`#23e6d1` (Ayoub) contre
`#ff2e97`/`#22e0c8` (Antoine). Le front React apporte en plus la typographie
(Chakra Petch / Sora / JetBrains Mono) et le glassmorphism. La fusion visuelle
consiste à faire adopter les variables CSS Orbit aux canvas d'Antoine.

---

## 3. Décisions actées

| Sujet | Décision |
|---|---|
| Front de référence | React `src/`, `monitor.html` est absorbé |
| Layout | Chat fixe à gauche, onglets à droite |
| Onglets | ① Infra (Antoine) ② Usage (Ayoub) ③ Logs toutes sessions |
| Graphes | Hybride : canvas pour le temps réel, Recharts pour l'échelle session |
| `chatClient.js` | Façade : seule porte vers un LLM, adaptateurs par format derrière |
| Routage chat | `meta-tool.js` réactivé, conforme CLAUDE.md ; `docAnswer.js` supprimé |
| Mémoire chat | Historique de la session renvoyé au LLM |
| Session | Nommée, bouton « nouvelle session », état côté front (`localStorage`) |
| Persistance | JSONL append-only côté backend |
| Contenu des logs | Métriques + texte du prompt + texte de la réponse + carottage |
| Vue logs | Groupé par session, dépliable |
| Coût local | 0 $ affiché, plus CPU·secondes mesurées à côté |
| Carottage | Bande sur le graphe + ligne repliable sous chaque message |
| `monitor.html` | Conservé pendant la migration, supprimé à l'étape 5 |
| Ordre | Front d'abord (étapes 1-3), refactor backend en étape 4 |

---

## 4. Architecture cible

### 4.1 Backend

```
index.js ──► meta-tool.js        décision pure : quels outils, jamais les arguments
   │
   ├──► mcpClient.js             seule porte vers le MCP
   │       init() · getTools() · callTool() · callToolJson()
   │
   └──► chatClient.js            SEULE PORTE VERS UN LLM, quel qu'il soit
             │ listTargets()     registre + disponibilité
             │ chat()            LA boucle de tool-calling (une seule)
             │ normalise les turnMetrics de tous les providers
             ├──► llm/ollama.js      ~45 l · traduit, ne décide rien
             ├──► llm/anthropic.js   ~45 l
             └──► llm/lambda.js      ~25 l
```

`providers.js`, `providerOllama.js`, `providerClaude.js`, `providerLambda.js`
et `docAnswer.js` disparaissent : leur contenu utile remonte dans `chatClient.js`
et `llm/*.js`.

#### Contrat d'un adaptateur

Trois fonctions, aucune orchestration, aucun état :

```js
// llm/<provider>.js
export const kind          // 'infra' | 'tokens'
export function toRequest({ messages, tools, model, apiKey })
  // -> { url, headers, body }
export function fromResponse(raw)
  // -> { content, toolCalls: [{id, name, args}], usage: {...}, assistantTurn }
export function toolResultTurn(toolCalls, results)
  // -> [messages] à pousser dans l'historique, au format du provider
```

`toolResultTurn` prend des tableaux parce que les formats divergent : Ollama pousse
un message `{role:'tool'}` par appel, Anthropic pousse un seul `{role:'user'}`
contenant tous les `tool_result`.

Les trois adaptateurs, **Lambda compris**, participent à la boucle de tool-calling.
Aucune cible ne court-circuite le MCP (corrige l'écart #12). Voir §8.2 pour le
prérequis côté AWS.

#### Normalisation des métriques (corrige l'écart #11)

Calculée une seule fois, dans `chatClient.js` :

```
latency_ms      = temps mur total du tour (mesuré par chatClient)
llm_latency_ms  = Σ des temps LLM mesurables :
                    Ollama    → load_ms + prompt_eval_ms + gen_ms
                    Anthropic → Σ des durées HTTP des appels API
                    Lambda    → billed_ms si fourni, sinon durée HTTP
overhead_ms     = latency_ms − llm_latency_ms   (MCP + orchestration backend)
cost_usd        = ollama local/ec2 → 0
                  anthropic        → in × ANTHROPIC_PRICE_IN + out × ANTHROPIC_PRICE_OUT
                  lambda           → cost_usd renvoyé par la fonction
```

Les trois cibles deviennent comparables dans un même graphe.

#### Intégration de `meta-tool.js` dans `index.js`

```js
const allTools = mcpClient.getTools()
const decision = selectTools(message, allTools)
let route, result

if (!decision.resolved) {
  route = 'llm-full'
  result = await chatClient.chat({ targetId, messages, tools: allTools, callTool })

} else if (decision.mode === 'deterministic') {
  route = 'deterministic'
  const { documents } = await mcpClient.callToolJson(decision.tool, decision.args)
  result = { reply: formatDeterministicReply(decision.flags, documents), turnMetrics: ZERO }

} else {
  route = 'llm-restricted'
  const restricted = allTools.filter((t) => decision.tools.includes(t.name))
  result = await chatClient.chat({ targetId, messages, tools: restricted, callTool })
}
```

`meta-tool.js` reste une fonction pure sans I/O. La décision est prise **avant**
tout dispatch, donc une seule fois, quel que soit le provider — c'est ce qui évite
de la dupliquer dans chaque adaptateur.

Le chemin déterministe ignore l'historique conversationnel : il liste le répertoire
et formate, il n'a pas besoin de contexte.

### 4.2 Front

```
src/
  App.jsx                    layout, hooks globaux, état session
  hooks/
    useVmMetrics.js          poll 1 Hz, buffer 60 s, carottage
    useSession.js            session courante (localStorage)
  components/
    ChatPanel.jsx            existant, étendu
    Tabs.jsx                 coquille à onglets
    infra/
      InfraTab.jsx
      VmCard.jsx             en-tête, lectures, barres par cœur
      VmChart.jsx            ~25 l : ref + useEffect + requestAnimationFrame
      orbitChart.js          moteur de dessin pur, repris d'Antoine, zéro React
    usage/
      UsageTab.jsx
      SummaryBar.jsx  TokensPanel.jsx  LatencyPanel.jsx  CostPanel.jsx
    logs/
      LogsTab.jsx  SessionRow.jsx  TurnRow.jsx
  api/
    chat.js  metrics.js  vmMetrics.js  providers.js  logs.js
```

**`useVmMetrics` vit dans `App.jsx`, au-dessus des onglets.** Si le buffer mourait
au changement d'onglet, un prompt envoyé depuis l'onglet Logs produirait un carottage
sans données. Le hook tourne en permanence à 1 Hz ; les onglets ne font que le lire.

**`orbitChart.js` est un module de dessin pur** : il reçoit un contexte canvas et un
buffer, il dessine. Le code d'Antoine passe presque verbatim et reste testable sans
React ni DOM applicatif.

### 4.3 Flux d'un tour de chat

```
1. Envoi     ChatPanel → useVmMetrics.startSampling()
               t_start noté, baseline = moyenne CPU des 15 s précédentes
2. Requête   POST /api/chat { message, history, session_id, session_name, provider }
3. Réponse   ← { reply, turnMetrics, turn_id }
4. Fin       useVmMetrics.endSampling()
               avg / pic CPU et RAM par VM sur [t_start, t_end]
               CPU·secondes = Σ (cpu% / 100 × cœurs × Δt)
5. Enrichi   POST /api/turns/:turn_id/sampling { window_s, vms: { llm, mcp } }
6. Affiche   bande ambrée sur le graphe + ligne « › métriques » sous la réponse
```

Le carottage est une **mesure client** : seul le navigateur connaît la fenêtre exacte
requête→réponse. D'où l'aller-retour en deux temps.

---

## 5. Contrats de données

### 5.1 JSONL — `nasa-back/logs/turns.jsonl`

Append-only, deux types de lignes, jamais de réécriture.

```json
{"type":"turn","id":"t_01JX7…","ts":"2026-07-23T12:41:08.221Z",
 "session_id":"s_01JX6…","session_name":"bench qwen 3b",
 "provider":"ollama:qwen2.5:3b-instruct","provider_kind":"infra",
 "prompt":"combien de fichiers dans le répertoire ?",
 "reply":"Il y a 7 fichier(s) dans le répertoire.",
 "route":"deterministic","tools_called":["list_documents"],
 "metrics":{"prompt_tokens":0,"completion_tokens":0,"total_tokens":0,
            "latency_ms":142,"llm_latency_ms":0,"overhead_ms":142,
            "load_ms":0,"prompt_eval_ms":0,"gen_ms":0,
            "llm_calls":0,"cost_usd":0}}
```

```json
{"type":"sampling","turn_id":"t_01JX7…","window_s":12.4,
 "vms":{"llm":{"cpu_avg":78.2,"cpu_peak":94,"cpu_base":8.1,"mem_avg":71.3,"cores":4,"cpu_seconds":12.4},
        "mcp":{"cpu_avg":22.0,"cpu_peak":31,"cpu_base":3.4,"mem_avg":24.1,"cores":2,"cpu_seconds":1.1}}}
```

`GET /api/logs` fusionne les deux types à la lecture, par `turn_id`.

**Pourquoi deux lignes plutôt qu'une** : le tour est enregistré dès la réponse. Si
l'onglet se ferme avant l'étape 5, le prompt et ses métriques sont conservés ; seul
le carottage manque. Aucune ligne n'est jamais modifiée.

**Champ `route`** — `deterministic` | `llm-restricted` | `llm-full`. C'est la preuve
chiffrée que `meta-tool.js` sert à quelque chose (« X % des prompts résolus sans
appeler le LLM »). Il vaut `"llm-full"` en dur jusqu'à l'étape 4, puis devient exact.

**Rotation** : aucune pour l'instant. Un tour pèse ~2 Ko. À revoir au-delà de ~50 Mo.

### 5.2 API backend

| Route | État | Contrat |
|---|---|---|
| `GET /api/metrics` | inchangé | snapshot `mock.js` |
| `GET /api/vm-metrics` | inchangé | `{ llm: {...}, mcp: {...} }` depuis les agents psutil |
| `GET /api/providers` | **inchangé** | `{ providers: [{id, label, metrics, target, available}] }` — contrat d'Antoine conservé pour que son dropdown fonctionne tel quel |
| `POST /api/chat` | étendu | **+** `session_id`, `session_name`, `history` · **renvoie** `turn_id` |
| `POST /api/turns/:id/sampling` | nouveau | corps = ligne `sampling` sans `type` ni `turn_id` |
| `GET /api/logs` | nouveau | sessions fusionnées, antéchronologique |
| ~~`GET /api/models`~~ | supprimé | assumé — `/api/providers` liste les modèles Ollama **et** les cibles API |

---

## 6. Les trois onglets

### ① Infra — le travail d'Antoine

Deux cartes VM (`LLM-TEST01` · Ollama · 172.18.53.7, `MCP-TEST01` · FastMCP · 172.18.53.9) :

- canvas CPU/RAM sur fenêtre glissante 60 s, 1 Hz, avec bande de carottage ambrée
  et bornes en pointillés
- barres d'occupation par cœur
- lectures : CPU %, RAM %, réseau ↓/↑, load 1 min
- pastille online/offline par agent
- sous les graphes : récapitulatif du dernier carottage

Restylé aux variables Orbit (`--accent`, `--accent-2`, `--panel-bg`, glassmorphism,
Chakra Petch pour les titres).

Le panneau « Usage API (tokens) » d'Antoine, qui s'affichait à la place des cartes VM
pour les providers de type `tokens`, est absorbé par l'onglet Usage. En provider
`tokens`, les cartes VM restent visibles mais signalent « pas d'exécution locale ».

### ② Usage — le travail d'Ayoub

`SummaryBar`, `TokensPanel`, `LatencyPanel`, `CostPanel` existants, avec trois évolutions :

1. Ils lisent la **session courante** au lieu de l'état global du backend.
2. Ils gagnent la **décomposition Ollama** qu'Antoine a débloquée : chargement /
   prompt / génération / overhead, plus le débit en tok/s.
3. Le coût affiche **0 $ pour les cibles locales**, avec les **CPU·secondes** de la
   session à côté — la vraie unité de coût d'une VM CPU-only.

En-tête d'onglet : `Session : bench qwen 3b · 14 prompts · [Nouvelle session]`.

`HardwarePanel.jsx` reste désactivé (données mockées) — hors scope.

### ③ Logs — toutes les sessions

Liste antéchronologique des sessions. Une ligne repliable par session :

> `bench qwen 3b` · 23/07 14:02 · ollama:qwen2.5:3b · 14 prompts · 8 412 tok · 0 $ · 96 CPU·s

Dépliée, un bloc par prompt : heure, prompt tronqué, tokens in/out, latence totale,
décomposition, `route`, outils MCP appelés, delta CPU vs baseline. Clic sur un prompt
→ texte complet du prompt et de la réponse.

---

## 7. Étapes

### Étape 1 — Coquille à onglets + onglet Infra

**Livrable** : dashboard à trois onglets, chat fixe à gauche avec sélecteur de cible,
onglet Infra complet et fonctionnel. Démontrable.

- `Tabs.jsx`, layout deux colonnes dans `App.jsx`
- `useVmMetrics.js` : poll `/api/vm-metrics` à 1 Hz, buffer 60 s, `startSampling()` /
  `endSampling()`, fallback mock d'Antoine conservé
- `orbitChart.js` (dessin pur, repris d'Antoine), `VmChart.jsx`, `VmCard.jsx`, `InfraTab.jsx`
- `ChatPanel.jsx` : dropdown providers via `/api/providers` + `localStorage`, ligne
  « › métriques » repliable sous chaque réponse
- Onglet Usage : les panneaux existants déplacés **tels quels**, aucun changement
- Onglet Logs : placeholder
- Styles : variables Orbit appliquées aux canvas

**Backend touché** : aucun.

### Étape 2 — Sessions + onglet Usage abouti

- `useSession.js` : `session_id` (ULID) + nom, `localStorage`, bouton « Nouvelle session »
- En-tête de session dans l'onglet Usage
- Agrégats par session calculés côté front (tokens, coût, CPU·s, latence moyenne)
- Décomposition Ollama affichée dans `LatencyPanel`
- Coût : 0 $ pour les cibles locales + CPU·s à côté
- `POST /api/chat` accepte `session_id`, `session_name`, `history` et les renvoie ;
  `history` est enfin transmis au LLM (corrige l'écart #13)

**Backend touché** : `index.js` (passage de `history` au provider), signature `/api/chat`.

### Étape 3 — Onglet Logs + persistance

- `nasa-back/sessionLog.js` : `appendTurn()` et `appendSampling()`. **Module totalement
  isolé** — aucune connaissance des providers ni du routage. C'est ce qui permet à
  l'étape 4 de ne déplacer que le site d'appel.
- `readLogs()` : lecture + fusion `turn` / `sampling` par `turn_id`, groupement par session
- Routes `POST /api/turns/:id/sampling` et `GET /api/logs`
- `LogsTab.jsx`, `SessionRow.jsx`, `TurnRow.jsx`
- `useVmMetrics.endSampling()` poste le carottage

**Backend touché** : +1 module, +2 routes, 1 ligne d'appel dans `/api/chat`.

### Étape 4 — Refactor backend (mise en conformité)

C'est l'étape qui solde les écarts 2, 4, 6, 7, 8, 9, 10, 11 de l'audit.

**4a. `chatClient.js` devient la façade**

- Créer `nasa-back/llm/ollama.js`, `llm/anthropic.js`, `llm/lambda.js` selon le contrat
  du §4.1, en reprenant la logique de `providerOllama.js` / `providerClaude.js` /
  `providerLambda.js`
- Réécrire `chatClient.js` : `listTargets()` (contenu de `providers.listProviders()`,
  contrat `/api/providers` inchangé), `chat()` avec **une seule** boucle de tool-calling
  (`MAX_HOPS` défini une fois), normalisation des `turnMetrics` selon le §4.1
- `llm/lambda.js` reçoit `tools` et `callTool` comme les autres et participe à la
  boucle de tool-calling (corrige l'écart #12). Il tolère une réponse sans
  `tool_calls` tant que la fonction AWS n'a pas évolué — voir §8.2
- Supprimer `providers.js`, `providerOllama.js`, `providerClaude.js`, `providerLambda.js`
- `index.js` n'importe plus que `chatClient.js` et `mcpClient.js`

**4b. Rebrancher `meta-tool.js`**

- Restaurer `mcpClient.callToolJson()` (écart #9)
- Insérer la décision dans `/api/chat` selon le §4.1
- Renseigner `route` pour de vrai dans le JSONL
- Supprimer `docAnswer.js` (écarts #3 et #4)

**4c. Corriger les métriques**

- Coût des cibles locales à 0 (écart #10)
- `llm_latency_ms` d'Anthropic = Σ des durées HTTP, pas le total (écart #11)

**4d. Documenter**

- `CLAUDE.md` : la ligne sur les fichiers clés devient « `chatClient.js` (façade,
  seule porte vers un LLM) + `llm/*.js` (adaptateurs de format, sans orchestration) »
- `ARCHITECTURE_Orbit_synthese.md` : ajouter la notion de cible LLM multiple et le
  fait que `meta-tool.js` décide **avant** le dispatch, donc une fois pour toutes
- `MIGRATION_conformite_architecture_EN.md` : nouvelle section pour cette migration

**Vérification de fin d'étape** : les trois onglets fonctionnent à l'identique, et un
prompt de comptage produit `route: "deterministic"` avec `llm_calls: 0`.

### Étape 5 — Nettoyage

- Supprimer `nasa-front/monitor.html`
- Décider du sort de `nasa-front/assets/` (build tracké depuis `6ab9037` — à regénérer
  ou à re-ignorer, à trancher avec Antoine qui déploie depuis là)
- README à jour : nouvelle arborescence, les trois onglets, le format JSONL
- Supprimer `probe_mcp.js` s'il n'est plus utilisé

---

## 8. Points ouverts

### 8.1 `meta-tool.js` est anglophone — et répond faux en français

`INTENT_PATTERNS` dans `meta-tool.js` ne contient que des motifs anglais. Le
comportement en français n'est pas « pas de match », il est **pire** : les cognates
matchent partiellement et produisent les mauvais drapeaux.

| Prompt FR | Ce qui matche | Résultat |
|---|---|---|
| « combien de **fichiers** ? » | rien (`fichiers` ∉ motifs, `combien` ∉ `count`) | `llm-full` — dégradé mais correct |
| « combien de **documents** ? » | `list` seul, via `\bdocuments?\b` — **pas** `count` | `deterministic` → **liste les fichiers au lieu de les compter** |
| « quelle est la **taille** ? » | rien | `llm-full` |
| « quel **volume** ? » | `volume` (cognate) | `deterministic` → correct par chance |
| « **date** du dernier fichier ? » | `date` (cognate) | `deterministic` → correct par chance |

Le deuxième cas est une **réponse silencieusement fausse**, pas un repli. C'est le
scénario le plus probable en démo.

`docAnswer.js` contient les motifs français correspondants (`intents()`, lignes 44-53 :
`combien|nombre|compte`, `taille|poids|octet`, `lis|lire|contenu`, `cherche|trouve`…).
Les fusionner dans `INTENT_PATTERNS` ne violerait pas l'invariant : `selectTools()`
resterait une fonction pure qui choisit des outils, jamais des arguments.

**Recommandation** : fusionner les motifs FR dans `meta-tool.js` **avant** de supprimer
`docAnswer.js` à l'étape 4b. Le coût est d'environ 6 lignes de regex et ça supprime une
classe de faux positifs. Le reste de `docAnswer.js` (détection de langue, réponses en
dur bilingues, `extractQuery()`) est bien à jeter.

### 8.2 `providerLambda` court-circuite le MCP — tranché : c'est un bug

**Décision** : la cible Lambda doit accéder aux outils MCP comme les autres.
Une cible qui répond sans jamais lire un document n'est pas comparable aux autres
dans les onglets Usage et Logs — elle afficherait des latences et des coûts
artificiellement bas pour un travail qu'elle n'a pas fait.

Côté dépôt, la correction est mécanique : `llm/lambda.js` implémente le contrat à
trois fonctions du §4.1 comme les deux autres, et `chatClient.js` lui passe `tools`
et `callTool`.

**Mais elle ne suffit pas seule.** Le contrat actuel de la fonction Lambda est
`POST {message} → {reply, input_tokens?, output_tokens?, cost_usd?, billed_ms?}` :
c'est une boîte noire qui n'accepte pas de `tools` et ne renvoie pas de `tool_calls`.
Le correctif complet suppose donc une **évolution côté AWS**, hors de ce dépôt :

- la fonction accepte `tools` (schémas JSON des outils MCP) et `messages`
  (l'historique, pas seulement le dernier message)
- elle renvoie les `tool_calls` demandés par le modèle au lieu de trancher seule
- Bedrock expose ça nativement via l'API Converse (`toolConfig` / `toolUse` /
  `toolResult`), donc l'implémentation est directe si la Lambda passe par Bedrock

**Séquencement** : le §4a livre `llm/lambda.js` conforme au contrat. Tant que la
fonction AWS n'a pas évolué, elle ignorera le champ `tools` et renverra une réponse
sans `tool_calls` — l'adaptateur le gère sans planter, la boucle sort au premier tour,
et la cible reste marquée non disponible dans le sélecteur jusqu'à ce que l'évolution
AWS soit livrée. **Propriétaire de cette évolution : à confirmer avec Antoine.**

### 8.3 Sort de `nasa-front/assets/`

Le commit `6ab9037` a retiré une ligne du `.gitignore` et committé le build Vite.
Antoine déploie peut-être depuis ces fichiers. À clarifier avec lui avant l'étape 5.

---

## 9. Hors scope

- La bascule 2 VM (MCP fusionné avec front/backend) — objectif long terme, non prioritaire
- Le déploiement sur `web-test01` (systemd, nginx) — couvert par `DEPLOYMENT_web-test01.md`
- `HardwarePanel.jsx` — reste désactivé tant que les données sont mockées
- L'agent psutil sur l'EC2 GPU — la cible `ec2` existe dans le registre mais n'a pas
  d'agent de métriques ; elle affichera des graphes vides jusqu'à déploiement
