# Lumo Production Asset Pack

Built from the supplied Lumo artwork.

## Primary color
- Launcher / splash background: `#FDBD1C`

## iOS
Copy `ios/AppIcon.appiconset` into your Xcode asset catalog.
The App Store icon is opaque and full-bleed, which avoids the alpha-channel rejection that can occur with store icons.

For Launch Screen:
- Use `#FDBD1C` as the background.
- Add `ios/LumoLaunchLogo.imageset` centered with **Aspect Fit**.
- Let iOS apply device sizing; do not use a full-screen static screenshot.

## Android
The `android/app/src/main/res` folder contains:
- `mipmap-*` legacy launcher icons
- round launcher icons
- adaptive foreground layers
- `mipmap-anydpi-v26` adaptive icon XML
- `mipmap-anydpi-v33` monochrome icon XML for themed icons
- white-only notification icon (`ic_stat_lumo`)
- Android 12+ splash asset (`drawable-nodpi/lumo_splash_icon.png`)

Launcher background color resource:
`@color/ic_launcher_background` = `#FDBD1C`

## Store submission
- Apple App Store: `store/app-store-icon-1024.png`
- Google Play: `store/google-play-icon-512.png`

## Expo / React Native
`expo-ready/` contains common files ready to copy into an `assets/` folder.
A starter `app-config-snippet.json` is included.

## Source-resolution note
The supplied artwork is 600×600. The 1024/2048 masters are high-quality Lanczos resamples with mild sharpening.
They are suitable for normal app icon display and store packaging, but a true vector/native 1024+ master would be preferable if you later want maximum-detail re-rendering for very large marketing artwork.
