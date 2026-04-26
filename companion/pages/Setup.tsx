import { useState } from 'react'
import { SESSION_TIMEBOX_MS } from '../../_shared/constants'

export function SetupPage() {
  const [goal, setGoal] = useState('Decide next steps and owners.')
  const [participants, setParticipants] = useState('Dana, Aman')
  const [minutes, setMinutes] = useState(Math.round(SESSION_TIMEBOX_MS / 60_000))
  const [passphrase, setPassphrase] = useState('0000')

  const save = () => {
    window.dispatchEvent(new CustomEvent('mindmirror:setup', {
      detail: {
        goal,
        participants: participants.split(',').map((item) => item.trim()).filter(Boolean),
        timeboxMs: minutes * 60_000,
        passphrase,
      },
    }))
  }

  return (
    <section className="panel">
      <h2>Setup</h2>
      <div className="field">
        <label htmlFor="goal">Goal</label>
        <textarea id="goal" className="input" value={goal} onChange={(event) => setGoal(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="participants">Participants</label>
        <input id="participants" className="input" value={participants} onChange={(event) => setParticipants(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="minutes">Time-box minutes</label>
        <input id="minutes" className="input" type="number" min={1} max={60} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} />
      </div>
      <div className="field">
        <label htmlFor="passphrase">Memory passphrase</label>
        <input id="passphrase" className="input" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
      </div>
      <button className="button primary" onClick={save}>Save setup</button>
      <p className="status">Demo mode allows a PIN. Production users should use a real passphrase.</p>
    </section>
  )
}
