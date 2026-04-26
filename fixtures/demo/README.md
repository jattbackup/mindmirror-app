# MindMirror Demo Fixture

This fixture replays a sales-close conversation without storing raw audio.

Run the integration replay:

```bash
npm test -- tests/integration/demo-replay.spec.ts
```

The committed fixture contains timestamped final transcript chunks and expected
surface events. A long `meeting.wav` is intentionally not committed unless a
recorded demo asset is supplied.
