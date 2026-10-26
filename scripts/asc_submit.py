#!/usr/bin/python3
"""Attaches a processed build to the editable version and submits it to App Review.
Only run with Akshay's explicit go (CLAUDE.md).
Usage: /usr/bin/python3 scripts/asc_submit.py BUILD_NUMBER"""
import os
import sys
import warnings

warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.expanduser("~/Documents/GitHub/appstore-tools"))
import asc  # noqa: E402

APP = "6824785119"
build_number = sys.argv[1]

builds = asc.get("/v1/builds", **{"filter[app]": APP, "filter[version]": build_number})["data"]
assert builds, f"no build {build_number}"
build = builds[0]
state = build["attributes"]["processingState"]
assert state == "VALID", f"build {build_number} is {state}"
print("build", build_number, state)

version = next(v for v in asc.get(f"/v1/apps/{APP}/appStoreVersions")["data"]
               if v["attributes"]["appStoreState"] in ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED"))
vid = version["id"]
asc.patch(f"/v1/appStoreVersions/{vid}/relationships/build", {"data": {"type": "builds", "id": build["id"]}})
attached = asc.get(f"/v1/appStoreVersions/{vid}/build")["data"]["attributes"]["version"]
print("attached build", attached, "to", version["attributes"]["versionString"], version["attributes"].get("releaseType"))

# Reuse an open submission if one exists, otherwise start one.
open_subs = asc.get("/v1/reviewSubmissions", **{"filter[app]": APP, "filter[state]": "READY_FOR_REVIEW"})["data"]
if open_subs:
    sub = open_subs[0]
else:
    sub = asc.post("/v1/reviewSubmissions", {"data": {"type": "reviewSubmissions", "attributes": {"platform": "IOS"},
                   "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})["data"]
print("submission", sub["id"])

items = asc.get(f"/v1/reviewSubmissions/{sub['id']}/items")["data"]
if not any(i.get("relationships", {}).get("appStoreVersion", {}).get("data") for i in items):
    asc.post("/v1/reviewSubmissionItems", {"data": {"type": "reviewSubmissionItems",
             "relationships": {"reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sub["id"]}},
                               "appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}}}})
    print("added version 1.0")

asc.patch(f"/v1/reviewSubmissions/{sub['id']}", {"data": {"type": "reviewSubmissions", "id": sub["id"],
          "attributes": {"submitted": True}}})
final = asc.get(f"/v1/reviewSubmissions/{sub['id']}")["data"]["attributes"]
print("submission state", final.get("state"))
v = asc.get(f"/v1/appStoreVersions/{vid}")["data"]["attributes"]
print("version state", v["appStoreState"])
