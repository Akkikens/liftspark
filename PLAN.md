# Liftspark plan

## Done (v1, on-device)

- **Base:** openGym 1.4.1's app in its standalone mobile mode (no server). Duarte Santos gave
  permission to build on it; AGPL notices, credits in README, NOTICE and Settings → About.
- **Rebrand:**
  - Liftspark name, bundle id `com.akkikens.liftspark` (team JFNPZ2JF6V, automatic signing).
  - Generated icon and splash (`scripts/make-icons.py`), new onboarding.
  - Server pairing, passkey sign-in, analytics and Ko-fi/Discord links are gone from the app.
- **Design system** (`app/src/theme.css`): ink-blue base, chalk text, and an ember-to-magenta
  "spark" used only for the primary action, live HR and strain. Barlow Condensed for titles and
  numbers, Barlow for body text, bundled offline. Fixed heart-rate zone colours. Light theme too.
- **Exercise pictures:** every Gym visual still and animation was removed.
  - 698 catalogue exercises now show free-exercise-db pictures (public domain) as two-frame loops,
    matched by name and equipment, with hand-checked overrides for the staple lifts.
  - The rest show the neutral tile; a wrong picture is never shown.
- **Live heart rate:**
  - Native Bluetooth LE plugin (`HeartRateBLEPlugin.swift`) for the standard Heart Rate Service
    0x180D/0x2A37. It scans, remembers the device, reconnects automatically, has a background mode
    and parses RR intervals.
  - Apple Watch via HealthKit (`HealthKitPlugin.swift`): an iPhone `HKWorkoutSession` with live
    builder on iOS 26+, or `HKAnchoredObjectQuery` on new heart-rate samples.
  - Live dock on the workout screen with zone and time-in-zones bar; samples stored per workout,
    downsampled to 5 s.
- **Strain, zones, calories** (`lib/strain.js`):
  - Five zones, Karvonen when resting HR is known, else of max HR.
  - Edwards TRIMP mapped to a 0–21 strain score.
  - Calories: Keytel from heart rate, METs as fallback, and Health's active energy when the watch
    recorded the session (read back on the finish screen).
- **Apple Health:** openGym's Health Connect sync layer now drives a HealthKit plugin under the same
  interface.
  - Writes workouts as `HKWorkout` (with energy, HR samples and strain metadata), plus weigh-ins and
    dietary energy.
  - Reads today's active and resting energy, steps, weight and resting HR.
- **Fuel** (`views/Fuel.jsx`, `lib/fuel.js`):
  - Open Food Facts search and barcode lookup through a native AVFoundation/Vision scanner (Google
    ML Kit removed), quick add, meals and macros.
  - Mifflin–St Jeor goal with activity and objective, active calories added back.
- **Strava, two layers:**
  1. **Default, no API keys:** finished workouts go to Apple Health; Strava's iOS app imports Health
     workouts (Strava → You → Settings → Applications, Services, and Devices → Health). Devices &
     Health explains the steps. "Share to Strava" opens the share sheet with a 1080×1350 card (strain,
     time, kcal, HR, zones, body map front/back) and copies a caption (strain, HR avg/max, zones,
     calories, sets, muscle groups with ●●● intensity, exercises).
  2. **Optional direct posting:** shown only when the backend has `STRAVA_CLIENT_ID`/`SECRET`
     (Strava now requires a paid subscription to create an API app). OAuth via
     ASWebAuthenticationSession, token exchange on the backend, then
     `POST /api/v3/activities` (WeightTraining) with the caption. Strava's API does not accept
     photos from third-party apps, so the image always goes through the share sheet.
- **WHOOP v2 and Oura v2:** OAuth through the backend (`backend/`), shown only when configured.
  Home shows WHOOP recovery/HRV or Oura readiness/sleep.
- **Backend** (`backend/`, Vercel):
  - `/api/config` reports which providers have keys.
  - `/api/oauth/:provider/{start,callback,token,refresh}` (plus `/api/strava/{token,refresh}`
    aliases).
  - Secrets come only from env; see `.env.example`.
- **Tests:** all 389 files pass (`npm test`, TZ=UTC), including new tests for strain, zones,
  calories, food, muscles and the body map. Tests tied to openGym's server, Android shell and
  catalogue folders were removed.

## Next

1. **Real-device QA:**
   - BLE pairing with a strap, WHOOP broadcast and Garmin broadcast; background reconnect mid-workout.
   - iPhone `HKWorkoutSession` with a paired Apple Watch on iOS 26.
   - HealthKit permissions; Strava import from Health; the barcode scanner.
2. **Native watchOS app:** start and log sets from the wrist, run the `HKWorkoutSession` on the watch,
   stream HR to the phone (WatchConnectivity). That replaces today's phone-side session/sample
   reading.
3. **Garmin direct:** Garmin's Health/Connect APIs require business approval. Until then Garmin
   arrives through Apple Health (post-workout) and BLE heart-rate broadcast (live).
4. **Wearable depth:** WHOOP workouts and sleep into history, Oura heart rate during sessions, and
   using recovery to suggest a lighter or harder day in the plan.
5. **Exercise pictures:** match more of the catalogue (manual mapping for the most-used 300
   exercises), or commission/license Liftspark's own animations.
6. **Backend deploy:**
   - Create the Vercel project (personal scope) and set `PUBLIC_BASE_URL`.
   - Register WHOOP/Oura apps with redirect `https://<backend>/api/oauth/<provider>/callback`; same
     for Strava if a paid API app is created (callback domain = backend host).
   - Set `VITE_LS_BACKEND` for the app build.
7. **App Store prep:**
   - Screenshots, privacy label (APPSTORE.md), HealthKit review notes (HealthKit data is never used
     for ads or sold).
   - App Store Connect record "Liftspark".
   - Archive with the HealthKit capability enabled on the App ID.
8. **Clean-up:** prune openGym server/passkey code paths that the iOS app never reaches, and
   translate Liftspark's new strings (English only for now).
