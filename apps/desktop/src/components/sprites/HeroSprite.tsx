import type { HairStyle, HeroDef } from "./heroDefs";
import styles from "./HeroSprite.module.css";

interface HeroSpriteProps {
  hero: HeroDef;
  facing: "left" | "right";
  walking: boolean;
  size?: number;
  glowColor?: string;
}

const SHOE = "#1c1c2a";

export function HeroSprite({ hero, facing, walking, size = 48, glowColor }: HeroSpriteProps) {
  const { skin, hair, outfit, outfitDark, accent, hairStyle } = hero;
  return (
    <svg
      viewBox="0 0 48 64"
      width={size}
      height={(size * 64) / 48}
      className={[styles.sprite, walking ? styles.walking : styles.idle].join(" ")}
      style={{
        transform: facing === "left" ? "scaleX(-1)" : undefined,
        filter: glowColor ? `drop-shadow(0 0 5px ${glowColor})` : undefined,
      }}
    >
      <g className={styles.body}>
        {/* back arm, resting */}
        <rect x="9" y="29" width="6" height="13" rx="3" fill={outfit} />
        <circle cx="12" cy="43" r="4" fill={skin} />

        {/* legs */}
        <g className={styles.legLeft}>
          <rect x="15" y="42" width="8" height="16" rx="2.5" fill={outfitDark} />
          <rect x="14" y="56" width="10" height="5" rx="2" fill={SHOE} />
        </g>
        <g className={styles.legRight}>
          <rect x="25" y="42" width="8" height="16" rx="2.5" fill={outfitDark} />
          <rect x="24" y="56" width="10" height="5" rx="2" fill={SHOE} />
        </g>

        {/* torso */}
        <rect x="13" y="24" width="22" height="19" rx="5" fill={outfit} />
        <rect x="13" y="38" width="22" height="4" fill={accent} />

        {/* head */}
        <circle cx="24" cy="16" r="10" fill={skin} />
        <g className={styles.eyes}>
          <circle cx="20.5" cy="16" r="1.2" fill="#151522" />
          <circle cx="27.5" cy="16" r="1.2" fill="#151522" />
        </g>

        {renderHair(hairStyle, hair, accent)}

        {/* front arm, punched forward, drawn last so it sits over the torso */}
        <g className={styles.armFront}>
          <rect x="34" y="27" width="9" height="6" rx="3" fill={outfit} />
          <circle cx="43" cy="30" r="4.3" fill={skin} />
        </g>
      </g>
    </svg>
  );
}

function renderHair(style: HairStyle, hair: string, accent: string) {
  switch (style) {
    case "spiky":
      return (
        <>
          <path d="M14 6 L17 1 L20 5 L24 0 L28 5 L31 1 L34 6 Z" fill={hair} />
          <rect x="14" y="9" width="20" height="2.5" fill={accent} />
        </>
      );
    case "mohawk":
      return (
        <>
          <path d="M20 8 L24 0 L28 8 Z" fill={hair} />
          <rect x="20" y="8" width="8" height="3" fill={hair} />
        </>
      );
    case "pony":
      return (
        <>
          <path d="M14 10 A10 9 0 0 1 34 10 Z" fill={hair} />
          <path d="M14 11 q-9 0 -8 9 q0 5 4 6 q0 -8 6 -11 Z" fill={hair} />
        </>
      );
    case "bob":
      return <path d="M13 14 A11 10 0 0 1 35 14 L35 17 L13 17 Z" fill={hair} />;
    case "hood":
      return <path d="M9 20 A15 16 0 0 1 39 20 L37 24 Q24 15 11 24 Z" fill={hair} />;
    case "helmet":
      return (
        <>
          <path d="M12 14 A12 11 0 0 1 36 14 L36 15 L12 15 Z" fill={hair} />
          <rect x="16" y="12.6" width="16" height="2.2" fill={accent} />
        </>
      );
    default:
      return null;
  }
}
