# OMLU Android App

This Flutter app provides native restaurant operations screens with a restricted WebView fallback.

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

Production defaults are:
- Frontend: `https://omlu.in`
- Primary API & WebSocket: `https://api.omlu.in` / `wss://api.omlu.in`
- Fallback API & WebSocket: `https://omlu-server.onrender.com` / `wss://omlu-server.onrender.com`

Override them with Dart defines:

```bash
--dart-define=OMLU_FRONTEND_URL=https://omlu.in \
--dart-define=OMLU_PRIMARY_BACKEND_URL=https://api.omlu.in \
--dart-define=OMLU_FALLBACK_BACKEND_URL=https://omlu-server.onrender.com
```

Optional:

```bash
--dart-define=OMLU_ALLOWED_DOMAINS=omlu.in,api.omlu.in,omlu-server.onrender.com
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
flutter run
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
flutter run
```

## Local Development Examples

Use default primary/fallback URLs:

```bash
flutter run
```

Use a local HTTPS tunnel:

```bash
flutter run \
  --dart-define=OMLU_FRONTEND_URL=https://your-ngrok-domain.ngrok-free.app \
  --dart-define=OMLU_PRIMARY_BACKEND_URL=https://your-api-tunnel.ngrok-free.app \
  --dart-define=OMLU_ALLOWED_DOMAINS=your-ngrok-domain.ngrok-free.app
```

Use HTTP only for local development when Android networking is configured for it:

```bash
flutter run \
  --dart-define=OMLU_FRONTEND_URL=http://10.0.2.2:3000 \
  --dart-define=OMLU_PRIMARY_BACKEND_URL=http://10.0.2.2:8000 \
  --dart-define=OMLU_ALLOW_HTTP=true \
  --dart-define=OMLU_ALLOWED_DOMAINS=10.0.2.2
```

## Build Release APK

```bash
flutter build apk --release
```

The APK is written under `build/app/outputs/flutter-apk/`.

## Build Release AAB

```bash
flutter build appbundle --release
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
