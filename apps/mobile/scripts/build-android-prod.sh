#!/usr/bin/env bash
# Builds and installs "soniroll prod" — the same app as the local preview build, but a separate
# Android app (com.jackmechem.sheddex.prod, named "soniroll prod") pointed at the *production*
# Convex deployment, so it can sit on the phone next to the dev-data app.
#
# It copies the prebuilt android/ project to android-prod/ (both gitignored), patches the
# application id, launcher name and link scheme, then builds the release APK with
# EXPO_PUBLIC_CONVEX_URL set to production (a real env var beats .env.local when Expo bundles).
# Re-run it after any change — it re-syncs android-prod/ from android/ first.
#
# For a public download (the alpha on GitHub and soniroll.com/download): APP_NAME=soniroll and
# ARCHS=arm64-v8a,armeabi-v7a (phones only, no emulator x86 — a much smaller file), with
# --no-install.
set -euo pipefail
cd "$(dirname "$0")/.."

PROD_URL="https://grandiose-dolphin-564.convex.cloud"
APP_NAME="${APP_NAME:-soniroll prod}"
ARCHS="${ARCHS:-armeabi-v7a,arm64-v8a,x86,x86_64}"
: "${ANDROID_HOME:=/nix/store/9snh3iqakna0nlx1xrsdvjbpa0nzkrxd-androidsdk/libexec/android-sdk}"
export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME" NODE_ENV=production EXPO_PUBLIC_CONVEX_URL="$PROD_URL"

mkdir -p android-prod
# Sync sources only — never the dev build's outputs/caches.
tar -C android --exclude='./app/build' --exclude='./build' --exclude='./.gradle' --exclude='./app/.cxx' -cf - . | tar -C android-prod -xf -

sed -i "s/applicationId 'com.jackmechem.sheddex'/applicationId 'com.jackmechem.sheddex.prod'/" android-prod/app/build.gradle
sed -i "s|<string name=\"app_name\">soniroll</string>|<string name=\"app_name\">$APP_NAME</string>|" android-prod/app/src/main/res/values/strings.xml
sed -i 's|android:scheme="sheddex"|android:scheme="sheddex-prod"|; s|android:scheme="exp+sheddex"|android:scheme="exp+sheddex-prod"|' android-prod/app/src/main/AndroidManifest.xml
grep -q "com.jackmechem.sheddex.prod" android-prod/app/build.gradle || { echo "couldn't set the prod application id" >&2; exit 1; }

cd android-prod
./gradlew assembleRelease -q -PreactNativeArchitectures="$ARCHS" -Dorg.gradle.jvmargs="-Xmx4096m -XX:MaxMetaspaceSize=1024m"
APK=app/build/outputs/apk/release/app-release.apk
if [[ "${1:-}" != "--no-install" ]]; then
  nix shell nixpkgs#android-tools -c adb install -r "$APK"
fi
echo "Built $(pwd)/$APK"
