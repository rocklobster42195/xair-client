// The emulator's starting state: invented names, all faders at 0 dB, everything unmuted.
import type { OscValue } from "../osc/codec.js";
import type { Model } from "../models.js";

const n2 = (i: number) => String(i).padStart(2, "0");
const UNITY = 0.75; // 0 dB

export function defaultValues(model: Model): Record<string, OscValue[]> {
    const v: Record<string, OscValue[]> = {};
    const strip = (p: string, name: string) => {
        v[`${p}/config/name`] = [name];
        v[`${p}/config/color`] = [0];
        v[`${p}/mix/on`] = [1];
        v[`${p}/mix/fader`] = [UNITY];
        v[`${p}/mix/pan`] = [0.5];
    };
    for (let c = 1; c <= 16; c++) {
        const p = `/ch/${n2(c)}`;
        strip(p, c <= model.channels ? `Ch ${c}` : "");
        v[`${p}/config/insrc`] = [c <= model.channels ? c - 1 : 18];
        v[`${p}/mix/lr`] = [1];
        v[`${p}/grp/dca`] = [0];
        v[`${p}/grp/mute`] = [0];
        for (let m = 1; m <= 10; m++) {
            v[`${p}/mix/${n2(m)}/level`] = [0];
            v[`${p}/mix/${n2(m)}/tap`] = [3];
            v[`${p}/mix/${n2(m)}/grpon`] = [1];
        }
    }
    strip("/rtn/aux", "Aux");
    strip("/lr", "Main LR");
    for (let i = 1; i <= model.fx; i++) {
        strip(`/rtn/${i}`, `FX ${i}`);
        strip(`/fxsend/${i}`, `FX Send ${i}`);
    }
    for (let i = 1; i <= model.buses; i++) strip(`/bus/${i}`, `Bus ${i}`);
    for (let i = 1; i <= model.dcas; i++) {
        v[`/dca/${i}/on`] = [1];
        v[`/dca/${i}/fader`] = [UNITY];
        v[`/dca/${i}/config/name`] = [`DCA ${i}`];
        v[`/dca/${i}/config/color`] = [0];
    }
    for (let i = 1; i <= model.muteGroups; i++) v[`/config/mute/${i}`] = [0];
    for (let c = 1; c <= 15; c += 2) v[`/config/chlink/${c}-${c + 1}`] = [0];
    for (let b = 1; b <= 5; b += 2) v[`/config/buslink/${b}-${b + 1}`] = [0];
    v["/-snap/index"] = [0];
    v["/-snap/name"] = [""];
    for (let s = 1; s <= model.snapshots; s++) v[`/-snap/${n2(s)}/name`] = [s <= 3 ? `Scene ${s}` : ""];
    return v;
}
