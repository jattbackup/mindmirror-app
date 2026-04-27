import { useState } from 'react'
import { DEFAULT_SALES_NEXT_ASK, DEFAULT_SALES_OFFER, DEFAULT_SALES_PROSPECT, SESSION_TIMEBOX_MS } from '../../_shared/constants'

export function SetupPage() {
  const [goal, setGoal] = useState('Close the next step and confirm buyer commitment.')
  const [prospect, setProspect] = useState(DEFAULT_SALES_PROSPECT)
  const [offer, setOffer] = useState(DEFAULT_SALES_OFFER)
  const [nextAsk, setNextAsk] = useState(DEFAULT_SALES_NEXT_ASK)
  const [participants, setParticipants] = useState('')
  const [minutes, setMinutes] = useState(Math.round(SESSION_TIMEBOX_MS / 60_000))
  const [passphrase, setPassphrase] = useState('0000')
  const [saved, setSaved] = useState(false)

  const save = () => {
    window.dispatchEvent(new CustomEvent('mindmirror:setup', {
      detail: {
        goal,
        prospect,
        offer,
        nextAsk,
        participants: participants.split(',').map((p) => p.trim()).filter(Boolean),
        timeboxMs: minutes * 60_000,
        passphrase,
      },
    }))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <section className="panel">
      <h2>Session Setup</h2>
      <div className="field">
        <label htmlFor="prospect">Client name <span style={{ color: '#ef4444' }}>*</span></label>
        <input id="prospect" className="input" placeholder="e.g. Dana" value={prospect} onChange={(e) => setProspect(e.target.value)} />
        <span className="status">Say this name to trigger coaching</span>
      </div>
      <div className="field">
        <label htmlFor="goal">Goal</label>
        <textarea id="goal" className="input" value={goal} onChange={(e) => setGoal(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="offer">Offer / product</label>
        <input id="offer" className="input" placeholder="e.g. MindMirror pilot" value={offer} onChange={(e) => setOffer(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="nextAsk">Next ask</label>
        <input id="nextAsk" className="input" placeholder="e.g. Confirm next meeting and owner" value={nextAsk} onChange={(e) => setNextAsk(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="participants">Other participants</label>
        <input id="participants" className="input" placeholder="comma separated" value={participants} onChange={(e) => setParticipants(e.target.value)} />
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label htmlFor="minutes">Time-box (min)</label>
          <input id="minutes" className="input" type="number" min={1} max={60} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
        </div>
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label htmlFor="passphrase">Memory passphrase</label>
          <input id="passphrase" className="input" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
        </div>
      </div>
      <button className="button primary" onClick={save} style={{ width: '100%', marginTop: 8 }}>
        {saved ? 'Saved!' : 'Save setup'}
      </button>
    </section>
  )
}
