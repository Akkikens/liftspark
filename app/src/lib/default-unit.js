// Which weight unit a profile that has not chosen one starts in. Gyms in the US, Canada, Liberia and
// Myanmar load plates in pounds, so a new profile there starts in lb; everywhere else starts in kg.
// Only a profile started from nothing on this device (freshState) uses it: an existing profile
// keeps whatever it has, and the unit can still be switched in Settings or during onboarding.
const LB_REGIONS = new Set(['US', 'CA', 'LR', 'MM'])

/** 'lb' or 'kg' for a language tag such as 'en-US'; no region in the tag means kg. */
export function unitForLocale(tag) {
  if (typeof tag !== 'string') return 'kg'
  const region = tag.trim().replace(/_/g, '-').split('-').slice(1).find(p => /^[A-Za-z]{2}$/.test(p))
  return region && LB_REGIONS.has(region.toUpperCase()) ? 'lb' : 'kg'
}

/** The device's own answer, from the first of its languages that names a region. */
export function detectedUnit() {
  try {
    const tags = navigator.languages?.length ? navigator.languages : [navigator.language]
    for (const tag of tags) { const u = unitForLocale(tag); if (u === 'lb') return u }
    const region = new Intl.DateTimeFormat().resolvedOptions().locale
    return unitForLocale(region)
  } catch (e) { return 'kg' }
}
