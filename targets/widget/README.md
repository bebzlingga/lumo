# Lumo iOS home-screen widget

A WidgetKit widget showing today's habits + completion progress. Built with
[`@bacons/apple-targets`](https://github.com/EvanBacon/expo-apple-targets).

## How it works

- The RN app writes a JSON snapshot of today's habits to the App Group
  `group.com.lumo.habits` on every habit change (`lib/widget.ts`, called from
  `context/LumoContext.tsx`) and asks WidgetKit to redraw.
- The SwiftUI widget (`index.swift`) reads that snapshot from the shared
  `UserDefaults` and renders small / medium / large families.
- Tapping the widget deep-links into the app (`lumo://`).

## One-time setup to actually build it

1. **Apple Developer portal** → Identifiers → App Groups: create
   `group.com.lumo.habits` and enable it on the app id `com.lumo.habits`.
2. **Generate the target** (this regenerates `ios/` from `app.json`, which now
   fully describes the config — entitlements, Info.plist, scheme, name):
   ```bash
   npx expo prebuild -p ios --clean
   npx pod-install
   ```
3. **Xcode signing**: open `ios/Lumo.xcworkspace`, and for BOTH the `Lumo`
   target and the generated `LumoWidget` target, set your Team and confirm the
   App Groups capability lists `group.com.lumo.habits`.
4. Build to a device (widgets don't run in Expo Go / simulator previews only),
   then long-press the home screen → add the Lumo widget.

## Notes

- Requires a native rebuild — the `react-native-shared-group-preferences` and
  `react-native-widgetkit` modules are absent until then; `lib/widget.ts`
  no-ops safely in the meantime.
- Keep the App Group id identical in three places: `app.json` (ios.entitlements),
  `expo-target.config.js`, and `index.swift`.
