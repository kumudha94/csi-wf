# Start Android Emulator + Run App

## List available AVDs

```bash
~/Android/Sdk/emulator/emulator -list-avds
```

## Start emulator (background)

```bash
~/Android/Sdk/emulator/emulator -avd kp_test &
```

## Confirm device is connected

```bash
adb devices
```

## Run Expo/React Native app on the emulator

```bash
cd /home/kgd122/personal/CSI-WF/mobile
npx expo run:android
```

Or, if Metro is already running separately:

```bash
cd /home/kgd122/personal/CSI-WF/mobile
npx expo start
```

then press `a` in the Metro terminal to launch on Android.

## Install a built APK directly instead

```bash
adb install -r /home/kgd122/personal/CSI-WF/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

## Kill emulator

```bash
adb -s emulator-5554 emu kill
```
