// Transport, discovery and the dump against a tiny fake mixer on localhost (invented names).
import dgram from "node:dgram";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decodePacket, encodeMessage } from "../src/osc/codec.js";
import { buildMeterBlob } from "../src/osc/meters.js";
import { discover, parseXinfo } from "../src/discover.js";
import { dumpMixer } from "../src/dump.js";
import { XAirTransport } from "../src/transport.js";

let mixer: dgram.Socket;
let port = 0;
const received: string[] = [];

beforeEach(async () => {
    received.length = 0;
    mixer = dgram.createSocket("udp4");
    mixer.on("message", (buf, rinfo) => {
        const [m] = decodePacket(buf);
        received.push(m.address + (m.args.length ? ` ${m.args.join(",")}` : ""));
        const reply = (address: string, args: (string | number | Buffer)[]) => mixer.send(encodeMessage(address, args), rinfo.port, rinfo.address);
        if (m.address === "/xinfo") reply("/xinfo", ["127.0.0.1", "XR12-00-00-01", "XR12", "1.18"]);
        else if (m.address === "/ch/01/config/name") reply(m.address, ["Test Vocals"]);
        else if (m.address === "/ch/01/mix/fader") reply(m.address, [0.75]);
        else if (m.address === "/meters" && m.args[0] === "/meters/1") reply("/meters/1", [buildMeterBlob([-20, -21])]);
    });
    await new Promise<void>((r) => mixer.bind(0, "127.0.0.1", r));
    port = mixer.address().port;
});

afterEach(() => mixer.close());

describe("transport", () => {
    it("queries a value and gets the reply for that address", async () => {
        const t = new XAirTransport({ host: "127.0.0.1", port });
        const m = await t.query("/ch/01/config/name");
        t.close();
        expect(m?.args).toEqual(["Test Vocals"]);
    });

    it("gives undefined when the mixer doesn't answer in time", async () => {
        const t = new XAirTransport({ host: "127.0.0.1", port });
        const m = await t.query("/nothing/here", 100);
        t.close();
        expect(m).toBeUndefined();
    });

    it("ignores packets from other addresses", async () => {
        const t = new XAirTransport({ host: "192.0.2.1", port }); // documentation address, never answers
        let got = 0;
        t.on("message", () => got++);
        await t.open();
        const stranger = dgram.createSocket("udp4");
        const local = (t as unknown as { socket: dgram.Socket }).socket.address().port;
        await new Promise<void>((r) => stranger.send(encodeMessage("/x"), local, "127.0.0.1", () => r()));
        await new Promise((r) => setTimeout(r, 100));
        stranger.close();
        t.close();
        expect(got).toBe(0);
    });
});

describe("discovery", () => {
    it("parses /xinfo replies", () => {
        expect(parseXinfo({ address: "/xinfo", types: ",ssss", args: ["10.0.0.5", "XR18-AA", "XR18", "1.22"] })).toEqual({ ip: "10.0.0.5", name: "XR18-AA", model: "XR18", firmware: "1.22" });
        expect(parseXinfo({ address: "/status", types: ",sss", args: ["active", "x", "y"] })).toBeUndefined();
    });

    it("finds a mixer asked directly", async () => {
        const found = await discover({ address: "127.0.0.1", port, timeoutMs: 200 });
        expect(found).toEqual([{ ip: "127.0.0.1", name: "XR12-00-00-01", model: "XR12", firmware: "1.18" }]);
    });
});

describe("dump", () => {
    it("probes the USB player only when asked, still without sending values", async () => {
        const dump = await dumpMixer({ host: "127.0.0.1", port, gapMs: 0, settleMs: 100, meterBanks: [], usb: true });
        expect(dump.missing).toContain("/-usb/dir/001/name");
        expect(received.filter((r) => r.includes(" "))).toEqual([]);
    });

    it("only queries and requests meters, never sends a value", async () => {
        const dump = await dumpMixer({ host: "127.0.0.1", port, gapMs: 0, settleMs: 200, meterBanks: [1], meterMs: 100 });
        expect(dump.values["/ch/01/config/name"]).toBe("Test Vocals");
        expect(dump.meters["/meters/1"]).toMatchObject({ count: 2, sample: [-20, -21] });
        expect(dump.missing).toContain("/ch/02/config/name");
        // Every request carries no arguments, except the meter request with its bank name
        const withArgs = received.filter((r) => r.includes(" "));
        expect(withArgs).toEqual(["/meters /meters/1"]);
    });
});
