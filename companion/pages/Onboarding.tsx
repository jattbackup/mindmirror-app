import { useState } from 'react'
import {
  DEFAULT_SALES_GOAL,
  DEFAULT_SALES_NEXT_ASK,
  DEFAULT_SALES_OFFER,
  DEFAULT_SALES_PROSPECT,
  SESSION_TIMEBOX_MS,
} from '../../_shared/constants'

function lines(value: string): string[] {
  return value.split(/\n|;/).map((item) => item.trim()).filter(Boolean).slice(0, 3)
}

export function OnboardingPage() {
  const [prospect, setProspect] = useState(DEFAULT_SALES_PROSPECT)
  const [participants, setParticipants] = useState('Aman, Dana')
  const [offer, setOffer] = useState(DEFAULT_SALES_OFFER)
  const [goal, setGoal] = useState(DEFAULT_SALES_GOAL)
  const [successCriteria, setSuccessCriteria] = useState('Confirm business pain\nAgree to next meeting\nName the buyer owner')
  const [knownObjections, setKnownObjections] = useState('budget timing\nsecurity review')
  const [nextAsk, setNextAsk] = useState(DEFAULT_SALES_NEXT_ASK)
  const [minutes, setMinutes] = useState(Math.round(SESSION_TIMEBOX_MS / 60_000))
  const [passphrase, setPassphrase] = useState('0000')
  const [status, setStatus] = useState('')

  const brief = () => {
    window.dispatchEvent(new CustomEvent('mindmirror:onboarding', {
      detail: {
        prospect,
        participants: participants.split(',').map((item) => item.trim()).filter(Boolean),
        offer,
        goal,
        successCriteria: lines(successCriteria),
        knownObjections: lines(knownObjections),
        nextAsk,
        timeboxMs: Math.max(1, minutes) * 60_000,
        passphrase,
      },
    }))
    setStatus('Brief sent. Tap the glasses to confirm and start.')
  }

  return (
    <section className="panel">
      <h2>Sales Onboarding</h2>
      <div className="grid two">
        <div className="field">
          <label htmlFor="prospect">Prospect</label>
          <input id="prospect" className="input" value={prospect} onChange={(event) => setProspect(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="participants">Participants</label>
          <input id="participants" className="input" value={participants} onChange={(event) => setParticipants(event.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="offer">Offer</label>
        <input id="offer" className="input" value={offer} onChange={(event) => setOffer(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="goal">Close goal</label>
        <textarea id="goal" className="input" value={goal} onChange={(event) => setGoal(event.target.value)} />
      </div>
      <div className="grid two">
        <div className="field">
          <label htmlFor="success">Success criteria</label>
          <textarea id="success" className="input" value={successCriteria} onChange={(event) => setSuccessCriteria(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="objections">Known objections</label>
          <textarea id="objections" className="input" value={knownObjections} onChange={(event) => setKnownObjections(event.target.value)} />
        </div>
      </div>
      <div className="grid two">
        <div className="field">
          <label htmlFor="ask">Next ask</label>
          <input id="ask" className="input" value={nextAsk} onChange={(event) => setNextAsk(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="minutes">Time-box minutes</label>
          <input id="minutes" className="input" type="number" min={1} max={90} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="passphrase">Memory passphrase</label>
        <input id="passphrase" className="input" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
      </div>
      <button className="button primary" onClick={brief}>Send brief to glasses</button>
      <p className="status">{status || 'Set the close goal before tapping the glasses.'}</p>
    </section>
  )
}
