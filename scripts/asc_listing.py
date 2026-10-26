#!/usr/bin/python3
"""Pushes Liftspark's 1.0 listing to App Store Connect (description from APPSTORE.md): name, subtitle,
privacy URL, category, age rating (4+), description, keywords, promo text, URLs, copyright,
content rights, free price, all territories, the 5 APP_IPHONE_67 screenshots and the review
details. Safe to re-run: it updates in place and replaces the screenshot set. The price schedule
already exists (free), so it is left alone. Adapted from Breakthru's scripts/asc_listing.py.
Usage: /usr/bin/python3 scripts/asc_listing.py"""
import hashlib
import os
import re
import sys
import warnings

warnings.filterwarnings("ignore")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.expanduser("~/Documents/GitHub/appstore-tools"))
import asc  # noqa: E402
import requests  # noqa: E402

BUNDLE = "com.akkikens.liftspark"
SITE = "https://liftspark.vercel.app"
md = open(os.path.join(ROOT, "APPSTORE.md")).read()
NAME = "Liftspark"
SUBTITLE = "Lifting, heart rate & calories"
KEYWORDS = re.search(r"Keywords \(\S+\):\*\* `([^`]+)`", md).group(1)
DESCRIPTION = md.split("## Description\n\n")[1].split("\n## ")[0].strip()
# Hard-wrapped paragraphs in the draft read as one line each in the store.
DESCRIPTION = "\n\n".join(p.replace("\n", " ") if not p.isupper() else p for p in DESCRIPTION.split("\n\n"))
DESCRIPTION = re.sub(r"^([A-Z &]+) ", r"\1\n", DESCRIPTION, flags=re.M)
PROMO = "Plans, live heart rate and a strain score for every lift, plus calories in and out. Free, open source, no account."
NOTES = """Liftspark is free, has no account, no ads and no in-app purchases. It is open source (AGPL v3): https://github.com/Akkikens/liftspark

HealthKit: reads heart rate, energy, steps, weight, resting heart rate, HRV and sleep, and writes workouts, weigh-ins and dietary energy, all on the device. To test: Settings, Devices & Health, Sync with Apple Health.

Bluetooth: used only for heart-rate sensors (standard Heart Rate Service). Without a strap, workouts run normally and show "Add live heart rate".

Apple Watch app: runs its own workout session (workout-processing) and sends heart rate to the phone over WatchConnectivity.

iCloud sync is optional and off by default. It stores Liftspark's own records in the user's private CloudKit database. Nothing read from HealthKit goes there (guideline 5.1.3): Health imports, Health-sourced daily values, and the heart rate and energy figures from Health or Apple Watch are removed before upload.

Strava, WHOOP and Oura sign-in are not offered in this version; Strava gets workouts through Apple Health. Food search uses Open Food Facts.

Background mode bluetooth-central keeps a paired heart-rate strap streaming while the phone is locked during a workout."""
for label, text, limit in [("name", NAME, 30), ("subtitle", SUBTITLE, 30), ("keywords", KEYWORDS, 100),
                           ("promo", PROMO, 170), ("description", DESCRIPTION, 4000)]:
    assert len(text) <= limit, f"{label} is {len(text)} > {limit}"
    assert "—" not in text and "–" not in text, f"dash in {label}"

app = asc.get("/v1/apps", **{"filter[bundleId]": BUNDLE})["data"][0]
app_id = app["id"]
print("app", app_id)

# Content rights on the app.
asc.patch(f"/v1/apps/{app_id}", {"data": {"type": "apps", "id": app_id,
                                          "attributes": {"contentRightsDeclaration": "DOES_NOT_USE_THIRD_PARTY_CONTENT"}}})

# App info: the editable one.
info = next(i for i in asc.get(f"/v1/apps/{app_id}/appInfos")["data"]
            if i["attributes"]["state"] in ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "WAITING_FOR_REVIEW", "REJECTED"))
asc.patch(f"/v1/appInfos/{info['id']}", {"data": {"type": "appInfos", "id": info["id"], "relationships": {
    "primaryCategory": {"data": {"type": "appCategories", "id": "HEALTH_AND_FITNESS"}},
    "secondaryCategory": {"data": {"type": "appCategories", "id": "SPORTS"}}}}})
for loc in asc.get(f"/v1/appInfos/{info['id']}/appInfoLocalizations")["data"]:
    if loc["attributes"]["locale"] == "en-US":
        asc.patch(f"/v1/appInfoLocalizations/{loc['id']}", {"data": {"type": "appInfoLocalizations", "id": loc["id"],
                  "attributes": {"name": NAME, "subtitle": SUBTITLE, "privacyPolicyUrl": f"{SITE}/privacy"}}})
print("name, subtitle, category, privacy url")

# Age rating: nothing objectionable, 4+.
ar = asc.get(f"/v1/appInfos/{info['id']}/ageRatingDeclaration")["data"]
BOOLS = {"advertising", "gambling", "healthOrWellnessTopics", "lootBox", "messagingAndChat", "parentalControls",
         "ageAssurance", "socialMedia", "socialMediaAgeRestricted", "unrestrictedWebAccess", "userGeneratedContent"}
FREQ = {"alcoholTobaccoOrDrugUseOrReferences", "contests", "gamblingSimulated", "gunsOrOtherWeapons",
        "medicalOrTreatmentInformation", "profanityOrCrudeHumor", "sexualContentGraphicAndNudity", "sexualContentOrNudity",
        "horrorOrFearThemes", "matureOrSuggestiveThemes", "violenceCartoonOrFantasy",
        "violenceRealisticProlongedGraphicOrSadistic", "violenceRealistic"}
attrs = {k: False for k in BOOLS if k in ar["attributes"]}
attrs.update({k: "NONE" for k in FREQ if k in ar["attributes"]})
attrs.update({"ageRatingOverrideV2": "NONE", "koreaAgeRatingOverride": "NONE"})
# A training and nutrition app: health and wellness topics, honestly answered. No medical info.
if "healthOrWellnessTopics" in ar["attributes"]:
    attrs["healthOrWellnessTopics"] = True
asc.patch(f"/v1/ageRatingDeclarations/{ar['id']}", {"data": {"type": "ageRatingDeclarations", "id": ar["id"], "attributes": attrs}})
print("age rating 4+")

# Version 1.0: copyright, release after approval, localization.
version = next(v for v in asc.get(f"/v1/apps/{app_id}/appStoreVersions")["data"]
               if v["attributes"]["appStoreState"] == "PREPARE_FOR_SUBMISSION")
vid = version["id"]
asc.patch(f"/v1/appStoreVersions/{vid}", {"data": {"type": "appStoreVersions", "id": vid,
          "attributes": {"copyright": "2026 Akshay Kalapgar", "releaseType": "AFTER_APPROVAL"}}})
vloc = next(l for l in asc.get(f"/v1/appStoreVersions/{vid}/appStoreVersionLocalizations")["data"]
            if l["attributes"]["locale"] == "en-US")
asc.patch(f"/v1/appStoreVersionLocalizations/{vloc['id']}", {"data": {"type": "appStoreVersionLocalizations", "id": vloc["id"],
          "attributes": {"description": DESCRIPTION, "keywords": KEYWORDS, "promotionalText": PROMO,
                         "marketingUrl": SITE, "supportUrl": f"{SITE}/support"}}})
print("description, keywords, promo, urls, copyright")

# Review details.
review = {"contactFirstName": "Akshay", "contactLastName": "Kalapgar", "contactPhone": "+17746969534",
          "contactEmail": "hello@getwingline.com", "demoAccountRequired": False, "notes": NOTES}
existing = asc.get(f"/v1/appStoreVersions/{vid}/appStoreReviewDetail").get("data")
if existing:
    asc.patch(f"/v1/appStoreReviewDetails/{existing['id']}", {"data": {"type": "appStoreReviewDetails", "id": existing["id"],
              "attributes": review}})
else:
    asc.post("/v1/appStoreReviewDetails", {"data": {"type": "appStoreReviewDetails", "attributes": review,
             "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}}}})
print("review details")

# Every territory, and new ones as they come.
territories = [t["id"] for t in asc.get("/v1/territories", limit=200)["data"]]
try:
    asc.post("/v2/appAvailabilities", {"data": {"type": "appAvailabilities", "attributes": {"availableInNewTerritories": True},
             "relationships": {"app": {"data": {"type": "apps", "id": app_id}},
                               "territoryAvailabilities": {"data": [{"type": "territoryAvailabilities", "id": f"${{{t}}}"} for t in territories]}}},
             "included": [{"type": "territoryAvailabilities", "id": f"${{{t}}}", "attributes": {"available": True},
                           "relationships": {"territory": {"data": {"type": "territories", "id": t}}}} for t in territories]})
    print(f"available in {len(territories)} territories")
except SystemExit as e:
    if "409" in str(e):
        print("availability already set")
    else:
        raise

# Screenshots: replace the 6.9 inch set.
sets = asc.get(f"/v1/appStoreVersionLocalizations/{vloc['id']}/appScreenshotSets")["data"]
shot_set = next((s for s in sets if s["attributes"]["screenshotDisplayType"] == "APP_IPHONE_67"), None)
if shot_set:
    for s in asc.get(f"/v1/appScreenshotSets/{shot_set['id']}/appScreenshots")["data"]:
        asc.call("DELETE", f"/v1/appScreenshots/{s['id']}")
else:
    shot_set = asc.post("/v1/appScreenshotSets", {"data": {"type": "appScreenshotSets",
                        "attributes": {"screenshotDisplayType": "APP_IPHONE_67"},
                        "relationships": {"appStoreVersionLocalization": {"data": {"type": "appStoreVersionLocalizations", "id": vloc["id"]}}}}})["data"]
for k in range(1, 6):
    path = os.path.join(ROOT, f"docs/appstore/6.9/{k}.png")  # composed by scripts/appstore.py
    data = open(path, "rb").read()
    shot = asc.post("/v1/appScreenshots", {"data": {"type": "appScreenshots",
                    "attributes": {"fileName": f"liftspark-{k}.png", "fileSize": len(data)},
                    "relationships": {"appScreenshotSet": {"data": {"type": "appScreenshotSets", "id": shot_set["id"]}}}}})["data"]
    for op in shot["attributes"]["uploadOperations"]:
        headers = {h["name"]: h["value"] for h in op.get("requestHeaders", [])}
        requests.request(op["method"], op["url"], headers=headers,
                         data=data[op["offset"]:op["offset"] + op["length"]]).raise_for_status()
    asc.patch(f"/v1/appScreenshots/{shot['id']}", {"data": {"type": "appScreenshots", "id": shot["id"],
              "attributes": {"uploaded": True, "sourceFileChecksum": hashlib.md5(data).hexdigest()}}})
    print("screenshot", k)
print("done")
