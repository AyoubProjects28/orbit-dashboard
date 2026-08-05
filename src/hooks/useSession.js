// Session courante côté front — nommée, persistée en localStorage pour
// survivre à un rechargement. Sert à grouper les tours dans l'onglet Logs
// (voir spec §5.1/§7 étape 2/3).
//
// `name` reste `null` tant qu'aucun message n'a été envoyé sous cet id : la
// session ne "commence" (au sens Logs — voir nasa-back/sessionLog.js, qui
// prend le session_name du premier tour) qu'au moment du premier message,
// pas au clic sur "New session". `startNewSession()` change juste l'id et
// remet `name` à `null` ; `lockSessionName()` (appelé par ChatPanel à l'envoi
// du premier message) fige le nom pour tous les tours suivants de cette session.
import { useCallback, useRef, useState } from 'react'

const STORAGE_KEY = 'orbit_session'

function randomId() {
  return typeof crypto.randomUUID === 'function'
    ? `s_${crypto.randomUUID()}`
    : `s_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function createSession() {
  return { id: randomId(), name: null }
}

function loadOrCreate() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // valeur corrompue : on retombe sur une session neuve
  }
  const fresh = createSession()
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
  return fresh
}

export function useSession() {
  const [session, setSession] = useState(loadOrCreate)
  const nameRef = useRef(session.name)

  const startNewSession = useCallback(() => {
    const fresh = createSession()
    nameRef.current = null
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
    setSession(fresh)
  }, [])

  // Retourne le nom figé s'il existe déjà, sinon en fige un nouveau à
  // l'instant présent. Synchrone (via nameRef) : ChatPanel a besoin de la
  // valeur immédiatement pour l'envoyer avec le premier message, avant que
  // le re-render qui suivrait un simple useState ait eu lieu.
  const lockSessionName = useCallback(() => {
    if (nameRef.current) return nameRef.current
    const name = `Session ${new Date().toLocaleString()}`
    nameRef.current = name
    setSession((prev) => {
      const next = { ...prev, name }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
    return name
  }, [])

  return {
    sessionId: session.id,
    sessionName: session.name,
    startNewSession,
    lockSessionName,
  }
}
