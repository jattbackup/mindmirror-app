import { useState } from 'react'
import { SetupPage } from './pages/Setup'
import { OnboardingPage } from './pages/Onboarding'
import { SessionsPage } from './pages/Sessions'
import { SearchPage } from './pages/Search'
import { PrivacyPage } from './pages/Privacy'

type Tab = 'setup' | 'onboarding' | 'sessions' | 'search' | 'privacy'

export function CompanionApp(props: {
  status: string
  onConnect(): Promise<void>
  onAction(): Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('onboarding')
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
      <nav className="tabs">
        {(['onboarding', 'setup', 'sessions', 'search', 'privacy'] as const).map((item) => (
          <button key={item} className={`tab ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </nav>
      {tab === 'onboarding' && <OnboardingPage />}
      {tab === 'setup' && <SetupPage />}
      {tab === 'sessions' && <SessionsPage />}
      {tab === 'search' && <SearchPage />}
      {tab === 'privacy' && <PrivacyPage />}
    </main>
  )
}
