// The X-Air fader law: OSC carries fader positions as floats 0..1, the mixer shows dB. The curve has
// four linear segments (the same law as the X32). 0 is -∞ (shown as -90 dB here).

export const FADER_STEPS = 1024;
export const MIN_DB = -90;
export const MAX_DB = 10;

/** dB for a fader position 0..1 (0 = -90, i.e. -∞). */
export function faderToDb(f: number): number {
    const x = Math.min(1, Math.max(0, f));
    if (x >= 0.5) return x * 40 - 30;
    if (x >= 0.25) return x * 80 - 50;
    if (x >= 0.0625) return x * 160 - 70;
    return x * 480 - 90;
}

/** Fader position 0..1 for a dB value, snapped to the mixer's 1024 steps. */
export function dbToFader(db: number): number {
    const d = Math.min(MAX_DB, Math.max(MIN_DB, db));
    let f: number;
    if (d >= -10) f = (d + 30) / 40;
    else if (d >= -30) f = (d + 50) / 80;
    else if (d >= -60) f = (d + 70) / 160;
    else f = (d + 90) / 480;
    return snapFader(f);
}

/** A fader position on the mixer's grid of 1024 steps. */
export function snapFader(f: number): number {
    return Math.round(Math.min(1, Math.max(0, f)) * (FADER_STEPS - 1)) / (FADER_STEPS - 1);
}

/** "-12.5 dB", "+3.0 dB", "-∞" for display. */
export function formatDb(db: number): string {
    if (db <= MIN_DB) return "-∞";
    return `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`;
}
