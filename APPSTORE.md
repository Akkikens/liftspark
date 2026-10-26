# App Store draft

- **Name:** Liftspark
- **Subtitle (≤30):** `Lifting, heart rate & calories` (30)
- **Category:** Health & Fitness (secondary: Sports)
- **Price:** Free
- **Keywords (≤100):** `gym,workout,strength,weightlifting,heart rate,strain,calories,food,macro,tracker,lifting,hrv`
  No other brands' names in the keyword field (guideline 2.3.7); the description names the
  integrations instead.
- **Privacy policy URL:** host PRIVACY.md (GitHub Pages or the repo once public); the same text is in
  the app at Settings → This phone → Privacy policy.
- **Encryption:** `ITSAppUsesNonExemptEncryption = NO` (HTTPS only).
- **Devices:** iPhone only for v1 (`TARGETED_DEVICE_FAMILY = 1`).

## Description

Lift with a plan, see every rep's effort, and keep your calories honest.

Liftspark guides your workouts set by set, with progression that adds weight when you're ready.
Connect your Apple Watch or any Bluetooth heart-rate strap (or a watch that broadcasts heart rate) and watch your live
heart rate and zones while you train. Every session gets a strain score, time in zones and the
calories it burned.

FUEL
Log food by search or barcode, track protein, carbs and fat, and see what's left for the day.

APPLE HEALTH & STRAVA
Workouts, weigh-ins and food go to Apple Health; Strava imports your workouts from there. Share a
card with the muscles you worked and your stats straight to your post.

WEARABLES
Apple Watch, plus any Bluetooth heart-rate strap or watch that broadcasts heart rate, such as Polar,
Wahoo and Garmin. Sleep and resting heart rate from other wearables come in through Apple Health.

PRIVATE
No account. Your training data stays on your phone.

Liftspark is open source (AGPL) and built on openGym by Duarte Santos.

## Privacy label

- **Health & Fitness:** heart rate, workouts, active energy, body weight, dietary energy.
  - Read from and written to Apple Health on the device only.
  - Not collected by the developer, not linked to the user, not used for tracking.
  - **HealthKit data is never used for advertising or sold**, and never leaves the device. Strava
    gets workouts through Apple Health itself, not from Liftspark.
- **Data not collected:** no analytics, no account, no ads SDK.
- **Third parties:**
  - Food searches go to Open Food Facts (real time, nothing retained).
  - Strava, WHOOP and Oura sign-in is hidden in 1.0: the backend that exchanges OAuth codes is not
    deployed, and the app only shows integrations the backend reports as configured.
  - Hevy import (optional) sends the user's own Hevy API key to Hevy's API to fetch their history.

## Review notes

- **HealthKit** reads heart rate, energy, steps and weight, and writes workouts, weight and dietary
  energy, all on the device. To test: Settings → Devices & Health → Sync with Apple Health.
- **Bluetooth** is used only for heart-rate sensors (standard Heart Rate Service). To test without a
  strap, workouts run normally and show "Add live heart rate".
- **iCloud sync (optional, off by default)** stores Liftspark's own records in the user's private
  CloudKit database. Nothing read from HealthKit goes there (guideline 5.1.3): Health-imported
  weigh-ins and sessions, Health-sourced daily values and the heart-rate/energy figures Health gave a
  workout are excluded by `lib/ls-icloud.js` before upload.
- **No login.**
- **Background modes:** `bluetooth-central` keeps a paired heart-rate strap streaming while the
  phone is locked during a workout. `workout-processing` is for the optional iOS 26 iPhone workout
  session (the Watch app runs its own session and sends heart rate over WatchConnectivity).
- **Privacy manifest:** PrivacyInfo.xcprivacy declares UserDefaults (CA92.1, the paired sensor) and
  file timestamps (C617.1, Capacitor Filesystem); no tracking, no collected data types.
- **Strava** works through Apple Health; direct posting appears only when configured.
