import { useState } from 'react'
import { getMindMirrorMemory } from '../../g2/main'

export function PrivacyPage() {
  const [status, setStatus] = useState('')

  const forgetAll = async () => {
    await getMindMirrorMemory()?.forgetAll()
    setStatus('Encrypted memory cleared.')
  }

  const exportBlob = async () => {
    const blob = await getMindMirrorMemory()?.exportEncryptedBlob()
    setStatus(blob ? `Encrypted export ready (${blob.size} bytes).` : 'Memory not initialised.')
  }

  return (
    <section className="panel">
      <h2>Privacy</h2>
      <p>Raw PCM is streamed only to STT and never persisted. Transcripts and summaries are encrypted before bridge KV storage.</p>
      <div className="row">
        <button className="button" onClick={exportBlob}>Export encrypted blob</button>
        <button className="button" onClick={forgetAll}>Forget everything</button>
      </div>
      <p className="status">{status}</p>
    </section>
  )
}
