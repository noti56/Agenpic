import styles from "./RobotSprite.module.css";

interface RobotSpriteProps {
  facing: "left" | "right";
  walking: boolean;
  active?: boolean;
  accent?: string;
  size?: number;
}

const METAL = "#20202e";
const METAL_DARK = "#17171f";
const JOINT = "#2c2c3e";

export function RobotSprite({ facing, walking, active, accent = "#00fff2", size = 48 }: RobotSpriteProps) {
  return (
    <svg
      viewBox="0 0 48 64"
      width={size}
      height={(size * 64) / 48}
      className={[styles.sprite, walking ? styles.walking : styles.idle, active ? styles.active : ""]
        .filter(Boolean)
        .join(" ")}
      style={{
        transform: facing === "left" ? "scaleX(-1)" : undefined,
        filter: `drop-shadow(0 0 6px ${accent}55)`,
      }}
    >
      <g className={styles.body}>
        {/* antenna */}
        <line x1="24" y1="2" x2="24" y2="7" stroke="#3a3a52" strokeWidth="2" />
        <circle className={styles.led} cx="24" cy="2" r="2.4" fill={accent} />

        {/* back arm */}
        <rect x="9" y="28" width="6" height="13" rx="2" fill={METAL} />
        <circle cx="12" cy="42" r="3.6" fill={JOINT} />

        {/* legs */}
        <g className={styles.legLeft}>
          <rect x="15" y="42" width="8" height="15" rx="2" fill={METAL} />
          <rect x="14" y="55" width="10" height="5" rx="1.5" fill={METAL_DARK} />
          <rect x="15" y="57" width="8" height="1.6" fill={accent} opacity="0.7" />
        </g>
        <g className={styles.legRight}>
          <rect x="25" y="42" width="8" height="15" rx="2" fill={METAL} />
          <rect x="24" y="55" width="10" height="5" rx="1.5" fill={METAL_DARK} />
          <rect x="25" y="57" width="8" height="1.6" fill={accent} opacity="0.7" />
        </g>

        {/* torso / chassis */}
        <rect x="12" y="24" width="24" height="18" rx="4" fill="#1a1a26" stroke="#2c2c44" strokeWidth="1.2" />
        <circle className={styles.core} cx="24" cy="33" r="3.2" fill={accent} />
        <rect x="15" y="38" width="18" height="2" fill="#2c2c44" />

        {/* head / terminal screen */}
        <rect x="12" y="7" width="24" height="16" rx="4" fill="#12121c" stroke="#2c2c44" strokeWidth="1.4" />
        <rect x="16" y="12" width="16" height="7" rx="1.5" fill="#0a0a12" />
        <path
          d="M18.6 14 l-2.1 2 l2.1 2"
          stroke={accent}
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M29.4 14 l2.1 2 l-2.1 2"
          stroke={accent}
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect className={styles.cursor} x="22.8" y="16.4" width="2.4" height="3" fill={accent} />

        {/* front arm */}
        <g className={styles.armFront}>
          <rect x="33" y="26" width="9" height="6" rx="2" fill={METAL} />
          <circle cx="43" cy="29" r="3.8" fill={JOINT} />
        </g>
      </g>
    </svg>
  );
}
