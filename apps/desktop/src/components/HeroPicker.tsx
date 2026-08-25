import { useState } from "react";
import { HERO_DEFS, SPRITE_URLS, type HeroDef } from "./sprites/heroDefs";
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
          <img src={SPRITE_URLS[hero.textureKey]} alt="" className={styles.thumbImg} />
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
                  <img src={SPRITE_URLS[h.textureKey]} alt="" className={styles.optionImg} />
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
