import { providerFor, tokenRequest } from '../../../lib/providers.js'

const idOf = (req: Request) => new URL(req.url).pathname.split('/').at(-2)

// POST /api/oauth/:provider/refresh { refresh_token } → a fresh access token.
export async function POST(req: Request): Promise<Response> {
  const p = providerFor(idOf(req))
  if (!p) return new Response('Not configured', { status: 404 })
  const { refresh_token } = (await req.json().catch(() => ({}))) as { refresh_token?: string }
  if (!refresh_token || refresh_token.length > 2048) return new Response('Missing refresh_token', { status: 400 })
  return tokenRequest(req, p, { refresh_token, grant_type: 'refresh_token' })
}
