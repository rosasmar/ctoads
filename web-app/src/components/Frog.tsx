// Deterministic generative frog for a CTOad id. The same id always draws the same frog, so it
// works as a placeholder PFP until the final art is ready.

type Traits = {
  background: string;
  skin: string;
  belly: string;
  eyes: "normal" | "sleepy" | "rekt" | "shades" | "side-eye";
  mouth: "smile" | "frown" | "flat" | "tongue";
  hat: "none" | "cap" | "party" | "crown" | "beanie";
};

const BACKGROUNDS = ["#1e293b", "#3b0764", "#7c2d12", "#064e3b", "#1e3a8a", "#831843", "#3f3f46", "#713f12"];
const SKINS: [string, string, number][] = [
  // [skin, belly, weight]
  ["#4ade80", "#bbf7d0", 30],
  ["#22c55e", "#dcfce7", 25],
  ["#84cc16", "#ecfccb", 15],
  ["#14b8a6", "#ccfbf1", 10],
  ["#a3a3a3", "#e5e5e5", 8],
  ["#f472b6", "#fce7f3", 6],
  ["#facc15", "#fef9c3", 4],
  ["#f8fafc", "#ffffff", 2],
];

function rng(seed: number) {
  // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(next: () => number, options: [T, number][]): T {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = next() * total;
  for (const [value, weight] of options) {
    r -= weight;
    if (r < 0) return value;
  }
  return options[options.length - 1][0];
}

export function frogTraits(id: number): Traits {
  const next = rng(Math.imul(id, 2654435761) ^ 0x5eed);
  const [skin, belly] = pick(next, SKINS.map(([s, b, w]) => [[s, b] as const, w] as [readonly [string, string], number]));
  return {
    background: BACKGROUNDS[Math.floor(next() * BACKGROUNDS.length)],
    skin,
    belly,
    eyes: pick(next, [["normal", 35], ["sleepy", 20], ["rekt", 20], ["side-eye", 15], ["shades", 10]]),
    mouth: pick(next, [["frown", 35], ["flat", 25], ["smile", 25], ["tongue", 15]]),
    hat: pick(next, [["none", 45], ["cap", 20], ["beanie", 15], ["party", 15], ["crown", 5]]),
  };
}

function Eyes({ style, skin }: { style: Traits["eyes"]; skin: string }) {
  const centers = [32, 68];
  if (style === "shades") {
    return (
      <g>
        <rect x={20} y={30} width={24} height={13} rx={4} fill="#0a0a0a" />
        <rect x={56} y={30} width={24} height={13} rx={4} fill="#0a0a0a" />
        <rect x={43} y={34} width={14} height={3} fill="#0a0a0a" />
        <rect x={24} y={32} width={7} height={3} rx={1.5} fill="#ffffff" opacity={0.5} />
      </g>
    );
  }
  return (
    <g>
      {centers.map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={36} r={8} fill="#ffffff" />
          {style === "rekt" ? (
            <g stroke="#0a0a0a" strokeWidth={2.5} strokeLinecap="round">
              <line x1={cx - 4} y1={32} x2={cx + 4} y2={40} />
              <line x1={cx + 4} y1={32} x2={cx - 4} y2={40} />
            </g>
          ) : (
            <circle cx={style === "side-eye" ? cx + 3.5 : cx} cy={37} r={3.6} fill="#0a0a0a" />
          )}
          {style === "sleepy" && <path d={`M ${cx - 8.5} 36 A 8.5 8.5 0 0 1 ${cx + 8.5} 36 Z`} fill={skin} />}
        </g>
      ))}
    </g>
  );
}

function Mouth({ style }: { style: Traits["mouth"] }) {
  const stroke = { stroke: "#0a0a0a", strokeWidth: 2.5, fill: "none", strokeLinecap: "round" as const };
  switch (style) {
    case "smile":
      return <path d="M 36 60 Q 50 70 64 60" {...stroke} />;
    case "frown":
      return <path d="M 36 66 Q 50 56 64 66" {...stroke} />;
    case "flat":
      return <path d="M 38 63 L 62 63" {...stroke} />;
    case "tongue":
      return (
        <g>
          <path d="M 36 60 Q 50 70 64 60" {...stroke} />
          <ellipse cx={54} cy={67} rx={4.5} ry={5} fill="#f43f5e" />
        </g>
      );
  }
}

function Hat({ style }: { style: Traits["hat"] }) {
  switch (style) {
    case "cap":
      return (
        <g>
          <path d="M 30 24 Q 50 6 70 24 Z" fill="#ef4444" />
          <rect x={56} y={21} width={24} height={5} rx={2.5} fill="#b91c1c" />
        </g>
      );
    case "party":
      return (
        <g>
          <polygon points="50,2 40,26 60,26" fill="#a855f7" />
          <circle cx={50} cy={3} r={3} fill="#fde047" />
        </g>
      );
    case "crown":
      return <polygon points="36,26 36,12 43,19 50,8 57,19 64,12 64,26" fill="#facc15" stroke="#a16207" strokeWidth={1} />;
    case "beanie":
      return (
        <g>
          <path d="M 32 26 Q 50 4 68 26 Z" fill="#3b82f6" />
          <circle cx={50} cy={9} r={4} fill="#93c5fd" />
        </g>
      );
    default:
      return null;
  }
}

export function Frog({ id, className }: { id: number; className?: string }) {
  const t = frogTraits(id);
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={`CTOad #${id}`}>
      <rect width={100} height={100} fill={t.background} />
      <ellipse cx={50} cy={86} rx={30} ry={18} fill={t.skin} />
      <ellipse cx={50} cy={89} rx={17} ry={11} fill={t.belly} />
      <ellipse cx={50} cy={56} rx={35} ry={23} fill={t.skin} />
      <circle cx={32} cy={36} r={12} fill={t.skin} />
      <circle cx={68} cy={36} r={12} fill={t.skin} />
      <circle cx={26} cy={60} r={4} fill="#f43f5e" opacity={0.25} />
      <circle cx={74} cy={60} r={4} fill="#f43f5e" opacity={0.25} />
      <Hat style={t.hat} />
      <Eyes style={t.eyes} skin={t.skin} />
      <Mouth style={t.mouth} />
    </svg>
  );
}
