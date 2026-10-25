# Release notes

What goes in the stores' "What's New" box, kept here so the text that ships is
written alongside the change rather than typed into a submission form from
memory.

Two versions per release, because the two stores have very different limits:

| Store | Field | Limit |
| --- | --- | --- |
| App Store Connect | *What's New in This Version* | 4,000 characters |
| Google Play Console | *Release notes* | **500 characters** |

Play's 500 is the one that bites — it is a hard cap, and a paste that goes over
is rejected rather than trimmed. So the Play entry is written short on purpose,
not cut down from the App Store one at submission time.

Newest first. The version headings match `expo.version` in `app.json`.

---

## 1.2.0

> **Incomplete.** The bullets below cover the walk-tracking work only. This
> release also carries Move goals, the activity chart, the distance slider and
> group chat, and those need their own entries before submission.

Walks that keep counting with the phone in your pocket.

### App Store

Walks now keep counting with the screen off, and keep time and distance properly in the places phones struggle to find you — under trees, between tall buildings, indoors.

• A walk no longer stops counting when your screen goes dark. The route kept being traced, but the distance and the timer could both sit exactly where you left them until you unlocked the phone — so a walk taken with the phone in a pocket came back reading almost nothing.
• Moving time no longer stalls while you are walking. On a weaker signal the clock used to stop and start, and at some accuracies a whole walk could finish reporting a couple of minutes of movement — or, in the worst case, no distance at all.
• Distance is recorded through those patches instead of being quietly dropped.
• The first stretch after a lost signal returns is no longer lost. Every blackout used to cost the leg that picked it back up, which in a town centre is once a block.
• A walk that pauses itself for a lost signal now waits and picks up on its own the moment your location comes back. It no longer offers a Resume that had nothing to record — if you want to take the walk over by hand you can still pause it yourself, and that one you can resume.

### Google Play

A walk no longer stops counting when your screen goes dark. Distance and the timer used to sit where you left them until you unlocked the phone, so a walk in a pocket came back reading almost nothing.

Walks also keep time and distance properly where phones struggle to find you — under trees, between buildings, indoors — and a walk that pauses itself for a lost signal now picks up on its own the moment your location comes back.

---

## 1.1.1

Walks that survive a locked screen.

### App Store

Walks now keep recording when your screen locks or you switch to another app.

• Your route keeps being traced with the phone in your pocket. Lumo no longer needs the screen on — and no longer needs "Allow all the time" location access to manage it.
• On iPhone, a note on the lock screen shows your distance and time as you walk, so you can see the recording is still going without unlocking.
• Resume works again after a walk pauses itself for a lost signal. Tapping it used to do nothing at all.
• Routes are traced far more accurately. The line used to trail several metres behind you and cut corners short; it now follows the path you actually took.
• A walk that gets interrupted by Lumo closing mid-route keeps everything it recorded in the background, instead of losing it.

### Google Play

Walks now keep recording when your screen locks or you switch apps — no need to keep Lumo open.

Resume works again after a walk pauses itself for a lost signal, and routes are traced far more accurately: the line no longer trails behind you or cuts corners short.

A walk interrupted by Lumo closing now keeps everything it recorded in the background.
