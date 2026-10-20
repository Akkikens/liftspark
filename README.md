# Liftspark

An iPhone strength-training app with live heart rate, strain, calories in and out, and sharing to
Strava.

**Liftspark is built on [openGym](https://github.com/DuarteSantos8/openGym) by Duarte Santos, used
with permission, AGPL-3.0.** openGym's plans, guided workouts, set logging, progression and stats are
the core; Liftspark adds a new design, wearables, food logging and Strava. See [NOTICE.md](NOTICE.md).

## What it does

- **Plans and guided workouts** (from openGym): weekly plans, rest timers, progression and 1RM
  estimates, history and stats.
- **Live heart rate during workouts:** any Bluetooth LE heart-rate sensor (standard Heart Rate Service
  0x180D: Polar, Wahoo and Garmin straps, WHOOP or Garmin with heart-rate broadcast on), or the
  Apple Watch through HealthKit.
- **Strain, zones and calories:** a 0–21 strain score from heart-rate zones (Edwards TRIMP), time in
  five zones, and calories from heart rate (Keytel) or METs when there is none.
- **Apple Health:** finished workouts (with heart rate, calories and strain), weigh-ins and food go
  to Health; activity, steps, resting heart rate and watch workouts come back.
- **Fuel:** food search and barcode scanning (Open Food Facts), quick add, meals, macros, and a
  daily goal from your profile.
- **Strava:** workouts reach Strava through Apple Health (Strava imports them). "Share to Strava"
  makes an image with a body map of the muscles worked and copies a caption with strain, heart rate,
  zones and sets. Direct posting through Strava's API turns on when the backend has Strava keys.
- **WHOOP and Oura:** recovery, readiness, HRV and sleep on Home, when the backend has their keys.

## Layout

| Path | What |
|---|---|
| `app/` | The app: React 19 + Vite, wrapped by Capacitor 7 for iOS (`app/ios`) |
| `app/ios/App/App/*Plugin.swift` | Native plugins: HealthKit, Bluetooth heart rate, OAuth sign-in, barcode scanner |
| `app/src/lib/strain.js`, `fuel.js`, `ls-workout.js`, `share-card.js`, `muscle-map.js`, `integrations.js` | Liftspark's logic |
| `app/src/theme.css` | The design system (tokens, type, components) |
| `api/` | Code shared with openGym's server that the app imports (coach core, sync stamps) |
| `backend/` | Vercel functions for OAuth token exchange (Strava, WHOOP, Oura) |
| `scripts/` | Exercise pictures from free-exercise-db, icon generation |

## Build

```sh
cd app
npm install
npm test                 # vitest (TZ=UTC)
npm run build:mobile     # vite build + cap sync ios
cd ios/App && pod install
open App.xcworkspace     # team JFNPZ2JF6V, bundle id com.akkikens.liftspark
```

The backend: `cd backend && npm install && npx tsc --noEmit`, deploy with Vercel, and set the
variables from `backend/.env.example`. The app reads the backend URL from `VITE_LS_BACKEND`
(default `https://liftspark-api.vercel.app`).

## Licence

AGPL-3.0-or-later, like openGym. openGym's app store exception (NOTICE.md) covers distribution
through the App Store while the source stays available here.
