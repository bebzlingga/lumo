import WidgetKit
import SwiftUI

// App Group shared with the main app (see app.json entitlements + lib/widget.ts).
private let appGroup = "group.com.lumo.habits"
private let snapshotKey = "todaySnapshot"

// Mirrors the JSON the RN app writes in lib/widget.ts.
struct HabitItem: Codable, Identifiable {
  let id: String
  let name: String
  let done: Bool
}

struct TodaySnapshot: Codable {
  let dateLabel: String
  let doneCount: Int
  let totalCount: Int
  let habits: [HabitItem]

  static let placeholder = TodaySnapshot(
    dateLabel: "Today",
    doneCount: 2,
    totalCount: 4,
    habits: [
      HabitItem(id: "1", name: "Drink water", done: true),
      HabitItem(id: "2", name: "Morning walk", done: true),
      HabitItem(id: "3", name: "Read 10 pages", done: false),
      HabitItem(id: "4", name: "Meditate", done: false)
    ]
  )

  static func load() -> TodaySnapshot {
    guard
      let defaults = UserDefaults(suiteName: appGroup),
      let raw = defaults.string(forKey: snapshotKey),
      let data = raw.data(using: .utf8),
      let decoded = try? JSONDecoder().decode(TodaySnapshot.self, from: data)
    else {
      return TodaySnapshot(dateLabel: "Today", doneCount: 0, totalCount: 0, habits: [])
    }
    return decoded
  }
}

struct Entry: TimelineEntry {
  let date: Date
  let snapshot: TodaySnapshot
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry {
    Entry(date: Date(), snapshot: .placeholder)
  }

  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    completion(Entry(date: Date(), snapshot: context.isPreview ? .placeholder : TodaySnapshot.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    // Refresh at the top of the next hour; the app also nudges the timeline on
    // every completion via WidgetCenter.reloadAllTimelines().
    let now = Date()
    let next = Calendar.current.date(byAdding: .hour, value: 1, to: now) ?? now.addingTimeInterval(3600)
    completion(Timeline(entries: [Entry(date: now, snapshot: TodaySnapshot.load())], policy: .after(next)))
  }
}

private let accent = Color(red: 0.20, green: 0.37, blue: 0.23) // greenDark

struct LumoWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: Entry

  var progress: Double {
    entry.snapshot.totalCount == 0 ? 0 : Double(entry.snapshot.doneCount) / Double(entry.snapshot.totalCount)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text("Lumo").font(.system(size: 13, weight: .heavy))
        Spacer()
        Text(entry.snapshot.dateLabel).font(.system(size: 11, weight: .medium)).foregroundColor(.secondary)
      }

      if entry.snapshot.totalCount == 0 {
        Spacer()
        Text("No habits for today").font(.system(size: 13, weight: .medium)).foregroundColor(.secondary)
        Spacer()
      } else {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
          Text("\(entry.snapshot.doneCount)").font(.system(size: 26, weight: .black)).foregroundColor(accent)
          Text("of \(entry.snapshot.totalCount) done").font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)
        }

        ProgressView(value: progress)
          .progressViewStyle(.linear)
          .tint(accent)

        if family != .systemSmall {
          VStack(alignment: .leading, spacing: 5) {
            ForEach(entry.snapshot.habits.prefix(family == .systemLarge ? 6 : 3)) { habit in
              HStack(spacing: 6) {
                Image(systemName: habit.done ? "checkmark.circle.fill" : "circle")
                  .foregroundColor(habit.done ? accent : .secondary)
                  .font(.system(size: 13))
                Text(habit.name)
                  .font(.system(size: 13, weight: .medium))
                  .strikethrough(habit.done, color: .secondary)
                  .foregroundColor(habit.done ? .secondary : .primary)
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
    .padding(14)
    // Tapping the widget opens the app on the Today tab.
    .widgetURL(URL(string: "lumo://"))
  }
}

@main
struct LumoWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "LumoWidget", provider: Provider()) { entry in
      if #available(iOS 17.0, *) {
        LumoWidgetView(entry: entry).containerBackground(.background, for: .widget)
      } else {
        LumoWidgetView(entry: entry).background(Color(.systemBackground))
      }
    }
    .configurationDisplayName("Today's Habits")
    .description("See how many of today's habits you've completed.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
