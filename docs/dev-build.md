# Development build

Expo Go can't include `expo-speech-recognition`, so hold-to-talk needs a build of your own. The app still runs in Expo Go, where the keyboard's mic is the fallback.

## What it costs

| | iPhone | Android |
| --- | --- | --- |
| Account | Paid Apple Developer Program, about US$99 a year | None needed. Google Play isn't involved |
| Expo account | Free | Free |
| Installs | On registered devices only | As an APK on any phone |

The free Expo plan includes EAS builds, with a monthly limit and a queue. A free Apple ID only works with a local build, and that needs Xcode, which this Mac doesn't have.

## One-time setup

```
cd "/Users/rajdeep/Documents/vs code/Habit tracker/mobile"
npm install --global eas-cli
eas login
eas init
```

`eas init` adds a project ID and owner to `app.json`. Commit that.

The free Expo plan queues builds, so the first one can take a while. Only the native app is built: your code still loads from this Mac, so keep `npm run ai` and Expo running, and stay on the same Wi-Fi.

## Android

1. Run `eas build --platform android --profile development`. Press Return to accept the package name, and Y to generate a keystore.
2. When it finishes, open the build page and tap **Install**, or scan its QR code with your phone.
3. Open the downloaded APK. If you see an unsafe app warning, choose **Install anyway**.

## iPhone

Needs the paid Apple account.

1. Turn on Developer Mode on the phone: Settings > Privacy & Security > Developer Mode (it appears after the first install attempt).
2. Run `eas device:create`, sign in with your Apple ID, choose **Website**, open the link on the phone, then install the profile from Settings.
3. Run `eas build --platform ios --profile development`. Accept the defaults, and select your device.
4. Scan the **Install** QR code on the build page.

## Run it

1. `npm run ai` from the repo root.
2. `npx expo start -c` from `mobile/`. With the dev client installed this targets your build, so open your build rather than Expo Go.
3. For Expo Go, use `npx expo start --go -c` instead.

You only rebuild when native code changes. App code still loads from your Mac.

## Preview build

The development build loads its JavaScript from this Mac. A widget has to run with the app closed, so testing one needs the preview build, which carries its code inside. It has the same app ID, so installing one replaces the other.

```
npx eas-cli build --platform android --profile preview
```

Its settings come from the `preview` environment on EAS, not `mobile/.env`. `EXPO_PUBLIC_AI_URL` there is this Mac's address, so if that changes, update it and rebuild. The coach also needs `npm run ai` running. Logging, Today and the widget don't.

