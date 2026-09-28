import { describe, expect, it } from "vitest";
import { decodeMessage, decodePacket, encodeMessage } from "../src/osc/codec.js";
import { buildMeterBlob, parseMeterBlob } from "../src/osc/meters.js";

describe("OSC codec", () => {
    it("encodes a query as address plus an empty type tag, padded to 4 bytes", () => {
        const buf = encodeMessage("/xinfo");
        expect(buf.length % 4).toBe(0);
        expect(buf.toString("ascii")).toBe("/xinfo\0\0,\0\0\0");
    });

    it("round-trips int, float, string and blob arguments", () => {
        const blob = Buffer.from([1, 2, 3, 4, 5]);
        const m = decodeMessage(encodeMessage("/ch/01/mix/fader", [7, 0.75, "Vocals", blob]));
        expect(m.address).toBe("/ch/01/mix/fader");
        expect(m.types).toBe(",ifsb");
        expect(m.args[0]).toBe(7);
        expect(m.args[1]).toBeCloseTo(0.75);
        expect(m.args[2]).toBe("Vocals");
        expect(Buffer.compare(m.args[3] as Buffer, blob)).toBe(0);
    });

    it("sends whole numbers as floats when asked to", () => {
        expect(decodeMessage(encodeMessage("/lr/mix/fader", [{ type: "f", value: 1 }])).types).toBe(",f");
    });

    it("pads strings whose length is already a multiple of 4 with a full NUL word", () => {
        const m = decodeMessage(encodeMessage("/abc", ["abcd"]));
        expect(m.args[0]).toBe("abcd");
    });

    it("reads a message without a type tag (old OSC) as having no arguments", () => {
        expect(decodeMessage(Buffer.from("/status\0")).args).toEqual([]);
    });

    it("unpacks bundles", () => {
        const a = encodeMessage("/a", [1]);
        const b = encodeMessage("/b", ["x"]);
        const size = (n: number) => {
            const s = Buffer.alloc(4);
            s.writeInt32BE(n);
            return s;
        };
        const bundle = Buffer.concat([Buffer.from("#bundle\0"), Buffer.alloc(8), size(a.length), a, size(b.length), b]);
        expect(decodePacket(bundle).map((m) => m.address)).toEqual(["/a", "/b"]);
    });

    it("rejects malformed packets instead of reading past them", () => {
        expect(() => decodeMessage(Buffer.from("no address"))).toThrow();
        expect(() => decodeMessage(Buffer.from("/x\0\0,z\0\0"))).toThrow(/unsupported/);
        const badBlob = Buffer.concat([Buffer.from("/x\0\0,b\0\0"), Buffer.from([0, 0, 0, 99])]);
        expect(() => decodeMessage(badBlob)).toThrow(/blob/);
    });
});

describe("meter blobs", () => {
    it("reads little-endian int16 values as dB / 256", () => {
        expect(parseMeterBlob(buildMeterBlob([-18.5, -128, 0, 6]))).toEqual([-18.5, -128, 0, 6]);
    });

    it("stops at the end of a short blob", () => {
        const blob = buildMeterBlob([-10, -20, -30]).subarray(0, 8); // count says 3, only 2 values
        expect(parseMeterBlob(blob)).toEqual([-10, -20]);
        expect(parseMeterBlob(Buffer.alloc(2))).toEqual([]);
    });

    it("survives a trip through OSC", () => {
        const m = decodeMessage(encodeMessage("/meters/1", [buildMeterBlob([-44.6, -44.4])]));
        expect(parseMeterBlob(m.args[0] as Buffer)).toEqual([-44.6015625, -44.3984375].map((v) => Math.round(v * 256) / 256));
    });
});
