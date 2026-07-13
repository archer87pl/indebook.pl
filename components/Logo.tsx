/**
 * Logo Rezio — wariant D: litera „R" na kaflu z odznaką potwierdzenia (✓).
 *
 * tone="light" (domyślny, na jasnym tle): ciemny kafel #123829, mintowe „R",
 *   mintowa odznaka z ciemnym ✓, obwódka odznaki w kolorze tła strony (ringColor).
 * tone="dark" (na ciemnym tle, np. rail/stopka): mintowy kafel, ciemne „R",
 *   ciemna odznaka z mintowym ✓.
 */
export default function Logo({
  size = 32,
  tone = "light",
  wordmark = true,
  ringColor = "#f7faf8",
}: {
  size?: number;
  tone?: "light" | "dark";
  wordmark?: boolean;
  ringColor?: string;
}) {
  const dark = tone === "dark";
  const tile = dark ? "#4ade9b" : "#123829";
  const letter = dark ? "#0d2b1e" : "#4ade9b";
  const badgeBg = dark ? "#123829" : "#4ade9b";
  const badgeRing = dark ? "#123829" : ringColor;
  const check = dark ? "#4ade9b" : "#0d2b1e";
  const radius = Math.round(size * 0.29);
  const fontSize = Math.round(size * 0.66);
  const badge = Math.round(size * 0.46);

  return (
    <span className="inline-flex items-center" style={{ gap: size * 0.38 }}>
      <span
        className="relative flex flex-none items-center justify-center"
        style={{ width: size, height: size, borderRadius: radius, background: tile }}
      >
        <span
          className="font-bold leading-none"
          style={{
            fontSize,
            color: letter,
            letterSpacing: "-0.04em",
            marginTop: -Math.round(size * 0.07),
          }}
        >
          R
        </span>
        <span
          className="absolute flex items-center justify-center rounded-full"
          style={{
            bottom: -Math.round(badge * 0.22),
            right: -Math.round(badge * 0.22),
            width: badge,
            height: badge,
            background: badgeBg,
            border: `${Math.max(2, Math.round(size * 0.07))}px solid ${badgeRing}`,
          }}
        >
          <svg
            width={badge * 0.55}
            height={badge * 0.55}
            viewBox="0 0 24 24"
            fill="none"
            stroke={check}
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
      </span>
      {wordmark && (
        <span
          className="font-bold"
          style={{
            fontSize: size * 0.58,
            letterSpacing: "-0.02em",
            color: dark ? "#ffffff" : "#123829",
          }}
        >
          Rezio
        </span>
      )}
    </span>
  );
}
