let ctx: AudioContext | undefined;

function getContext(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

/**
 * A short two-tone "poke" chirp, synthesized rather than shipped as a media
 * file — keeps the poke feature self-contained with no asset to source,
 * license, or ship.
 */
export function playPokeSound() {
  try {
    const audio = getContext();
    const now = audio.currentTime;

    const gain = audio.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    gain.connect(audio.destination);

    const osc = audio.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(760, now);
    osc.frequency.exponentialRampToValueAtTime(1180, now + 0.12);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch {
    // Autoplay/permission policies can block AudioContext — the toast and
    // tab blink still land, so a missed sound isn't fatal.
  }
}

/** A single soft blip for an incoming chat message — quieter and simpler than poke's chirp, since chat is more frequent and less urgent. */
export function playMessageSound() {
  try {
    const audio = getContext();
    const now = audio.currentTime;

    const gain = audio.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    gain.connect(audio.destination);

    const osc = audio.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(920, now);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch {
    // Same non-fatal fallback as playPokeSound.
  }
}
