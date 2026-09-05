# Build Local Android APK (Gradle)

Path: `/home/kgd122/personal/CSI-WF/mobile/android`

## Debug APK

```bash
cd /home/kgd122/personal/CSI-WF/mobile/android
./gradlew assembleDebug
```

Output:

``` bash
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

## Release APK

```bash
cd /home/kgd122/personal/CSI-WF/mobile/android
./gradlew assembleRelease
```

Output:

``` bash
mobile/android/app/build/outputs/apk/release/app-release.apk
```

## Clean build (if stale build issues)

```bash
cd /home/kgd122/personal/CSI-WF/mobile/android
./gradlew clean
./gradlew assembleDebug
```

## Install directly on connected device/emulator

```bash
adb install -r /home/kgd122/personal/CSI-WF/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

## Notes

- Backend URL is baked in from `mobile/.env` (`EXPO_PUBLIC_API_URL`) at build time. Only rebuild if that value changes — a backend redeploy to the same URL does not require a rebuild.
- No EAS build configured (`eas.json` doesn't exist) — this Gradle path is the actual build path, not a fallback.
