export function TranscriptPage(props: { transcript: string }) {
  return (
    <section className="panel" style={{ minHeight: 200 }}>
      <h2>Live Transcript</h2>
      {props.transcript
        ? (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6 }}>
            {props.transcript}
          </pre>
        )
        : <span className="status">Waiting for speech…</span>
      }
    </section>
  )
}
