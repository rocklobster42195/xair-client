// XAirMixer and XAirStrips against the emulator (invented names, localhost only).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { XAirEmulator } from "../src/emulator/index.js";
import { XAirMixer } from "../src/mixer.js";
import { XAirStrips } from "../src/strips.js";

let emu: XAirEmulator;
let mixer: XAirMixer;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (check: () => boolean, ms = 2000) => {
    const end = Date.now() + ms;
    while (!check()) {
        if (Date.now() > end) throw new Error("timed out");
        await wait(10);
    }
};

beforeEach(async () => {
    emu = new XAirEmulator({ model: "XR12", name: "XR12-TEST", values: { "/ch/01/config/name": ["Test Vocals"], "/ch/01/config/color": [9], "/config/chlink/3-4": [1] } });
    const port = await emu.start();
    mixer = new XAirMixer({ host: "127.0.0.1", port, offlineMs: 400, pingMs: 100 });
});

afterEach(() => {
    mixer.close();
    try {
        emu.stop();
    } catch {
        // already stopped by the test
    }
});

describe("XAirMixer", () => {
    it("connects, learns the model and goes online", async () => {
        expect(await mixer.connect()).toBe(true);
        expect(mixer.info?.name).toBe("XR12-TEST");
        expect(mixer.model.channels).toBe(12);
        expect(mixer.online).toBe(true);
    });

    it("keeps /xremote alive and receives changes made on the desk", async () => {
        await mixer.connect();
        await until(() => emu.received.some((m) => m.address === "/xremote"));
        const changes: number[] = [];
        mixer.watch("/ch/05/mix/fader", (args) => changes.push(args[0] as number));
        emu.change("/ch/05/mix/fader", [0.5]);
        await until(() => changes.length > 0);
        expect(changes).toEqual([0.5]);
        expect(mixer.cached("/ch/05/mix/fader")).toEqual([0.5]);
    });

    it("goes offline when the mixer stops answering, and says so once", async () => {
        const states: boolean[] = [];
        mixer.on("online", (o) => states.push(o));
        await mixer.connect();
        emu.stop();
        await until(() => !mixer.online, 2000);
        expect(states).toEqual([true, false]);
    });

    it("renews meter requests while someone listens and stops when nobody does", async () => {
        await mixer.connect();
        const frames: number[][] = [];
        const off = mixer.subscribeMeters(1, (db) => frames.push(db));
        await until(() => frames.length >= 3);
        expect(frames[0]).toHaveLength(40);
        expect(frames[0][0]).toBeLessThan(0);
        const requests = () => emu.received.filter((m) => m.address === "/meters").length;
        expect(requests()).toBe(1);
        const second = mixer.subscribeMeters(1, () => {});
        expect(requests()).toBe(1); // shared, not requested twice
        off();
        second();
        const count = frames.length;
        await wait(150);
        expect(frames.length).toBe(count); // no more callbacks after unsubscribing
    });
});

describe("XAirStrips", () => {
    it("reads names, colors, faders, mutes and links after a sync", async () => {
        await mixer.connect();
        const strips = new XAirStrips(mixer);
        await mixer.sync(strips.addresses());
        await until(() => mixer.cached("/dca/4/config/name") !== undefined);
        const ch1 = strips.strip({ kind: "ch", n: 1 });
        expect(ch1).toMatchObject({ name: "Test Vocals", db: 0, muted: false, linked: false });
        expect(ch1.color).toEqual({ index: 9, name: "red", inverted: true });
        expect(strips.strip({ kind: "ch", n: 4 }).linked).toBe(true);
        expect(strips.list()).toHaveLength(32);
    });

    it("sets fader in dB and mute, and tells watchers", async () => {
        await mixer.connect();
        const strips = new XAirStrips(mixer);
        const seen: number[] = [];
        strips.watch({ kind: "ch", n: 2 }, (s) => seen.push(s.db));
        strips.setDb({ kind: "ch", n: 2 }, -10);
        strips.setMuted({ kind: "ch", n: 2 }, true);
        await until(() => emu.values.get("/ch/02/mix/on")?.[0] === 0);
        expect(emu.values.get("/ch/02/mix/fader")?.[0]).toBeCloseTo(0.5, 2);
        expect(seen[0]).toBeCloseTo(-10, 1);
        expect(strips.strip({ kind: "ch", n: 2 }).muted).toBe(true);
    });
});
