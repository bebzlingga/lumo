import type { ComponentType, SVGProps } from "react";
import type { IconName } from "@/types";

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps): IconProps => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props
});

const Water = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.5c3 3.6 5 6.4 5 9a5 5 0 1 1-10 0c0-2.6 2-5.4 5-9Z" />
    <path d="M9.5 13.5a2.5 2.5 0 0 0 2 2.4" />
  </svg>
);

const Seed = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 21v-6" />
    <path d="M12 15c0-3 2.2-5 5-5-.2 3-2.2 5-5 5Z" />
    <path d="M12 16c0-2.6-1.9-4.4-4.5-4.4C7.7 14 9.5 16 12 16Z" />
  </svg>
);

const Book = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
    <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5Z" />
    <path d="M9 7h6" />
  </svg>
);

const Flame = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3c1.5 2.5 4.5 4 4.5 8a4.5 4.5 0 1 1-9 0c0-1.6.7-2.7 1.6-3.6C9.8 8.6 11 7.4 12 3Z" />
    <path d="M12 20a2 2 0 0 0 2-2c0-1.4-2-2.2-2-4-1 1-2 1.8-2 4a2 2 0 0 0 2 2Z" fill="currentColor" stroke="none" opacity={0.35} />
  </svg>
);

const Trophy = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 4h10v3a5 5 0 0 1-10 0Z" />
    <path d="M7 5H4.5A1.5 1.5 0 0 0 3 6.5C3 9 5 10 7 10" />
    <path d="M17 5h2.5A1.5 1.5 0 0 1 21 6.5C21 9 19 10 17 10" />
    <path d="M12 12v3" />
    <path d="M9 20h6" />
    <path d="M10 20c0-1.5.7-2.5 2-2.5s2 1 2 2.5" />
  </svg>
);

const Rocket = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3c3 1.5 5 4.5 5 8l-2.5 3h-5L7 11c0-3.5 2-6.5 5-8Z" />
    <circle cx="12" cy="9.5" r="1.6" />
    <path d="M9.5 17c-1.5.4-2 1.8-2 4 2.2 0 3.6-.5 4-2" />
    <path d="M14.5 17c1.5.4 2 1.8 2 4-2.2 0-3.6-.5-4-2" />
  </svg>
);

const Star = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.5 14.4 9l5.6.5-4.3 3.7 1.3 5.5L12 15.9 6.9 18.7l1.3-5.5L4 9.5 9.6 9Z" />
  </svg>
);

const Sun = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
  </svg>
);

const Brain = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9.5 4.5A2.5 2.5 0 0 0 7 7a2.4 2.4 0 0 0-1.5 4.3A2.6 2.6 0 0 0 7 16a2.5 2.5 0 0 0 2.5 2.5V4.5Z" />
    <path d="M14.5 4.5A2.5 2.5 0 0 1 17 7a2.4 2.4 0 0 1 1.5 4.3A2.6 2.6 0 0 1 17 16a2.5 2.5 0 0 1-2.5 2.5V4.5Z" />
    <path d="M12 5v14" />
  </svg>
);

const Footprints = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 15c-1.4 0-2.2-1-2.2-3S4.3 8 6 8s2 1.6 2 3.4C8 13.6 7.3 15 6 15Z" />
    <path d="M4.4 17.5c0 1 .6 1.6 1.6 1.6s1.6-.6 1.6-1.6-.4-1.4-1.6-1.4-1.6.5-1.6 1.4Z" />
    <path d="M18 11c-1.4 0-2.2-1-2.2-3S16.3 4 18 4s2 1.6 2 3.4C20 9.6 19.3 11 18 11Z" />
    <path d="M16.4 13.5c0 1 .6 1.6 1.6 1.6s1.6-.6 1.6-1.6-.4-1.4-1.6-1.4-1.6.5-1.6 1.4Z" />
  </svg>
);

const Lotus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5c1.6 1.6 2.4 3.4 2.4 5.4 0 .8-.2 1.6-.6 2.3" />
    <path d="M12 5c-1.6 1.6-2.4 3.4-2.4 5.4 0 .8.2 1.6.6 2.3" />
    <path d="M12 13c-2-1.5-4-2-6-1.6.6 2.6 2.6 4.2 6 4.2s5.4-1.6 6-4.2c-2-.4-4 .1-6 1.6Z" />
    <path d="M4 15.5c2.5 2 5 3 8 3s5.5-1 8-3" />
  </svg>
);

const Pen = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M16.5 4.5l3 3L9 18l-4 1 1-4Z" />
    <path d="M14.5 6.5l3 3" />
  </svg>
);

const Heart = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 20s-6.5-4-8.2-8A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 20.2 12C18.5 16 12 20 12 20Z" />
  </svg>
);

const Apple = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 8c-1-1-2.4-1.5-3.8-1C6 7.7 5 9.6 5 12c0 3.4 2.4 7 4.6 7 .9 0 1.5-.4 2.4-.4s1.5.4 2.4.4C16.6 19 19 15.4 19 12c0-2.4-1-4.3-3.2-5-1.4-.5-2.8 0-3.8 1Z" />
    <path d="M12 8c0-1.6.6-3 2.4-3.6" />
  </svg>
);

const Moon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 13.5A7.5 7.5 0 1 1 10.5 4a6 6 0 0 0 9.5 9.5Z" />
  </svg>
);

const Wind = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 9h9a2.5 2.5 0 1 0-2.5-2.5" />
    <path d="M3 14h13a2.5 2.5 0 1 1-2.5 2.5" />
    <path d="M3 12h6" />
  </svg>
);

const Target = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

const Smile = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 14a4 4 0 0 0 7 0" />
    <path d="M9 9.5h.01M15 9.5h.01" />
  </svg>
);

const Bulb = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 15a5 5 0 1 1 6 0c-.7.5-1 1.2-1 2H10c0-.8-.3-1.5-1-2Z" />
    <path d="M10 19h4M10.5 21h3" />
  </svg>
);

const Shoe = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 15v-3l4-1 2.5 2.5c1 1 2.3 1.5 3.7 1.5H20a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
    <path d="M7 11l1.5 2M10 10l1.5 2.2" />
  </svg>
);

const Sparkle = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3c.4 3.6 1.4 4.6 5 5-3.6.4-4.6 1.4-5 5-.4-3.6-1.4-4.6-5-5 3.6-.4 4.6-1.4 5-5Z" />
    <path d="M18.5 13c.2 1.7.7 2.2 2.5 2.5-1.8.3-2.3.8-2.5 2.5-.2-1.7-.7-2.2-2.5-2.5 1.8-.3 2.3-.8 2.5-2.5Z" />
  </svg>
);

const Leaf = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 19c0-7 5-12 14-13 .5 7-3 14-11 14-1.5 0-2.5-.4-3-1Z" />
    <path d="M8 16c2.5-3 5-5 8.5-6.5" />
  </svg>
);

export const ICONS: Record<IconName, ComponentType<IconProps>> = {
  seed: Seed,
  water: Water,
  book: Book,
  flame: Flame,
  trophy: Trophy,
  rocket: Rocket,
  star: Star,
  sun: Sun,
  brain: Brain,
  footprints: Footprints,
  lotus: Lotus,
  pen: Pen,
  heart: Heart,
  apple: Apple,
  moon: Moon,
  wind: Wind,
  target: Target,
  smile: Smile,
  bulb: Bulb,
  shoe: Shoe,
  sparkle: Sparkle,
  leaf: Leaf
};

export function HabitIcon({ name, ...props }: { name: IconName } & IconProps) {
  const Cmp = ICONS[name];
  return <Cmp {...props} />;
}
