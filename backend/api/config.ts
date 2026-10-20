import { providers, isConfigured } from '../lib/providers.js'

// GET /api/config → which integrations this backend has API keys for. The app hides the rest.
export function GET(): Response {
  const out = Object.fromEntries(Object.values(providers).map(p => [p.id, isConfigured(p)]))
  return Response.json(out, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
