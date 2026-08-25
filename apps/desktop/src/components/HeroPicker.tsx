import { useState } from "react";
import { HERO_DEFS, type HeroDef } from "./sprites/heroDefs";
import { HeroSprite } from "./sprites/HeroSprite";
import styles from "./HeroPicker.module.css";

interface HeroPickerProps {
  hero: HeroDef;
  onSelect: (heroId: string) => void;
}

export function HeroPicker({ hero, onSelect }: HeroPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.trigger} onClick={() => setOpen((v) => !v)}>
        <span className={styles.triggerThumb}>
          <HeroSprite hero={hero} facing="right" walking={false} size={24} />
        </span>
        {hero.name}
      </button>

      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div className={styles.panel}>
            <div className={styles.panelTitle}>Choose your hero</div>
            <div className={styles.grid}>
              {HERO_DEFS.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className={[styles.option, h.id === hero.id ? styles.optionActive : ""].join(" ")}
                  onClick={() => {
                    onSelect(h.id);
                    setOpen(false);
                  }}
                >
                  <HeroSprite hero={h} facing="right" walking={false} size={36} />
                  <span>{h.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
