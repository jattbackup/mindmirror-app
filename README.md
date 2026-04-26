# MindMirror App

Fresh sibling implementation of the checked-in MindMirror G2 spec.

```bash
npm install
npm run dev
npm run qr
```

Backend:

```bash
cd server
npm install
OPENAI_API_KEY=... SONIOX_API_KEY=... npm run dev
```

The canonical product spec is copied into `SPEC.md`. Persistent memory uses encrypted bridge KV chunks via `bridge.setLocalStorage`, not browser `localStorage` or IndexedDB.
