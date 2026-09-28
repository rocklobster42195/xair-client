// A fake X-Air mixer on UDP, for tests, simulators and screenshots. It answers queries, stores
// what it is sent, pushes changes to clients that sent /xremote in the last 10 s (except the
// sender, like the real mixer), answers /xinfo and /status, and streams synthetic meters.
import dgram from "node:dgram";
import { decodePacket, encodeMessage, type OscArg, type OscValue } from "../osc/codec.js";
import { buildMeterBlob } from "../osc/meters.js";
import { MODELS, type ModelName } from "../models.js";
import { defaultValues } from "./defaults.js";

export type EmulatorOptions = {
    model?: ModelName;
    /** Network name reported by /xinfo. */
    name?: string;
    firmware?: string;
    /** UDP port (default 0 = any free port; the real mixer uses 10024). */
    port?: number;
    /** Values that differ from the defaults, e.g. { "/ch/01/config/name": ["Vocals"] }. */
    values?: Record<string, OscValue[]>;
    /** dB values of a meter bank at time `t` (ms); default: a quiet synthetic signal. */
    meters?: (bank: number, t: number) => number[];
};

type Client = { port: number; address: string };

/** How long the real mixer keeps pushing after /xremote or /meters, before the client must renew. */
const LEASE_MS = 10_000;
const METER_FRAME_MS = 50;

export class XAirEmulator {
    readonly values = new Map<string, OscValue[]>();
    private readonly socket = dgram.createSocket("udp4");
    private readonly remotes = new Map<string, { client: Client; until: number }>();
    private readonly meterSubs = new Map<string, { client: Client; bank: number; until: number }>();
    private meterTimer: ReturnType<typeof setInterval> | undefined;
    private readonly started = Date.now();
    /** Every message the emulator received, for tests ("/ch/01/mix/fader 0.5"). */
    readonly received: { address: string; args: OscValue[] }[] = [];
    port = 0;

    constructor(private readonly options: EmulatorOptions = {}) {
        const model = MODELS[options.model ?? "XR18"];
        for (const [k, v] of Object.entries(defaultValues(model))) this.values.set(k, v);
        for (const [k, v] of Object.entries(options.values ?? {})) this.values.set(k, v);
        this.socket.on("message", (buf, rinfo) => this.handle(buf, { port: rinfo.port, address: rinfo.address }));
    }

    async start(): Promise<number> {
        await new Promise<void>((r) => this.socket.bind(this.options.port ?? 0, "127.0.0.1", r));
        this.port = this.socket.address().port;
        this.meterTimer = setInterval(() => this.sendMeters(), METER_FRAME_MS);
        return this.port;
    }

    stop(): void {
        clearInterval(this.meterTimer);
        this.socket.close();
    }

    /** A change made "on the desk" (e.g. someone moves a fader): stored and pushed to /xremote clients. */
    change(address: string, args: OscValue[]): void {
        this.values.set(address, args);
        this.push(address, args);
    }

    private handle(buf: Buffer, from: Client): void {
        let messages;
        try {
            messages = decodePacket(buf);
        } catch {
            return;
        }
        for (const m of messages) {
            this.received.push({ address: m.address, args: m.args });
            const key = `${from.address}:${from.port}`;
            switch (m.address) {
                case "/xinfo":
                    this.reply(from, "/xinfo", ["127.0.0.1", this.options.name ?? "XR18-EM-00-01", this.options.model ?? "XR18", this.options.firmware ?? "1.18"]);
                    continue;
                case "/status":
                    this.reply(from, "/status", ["active", "127.0.0.1", this.options.name ?? "XR18-EM-00-01"]);
                    continue;
                case "/xremote":
                    this.remotes.set(key, { client: from, until: Date.now() + LEASE_MS });
                    continue;
                case "/meters": {
                    const bank = Number(/^\/meters\/(\d+)$/.exec(String(m.args[0] ?? ""))?.[1]);
                    if (Number.isInteger(bank)) this.meterSubs.set(`${key}#${bank}`, { client: from, bank, until: Date.now() + LEASE_MS });
                    continue;
                }
            }
            if (m.args.length === 0) {
                // A query: answer with the stored value; unknown paths get no answer, like the mixer
                const v = this.values.get(m.address);
                if (v) this.reply(from, m.address, v);
            } else if (this.values.has(m.address)) {
                this.values.set(m.address, m.args);
                this.push(m.address, m.args, key);
            }
        }
    }

    private push(address: string, args: OscValue[], exceptKey?: string): void {
        const now = Date.now();
        for (const [key, r] of this.remotes) {
            if (r.until < now) this.remotes.delete(key);
            else if (key !== exceptKey) this.reply(r.client, address, args);
        }
    }

    private sendMeters(): void {
        const now = Date.now();
        for (const [key, s] of this.meterSubs) {
            if (s.until < now) {
                this.meterSubs.delete(key);
                continue;
            }
            const db = this.options.meters?.(s.bank, now - this.started) ?? syntheticMeters(s.bank, now - this.started);
            this.reply(s.client, `/meters/${s.bank}`, [buildMeterBlob(db)]);
        }
    }

    private reply(to: Client, address: string, args: OscArg[]): void {
        this.socket.send(encodeMessage(address, args), to.port, to.address);
    }
}

/** Bank 1 (all strips): a gentle pulse around -30 dB on the first strips, silence elsewhere. */
function syntheticMeters(bank: number, t: number): number[] {
    const count = bank === 1 ? 40 : 16;
    return Array.from({ length: count }, (_, i) => (i < 8 ? -30 + 10 * Math.sin(t / 400 + i) : -128));
}
