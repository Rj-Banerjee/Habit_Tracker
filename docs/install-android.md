# Installing the app on an Android phone

These steps install a test build of Habit Tracker, then set up the home-screen widget, the Quick Settings voice tile and Tunnel Vision's phone lock. They work on any Android phone from Android 8 up. Menu names below are from stock Android, with the Samsung and Realme names in brackets where they differ.

## 1. Get the build onto the phone

Pick whichever is easier.

**From an Expo link (cloud builds):**

1. On the phone, open the build's link from [expo.dev](https://expo.dev/accounts/rajdeep26/projects/habit-tracker/builds), or scan its QR code with the camera.
2. Tap **Install**. The phone downloads an `.apk` file.

**From the Mac (local builds, or any `.apk` file):**

1. Copy the `.apk` to the phone: by USB, Google Drive, or by sending it to yourself.
2. Open it from the phone's **Files** app (Samsung: **My Files**).

## 2. Allow the install

Android blocks apps from outside the Play Store until you allow it once for the app that opens the file.

1. When the phone says the install is blocked, tap **Settings**.
2. Turn on **Allow from this source** (Samsung: **Allow from this source**; Realme: **Allow app installs**).
3. Go back and tap **Install**.
4. If Play Protect warns that the app is unknown, tap **More details**, then **Install anyway**. Test builds aren't in the Play Store, so Play Protect doesn't know them.

Installing a newer build over an older one keeps you signed in, as long as both came from this project.

## 3. Sign in

Open **Habit Tracker** and sign in. Use the `+test` account if you want the coach and voice to work, because the AI only answers test accounts while it's on the free tier.

## 4. Add the home-screen widget

1. Touch and hold an empty space on the home screen.
2. Tap **Widgets** (Realme: tap the arrow first, then **Widgets**).
3. Find **Habit Tracker** and drag **Habits today** onto the screen (Samsung: tap it, then **Add**).
4. Tap a habit on the widget to log it without opening the app. The first tap after a while can take a few seconds while the phone wakes the app.

## 5. Add the Quick Settings voice tile

1. Swipe down twice from the top of the screen to open Quick Settings.
2. Tap the **pencil** or **Edit** button (Samsung: the **⋮** menu, then **Edit buttons**).
3. Drag **Log by voice** into the active tiles, then tap **Done** or go back.
4. Tap the tile, hold the button and say something like "I read 10 pages".

## 6. Set up Tunnel Vision's phone lock

The first time you tap **Focus**, the app asks for three permissions:

1. **Usage access:** find **Habit Tracker** in the list and turn it on. This lets the lock see when another app opens.
2. **Display over other apps** (Samsung: **Appear on top**): turn it on for **Habit Tracker**. This lets it bring focus back to the front.
3. **Notifications:** tap **Allow**. This shows the countdown in the notifications and on the lock screen.
4. Come back to the app. **Start** becomes available once all three are on.

While a focus timer runs, the countdown shows in the notifications and on the lock screen, and other apps bounce back to Tunnel Vision. Calls and emergency calls always get through. To finish early, tap **Done my work**, hold the mic and say "done my work", or tap **Stop**.

Phones that save battery hard, Realme and Samsung included, can stop the timer's service in the background. If the countdown disappears with the app closed, set Habit Tracker's battery use to **Unrestricted** (Settings → Apps → Habit Tracker → Battery).

## The review app

**Habit Tracker Review** is a separate test app with the design review and the Animation Playground. It installs next to the real app the same way, and never replaces it.
