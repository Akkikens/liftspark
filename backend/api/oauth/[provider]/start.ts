import { providerFor, redirectUri } from '../../../lib/providers.js'

const idOf = (req: Request) => new URL(req.url).pathname.split('/').at(-2)

// GET /api/oauth/:provider/start → the provider's consent page.
export function GET(req: Request): Response {
  const p = providerFor(idOf(req))
  if (!p) return new Response('Not configured', { status: 404 })
  const state = crypto.randomUUID()
  const u = new URL(p.authorizeUrl)
  u.searchParams.set('client_id', p.clientId!)
  u.searchParams.set('redirect_uri', redirectUri(req, p))
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', p.scope)
  u.searchParams.set('state', state)
  if (p.id === 'strava') u.searchParams.set('approval_prompt', 'auto')
  return Response.redirect(u.toString(), 302)
}
