// Onglet Families : familles + tours décorés (SPEC_families.md §5), et les
// actions qui les font évoluer. Même forme que src/api/logs.js.

export async function fetchFamilies() {
  const response = await fetch('/api/families', { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to fetch families: ${response.status}`)
  }
  return response.json()
}

// id omis : création (le backend en génère un). id fourni : mise à jour.
export async function saveFamily({ id, name, description }) {
  const response = await fetch('/api/families', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name, description }),
  })
  if (!response.ok) {
    throw new Error(`Failed to save family: ${response.status}`)
  }
  return response.json()
}

export async function deleteFamily(id) {
  const response = await fetch(`/api/families/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(`Failed to delete family: ${response.status}`)
  }
}

export async function assignToFamily(familyId, turnIds) {
  const response = await fetch(`/api/families/${encodeURIComponent(familyId)}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ turn_ids: turnIds }),
  })
  if (!response.ok) {
    throw new Error(`Failed to assign turns: ${response.status}`)
  }
}

export async function unassignTurns(turnIds) {
  const response = await fetch('/api/families/unassign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ turn_ids: turnIds }),
  })
  if (!response.ok) {
    throw new Error(`Failed to unassign turns: ${response.status}`)
  }
}

export async function setExpectation(promptKey, { expectedItems, match }) {
  const response = await fetch(`/api/prompts/${encodeURIComponent(promptKey)}/expectation`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_items: expectedItems, match }),
  })
  if (!response.ok) {
    throw new Error(`Failed to set expectation: ${response.status}`)
  }
}

export async function gradeTurn(turnId, { expectedCount, matchedCount, foundCount }) {
  const response = await fetch(`/api/turns/${encodeURIComponent(turnId)}/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_count: expectedCount, matched_count: matchedCount, found_count: foundCount }),
  })
  if (!response.ok) {
    throw new Error(`Failed to grade turn: ${response.status}`)
  }
}
