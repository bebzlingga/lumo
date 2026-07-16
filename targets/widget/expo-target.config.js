/** @type {import('@bacons/apple-targets').Config} */
// Defines the "Today" home-screen widget. `@bacons/apple-targets` generates a
// WidgetKit extension target from this + the Swift files in this folder during
// `expo prebuild`. The App Group must match the main app's entitlement so the
// widget can read the habit snapshot the app writes (see lib/widget.ts).
module.exports = {
  type: "widget",
  name: "LumoWidget",
  entitlements: {
    "com.apple.security.application-groups": ["group.com.lumo.habits"]
  }
};
