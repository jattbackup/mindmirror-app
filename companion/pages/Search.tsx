import { useState } from 'react'
import { getMindMirrorMemory, pushRecallToGlasses } from '../../g2/main'
import type { SearchHit } from '../../memory'

export function SearchPage() {
  const [query, setQuery] = useState('API schema')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [status, setStatus] = useState('')

  const search = async () => {
    const memory = getMindMirrorMemory()
    if (!memory) {
      setStatus('Memory is not initialised yet.')
      return
    }
    const nextHits = await memory.search(query, 5)
    setHits(nextHits)
    setStatus(nextHits.length ? `${nextHits.length} hits` : 'No hits')
  }

  return (
    <section className="panel">
      <h2>Search</h2>
      <div className="row">
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className="button primary" onClick={search}>Search</button>
      </div>
      <p className="status">{status}</p>
      <div className="grid">
        {hits.map((hit) => (
          <button className="hit" key={hit.segmentId} onClick={() => pushRecallToGlasses([hit])}>
            <strong>{hit.score.toFixed(2)}</strong> {hit.snippet}
          </button>
        ))}
      </div>
    </section>
  )
}
