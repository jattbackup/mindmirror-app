import React from 'react'
import { createRoot } from 'react-dom/client'
import type { AppModule } from '../_shared/app-types'
import { installConsoleRedaction } from '../_shared/log'
import { CompanionApp } from '../companion/ui'
import '../companion/styles.css'

installConsoleRedaction()

async function boot() {
  const module = await import('../g2/index')
  const app: AppModule = module.app ?? module.default
  const rootEl = document.getElementById('root')
  if (!rootEl) throw new Error('Missing root element')
  const root = createRoot(rootEl)

  let status = app.initialStatus ?? `${app.name} ready`
  let alignScore: number | null = null
  let transcript = ''

  const actions = await app.createActions((text) => {
    status = text
    render()
  })

  const render = () => {
    root.render(
      <React.StrictMode>
        <CompanionApp
          status={status}
          alignScore={alignScore}
          transcript={transcript}
          onConnect={actions.connect}
          onAction={actions.action}
        />
      </React.StrictMode>,
    )
  }

  render()
  void actions.connect().catch((error) => {
    console.error('[mindmirror] auto-connect failed', error)
  })

  const { getMindMirrorStore } = await import('../g2/main')
  getMindMirrorStore().subscribe((state) => {
    const newTranscript = state.finalTranscript + (state.provisionalTranscript ? ` ${state.provisionalTranscript}` : '')
    const changed = state.lastAlignScore !== alignScore || newTranscript !== transcript
    if (changed) {
      alignScore = state.lastAlignScore
      transcript = newTranscript
      render()
    }
  })
}

void boot().catch((error) => {
  console.error('[mindmirror] boot failed', error)
})
