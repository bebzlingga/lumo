import WidgetKit
import SwiftUI
import AppIntents

// App Group shared with the main app (see app.json entitlements + lib/widget.ts).
private let appGroup = "group.com.lumo.habits"
private let snapshotKey = "todaySnapshot"
// The widget owns these two keys; the RN app reads/clears pending toggles and
// leaves the cursor alone (see lib/widget.ts).
private let cursorKey = "widgetCursor"
private let pendingKey = "pendingToggles"

private func sharedDefaults() -> UserDefaults? { UserDefaults(suiteName: appGroup) }

// MARK: - Colour helpers

extension Color {
  init(hex: String) {
    let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    var value: UInt64 = 0
    Scanner(string: cleaned).scanHexInt64(&value)
    let r = Double((value >> 16) & 0xFF) / 255
    let g = Double((value >> 8) & 0xFF) / 255
    let b = Double(value & 0xFF) / 255
    self.init(.sRGB, red: r, green: g, blue: b, opacity: 1)
  }
}

// MARK: - Models (mirror the JSON the RN app writes in lib/widget.ts)

struct HabitItem: Codable, Identifiable {
  let id: String
  let name: String
  var done: Bool
  // SF Symbol + colours the RN app resolves from the habit's icon/colour so the
  // widget's icon badge matches the app row. Optional for older app builds.
  let symbol: String?
  let color: String?
  let onColor: String?
}

// The active app theme, pushed by RN so the widget matches the user's chosen
// look. Falls back to Lumo's warm-dark palette when absent (older app builds).
struct WidgetTheme: Codable {
  let background: String
  let card: String
  let accent: String
  let onAccent: String
  let text: String
  let subtle: String

  static let fallback = WidgetTheme(
    background: "#17140F",
    card: "#20211E",
    accent: "#E8EADF",
    onAccent: "#20211E",
    text: "#FFF7E6",
    subtle: "#9A9385"
  )
}

struct TodaySnapshot: Codable {
  let dateLabel: String
  var doneCount: Int
  let totalCount: Int
  var habits: [HabitItem]
  let theme: WidgetTheme?

  static let placeholder = TodaySnapshot(
    dateLabel: "Today",
    doneCount: 1,
    totalCount: 3,
    habits: [
      HabitItem(id: "1", name: "Drink water", done: true, symbol: "drop.fill", color: nil, onColor: nil),
      HabitItem(id: "2", name: "Morning walk", done: false, symbol: "figure.walk", color: nil, onColor: nil),
      HabitItem(id: "3", name: "Read 10 pages", done: false, symbol: "book.fill", color: nil, onColor: nil)
    ],
    theme: nil
  )

  static func load() -> TodaySnapshot {
    guard
      let defaults = sharedDefaults(),
      let raw = defaults.string(forKey: snapshotKey),
      let data = raw.data(using: .utf8),
      let decoded = try? JSONDecoder().decode(TodaySnapshot.self, from: data)
    else {
      return TodaySnapshot(dateLabel: "Today", doneCount: 0, totalCount: 0, habits: [], theme: nil)
    }
    return decoded
  }

  func save() {
    guard
      let defaults = sharedDefaults(),
      let data = try? JSONEncoder().encode(self),
      let raw = String(data: data, encoding: .utf8)
    else { return }
    defaults.set(raw, forKey: snapshotKey)
  }
}

// A completion the widget applied optimistically, for the app to reconcile.
struct PendingToggle: Codable {
  let id: String
  let done: Bool
}

private func appendPendingToggle(_ toggle: PendingToggle) {
  guard let defaults = sharedDefaults() else { return }
  var list: [PendingToggle] = []
  if
    let raw = defaults.string(forKey: pendingKey),
    let data = raw.data(using: .utf8),
    let decoded = try? JSONDecoder().decode([PendingToggle].self, from: data)
  {
    list = decoded
  }
  // Keep only the latest intent per habit so rapid taps collapse cleanly.
  list.removeAll { $0.id == toggle.id }
  list.append(toggle)
  if let data = try? JSONEncoder().encode(list), let raw = String(data: data, encoding: .utf8) {
    defaults.set(raw, forKey: pendingKey)
  }
}

private func loadCursor(count: Int) -> Int {
  guard count > 0 else { return 0 }
  let raw = sharedDefaults()?.integer(forKey: cursorKey) ?? 0
  return min(max(raw, 0), count - 1)
}

private func saveCursor(_ index: Int) {
  sharedDefaults()?.set(index, forKey: cursorKey)
}

// MARK: - App Intents (interactive widgets, iOS 17+)

@available(iOS 17.0, *)
struct ToggleHabitIntent: AppIntent {
  static var title: LocalizedStringResource = "Complete Habit"
  @Parameter(title: "Habit ID") var habitId: String

  init() {}
  init(habitId: String) { self.habitId = habitId }

  func perform() async throws -> some IntentResult {
    var snapshot = TodaySnapshot.load()
    if let index = snapshot.habits.firstIndex(where: { $0.id == habitId }) {
      let next = !snapshot.habits[index].done
      snapshot.habits[index].done = next
      snapshot.doneCount = snapshot.habits.filter { $0.done }.count
      snapshot.save() // optimistic — RN makes it authoritative on next foreground
      appendPendingToggle(PendingToggle(id: habitId, done: next))
    }
    return .result()
  }
}

@available(iOS 17.0, *)
struct NextHabitIntent: AppIntent {
  static var title: LocalizedStringResource = "Next Habit"
  func perform() async throws -> some IntentResult {
    let count = TodaySnapshot.load().habits.count
    if count > 0 {
      saveCursor((loadCursor(count: count) + 1) % count)
    }
    return .result()
  }
}

@available(iOS 17.0, *)
struct PrevHabitIntent: AppIntent {
  static var title: LocalizedStringResource = "Previous Habit"
  func perform() async throws -> some IntentResult {
    let count = TodaySnapshot.load().habits.count
    if count > 0 {
      saveCursor((loadCursor(count: count) - 1 + count) % count)
    }
    return .result()
  }
}

// MARK: - Timeline

struct Entry: TimelineEntry {
  let date: Date
  let snapshot: TodaySnapshot
  let cursor: Int
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry {
    Entry(date: Date(), snapshot: .placeholder, cursor: 0)
  }

  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    let snap = context.isPreview ? .placeholder : TodaySnapshot.load()
    completion(Entry(date: Date(), snapshot: snap, cursor: loadCursor(count: snap.habits.count)))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    // Refresh at the top of the next hour; the app also nudges the timeline on
    // every completion via WidgetCenter.reloadAllTimelines(), and each button
    // intent reloads automatically once it finishes.
    let now = Date()
    let next = Calendar.current.date(byAdding: .hour, value: 1, to: now) ?? now.addingTimeInterval(3600)
    let snap = TodaySnapshot.load()
    let entry = Entry(date: now, snapshot: snap, cursor: loadCursor(count: snap.habits.count))
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

// MARK: - View

struct LumoWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: Entry

  private var theme: WidgetTheme { entry.snapshot.theme ?? .fallback }
  private var bg: Color { Color(hex: theme.background) }
  private var accent: Color { Color(hex: theme.accent) }
  private var onAccent: Color { Color(hex: theme.onAccent) }
  private var text: Color { Color(hex: theme.text) }
  private var subtle: Color { Color(hex: theme.subtle) }

  private var progress: Double {
    entry.snapshot.totalCount == 0 ? 0 : Double(entry.snapshot.doneCount) / Double(entry.snapshot.totalCount)
  }

  var body: some View {
    Group {
      if entry.snapshot.totalCount == 0 {
        emptyState
      } else if #available(iOS 17.0, *) {
        interactiveCard
      } else {
        staticList
      }
    }
    .padding(14)
    .widgetURL(URL(string: "lumo://"))
  }

  // MARK: Empty

  private var emptyState: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Lumo").font(.system(size: 12, weight: .heavy)).foregroundColor(accent)
      Spacer()
      Text("Nothing due today").font(.system(size: 15, weight: .bold)).foregroundColor(text)
      Text("Enjoy the rest ✦").font(.system(size: 12, weight: .medium)).foregroundColor(subtle)
      Spacer()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: Interactive (iOS 17+)

  @available(iOS 17.0, *)
  private var interactiveCard: some View {
    let count = entry.snapshot.habits.count
    let cursor = min(max(entry.cursor, 0), count - 1)
    let habit = entry.snapshot.habits[cursor]

    return VStack(alignment: .leading, spacing: 0) {
      // Header: date + prev · "2 / 3" · next
      HStack(spacing: 6) {
        Text(entry.snapshot.dateLabel)
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(subtle)
          .lineLimit(1)
        Spacer(minLength: 4)
        if count > 1 {
          Button(intent: PrevHabitIntent()) { navGlyph("chevron.left") }.buttonStyle(.plain)
        }
        Text("\(cursor + 1) / \(count)")
          .font(.system(size: 12, weight: .heavy))
          .foregroundColor(text)
          .monospacedDigit()
        if count > 1 {
          Button(intent: NextHabitIntent()) { navGlyph("chevron.right") }.buttonStyle(.plain)
        }
      }

      Spacer(minLength: 8)

      // Current habit: icon badge + name (mirrors an app habit row)
      HStack(spacing: 11) {
        iconBadge(for: habit)
        Text(habit.name)
          .font(.system(size: family == .systemSmall ? 16 : 21, weight: .bold))
          .foregroundColor(habit.done ? subtle : text)
          .strikethrough(habit.done, color: subtle)
          .lineLimit(2)
          .minimumScaleFactor(0.8)
        Spacer(minLength: 0)
      }

      Spacer(minLength: 8)

      // Overall progress for the day
      HStack {
        Text("\(entry.snapshot.doneCount) of \(entry.snapshot.totalCount) done today")
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(subtle)
        Spacer()
      }
      .padding(.bottom, 4)
      progressBar

      Spacer(minLength: 10)

      // Complete / undo button
      Button(intent: ToggleHabitIntent(habitId: habit.id)) {
        completeLabel(done: habit.done)
      }
      .buttonStyle(.plain)
    }
  }

  private func iconBadge(for habit: HabitItem) -> some View {
    let badgeBg = habit.color.map { Color(hex: $0) } ?? accent
    let badgeFg = habit.onColor.map { Color(hex: $0) } ?? onAccent
    let size: CGFloat = family == .systemSmall ? 34 : 42
    return Image(systemName: habit.symbol ?? "circle.fill")
      .font(.system(size: family == .systemSmall ? 15 : 18, weight: .bold))
      .foregroundColor(badgeFg)
      .frame(width: size, height: size)
      .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(badgeBg))
      .opacity(habit.done ? 0.5 : 1)
  }

  @available(iOS 17.0, *)
  private func navGlyph(_ system: String) -> some View {
    Image(systemName: system)
      .font(.system(size: 11, weight: .bold))
      .foregroundColor(text)
      .frame(width: 26, height: 26)
      .background(Circle().fill(subtle.opacity(0.16)))
  }

  private func completeLabel(done: Bool) -> some View {
    HStack(spacing: 6) {
      Image(systemName: done ? "checkmark.circle.fill" : "circle")
        .font(.system(size: 14, weight: .bold))
      Text(done ? "Done" : "Complete")
        .font(.system(size: 14, weight: .bold))
    }
    .foregroundColor(done ? accent : onAccent)
    .frame(maxWidth: .infinity)
    .padding(.vertical, 10)
    .background(
      RoundedRectangle(cornerRadius: 13, style: .continuous)
        .fill(done ? accent.opacity(0.16) : accent)
    )
  }

  private var progressBar: some View {
    GeometryReader { geo in
      ZStack(alignment: .leading) {
        Capsule().fill(subtle.opacity(0.22))
        Capsule().fill(accent).frame(width: max(0, geo.size.width * progress))
      }
    }
    .frame(height: 6)
  }

  // MARK: Fallback list (iOS 16 — no interactive buttons)

  private var staticList: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text("Lumo").font(.system(size: 13, weight: .heavy)).foregroundColor(accent)
        Spacer()
        Text(entry.snapshot.dateLabel).font(.system(size: 11, weight: .medium)).foregroundColor(subtle)
      }
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text("\(entry.snapshot.doneCount)").font(.system(size: 26, weight: .black)).foregroundColor(accent)
        Text("of \(entry.snapshot.totalCount) done").font(.system(size: 13, weight: .semibold)).foregroundColor(subtle)
      }
      progressBar
      if family != .systemSmall {
        VStack(alignment: .leading, spacing: 5) {
          ForEach(entry.snapshot.habits.prefix(family == .systemLarge ? 6 : 3)) { habit in
            HStack(spacing: 6) {
              Image(systemName: habit.done ? "checkmark.circle.fill" : "circle")
                .foregroundColor(habit.done ? accent : subtle)
                .font(.system(size: 13))
              Text(habit.name)
                .font(.system(size: 13, weight: .medium))
                .strikethrough(habit.done, color: subtle)
                .foregroundColor(habit.done ? subtle : text)
                .lineLimit(1)
              Spacer()
            }
          }
        }
        .padding(.top, 2)
      }
      Spacer(minLength: 0)
    }
  }
}

// MARK: - Widget

@main
struct LumoWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "LumoWidget", provider: Provider()) { entry in
      let theme = entry.snapshot.theme ?? .fallback
      // A soft diagonal wash rather than a flat fill, so the widget reads as
      // Lumo's own surface instead of a plain colour block — and so the medium
      // and large sizes, which have far more empty area than the small one,
      // don't look washed out.
      let background = LinearGradient(
        colors: [Color(hex: theme.background), Color(hex: theme.card)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      if #available(iOS 17.0, *) {
        LumoWidgetView(entry: entry).containerBackground(for: .widget) { background }
      } else {
        LumoWidgetView(entry: entry).background(background)
      }
    }
    .configurationDisplayName("Today's Habits")
    .description("Check off today's habits right from the home screen.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
