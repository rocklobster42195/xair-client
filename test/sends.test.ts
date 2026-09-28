// Sends, mute groups and snapshots against the emulator (invented names).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { XAirEmulator } from "../src/emulator/index.js";
import { XAirMixer } from "../src/mixer.js";
import { XAirScenes } from "../src/scenes.js";
import { XAirSends, parseSendTarget, sendAddresses, sendId } from "../src/sends.js";

let emu: XAirEmulator;
let mixer: XAirMixer;
const until = async (check: () => boolean, ms = 2000) => {
    const end = Date.now() + ms;
    while (!check()) {
        if (Date.now() > end) throw new Error("timed out");
        await new Promise((r) => setTimeout(r, 10));
    }
};

beforeEach(async () => {
    emu = new XAirEmulator({ model: "XR12", values: { "/bus/2/config/name": ["Monitor"], "/fxsend/1/config/name": ["Reverb"], "/ch/01/mix/02/level": [0.5], "/ch/01/mix/02/tap": [3], "/ch/04/grp/mute": [0b0100] } });
    mixer = new XAirMixer({ host: "127.0.0.1", port: await emu.start() });
    await mixer.connect();
});
afterEach(() => {
    mixer.close();
    emu.stop();
});

describe("sends", () => {
    it("addresses buses 1–6 as mix 01–06 and FX 1–4 as mix 07–10", () => {
        expect(sendAddresses({ kind: "ch", n: 1 }, { kind: "bus", n: 2 }).level).toBe("/ch/01/mix/02/level");
        expect(sendAddresses({ kind: "ch", n: 12 }, { kind: "fx", n: 1 }).tap).toBe("/ch/12/mix/07/tap");
        expect(parseSendTarget(sendId({ kind: "fx", n: 3 }))).toEqual({ kind: "fx", n: 3 });
    });

    it("reads level, tap and target name, and sets the level in dB", async () => {
        const sends = new XAirSends(mixer);
        await mixer.sync(sends.addresses());
        await until(() => mixer.cached("/fxsend/1/config/name") !== undefined);
        expect(sends.send({ kind: "ch", n: 1 }, { kind: "bus", n: 2 })).toMatchObject({ db: -10, tap: "PRE", targetName: "Monitor" });
        sends.setDb({ kind: "ch", n: 1 }, { kind: "fx", n: 1 }, -10);
        await until(() => emu.values.get("/ch/01/mix/07/level")?.[0] !== 0);
        expect(emu.values.get("/ch/01/mix/07/level")?.[0]).toBeCloseTo(0.5, 2);
    });
});

describe("mute groups and snapshots", () => {
    it("knows members, switches a group and names snapshots", async () => {
        const scenes = new XAirScenes(mixer);
        await mixer.sync(scenes.addresses());
        await until(() => mixer.cached("/-snap/64/name") !== undefined);
        expect(scenes.muteGroupMembers(3)).toEqual([4]);
        expect(scenes.snapshotName(1)).toBe("Scene 1");
        scenes.setMuteGroup(3, true);
        await until(() => emu.values.get("/config/mute/3")?.[0] === 1);
        expect(scenes.muteGroupActive(3)).toBe(true);
        scenes.loadSnapshot(2);
        await until(() => emu.received.some((m) => m.address === "/-snap/load"));
        expect(emu.received.find((m) => m.address === "/-snap/load")?.args).toEqual([2]);
    });
});
