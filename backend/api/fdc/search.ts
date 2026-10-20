// GET /api/fdc/search?q=… → USDA FoodData Central generic foods (Foundation and SR Legacy, public
// domain), so the app can offer "chicken breast, raw" next to Open Food Facts' packaged products.
// The API key (FDC_API_KEY) stays here; without one this answers 404 and the app skips it.
export async function GET(req: Request): Promise<Response> {
  const key = process.env.FDC_API_KEY
  if (!key) return new Response('Not configured', { status: 404 })
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 80)
  if (q.length < 2) return Response.json({ foods: [] })
  const u = new URL('https://api.nal.usda.gov/fdc/v1/foods/search')
  u.searchParams.set('api_key', key)
  u.searchParams.set('query', q)
  u.searchParams.set('dataType', 'Foundation,SR Legacy')
  u.searchParams.set('pageSize', '12')
  const r = await fetch(u)
  if (!r.ok) return new Response('Upstream error', { status: 502 })
  const j = (await r.json()) as { foods?: Array<Record<string, unknown>> }
  const foods = (j.foods || []).map(f => ({
    fdcId: f.fdcId, description: f.description,
    foodNutrients: ((f.foodNutrients as Array<Record<string, unknown>>) || [])
      .filter(n => ['203', '204', '205', '208'].includes(String(n.nutrientNumber)))
      .map(n => ({ nutrientNumber: String(n.nutrientNumber), value: n.value })),
  }))
  return Response.json({ foods }, { headers: { 'Cache-Control': 'public, max-age=86400' } })
}
