const idOf = (req: Request) => new URL(req.url).pathname.split('/').at(-2)

// GET /api/oauth/:provider/callback?code=… → back into the app (liftspark://oauth/:provider?code=…),
// where the system sign-in sheet (ASWebAuthenticationSession) picks it up. The code is useless
// without the client secret, which only this backend holds.
export function GET(req: Request): Response {
  const id = idOf(req)
  if (!id || !/^[a-z]+$/.test(id)) return new Response('Bad provider', { status: 400 })
  const src = new URL(req.url).searchParams
  const out = new URL(`liftspark://oauth/${id}`)
  for (const k of ['code', 'error', 'state', 'scope']) { const v = src.get(k); if (v) out.searchParams.set(k, v) }
  return Response.redirect(out.toString(), 302)
}
