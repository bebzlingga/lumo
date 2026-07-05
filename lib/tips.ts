import type { IconName } from "@/components/Icon";

export type Tip = { title: string; body: string; action: string };
export type TipSection = {
  slug: string;
  icon: IconName;
  title: string;
  focus: string;
  tips: Tip[];
};

/**
 * A consolidated, best-of synthesis of the most trusted habit books —
 * Atomic Habits (James Clear), The Power of Habit (Charles Duhigg),
 * Tiny Habits (BJ Fogg), Better Than Before (Gretchen Rubin),
 * The Willpower Instinct (Kelly McGonigal), The Compound Effect (Darren Hardy),
 * and Mini Habits (Stephen Guise) — reorganized into one practical path.
 * Each tip pairs the idea with a concrete action the reader can take.
 */
export const TIP_SECTIONS: TipSection[] = [
  {
    slug: "how-habits-work",
    icon: "refresh",
    title: "How habits work",
    focus: "The loop running quietly behind every routine",
    tips: [
      {
        title: "Learn the habit loop",
        body: "In The Power of Habit, Charles Duhigg shows every habit runs on a loop: a cue triggers a routine that delivers a reward. Repeat it enough and the brain automates the whole sequence. Once you can spot the loop behind a behavior, you can redesign it instead of fighting it.",
        action: "Pick one habit you'd like to change and write down its three parts — the cue that starts it, the routine you do, and the reward you get."
      },
      {
        title: "Swap the routine, keep the cue and reward",
        body: "Duhigg's Golden Rule of Habit Change: you rarely erase a habit — you replace it. Keep the same cue and the same reward, but insert a better routine between them. Craving a break from stress? Take a short walk instead of reaching for the snack.",
        action: "Choose one habit you dislike. Keep its cue and reward, but pick a healthier routine to try in the middle this week."
      },
      {
        title: "Behavior = Motivation + Ability + Prompt",
        body: "BJ Fogg (Tiny Habits) reduces every action to B=MAP: it happens only when motivation, ability, and a prompt line up at the same moment. When a habit won't stick, one of the three is missing — usually make it easier, or add a clearer prompt, rather than trying to want it more.",
        action: "For a habit that keeps failing, ask: is it too hard to do, or too easy to forget? Then either shrink it or set a clearer reminder."
      },
      {
        title: "Find your keystone habit",
        body: "Duhigg found that certain habits — exercise, making your bed, a shared family dinner — quietly set off a cascade of other good behaviors. Change one keystone habit and the rest gets easier, so spend your early energy there rather than spreading it thin.",
        action: "Name the one habit that would make everything else easier — often exercise, sleep, or planning your day — and start with just that."
      }
    ]
  },
  {
    slug: "start-small",
    icon: "tree",
    title: "Start tiny, then win big",
    focus: "Winning the first, almost-effortless reps",
    tips: [
      {
        title: "Make it too small to fail",
        body: "James Clear's Two-Minute Rule, Fogg's \"start tiny,\" and Stephen Guise's Mini Habits all agree: shrink the habit until it feels almost laughable — \"floss one tooth,\" \"read one page,\" \"put on running shoes.\" Establish the behavior first; the size can grow once showing up is automatic.",
        action: "Shrink your habit to a version you could do on your worst day — one push-up, one page, one sentence — and commit to only that for now."
      },
      {
        title: "Don't wait for motivation",
        body: "Motivation rises and falls by the hour, so Fogg and Guise argue you should engineer the habit to be so easy that motivation barely matters. Willpower will fail you on a bad day — a two-minute version won't ask for any.",
        action: "Do your tiny habit today whether or not you feel like it, and notice that at that size, mood doesn't get a vote."
      },
      {
        title: "Anchor it to what you already do",
        body: "Both Fogg and Clear recommend attaching a new habit to an existing routine: \"After I [current habit], I will [tiny habit].\" The routine you already run on autopilot becomes a dependable prompt, so you never have to remember the new one.",
        action: "Fill in and use this line: \"After I ______, I will ______.\" Choose a rock-solid daily routine as the anchor."
      },
      {
        title: "Celebrate the instant you finish",
        body: "Fogg's overlooked ingredient is emotion. A small celebration the moment you finish — a smile, a quiet \"yes!\", a fist pump — floods the behavior with positive feeling and wires it in. Habits form from emotion, not repetition alone.",
        action: "The second you complete the habit, give yourself a genuine little celebration — a fist pump, a smile, a \"yes!\" — to seal in the win."
      }
    ]
  },
  {
    slug: "make-it-stick",
    icon: "calendar",
    title: "Make it stick",
    focus: "Consistency, cues, and a friendlier environment",
    tips: [
      {
        title: "Design your environment",
        body: "Clear and Duhigg agree that behavior follows cues, so shape the space around you: make good habits obvious and easy, bad ones invisible and hard. Gretchen Rubin calls it convenience and inconvenience — fruit on the counter, cookies out of reach, phone in another room.",
        action: "Today, make one good cue obvious (lay it out in plain sight) and put one bad cue out of reach or out of the room."
      },
      {
        title: "Never miss twice",
        body: "Clear's rule: missing once is an accident; missing twice is the start of a new habit. Darren Hardy's The Compound Effect explains why it works — small, consistent choices compound over time, so protecting the streak matters far more than any single heroic effort.",
        action: "Make a personal rule right now: if you miss a day, the next day is non-negotiable. Two misses in a row is off the table."
      },
      {
        title: "Track it — what gets measured gets managed",
        body: "Rubin's Strategy of Monitoring and Clear's habit tracking both show that simply watching a behavior tends to improve it. Mark the habit done the moment you finish; the visible chain becomes something you won't want to break.",
        action: "Mark today's habit as done the instant you finish it, and aim to keep the chain unbroken all week."
      },
      {
        title: "Make it attractive",
        body: "Clear's temptation bundling pairs something you want with something you should do — only watch your show while on the treadmill, only sip the good coffee while journaling. Anticipation of the reward, rather than raw discipline, is what pulls you toward the habit.",
        action: "Pick a treat you'll allow only during your habit — a favorite playlist, podcast, or show — so you start looking forward to it."
      }
    ]
  },
  {
    slug: "willpower-and-setbacks",
    icon: "zap",
    title: "Willpower & setbacks",
    focus: "Discipline, recovery, and knowing yourself",
    tips: [
      {
        title: "Treat willpower like a muscle",
        body: "Kelly McGonigal (The Willpower Instinct) shows self-control is trainable but tires through the day. Protect it with sleep, food, and lower stress, and schedule your hardest habit for when your willpower is freshest — usually the morning.",
        action: "Move your hardest habit to earlier in the day, and protect it by keeping a consistent bedtime tonight."
      },
      {
        title: "Forgive your slips",
        body: "McGonigal's research is counterintuitive: guilt makes another slip more likely, while self-compassion after a lapse helps you recover faster. When you miss, skip the shame spiral and simply start again — the comeback matters more than the stumble.",
        action: "Next time you slip, say \"that's human\" instead of beating yourself up, and just restart at the next opportunity."
      },
      {
        title: "Know your tendency",
        body: "Rubin's Four Tendencies — Upholder, Questioner, Obliger, Rebel — explain why one-size advice fails. Obligers, the largest group, meet outer expectations but drop inner ones, so they need external accountability; Questioners need a solid reason. Build the system that fits how you're wired.",
        action: "If you keep promises to others but not yourself, you're likely an Obliger — set up outside accountability like a partner, a check-in, or a public commitment."
      },
      {
        title: "Abstain or moderate — pick one",
        body: "Rubin distinguishes abstainers, who find it easier to have none, from moderators, who do better with a little. Forcing the wrong strategy burns willpower you can't spare. Decide which you are for a given temptation, and stop fighting your own nature.",
        action: "For one tempting treat, decide honestly whether none or a little is easier for you — then set that as your rule and stop renegotiating it."
      }
    ]
  },
  {
    slug: "make-it-who-you-are",
    icon: "award",
    title: "Make it who you are",
    focus: "Identity, systems, and lasting mastery",
    tips: [
      {
        title: "Vote for an identity",
        body: "Clear's most powerful idea: focus on who you wish to become, not just what you want to achieve. Every repetition is a vote — \"I'm a runner,\" \"I'm a reader.\" The aim isn't to finish a book, it's to become the kind of person who reads.",
        action: "Rewrite your goal as an identity — not \"I want to write,\" but \"I'm a writer\" — then ask what that person would do today."
      },
      {
        title: "Build systems, not goals",
        body: "\"You do not rise to the level of your goals. You fall to the level of your systems,\" Clear writes. Winners and losers often share the same goal; the system is what separates them. Fall in love with the daily process and the outcomes follow.",
        action: "Replace a finish-line goal with a repeatable weekly schedule, and commit to following the schedule regardless of results."
      },
      {
        title: "Believe it's possible — ideally together",
        body: "Duhigg found that lasting change sticks when people believe change is possible, and that belief grows strongest inside a community. A partner, a group, or a shared streak turns a fragile new behavior into a durable identity.",
        action: "Tell one person about your habit, or join a group doing the same thing, so you're not relying on willpower alone."
      },
      {
        title: "Expect the plateau, then keep refining",
        body: "Clear's Plateau of Latent Potential: results lag far behind effort, so progress feels invisible until it suddenly isn't — like ice melting a degree past freezing. Push through the dip, review your systems regularly, and teach what you've learned to lock it in.",
        action: "When progress feels invisible, don't quit — keep going and run a five-minute weekly review to tweak whatever isn't working."
      }
    ]
  }
];

export function getTipSection(slug: string | undefined): TipSection | undefined {
  return TIP_SECTIONS.find((section) => section.slug === slug);
}
