# Liftspark privacy policy

_Last updated: 25 October 2026_

Liftspark is a workout, heart-rate and calorie tracker. It has no account and no Liftspark cloud.

## What stays on your phone

Everything you log (workouts, plans, body weight, food, settings, and heart-rate traces from a
Bluetooth sensor) is stored on your iPhone. It leaves the phone only when you export a backup,
share a workout, or turn on iCloud sync (your own private iCloud database, which the developer
cannot read).

## Apple Health

With your permission Liftspark reads heart rate, workouts, active energy, steps, weight, resting
heart rate, HRV and sleep, and writes workouts, weigh-ins and food energy. Health data:

- is used only to show your training, recovery and calorie numbers in the app;
- is never sent to the developer, never used for advertising or marketing, and never sold;
- is not stored in Liftspark's backups or exports (only summaries such as a workout's average heart
  rate are kept on the workout);
- is never copied to iCloud sync: weigh-ins and sessions imported from Health, and the heart-rate
  and energy figures Health gives a workout, stay on the phone.

## Services you choose to use

- **Food search and barcodes** go to [Open Food Facts](https://world.openfoodfacts.org) (and, for
  generic foods, USDA FoodData Central). Only the search text or barcode is sent.
- **Strava, WHOOP and Oura sign-in**, when offered, contacts those services only after you sign in.
  The sign-in passes through Liftspark's small backend, which exchanges the one-time code for tokens
  and keeps no database; the tokens are kept in your iPhone's Keychain. Data imported from WHOOP or
  Oura stays on your phone.
- **Generic food search** goes through the same backend to USDA FoodData Central, so your search
  text passes through it. Like any web service, the backend's host keeps short-lived request logs
  that can include request addresses; nothing is stored beyond that.
- **Hevy import** sends the Hevy API key you enter to Hevy, only to fetch your workout history.

## What the developer collects

Nothing. No analytics, no advertising SDKs, no tracking, no crash reporting.

## Deleting your data

Settings → Data & backup → Reset everything deletes all Liftspark data on the phone, signs you out
of connected services and forgets paired sensors. Deleting the app does the same. Data already
written to Apple Health can be removed in the Health app.

## Contact

Questions: email hello@getwingline.com or open an issue at https://github.com/Akkikens/liftspark/issues.

## Source code

Liftspark is open source under the GNU AGPL v3.0. The full source is at
https://github.com/Akkikens/liftspark.
