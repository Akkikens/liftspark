#!/bin/zsh
# Builds the web app, syncs it into the iOS project, archives (App + Watch + Widgets) and uploads
# to App Store Connect / TestFlight with the ASC API key. Runs on Akshay's Mac only (key lives there).
# Usage: scripts/release.sh [archive|upload|all]   (default all)
set -e
# CocoaPods fails with an encoding error without a UTF-8 locale.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd "$(dirname $0)/.."
KEY_ID=LF4C93857Z
ISSUER=d11a689f-e9b8-4382-9de1-2c512cd35a81
KEY=~/.appstoreconnect/private_keys/AuthKey_$KEY_ID.p8
ARCHIVE=build/Liftspark.xcarchive
AUTH=(-allowProvisioningUpdates -authenticationKeyPath $KEY -authenticationKeyID $KEY_ID -authenticationKeyIssuerID $ISSUER)
step=${1:-all}
if [[ $step == archive || $step == all ]]; then
  (cd app && npm run build:mobile)
  (cd app/ios/App && pod install)
  xcodebuild -workspace app/ios/App/App.xcworkspace -scheme App -configuration Release -destination 'generic/platform=iOS' \
    -archivePath $ARCHIVE "${AUTH[@]}" archive | grep -E "error:|ARCHIVE (SUCCEEDED|FAILED)"
fi
if [[ $step == upload || $step == all ]]; then
  xcodebuild -exportArchive -archivePath $ARCHIVE -exportOptionsPlist scripts/ExportOptions.plist \
    -exportPath build/export "${AUTH[@]}" | grep -E "error:|EXPORT (SUCCEEDED|FAILED)|Upload"
fi
