import { useState } from 'react'
import { SetupPage } from './pages/Setup'
import { SessionsPage } from './pages/Sessions'
import { SearchPage } from './pages/Search'
import { PrivacyPage } from './pages/Privacy'

type Tab = 'setup' | 'sessions' | 'search' | 'privacy'

export function CompanionApp(props: {
  status: string
  alignScore?: number | null
  onConnect(): Promise<void>
  onAction(): Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('setup')
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
        {(['setup', 'sessions', 'search', 'privacy'] as const).map((item) => (
          <button key={item} className={`tab ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </nav>
      {tab === 'setup' && <SetupPage />}
      {tab === 'sessions' && <SessionsPage />}
      {tab === 'search' && <SearchPage />}
      {tab === 'privacy' && <PrivacyPage />}
    </main>
  )
}
