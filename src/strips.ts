// The typed layer: the mixer's strips (anything with a fader and a mute) by kind and number, with
// name, color, fader in dB, mute and stereo link, read from and written through XAirMixer.
import { dbToFader, faderToDb } from "./fader.js";
import type { XAirMixer } from "./mixer.js";
import type { Model } from "./models.js";
import { stripColor, type StripColor } from "./models.js";

export type StripKind = "ch" | "aux" | "fxrtn" | "bus" | "fxsend" | "lr" | "dca";

/** A strip: kind plus number (1-based; aux and lr have 1). */
export type StripRef = { kind: StripKind; n: number };

export type Strip = StripRef & {
    /** Base OSC path, e.g. "/ch/03". */
    path: string;
    name: string;
    color: StripColor;
    /** Fader position 0..1 and in dB. */
    fader: number;
    db: number;
    muted: boolean;
    /** Linked with its neighbour as a stereo pair (channels and buses); `n` is the pair's first strip. */
    linked: boolean;
};

const n2 = (i: number) => String(i).padStart(2, "0");

export function stripPath({ kind, n }: StripRef): string {
    switch (kind) {
        case "ch":
            return `/ch/${n2(n)}`;
        case "aux":
            return "/rtn/aux";
        case "fxrtn":
            return `/rtn/${n}`;
        case "bus":
            return `/bus/${n}`;
        case "fxsend":
            return `/fxsend/${n}`;
        case "lr":
            return "/lr";
        case "dca":
            return `/dca/${n}`;
    }
}

/** Paths of a strip's name, color, fader and on switch (DCAs keep fader and on at the top level). */
export function stripAddresses(ref: StripRef): { name: string; color: string; fader: string; on: string } {
    const p = stripPath(ref);
    const mix = ref.kind === "dca" ? p : `${p}/mix`;
    return { name: `${p}/config/name`, color: `${p}/config/color`, fader: `${mix}/fader`, on: `${mix}/on` };
}

/** Every strip of a model, in the order the mixer's app shows them. */
export function stripRefs(model: Model): StripRef[] {
    const range = (kind: StripKind, count: number) => Array.from({ length: count }, (_, i) => ({ kind, n: i + 1 }));
    return [...range("ch", model.channels), { kind: "aux", n: 1 }, ...range("fxrtn", model.fx), ...range("bus", model.buses), ...range("fxsend", model.fx), { kind: "lr", n: 1 }, ...range("dca", model.dcas)];
}

/** The link switch covering a channel or bus, e.g. channel 4 → "/config/chlink/3-4". */
export function linkAddress({ kind, n }: StripRef): string | undefined {
    const first = n % 2 ? n : n - 1;
    if (kind === "ch") return `/config/chlink/${first}-${first + 1}`;
    if (kind === "bus") return `/config/buslink/${first}-${first + 1}`;
    return undefined;
}

export class XAirStrips {
    constructor(private readonly mixer: XAirMixer) {}

    /** Every address the strips need; pass it to mixer.sync() once after connecting. */
    addresses(): string[] {
        const out = new Set<string>();
        for (const ref of stripRefs(this.mixer.model)) {
            for (const a of Object.values(stripAddresses(ref))) out.add(a);
            const link = linkAddress(ref);
            if (link) out.add(link);
        }
        return [...out];
    }

    list(): Strip[] {
        return stripRefs(this.mixer.model).map((ref) => this.strip(ref));
    }

    /** A strip from the cache (defaults while not synced yet). */
    strip(ref: StripRef): Strip {
        const a = stripAddresses(ref);
        const num = (addr: string, fallback: number) => {
            const v = this.mixer.cached(addr)?.[0];
            return typeof v === "number" ? v : fallback;
        };
        const fader = num(a.fader, 0);
        const link = linkAddress(ref);
        return {
            ...ref,
            path: stripPath(ref),
            name: String(this.mixer.cached(a.name)?.[0] ?? ""),
            color: stripColor(num(a.color, 0)),
            fader,
            db: faderToDb(fader),
            muted: num(a.on, 1) === 0,
            linked: link ? num(link, 0) === 1 : false,
        };
    }

    setDb(ref: StripRef, db: number): void {
        this.mixer.set(stripAddresses(ref).fader, [{ type: "f", value: dbToFader(db) }]);
    }

    setFader(ref: StripRef, fader: number): void {
        this.mixer.set(stripAddresses(ref).fader, [{ type: "f", value: Math.min(1, Math.max(0, fader)) }]);
    }

    setMuted(ref: StripRef, muted: boolean): void {
        this.mixer.set(stripAddresses(ref).on, [{ type: "i", value: muted ? 0 : 1 }]);
    }

    /** Called whenever anything of this strip changes; returns the unsubscribe function. */
    watch(ref: StripRef, fn: (strip: Strip) => void): () => void {
        const addrs = [...Object.values(stripAddresses(ref)), linkAddress(ref)].filter((a): a is string => !!a);
        const offs = addrs.map((a) => this.mixer.watch(a, () => fn(this.strip(ref))));
        return () => offs.forEach((off) => off());
    }
}

/** Mute groups 1–4: `/config/mute/N` (1 = muted). */
export function muteGroupAddress(n: number): string {
    return `/config/mute/${n}`;
}

/** Snapshot names (`/-snap/01..64/name`) and the one loaded last (`/-snap/index`). */
export function snapshotAddresses(model: Model): string[] {
    return ["/-snap/index", ...Array.from({ length: model.snapshots }, (_, i) => `/-snap/${n2(i + 1)}/name`)];
}
