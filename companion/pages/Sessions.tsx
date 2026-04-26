import { useState } from 'react'
import { getEventLog } from '../../_shared/log'
import { getMindMirrorMemory } from '../../g2/main'
import type { MemorySnapshot } from '../../memory/schema'

export function SessionsPage() {
  const [snapshot, setSnapshot] = useState<MemorySnapshot | null>(null)
  const logs = getEventLog().slice(-5).reverse()

  const refresh = () => {
    setSnapshot(getMindMirrorMemory()?.getSnapshot() ?? null)
  }

  const sessions = snapshot?.sessions.slice().sort((a, b) => b.startedAt - a.startedAt) ?? []

  return (
    <section className="panel">
      <div className="row">
        <h2>Sessions</h2>
        <button className="button" onClick={refresh}>Refresh</button>
      </div>
      <div className="grid">
        {sessions.length ? sessions.map((session) => {
          const segments = snapshot?.segments.filter((segment) => segment.sessionId === session.id) ?? []
          const drifts = segments.filter((segment) => segment.kind === 'drift')
          const accepted = drifts.filter((segment) => segment.wasAccepted).length
          return (
            <div className="hit" key={session.id}>
              <strong>{session.prospect || 'Sales session'}</strong>
              <div>{session.goal}</div>
              <div className="status">
                final align {session.finalAlign?.toFixed(2) ?? '-'} · {drifts.length} drift · {accepted} accepted
              </div>
            </div>
          )
        }) : <div className="hit">No saved sessions yet.</div>}
      </div>
      <p className="status">{logs.join(' · ')}</p>
    </section>
  )
}
