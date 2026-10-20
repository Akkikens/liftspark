import { providerFor, tokenRequest } from '../../../lib/providers.js'

const idOf = (req: Request) => new URL(req.url).pathname.split('/').at(-2)

// POST /api/oauth/:provider/token { code } → the provider's token response (access + refresh token).
export async function POST(req: Request): Promise<Response> {
  const p = providerFor(idOf(req))
  if (!p) return new Response('Not configured', { status: 404 })
  const { code } = (await req.json().catch(() => ({}))) as { code?: string }
  if (!code || code.length > 512) return new Response('Missing code', { status: 400 })
  return tokenRequest(req, p, { code, grant_type: 'authorization_code' })
}
