# OMLU Operations Android App

This Flutter app is a secure Android WebView wrapper for the existing deployed OMLU website. It does not duplicate the website UI. Staff, kitchen, admin, owner, authentication, cookies, local storage, sessions, and role-based redirects remain owned by the web application.

## Requirements

- Flutter stable SDK 3.41.9 or newer
- Android Studio with Android SDK Platform Tools
- Java 17
- A physical Android device or Android emulator

## Install Flutter on macOS

```bash
brew install --cask flutter
flutter doctor
flutter doctor --android-licenses
```

If you already use a manually installed Flutter SDK, ensure `flutter/bin` is on your `PATH`.

## Install Dependencies

From this directory:

```bash
cd mobile-app/omlu_operations
flutter pub get
```

## Configuration

The app reads its target website from Dart defines:

```bash
--dart-define=OMLU_APP_URL=https://omlu.vercel.app
```

Optional:

```bash
--dart-define=OMLU_ALLOWED_DOMAINS=omlu.vercel.app,admin.omlu.example
--dart-define=OMLU_ALLOW_HTTP=true
```

`OMLU_ALLOW_HTTP=true` is for local development only. Production builds should use HTTPS URLs and omit it.

## Run on a Physical Android Device

1. Enable Developer Options on the phone.
2. Enable USB debugging.
3. Connect the phone by USB.
4. Confirm the device appears:

```bash
flutter devices
```

Run:

```bash
flutter run \
  --dart-define=OMLU_APP_URL=https://omlu.vercel.app
```

## Run on an Android Emulator

1. Open Android Studio.
2. Create or start an Android Virtual Device.
3. Confirm it appears:

```bash
flutter devices
```

Run:

```bash
flutter run \
  --dart-define=OMLU_APP_URL=https://omlu.vercel.app
```

## Local Development Examples

Use the safe hosted fallback:

```bash
flutter run
```

Use a local HTTPS tunnel:

```bash
flutter run \
  --dart-define=OMLU_APP_URL=https://your-ngrok-domain.ngrok-free.app \
  --dart-define=OMLU_ALLOWED_DOMAINS=your-ngrok-domain.ngrok-free.app
```

Use HTTP only for local development when Android networking is configured for it:

```bash
flutter run \
  --dart-define=OMLU_APP_URL=http://10.0.2.2:3000 \
  --dart-define=OMLU_ALLOW_HTTP=true \
  --dart-define=OMLU_ALLOWED_DOMAINS=10.0.2.2
```

## Build Release APK

```bash
flutter build apk --release \
  --dart-define=OMLU_APP_URL=https://omlu.vercel.app
```

The APK is written under `build/app/outputs/flutter-apk/`.

## Build Release AAB

```bash
flutter build appbundle --release \
  --dart-define=OMLU_APP_URL=https://omlu.vercel.app
```

The app bundle is written under `build/app/outputs/bundle/release/`.

## Security Notes

- Navigation inside the WebView is restricted to the configured OMLU domains.
- External websites and `tel:`, `mailto:`, `geo:`, `maps:`, `sms:`, and `intent:` links open in Android apps.
- JavaScript is enabled because the existing OMLU frontend requires it.
- Cookies, DOM storage, local storage, and session storage are preserved by Android WebView.
- SSL validation is not disabled.
- Production should use HTTPS only.
- PDF and CSV report links are handed to Android DownloadManager.
- Camera and microphone prompts are granted only after Android runtime permission approval.
