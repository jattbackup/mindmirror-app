export async function searchSegments(req: { q?: string; k?: number }) {
  return {
    hits: [],
    q: req.q ?? '',
    k: req.k ?? 5,
  }
}
