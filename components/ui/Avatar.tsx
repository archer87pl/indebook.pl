const TONES = {
  mint: "bg-brand-400 text-brand-950",
  dark: "bg-brand-900 text-brand-400",
  soft: "bg-brand-100 text-brand-700",
} as const;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Kółko z inicjałami (rail, listy gości, czat). */
export default function Avatar({
  name,
  size = 30,
  tone = "mint",
}: {
  name: string;
  size?: number;
  tone?: keyof typeof TONES;
}) {
  return (
    <span
      className={`inline-flex flex-none items-center justify-center rounded-full font-bold ${TONES[tone]}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initials(name)}
    </span>
  );
}
