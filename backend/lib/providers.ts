// OAuth providers Liftspark connects to. A provider is "configured" only when both its client id and
// secret are set in the environment; the app hides anything that isn't.
export type ProviderId = 'strava' | 'whoop' | 'oura'

export interface Provider {
  id: ProviderId
  authorizeUrl: string
  tokenUrl: string
  scope: string
  clientId?: string
  clientSecret?: string
}

export const providers: Record<ProviderId, Provider> = {
  strava: {
    id: 'strava',
    authorizeUrl: 'https://www.strava.com/oauth/mobile/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token',
    scope: 'activity:write,read',
    clientId: process.env.STRAVA_CLIENT_ID,
    clientSecret: process.env.STRAVA_CLIENT_SECRET,
  },
  whoop: {
    id: 'whoop',
    authorizeUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    scope: 'offline read:recovery read:cycles read:workout read:sleep read:profile',
    clientId: process.env.WHOOP_CLIENT_ID,
    clientSecret: process.env.WHOOP_CLIENT_SECRET,
  },
  oura: {
    id: 'oura',
    authorizeUrl: 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: 'https://api.ouraring.com/oauth/token',
    scope: 'daily heartrate workout personal',
    clientId: process.env.OURA_CLIENT_ID,
    clientSecret: process.env.OURA_CLIENT_SECRET,
  },
}

export const isConfigured = (p: Provider) => !!(p.clientId && p.clientSecret)

export function providerFor(id: string | null | undefined): Provider | null {
  const p = id && (providers as Record<string, Provider>)[id]
  return p && isConfigured(p) ? p : null
}

/** This deployment's own base URL, for redirect_uri. Set PUBLIC_BASE_URL in production. */
export function baseUrl(req: Request): string {
  return (process.env.PUBLIC_BASE_URL || new URL(req.url).origin).replace(/\/$/, '')
}

export const redirectUri = (req: Request, p: Provider) => `${baseUrl(req)}/api/oauth/${p.id}/callback`

/** Exchange a code or refresh token at the provider. Returns the provider's JSON as is. */
export async function tokenRequest(req: Request, p: Provider, body: Record<string, string>) {
  const form = new URLSearchParams({ client_id: p.clientId!, client_secret: p.clientSecret!, redirect_uri: redirectUri(req, p), ...body })
  const r = await fetch(p.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form })
  const text = await r.text()
  return new Response(text, { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
