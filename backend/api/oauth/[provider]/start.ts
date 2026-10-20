import { providerFor, redirectUri } from '../../../lib/providers.js'

const idOf = (req: Request) => new URL(req.url).pathname.split('/').at(-2)

// GET /api/oauth/:provider/start?state=…&code_challenge=… → the provider's consent page.
// The app makes the state (and checks it comes back unchanged) and the PKCE pair; only the S256
// challenge passes through here, the verifier stays on the phone until the token exchange.
export function GET(req: Request): Response {
  const p = providerFor(idOf(req))
  if (!p) return new Response('Not configured', { status: 404 })
  const q = new URL(req.url).searchParams
  const fromApp = q.get('state') || ''
  const state = /^[\w-]{16,128}$/.test(fromApp) ? fromApp : crypto.randomUUID()
  const challenge = q.get('code_challenge') || ''
  const u = new URL(p.authorizeUrl)
  u.searchParams.set('client_id', p.clientId!)
  u.searchParams.set('redirect_uri', redirectUri(req, p))
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', p.scope)
  u.searchParams.set('state', state)
  if (p.id === 'strava') u.searchParams.set('approval_prompt', 'auto')
  else if (/^[\w-]{43,128}$/.test(challenge)) {
    u.searchParams.set('code_challenge', challenge)
    u.searchParams.set('code_challenge_method', 'S256')
  }
  return Response.redirect(u.toString(), 302)
}
