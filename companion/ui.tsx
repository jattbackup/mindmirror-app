import { useState } from 'react'
import { SetupPage } from './pages/Setup'
import { SessionsPage } from './pages/Sessions'
import { SearchPage } from './pages/Search'
import { PrivacyPage } from './pages/Privacy'
import { TranscriptPage } from './pages/Transcript'
import { MINDMIRROR_ASCII } from '../g2/intro/ascii'

type Tab = 'transcript' | 'setup' | 'sessions' | 'search' | 'privacy'

export function CompanionApp(props: {
  status: string
  alignScore?: number | null
  transcript?: string
  onConnect(): Promise<void>
  onAction(): Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('transcript')
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const pct = props.alignScore != null ? Math.round(props.alignScore * 100) : null
  const barColor = pct == null ? '#aaa'
    : pct >= 70 ? '#22c55e'
    : pct >= 45 ? '#f59e0b'
    : '#ef4444'

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <pre className="ascii-brand" aria-label="MindMirror">
            {MINDMIRROR_ASCII}
          </pre>
          <h1>MindMirror</h1>
          <span className="status">{props.status}</span>
        </div>
        <div className="row">
          <button className="button" disabled={busy} onClick={() => run(props.onConnect)}>Connect</button>
          <button className="button primary" disabled={busy} onClick={() => run(props.onAction)}>Start / Stop</button>
        </div>
      </header>

      <div className="align-bar-wrap">
        <div className="align-bar-track">
          <div
            className="align-bar-fill"
            style={{ width: `${pct ?? 0}%`, background: barColor, transition: 'width 0.6s ease, background 0.6s ease' }}
          />
        </div>
        <span className="align-label">
          {pct == null ? 'Warmup' : pct >= 70 ? `On goal ${pct}%` : pct >= 45 ? `Drifting ${pct}%` : `Off goal ${pct}%`}
        </span>
      </div>

      <nav className="tabs">
        {(['transcript', 'setup', 'sessions', 'search', 'privacy'] as const).map((item) => (
          <button key={item} className={`tab ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </nav>
      {tab === 'transcript' && <TranscriptPage transcript={props.transcript ?? ''} />}
      {tab === 'setup' && <SetupPage />}
      {tab === 'sessions' && <SessionsPage />}
      {tab === 'search' && <SearchPage />}
      {tab === 'privacy' && <PrivacyPage />}
    </main>
  )
}
