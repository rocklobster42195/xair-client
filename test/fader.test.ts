import { describe, expect, it } from "vitest";
import { dbToFader, faderToDb, formatDb, snapFader } from "../src/fader.js";
import { modelOf, stripColor } from "../src/models.js";
import { linkAddress, stripAddresses, stripRefs } from "../src/strips.js";

describe("fader law", () => {
    it("hits the known points of the X-Air curve", () => {
        expect(faderToDb(1)).toBe(10);
        expect(faderToDb(0.75)).toBe(0);
        expect(faderToDb(0.5)).toBe(-10);
        expect(faderToDb(0.25)).toBe(-30);
        expect(faderToDb(0.0625)).toBe(-60);
        expect(faderToDb(0)).toBe(-90);
    });

    it("converts dB back to the mixer's 1024-step grid", () => {
        for (const db of [10, 0, -10, -30, -60, -90]) expect(faderToDb(dbToFader(db))).toBeCloseTo(db, 0);
        expect(dbToFader(0) * 1023).toBeCloseTo(Math.round(0.75 * 1023), 6);
        expect(dbToFader(99)).toBe(1);
        expect(dbToFader(-200)).toBe(0);
    });

    it("stays within half a step when going round", () => {
        for (let f = 0; f <= 1; f += 0.01) expect(Math.abs(snapFader(f) - f)).toBeLessThanOrEqual(0.5 / 1023 + 1e-9);
    });

    it("formats dB for display", () => {
        expect(formatDb(-90)).toBe("-∞");
        expect(formatDb(3)).toBe("+3.0 dB");
        expect(formatDb(-12.34)).toBe("-12.3 dB");
    });
});

describe("models and strips", () => {
    it("knows the strip counts per model", () => {
        expect(modelOf("XR12").channels).toBe(12);
        expect(modelOf("xr16").channels).toBe(16);
        expect(modelOf("something new").name).toBe("XR18");
        // XR12: 12 channels, aux, 4 FX returns, 6 buses, 4 FX sends, LR, 4 DCAs
        expect(stripRefs(modelOf("XR12"))).toHaveLength(12 + 1 + 4 + 6 + 4 + 1 + 4);
    });

    it("builds the OSC paths of each strip kind", () => {
        expect(stripAddresses({ kind: "ch", n: 3 })).toEqual({ name: "/ch/03/config/name", color: "/ch/03/config/color", fader: "/ch/03/mix/fader", on: "/ch/03/mix/on" });
        expect(stripAddresses({ kind: "aux", n: 1 }).fader).toBe("/rtn/aux/mix/fader");
        expect(stripAddresses({ kind: "dca", n: 2 }).fader).toBe("/dca/2/fader");
        expect(linkAddress({ kind: "ch", n: 4 })).toBe("/config/chlink/3-4");
        expect(linkAddress({ kind: "bus", n: 5 })).toBe("/config/buslink/5-6");
        expect(linkAddress({ kind: "lr", n: 1 })).toBeUndefined();
    });

    it("names the strip colors (8–15 inverted)", () => {
        expect(stripColor(9)).toEqual({ index: 9, name: "red", inverted: true });
        expect(stripColor(99).name).toBe("off");
    });
});
