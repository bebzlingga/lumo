import { IconName } from "@/components/Icon";

// A group's progression lives in two places, and used to live in three.
//
// REMOVED: the ten-level "milestone ladder" (Assemble → First Wins → … →
// Legends). It tested the same four synced metrics the trophy shelf below tests,
// against smaller numbers, and unlocked in a strict order — so a group met
// "Assemble" and "First Wins" as two more things to read on a page that already
// showed a trophy for each. Two ladders climbing the same wall meant every win
// arrived twice, once as a milestone and once as a trophy. The shelf is the one
// that stayed: it is a place you can go and look at, it has art, and it is
// shared with the personal badge grid.
//
// What remains: the trophies (a shelf earned off synced metrics) and the group
// score/XP level (a number that climbs forever off completions).

export type GroupChallengeTier = "bronze" | "silver" | "gold" | "diamond";

export const groupChallengeTierMeta: Record<GroupChallengeTier, { label: string; accent: string }> = {
  bronze: { label: "Bronze", accent: "#C6803F" },
  silver: { label: "Silver", accent: "#8FA1B3" },
  gold: { label: "Gold", accent: "#E0AE3A" },
  diamond: { label: "Diamond", accent: "#5B9BD5" }
};

// Challenges the group can take on — each becomes a shared daily group activity
// when started, so the whole group builds the habit together (and completions
// feed the group's XP). Graded from easy to very hard.
export type ChallengeDifficulty = "easy" | "medium" | "hard" | "extreme";

export const challengeDifficultyMeta: Record<ChallengeDifficulty, { label: string; accent: string }> = {
  easy: { label: "Easy", accent: "#3F9E6E" },
  medium: { label: "Medium", accent: "#E0AE3A" },
  hard: { label: "Difficult", accent: "#E8871A" },
  extreme: { label: "Extreme", accent: "#D0405E" }
};

export const challengeDifficultyOrder: ChallengeDifficulty[] = ["easy", "medium", "hard", "extreme"];

// XP each completion of a challenge is worth — harder challenges pay out more,
// so choosing a Very Hard one actually moves the group's score. Custom (non-
// challenge) group habits earn a small base so everything counts for something.
export const challengeXp: Record<ChallengeDifficulty, number> = {
  easy: 10,
  medium: 25,
  hard: 50,
  extreme: 100
};
export const BASE_HABIT_XP = 5;

// A challenge is either a multi-day habit ("do it on N days") or a single big
// accomplishment ("once"). The duration scales with difficulty.
export type ChallengeGoalKind = "daily" | "once";

export type ProductivityChallenge = {
  id: string;
  name: string;
  description: string;
  /** A short paragraph on why this challenge is worth doing — shown on the
   * challenge detail page to motivate the group before they start. */
  why: string;
  /** Concrete things the challenge helps with — rendered as a short list under
   * a "What it'll help with" heading on the detail page. */
  benefits: string[];
  /**
   * What actually counts as doing it — the rules, spelled out.
   *
   * `description` is a one-line summary for the list, and on the harder
   * challenges a line cannot carry the terms: "Monk Mode" told a group its name
   * and nothing about no feeds, no junk food and two hours of deep work, so
   * every member decided for themselves what they had signed up for. This is
   * the page's answer to "so what do I have to do today", and every challenge
   * carries it — the easy ones have terms too (is coffee water? does a bike ride
   * count as steps?), and a challenge without them would read as the one you can
   * interpret freely.
   *
   * Written as things to DO, not as prose, because the group reads them as a
   * checklist before they check in.
   */
  rules: string[];
  icon: IconName;
  difficulty: ChallengeDifficulty;
  goalKind: ChallengeGoalKind;
  /** For "daily": the number of days to complete it. For "once": a suggested
   * window (informational only — completion just needs one log). */
  durationDays: number;
};

export const productivityChallenges: ProductivityChallenge[] = [
  // Easy — 5–10 mins/day, 3-day starters.
  { id: "water", name: "Drink 8 glasses of water", description: "Stay hydrated all day.", why: "Even mild dehydration quietly drains your energy, focus, and mood long before you actually feel thirsty. Water is the simplest lever you have for feeling more alert and clear-headed, and it costs nothing. As a 3-day starter, it's an easy first win that builds momentum for the whole group.", benefits: ["Steadier energy through the day", "Sharper focus and fewer headaches", "Better digestion and skin"], rules: ["Eight glasses over the day — roughly 2 litres.", "Water, sparkling water or unsweetened tea. Coffee, juice and soda don't count.", "Spread them out: one with each meal, one between."], icon: "drop", difficulty: "easy", goalKind: "daily", durationDays: 3 },
  { id: "gratitude", name: "Share 1 gratitude", description: "One thing you're grateful for.", why: "Naming one good thing each day trains your brain to look for more of them instead of defaulting to what went wrong. Over time that small shift measurably lifts your mood and outlook. Sharing it with the group also makes everyone feel more connected.", benefits: ["A more positive outlook", "Lower day-to-day stress", "A closer, warmer group"], rules: ["Name one thing you're grateful for from today.", "Say it to the group or write it in your journal — out of your head either way.", "Something new each day, not yesterday's repeated."], icon: "heart", difficulty: "easy", goalKind: "daily", durationDays: 3 },
  { id: "nosoda", name: "No soft drinks", description: "Skip the soda today.", why: "A single soft drink can carry the entire day's recommended sugar in one go — spiking your energy and then crashing it. Skipping it steadies your mood and is one of the least painful ways to start eating better. Doing it together makes the habit far easier to hold.", benefits: ["Fewer energy crashes", "A big cut in daily sugar", "An easy on-ramp to eating better"], rules: ["No soda, energy drinks or sweetened iced tea, all day.", "Diet and zero-sugar versions still count as a soft drink.", "Water, black coffee or unsweetened tea instead."], icon: "glass", difficulty: "easy", goalKind: "daily", durationDays: 3 },
  { id: "walk", name: "Walk 5,000 steps", description: "Get moving.", why: "A short daily walk lifts your mood, clears your head, and protects your heart — with no gym, gear, or skill required. It's the most accessible form of exercise there is. Getting the group moving together turns it into something to look forward to.", benefits: ["A quick mood boost", "Better heart health", "A clearer, calmer head"], rules: ["5,000 steps by the end of the day.", "Any counter — your watch, your phone, or Lumo Move.", "Errands, commutes and pacing the house all count."], icon: "activity", difficulty: "easy", goalKind: "daily", durationDays: 3 },
  { id: "language", name: "Learn 1 new word", description: "Grow your vocabulary.", why: "One new word a day is 365 a year without ever feeling like studying. Small, steady learning keeps your mind engaged and your vocabulary quietly growing. Best of all, it proves how quickly tiny daily habits compound.", benefits: ["A richer vocabulary", "A more engaged mind", "Proof that small habits add up"], rules: ["Look up one word you genuinely didn't know.", "Write down what it means, in your own words.", "Use it once today — in a message or out loud."], icon: "book1", difficulty: "easy", goalKind: "daily", durationDays: 3 },
  { id: "reflect", name: "Reflect on your day", description: "Write one sentence.", why: "A single sentence about your day helps you process what happened and notice what actually matters. It's the lightest possible on-ramp to journaling — impossible to feel too busy for. Do it for three days and you'll already have the start of a real record.", benefits: ["More self-awareness", "Less mental clutter", "An effortless journaling start"], rules: ["One written sentence about how the day went.", "In the Lumo journal, or anywhere you write.", "One line is the whole ask — don't wait for something profound."], icon: "note", difficulty: "easy", goalKind: "daily", durationDays: 3 },
  { id: "sunlight", name: "10 minutes of sunlight", description: "Step out for some light.", why: "Morning light sets your internal body clock, lifts your mood, and improves how well you sleep that same night. Ten minutes outside early is one of the highest-value things you can do for your energy. It's free, simple, and works from day one.", benefits: ["Deeper, easier sleep", "More daytime energy", "A brighter mood"], rules: ["Ten minutes outdoors in daylight.", "Morning is best — before 10 AM if your day allows it.", "Outside, not through a window."], icon: "sun", difficulty: "easy", goalKind: "daily", durationDays: 3 },

  // Medium — 15–30 mins/day, a full week.
  { id: "workout", name: "20-minute workout", description: "Break a sweat.", why: "Twenty focused minutes is genuinely enough to boost your energy, mood, and strength — you don't need an hour. Doing it every day for a week builds the identity of someone who trains, not someone who's merely 'trying to.' Momentum, not intensity, is what makes it last.", benefits: ["More energy and strength", "A reliable mood boost", "A real training habit"], rules: ["Twenty unbroken minutes of real effort.", "Anything counts: gym, run, home circuit, sport, class.", "Warm-up and stretching are extra, not part of the twenty."], icon: "fire", difficulty: "medium", goalKind: "daily", durationDays: 7 },
  { id: "learn", name: "Learn something new", description: "20 minutes on a skill.", why: "Deliberate daily practice — not occasional bursts — is how skills actually grow. Twenty minutes a day compounds into progress you and the group can genuinely feel by the end of the week. It also keeps your mind curious and engaged.", benefits: ["Real, visible skill progress", "A curious, engaged mind", "A daily learning habit"], rules: ["Twenty minutes on ONE skill you're building.", "Practising it — a lesson, a drill, a tutorial you follow along with.", "Same skill every day; switching daily starts you over."], icon: "star", difficulty: "medium", goalKind: "daily", durationDays: 7 },
  { id: "journal", name: "Journal for 5 minutes", description: "Put it on paper.", why: "Writing untangles the thoughts looping in your head and measurably lowers stress. Five minutes a day gives you a clearer mind and a record of where you've been. Over a week it becomes a place to think, not just to vent.", benefits: ["Less stress and overwhelm", "A clearer head", "A record to look back on"], rules: ["Five minutes of writing, timer on.", "Anything on your mind — no format, no editing, nobody reads it.", "Written down, not thought through."], icon: "edit", difficulty: "medium", goalKind: "daily", durationDays: 7 },
  { id: "cleanspace", name: "Clean your space", description: "Desk or room, every day.", why: "A tidy space lowers stress and makes it easier to focus — your environment shapes your mind more than you'd think. A short daily reset keeps clutter from ever piling into an overwhelming mess. Outer order tends to bring inner calm.", benefits: ["Sharper focus", "Less background stress", "No more clutter pile-ups"], rules: ["One space: your desk, your room, or the kitchen.", "Leave it clear — surfaces empty, everything back where it lives.", "Ten minutes is plenty. This is a daily reset, not a deep clean."], icon: "broom", difficulty: "medium", goalKind: "daily", durationDays: 7 },
  { id: "meditate", name: "Meditate 15 minutes", description: "Find some calm.", why: "Meditation is a gym for your attention: you practice noticing when your mind wanders and gently bringing it back. Fifteen minutes a day builds calm, focus, and the ability to not get hijacked by every passing thought. A single week is enough to feel the difference.", benefits: ["More calm and less anxiety", "Better sustained focus", "Less emotional reactivity"], rules: ["Fifteen minutes sitting still, timer on.", "Follow your breath; when your mind wanders, bring it back.", "Guided sessions count. Falling asleep doesn't."], icon: "moon", difficulty: "medium", goalKind: "daily", durationDays: 7 },
  { id: "budget", name: "Track every expense", description: "Know where it goes.", why: "You can't manage what you don't measure, and most money leaks out in small, unnoticed amounts. A week of tracking every peso shows you exactly where it's going — usually a surprise. That awareness is the first real step to keeping more of it.", benefits: ["Clarity on your spending", "Fewer invisible money leaks", "The foundation for saving"], rules: ["Write down every peso you spend, as you spend it.", "All of it — the coffee, the fare, every tap of a card.", "Total it at the end of the day so you see the number."], icon: "money", difficulty: "medium", goalKind: "daily", durationDays: 7 },
  { id: "detox", name: "2 hours off social media", description: "Reclaim your focus.", why: "The feed is engineered to hold your attention as long as possible — that's the entire product. Reclaiming two hours a day gives you back focus, time, and mental space for what you actually care about. A week off the endless scroll resets your defaults.", benefits: ["Hours of time back", "Better focus", "Less comparison and anxiety"], rules: ["Two unbroken hours with no feeds — Facebook, Instagram, TikTok, X, YouTube.", "Messaging a person is fine; scrolling past strangers is not.", "Phone out of reach, not just the app closed."], icon: "eye", difficulty: "medium", goalKind: "daily", durationDays: 7 },
  { id: "reading", name: "Read 20 pages", description: "Feed your mind.", why: "Twenty pages a day adds up to roughly a book a month, one calm session at a time. Reading deepens your thinking and rebuilds the long attention span that scrolling quietly erodes. It's a low-effort daily habit with outsized returns.", benefits: ["Deeper thinking", "A longer attention span", "About a book a month"], rules: ["Twenty pages of a book — paper or e-reader.", "Articles and audiobooks don't count for this one.", "One sitting or spread out, as long as it's twenty by bedtime."], icon: "book", difficulty: "medium", goalKind: "daily", durationDays: 7 },
  { id: "sleep", name: "Sleep before 11 PM", description: "Protect your rest.", why: "Sleep is when your body repairs and your brain locks in everything you learned that day. An earlier bedtime improves your mood, focus, and willpower for literally everything else you're trying to do. Protect it for a week and the rest gets noticeably easier.", benefits: ["More energy and focus", "A steadier mood", "Stronger willpower"], rules: ["Lights out before 11 PM.", "In bed to sleep — in bed scrolling doesn't count.", "Set a 10:30 alarm to start winding down."], icon: "moon", difficulty: "medium", goalKind: "daily", durationDays: 7 },

  // Difficult — 30–60 mins/day, two weeks of discipline.
  { id: "steps", name: "10,000 steps", description: "All-day movement.", why: "Ten thousand steps means genuine all-day movement, not a single workout you sit still around. Two weeks of hitting it builds real cardiovascular health and a naturally active lifestyle. It's a target that quietly reshapes your whole day.", benefits: ["Heart and cardio health", "A naturally active lifestyle", "More all-day energy"], rules: ["10,000 steps by midnight.", "Any tracker — watch, phone, or Lumo Move.", "Treadmill counts. A bike ride doesn't."], icon: "activity", difficulty: "hard", goalKind: "daily", durationDays: 14 },
  { id: "deepwork", name: "1 hour of deep work", description: "Distraction-free.", why: "One truly distraction-free hour beats an entire scattered day of half-focus. Protecting it daily is how meaningful work actually gets finished — and how you train the increasingly rare skill of deep concentration. Two weeks is enough to build the muscle.", benefits: ["Meaningful progress on real work", "Trained deep focus", "Less time lost to busywork"], rules: ["One hour on a single task, timer running.", "Phone on silent and out of sight — no email, chat or spare tabs.", "Break focus and the clock pauses; the hour is time ON task."], icon: "timer", difficulty: "hard", goalKind: "daily", durationDays: 14 },
  { id: "sideproject", name: "1 hour on your side project", description: "Build your thing.", why: "Big things get built one hour at a time, not in rare heroic bursts. Fourteen straight days of showing up turns a 'someday' idea into real, visible progress you can point to. Consistency is the whole secret.", benefits: ["Visible progress on your idea", "A consistent building habit", "Real momentum"], rules: ["One hour on the same project, every day.", "Building it — planning, reading and redesigning the logo don't count.", "Leave yourself a note of where you stopped, so tomorrow starts fast."], icon: "zap", difficulty: "hard", goalKind: "daily", durationDays: 14 },
  { id: "study", name: "1 hour of study", description: "Learn deliberately.", why: "An hour of deliberate study a day is how exams get passed and hard subjects get mastered. Consistency, not last-minute cramming, is what actually makes knowledge stick. Two weeks of it builds a routine you can lean on.", benefits: ["Knowledge that actually sticks", "Far less cramming", "A dependable study routine"], rules: ["One hour on one subject, phone away.", "Active study: problems, recall, past papers. Re-reading notes isn't studying.", "Breaks are fine — the hour is time on task."], icon: "book1", difficulty: "hard", goalKind: "daily", durationDays: 14 },
  { id: "gym", name: "Hit the gym", description: "5× a week.", why: "Strength training protects your body, metabolism, and independence for the rest of your life. Committing to five sessions a week for two weeks is enough to build the routine that makes going automatic. The hardest part is showing up — so you practice exactly that.", benefits: ["Real strength and muscle", "A lasting gym routine", "Long-term health"], rules: ["A real session: 45 minutes or more of training.", "Strength work, not a stroll on the treadmill.", "Log only the days you actually trained."], icon: "weight", difficulty: "hard", goalKind: "daily", durationDays: 14 },
  { id: "healthymeals", name: "No junk food", description: "Eat clean.", why: "What you eat directly drives your energy, focus, and mood, hour to hour. Two weeks off junk food resets your cravings and taste buds and shows you how good eating clean actually feels. Most people are surprised how much lighter they feel.", benefits: ["Steadier, cleaner energy", "Reset cravings", "Better mood and focus"], rules: ["No fast food, chips, sweets, pastries or instant noodles.", "Eat what you recognise: rice, meat, fish, vegetables, fruit, eggs.", "One bite breaks the day — this is the difficult tier."], icon: "health", difficulty: "hard", goalKind: "daily", durationDays: 14 },
  { id: "coldshower", name: "Cold shower", description: "Embrace the cold.", why: "A cold shower is a small, daily rep of choosing to do the hard thing on purpose. It sharpens your alertness in the moment and, over two weeks, builds the discipline to act even when you're uncomfortable. That skill quietly carries into everything else.", benefits: ["Instant alertness", "Stronger discipline", "A real resilience boost"], rules: ["Cold from the first second — no warming up first.", "Two minutes minimum, tap all the way cold.", "Every day, especially the days you don't want to."], icon: "drop", difficulty: "hard", goalKind: "daily", durationDays: 14 },
  { id: "content", name: "Create content daily", description: "Write or post something.", why: "Creating every day beats passively consuming every day — you become a maker, not just an audience. Publishing something daily for two weeks sharpens your skills, builds your voice, and kills the fear of sharing. The work compounds in public.", benefits: ["A sharper creative voice", "A growing body of work", "Less fear of shipping"], rules: ["Make one thing and put it out — a post, video, thread, drawing, track.", "Published, not drafted.", "Small counts. Shipping is the whole point."], icon: "brush", difficulty: "hard", goalKind: "daily", durationDays: 14 },
  { id: "savemoney", name: "No unnecessary spending", description: "Save it.", why: "Most spending is impulse dressed up as need. Two weeks of pausing before every non-essential purchase builds real discipline — and leaves noticeably more in your account. You'll also relearn the difference between wanting and needing.", benefits: ["More money saved", "Stronger self-control", "Clarity on want vs need"], rules: ["Essentials only: food, transport, bills, medicine.", "Anything else waits 24 hours — still want it tomorrow, buy it tomorrow.", "Nothing bought out of boredom."], icon: "money", difficulty: "hard", goalKind: "daily", durationDays: 14 },
  { id: "fiveam", name: "Wake up at 5 AM", description: "Win the morning.", why: "A 5 AM start hands you quiet, uninterrupted hours before the world wakes up and starts making demands. Win those hours and the rest of the day tends to fall in line. Two weeks is enough to reset what 'early' even feels like.", benefits: ["Quiet, focused mornings", "A real head start on the day", "Stronger discipline"], rules: ["Up at 5 AM — feet on the floor, no snooze.", "Out of the bedroom within ten minutes.", "Which means asleep by 10 PM. The night before is the hard part."], icon: "sun", difficulty: "hard", goalKind: "daily", durationDays: 14 },

  // Extreme — all-in 30-day challenges across different areas of life,
  // not just fitness. Unlocked after clearing the Hard tier.
  {
    id: "hard75",
    name: "75 Hard",
    description: "45-min workout, 20 pages, 3 L water, sleep by 10 PM, journal, no junk food, no social before 12 PM, save ₱100, 10,000 steps.",
    why: "75 Hard is less about fitness and more about mental toughness. Thirty days with zero compromises and no missed tasks rewires how seriously you take promises to yourself. It's brutally hard on purpose — and doing it as a group is what makes the worst days survivable.",
    benefits: ["Unshakable mental toughness", "Total discipline across mind and body", "Proof you can finish what you start"],
    rules: [
      "A 45-minute workout.",
      "Read 20 pages of a book.",
      "Drink 3 litres of water.",
      "No junk food and no alcohol.",
      "Asleep by 10 PM.",
      "Nothing social before 12 PM.",
      "10,000 steps.",
      "Journal for five minutes.",
      "Put ₱100 away.",
      "Miss any one of them and the day doesn't count. That is the challenge."
    ],
    icon: "crown1",
    difficulty: "extreme",
    goalKind: "daily",
    durationDays: 30
  },
  {
    id: "monkmode",
    name: "Monk Mode",
    description: "No social media, no junk food, and 2 hours of deep work — every day.",
    why: "Monk Mode strips out the noise — feeds, junk, distraction — so you can go all-in on your goals. A full month of deep focus with none of the usual dopamine hits is long enough to make real, visible progress on what actually matters. You come out with sharper focus and a much clearer sense of what you want.",
    benefits: ["Deep, undistracted focus", "Real progress on your goals", "Freedom from digital dependence"],
    rules: [
      "No social media at all — no feeds, no scrolling, all thirty days.",
      "No junk food and no alcohol.",
      "Two hours of deep work on the thing that matters most.",
      "All three, every day. Two out of three is a normal day."
    ],
    icon: "moon",
    difficulty: "extreme",
    goalKind: "daily",
    durationDays: 30
  },
  {
    id: "nosugar30",
    name: "Sugar-Free 30",
    description: "Zero added sugar, every single day.",
    why: "Sugar hides in almost everything and keeps your energy on an all-day rollercoaster of spikes and crashes. Thirty days completely off it resets your cravings and taste buds so fruit starts tasting sweet again. Most people report steadier energy, clearer skin, and no desire to go back.",
    benefits: ["Steady, crash-free energy", "Reset cravings and taste buds", "Clearer skin and easier weight control"],
    rules: [
      "No added sugar: sweets, soda, pastries, sweetened coffee, desserts.",
      "Read labels — sugar hides in sauces, bread, cereal and 'healthy' bars.",
      "Whole fruit is fine. Fruit juice is not."
    ],
    icon: "health",
    difficulty: "extreme",
    goalKind: "daily",
    durationDays: 30
  },
  {
    id: "deepfocus30",
    name: "Deep Focus",
    description: "3 hours of distraction-free deep work daily.",
    why: "Three genuinely focused hours a day for a month is enough to ship a project, master a skill, or transform your output. Sustained over thirty days, deep work stops being something you schedule and becomes who you are. Few habits pay off as visibly as this one.",
    benefits: ["A finished project or new skill", "Elite-level concentration", "A permanent deep-work identity"],
    rules: [
      "Three hours of deep work a day, timer running.",
      "One task at a time, phone in another room.",
      "Split it into blocks if you like — three hours ON task is the number."
    ],
    icon: "timer",
    difficulty: "extreme",
    goalKind: "daily",
    durationDays: 30
  },
  {
    id: "fivecold",
    name: "5 AM & Cold",
    description: "Wake at 5 AM and take a cold shower every day.",
    why: "Starting every day with a 5 AM wake-up and a cold shower is a double dose of discipline before most people are awake. A month of it builds mornings — and a mindset — that are genuinely hard to shake. You'll gain hours, alertness, and the daily proof that you can do hard things.",
    benefits: ["Hours of extra morning time", "A jolt of daily discipline", "Alertness and resilience that lasts"],
    rules: [
      "Awake at 5 AM, no snooze.",
      "Cold shower straight after — two minutes, no warm water.",
      "Both or neither: one without the other doesn't count."
    ],
    icon: "sun",
    difficulty: "extreme",
    goalKind: "daily",
    durationDays: 30
  },
  {
    id: "spendnothing",
    name: "Spend Nothing Extra",
    description: "No unnecessary spending — save ₱100 every day.",
    why: "A month of spending nothing beyond the essentials completely rebuilds your relationship with money. You'll break autopilot impulse habits and watch real savings stack up, one day at a time. By the end you'll see clearly how much of your old spending you never actually needed.",
    benefits: ["A visibly fuller savings account", "Impulse spending broken", "A clear-eyed view of your money"],
    rules: [
      "Essentials only: food, transport, bills, medicine.",
      "Move ₱100 into savings, every day.",
      "No small exceptions — no coffee runs, no deliveries, no sales."
    ],
    icon: "money",
    difficulty: "extreme",
    goalKind: "daily",
    durationDays: 30
  },
  {
    id: "readdaily30",
    name: "30 Pages a Day",
    description: "Read 30 pages every day for a month.",
    why: "Thirty pages a day adds up to a full book or two in a month — real depth, not headlines. Sustained deep reading rebuilds the long attention span that endless scrolling quietly erodes. It's one of the highest-return ways to spend an hour a day.",
    benefits: ["One to two finished books", "A restored attention span", "Deeper knowledge and thinking"],
    rules: [
      "Thirty pages of a book, every day.",
      "Paper or e-reader. Audiobooks don't count here.",
      "Finish them before bed; pages don't carry over to tomorrow."
    ],
    icon: "book",
    difficulty: "extreme",
    goalKind: "daily",
    durationDays: 30
  },
  {
    id: "shipdaily",
    name: "Ship Daily",
    description: "Create and post something you made — every day.",
    why: "Shipping something every single day for a month kills perfectionism and forces you to build a real body of work. Consistency beats talent, and thirty public reps will sharpen your skills faster than months of planning ever could. What you can make by the end will surprise you.",
    benefits: ["A month-long body of work", "Perfectionism defeated", "Rapidly sharpened skills"],
    rules: [
      "Make something and publish it the same day.",
      "Public — somewhere another person can actually see it.",
      "No saving it for a better day. The day is the deadline."
    ],
    icon: "brush",
    difficulty: "extreme",
    goalKind: "daily",
    durationDays: 30
  }
];

/** The number of days (or 1, for a one-time goal) needed to complete a challenge. */
export function challengeTarget(challenge: ProductivityChallenge): number {
  return challenge.goalKind === "once" ? 1 : challenge.durationDays;
}

/** Short label for a challenge's commitment, e.g. "3 days" or "One-time". */
export function challengeDurationLabel(challenge: ProductivityChallenge): string {
  return challenge.goalKind === "once" ? "One-time" : `${challenge.durationDays} days`;
}

export type ChallengeProgress = {
  /** Distinct days the group has logged it (capped at target). */
  daysDone: number;
  target: number;
  complete: boolean;
  /** 0–1 toward the finish line. */
  pct: number;
};

/** Resolve a challenge's live progress from the number of distinct days the
 * group has logged it. `daysDone` comes from Group.completedDaysByHabit. */
export function challengeProgressFor(challenge: ProductivityChallenge, daysDone: number): ChallengeProgress {
  const target = challengeTarget(challenge);
  return {
    daysDone: Math.min(daysDone, target),
    target,
    complete: daysDone >= target,
    pct: target > 0 ? Math.min(1, daysDone / target) : 0
  };
}

function normalizeChallengeName(name: string): string {
  return name.trim().toLowerCase();
}

const challengesByName = new Map(productivityChallenges.map((challenge) => [normalizeChallengeName(challenge.name), challenge]));

/** Resolve a group habit back to its challenge definition by name (group habits
 * are stored by name, not challenge id). Custom habits return undefined. */
export function challengeByName(name: string): ProductivityChallenge | undefined {
  return challengesByName.get(normalizeChallengeName(name));
}

/** XP a single completion of this habit is worth (base for custom habits). */
export function xpForHabitName(name: string): number {
  const challenge = challengeByName(name);
  return challenge ? challengeXp[challenge.difficulty] : BASE_HABIT_XP;
}

/** Total group XP from per-habit completion counts. */
export function groupXpFromCounts(habits: { id: string; name: string }[], countByHabit: Record<string, number>): number {
  return habits.reduce((sum, habit) => sum + (countByHabit[habit.id] ?? 0) * xpForHabitName(habit.name), 0);
}

// ---------------------------------------------------------------------------
// Group Score: an XP-driven level that climbs forever, alongside the milestone
// ladder above. The cost to reach a level grows quadratically so early levels
// come fast and later ones feel earned.
// ---------------------------------------------------------------------------
export type GroupScore = {
  xp: number;
  level: number;
  /** XP at the start of the current level. */
  floor: number;
  /** XP needed to reach the next level. */
  ceiling: number;
  /** XP earned within the current level. */
  into: number;
  /** XP span of the current level. */
  span: number;
  /** 0–1 progress toward the next level. */
  progress: number;
};

/** Cumulative XP required to be AT a given level (level 1 = 0). */
function cumulativeXpForLevel(level: number): number {
  return 50 * (level - 1) * level;
}

export function groupScoreForXp(xp: number): GroupScore {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 1;
  while (cumulativeXpForLevel(level + 1) <= safeXp) {
    level += 1;
  }
  const floor = cumulativeXpForLevel(level);
  const ceiling = cumulativeXpForLevel(level + 1);
  const span = ceiling - floor;
  const into = safeXp - floor;

  return { xp: safeXp, level, floor, ceiling, into, span, progress: span > 0 ? into / span : 1 };
}

// ---------------------------------------------------------------------------
// Trophies — a group's achievement shelf, grouped by tier (Bronze → Diamond).
// Each is earned once a synced metric crosses its target (no extra backend), and
// carries a `variant` picking which line-art award graphic it uses.
// ---------------------------------------------------------------------------
export type GroupTrophyMetric = "members" | "completions" | "streak" | "rollCallStreak" | "challengesWon";
export type TrophyVariant = "cup" | "star" | "medal" | "diamond";

export type GroupTrophy = {
  id: string;
  name: string;
  /** What it takes, in as few words as fit under the art on the shelf. */
  requirement: string;
  /**
   * What earning it MEANS. The shelf tile and the locked chip both already
   * state the number, so a description that only restated it — "Log 200
   * completions" — was the third copy of the same fact and the one place with
   * room to say something. This is what the card shows.
   */
  description: string;
  tier: GroupChallengeTier;
  metric: GroupTrophyMetric;
  target: number;
  variant: TrophyVariant;
};

export const groupTrophyTierOrder: GroupChallengeTier[] = ["bronze", "silver", "gold", "diamond"];

// One of each award shape per tier (cup / star / medal / diamond) for variety.
export const groupTrophies: GroupTrophy[] = [
  // Bronze — the first wins.
  {
    id: "bronze-completions",
    name: "First Wins",
    requirement: "Log 14 completions",
    description: "Fourteen check-ins between you. Enough to know this group actually does the thing it was made for.",
    tier: "bronze",
    metric: "completions",
    target: 14,
    variant: "cup"
  },
  {
    id: "bronze-streak",
    name: "Warming Up",
    requirement: "14-day group streak",
    description: "Two weeks where nobody let the others down. The habit has a shape now.",
    tier: "bronze",
    metric: "streak",
    target: 14,
    variant: "star"
  },
  {
    id: "bronze-members",
    name: "First Steps",
    requirement: "Grow to 3 members",
    description: "Three of you. Big enough that showing up stopped being only your own business.",
    tier: "bronze",
    metric: "members",
    target: 3,
    variant: "medal"
  },
  {
    id: "bronze-challenge",
    name: "On the Board",
    requirement: "Win 3 challenges",
    description: "Three challenges seen all the way through. The group knows it can finish what it starts.",
    tier: "bronze",
    metric: "challengesWon",
    target: 3,
    variant: "diamond"
  },

  // Silver — building momentum.
  {
    id: "silver-completions",
    name: "Team Effort",
    requirement: "Log 75 completions",
    description: "Seventy-five check-ins, and nobody carried this on their own.",
    tier: "silver",
    metric: "completions",
    target: 75,
    variant: "cup"
  },
  {
    id: "silver-streak",
    name: "On a Roll",
    requirement: "45-day group streak",
    description: "Six weeks unbroken — every member, every habit, every day. Most groups never see a fortnight.",
    tier: "silver",
    metric: "streak",
    target: 45,
    variant: "star"
  },
  {
    id: "silver-members",
    name: "Full Squad",
    requirement: "Grow to 8 members",
    description: "Eight people pulling in the same direction. That is a team, not a group chat.",
    tier: "silver",
    metric: "members",
    target: 8,
    variant: "medal"
  },
  {
    id: "silver-challenge",
    name: "Challenger",
    requirement: "Win 8 challenges",
    description: "Eight challenges finished. Picking a hard one has stopped being a debate.",
    tier: "silver",
    metric: "challengesWon",
    target: 8,
    variant: "diamond"
  },

  // Gold — serious commitment.
  {
    id: "gold-completions",
    name: "Double Century",
    requirement: "Log 200 completions",
    description: "Two hundred check-ins together. Whatever this group is doing, it is working.",
    tier: "gold",
    metric: "completions",
    target: 200,
    variant: "cup"
  },
  {
    id: "gold-streak",
    name: "Unstoppable",
    requirement: "120-day group streak",
    description: "Four months without a single miss from anyone. This is no longer a run of luck.",
    tier: "gold",
    metric: "streak",
    target: 120,
    variant: "star"
  },
  {
    id: "gold-rollcall",
    name: "Reliable",
    requirement: "21-day roll call",
    description: "Three weeks where every member turned up, every day. Being there is its own habit.",
    tier: "gold",
    metric: "rollCallStreak",
    target: 21,
    variant: "medal"
  },
  {
    id: "gold-challenge",
    name: "Dedicated",
    requirement: "Win 16 challenges",
    description: "Sixteen challenges done. This group goes looking for hard things now.",
    tier: "gold",
    metric: "challengesWon",
    target: 16,
    variant: "diamond"
  },

  // Diamond — legendary.
  {
    id: "diamond-completions",
    name: "Elite",
    requirement: "Log 750 completions",
    description: "Seven hundred and fifty. This is what a year of showing up for each other adds up to.",
    tier: "diamond",
    metric: "completions",
    target: 750,
    variant: "cup"
  },
  {
    id: "diamond-streak",
    name: "Legends",
    requirement: "300-day group streak",
    description: "Three hundred days. Everyone, every habit, every single day — and not one of them missed.",
    tier: "diamond",
    metric: "streak",
    target: 300,
    variant: "star"
  },
  {
    id: "diamond-rollcall",
    name: "Ironclad",
    requirement: "45-day roll call",
    description: "Six weeks and nobody skipped a day. Whatever holds this group together, it holds.",
    tier: "diamond",
    metric: "rollCallStreak",
    target: 45,
    variant: "medal"
  },
  {
    id: "diamond-challenge",
    name: "Champion",
    requirement: "Win 30 challenges",
    description: "Thirty challenges won. There is not much left for this group to prove.",
    tier: "diamond",
    metric: "challengesWon",
    target: 30,
    variant: "diamond"
  }
];

export type GroupTrophyMetrics = Record<GroupTrophyMetric, number>;

/**
 * The floor under the whole shelf: a group of one earns nothing.
 *
 * Every trophy here is written as something a GROUP did — "nobody let the others
 * down", "nobody carried this on their own" — and all but the `members` ones can
 * be reached alone, by making a group for yourself and checking in for a month.
 * That turns the shelf into a solo achievement wall the app already has (see the
 * streak badges), and it awards "Team Effort" to a team of one.
 *
 * So the requirement is stated once, here, rather than as a `minMembers` on 16
 * trophies that would all carry the same 2 — and rather than in the screens,
 * which would each have to remember it. `members`-metric trophies are covered by
 * their own target anyway; this is what makes the other twelve honest.
 */
export const TROPHY_MIN_MEMBERS = 2;

export function trophyEarned(trophy: GroupTrophy, metrics: GroupTrophyMetrics): boolean {
  if (metrics.members < TROPHY_MIN_MEMBERS) {
    return false;
  }

  return metrics[trophy.metric] >= trophy.target;
}

export function earnedTrophies(metrics: GroupTrophyMetrics): GroupTrophy[] {
  return groupTrophies.filter((trophy) => trophyEarned(trophy, metrics));
}

export function earnedTrophyCount(metrics: GroupTrophyMetrics): number {
  return groupTrophies.reduce((count, trophy) => (trophyEarned(trophy, metrics) ? count + 1 : count), 0);
}

/**
 * The best trophy the group holds — what the group page wears where the
 * milestone ladder's rank chip used to sit.
 *
 * The shelf is authored in tier order (bronze → diamond), so the last earned
 * entry is the highest. Null for a group that has not earned one yet, which the
 * chip reads as "Unranked".
 */
export function bestEarnedTrophy(metrics: GroupTrophyMetrics): GroupTrophy | null {
  const earned = earnedTrophies(metrics);

  return earned.length > 0 ? earned[earned.length - 1] : null;
}

/** The glyph each award shape wears outside the shelf — on a chip, or on the
 *  celebration card, where the line-art trophy image is too detailed to read. */
export const trophyVariantIcon: Record<TrophyVariant, IconName> = {
  cup: "trophy",
  star: "star",
  medal: "award",
  diamond: "crown1"
};

/** How many built-in challenges the group has completed (a "challengesWon"
 * metric source). Typed structurally to avoid importing the friends layer. */
export function countWonChallenges(
  habits: { id: string; name: string }[],
  completedDaysByHabit: Record<string, string[]>
): number {
  return productivityChallenges.reduce((count, challenge) => {
    const habit = habits.find((entry) => entry.name.trim().toLowerCase() === challenge.name.trim().toLowerCase());
    const daysDone = habit ? completedDaysByHabit[habit.id]?.length ?? 0 : 0;
    return challengeProgressFor(challenge, daysDone).complete ? count + 1 : count;
  }, 0);
}

