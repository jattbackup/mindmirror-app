import { getEventLog } from '../../_shared/log'

export function SessionsPage() {
  const logs = getEventLog().slice(-8).reverse()
  return (
    <section className="panel">
      <h2>Sessions</h2>
      <p className="status">Recent runtime events and saved cards appear here in v1.</p>
      <div className="grid">
        {logs.length ? logs.map((line) => <div className="hit" key={line}>{line}</div>) : <div className="hit">No sessions yet.</div>}
      </div>
    </section>
  )
}
