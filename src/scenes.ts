// Mute groups and snapshots.
//  - Mute groups 1–4: /config/mute/N (1 = active); members are the channels whose /ch/NN/grp/mute
//    has bit N-1 set.
//  - Snapshots 1–64: /-snap/NN/name, the last loaded one in /-snap/index. Loading is
//    "/-snap/load ,i N" (as on the X32; not yet verified on an X-Air). Loading changes the whole
//    mix, so callers should confirm first.
import type { XAirMixer } from "./mixer.js";
import { muteGroupAddress } from "./strips.js";

const n2 = (i: number) => String(i).padStart(2, "0");

export class XAirScenes {
    constructor(private readonly mixer: XAirMixer) {}

    /** Mute group states, members and snapshot names; pass to mixer.sync() once. */
    addresses(): string[] {
        const out = ["/-snap/index", "/-snap/name"];
        for (let g = 1; g <= this.mixer.model.muteGroups; g++) out.push(muteGroupAddress(g));
        for (let c = 1; c <= this.mixer.model.channels; c++) out.push(`/ch/${n2(c)}/grp/mute`);
        for (let s = 1; s <= this.mixer.model.snapshots; s++) out.push(`/-snap/${n2(s)}/name`);
        return out;
    }

    muteGroupActive(n: number): boolean {
        return this.mixer.cached(muteGroupAddress(n))?.[0] === 1;
    }

    setMuteGroup(n: number, active: boolean): void {
        this.mixer.set(muteGroupAddress(n), [{ type: "i", value: active ? 1 : 0 }]);
    }

    /** Channels (1-based) in mute group `n`. */
    muteGroupMembers(n: number): number[] {
        const out: number[] = [];
        for (let c = 1; c <= this.mixer.model.channels; c++) {
            const bits = Number(this.mixer.cached(`/ch/${n2(c)}/grp/mute`)?.[0] ?? 0);
            if (bits & (1 << (n - 1))) out.push(c);
        }
        return out;
    }

    snapshotName(n: number): string {
        return String(this.mixer.cached(`/-snap/${n2(n)}/name`)?.[0] ?? "");
    }

    /** The snapshot loaded last (1–64), or 0. */
    currentSnapshot(): number {
        return Number(this.mixer.cached("/-snap/index")?.[0] ?? 0);
    }

    loadSnapshot(n: number): void {
        void this.mixer.transport.send("/-snap/load", [{ type: "i", value: n }]);
    }
}
