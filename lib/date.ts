export const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function toDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDays(dateKey: string, amount: number) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);

  return toDateKey(date);
}

export function daysBetween(startKey: string, endKey: string) {
  const start = parseDateKey(startKey).getTime();
  const end = parseDateKey(endKey).getTime();

  return Math.round((end - start) / 86400000);
}

export function dateRange(days: number, endKey = toDateKey()) {
  const startKey = addDays(endKey, -(days - 1));
  return Array.from({ length: days }, (_, index) => addDays(startKey, index));
}

export function startOfWeek(dateKey: string) {
  const date = parseDateKey(dateKey);
  const day = date.getDay();
  date.setDate(date.getDate() - day);

  return toDateKey(date);
}

export function weekRange(dateKey: string) {
  const start = startOfWeek(dateKey);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function startOfMonth(dateKey: string) {
  const date = parseDateKey(dateKey);
  date.setDate(1);

  return toDateKey(date);
}

export function monthRange(dateKey: string) {
  const start = parseDateKey(startOfMonth(dateKey));
  const year = start.getFullYear();
  const month = start.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const startKey = toDateKey(start);

  return Array.from({ length: days }, (_, index) => addDays(startKey, index));
}

export function formatShortDate(dateKey: string) {
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatLongDate(dateKey: string) {
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function formatFullDate(dateKey: string) {
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

export function formatMonthYear(dateKey: string) {
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function formatHeaderDateParts(dateKey: string) {
  const date = parseDateKey(dateKey);
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleDateString(undefined, { month: "short" });

  return {
    weekday: dayNames[date.getDay()],
    date: `${day} ${month} ${date.getFullYear()}`
  };
}

/** Compact relative time for feeds/lists: "Just now", "5m ago", "3h ago",
 * "Yesterday", "4d ago". */
export function timeAgo(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  return days === 1 ? "Yesterday" : `${days}d ago`;
}

// "Sunday, 05 Jun 2026" — day/month/year assembled by hand so the order
// doesn't flip with the device locale.
export function formatHistoryDate(dateKey: string) {
  const date = parseDateKey(dateKey);
  const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
  const month = date.toLocaleDateString(undefined, { month: "short" });
  const day = String(date.getDate()).padStart(2, "0");

  return `${weekday}, ${day} ${month} ${date.getFullYear()}`;
}
