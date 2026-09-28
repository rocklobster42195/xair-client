// Channel sends: a channel's level into a bus (1–6) or an FX send (1–4). On X-Air they live at
// /ch/NN/mix/MM/…, with MM 01–06 the buses and 07–10 the FX sends. There is no on/off switch
// per send (only level, tap and grpon), so "off" means level -∞ here.
import { dbToFader, faderToDb } from "./fader.js";
import type { XAirMixer } from "./mixer.js";
import type { StripRef } from "./strips.js";

export type SendTarget = { kind: "bus" | "fx"; n: number };

/** Where a send taps the channel, as the mixer numbers it. */
export const SEND_TAPS = ["IN", "PRE EQ", "POST EQ", "PRE", "POST", "GRP"] as const;

export type Send = { level: number; db: number; tap: (typeof SEND_TAPS)[number] | undefined; targetName: string };

const n2 = (i: number) => String(i).padStart(2, "0");

export function sendAddresses(channel: StripRef, target: SendTarget): { level: string; tap: string } {
    const mix = target.kind === "bus" ? target.n : 6 + target.n;
    const base = `/ch/${n2(channel.n)}/mix/${n2(mix)}`;
    return { level: `${base}/level`, tap: `${base}/tap` };
}

/** The name the mixer shows for a send target (the bus name, or the FX send's name). */
export function targetNameAddress(target: SendTarget): string {
    return target.kind === "bus" ? `/bus/${target.n}/config/name` : `/fxsend/${target.n}/config/name`;
}

export function sendId(target: SendTarget): string {
    return `${target.kind}:${target.n}`;
}

export function parseSendTarget(id: string | undefined): SendTarget | undefined {
    const m = /^(bus|fx):(\d+)$/.exec(id ?? "");
    return m ? { kind: m[1] as SendTarget["kind"], n: Number(m[2]) } : undefined;
}

export class XAirSends {
    constructor(private readonly mixer: XAirMixer) {}

    /** Every send of every channel plus the target names; pass to mixer.sync() once. */
    addresses(): string[] {
        const out: string[] = [];
        const targets: SendTarget[] = [
            ...Array.from({ length: this.mixer.model.buses }, (_, i) => ({ kind: "bus" as const, n: i + 1 })),
            ...Array.from({ length: this.mixer.model.fx }, (_, i) => ({ kind: "fx" as const, n: i + 1 })),
        ];
        for (let c = 1; c <= this.mixer.model.channels; c++) for (const t of targets) out.push(...Object.values(sendAddresses({ kind: "ch", n: c }, t)));
        for (const t of targets) out.push(targetNameAddress(t));
        return out;
    }

    send(channel: StripRef, target: SendTarget): Send {
        const a = sendAddresses(channel, target);
        const level = Number(this.mixer.cached(a.level)?.[0] ?? 0);
        const tap = this.mixer.cached(a.tap)?.[0];
        return {
            level,
            db: faderToDb(level),
            tap: typeof tap === "number" ? SEND_TAPS[tap] : undefined,
            targetName: String(this.mixer.cached(targetNameAddress(target))?.[0] ?? ""),
        };
    }

    setDb(channel: StripRef, target: SendTarget, db: number): void {
        this.mixer.set(sendAddresses(channel, target).level, [{ type: "f", value: dbToFader(db) }]);
    }
}
