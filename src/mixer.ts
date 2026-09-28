// The generic layer: one mixer with a value cache, pushed updates (/xremote), an online state and
// meter subscriptions. Works with any OSC path; the typed layer (strips.ts) builds on it.
import { EventEmitter } from "node:events";
import type { DecodedMessage, OscArg, OscValue } from "./osc/codec.js";
import { parseMeterBlob } from "./osc/meters.js";
import { LatestValueSender } from "./latest-sender.js";
import { modelOf, type Model } from "./models.js";
import { parseXinfo, type XAirInfo } from "./discover.js";
import { XAirTransport } from "./transport.js";

export type MixerOptions = {
    host: string;
    port?: number;
    /** Renew /xremote this often; the mixer stops pushing after 10 s (default 8000). */
    remoteMs?: number;
    /** Ask for /status this often while nothing arrives (default 2000). */
    pingMs?: number;
    /** Offline when nothing arrived for this long (default 5000). */
    offlineMs?: number;
    /** Throttle for set(): at most one value per address this often (default 40). */
    sendIntervalMs?: number;
};

type Events = {
    /** A value changed (pushed by the mixer, answered, or set here). */
    change: [address: string, args: OscValue[]];
    online: [online: boolean];
    error: [error: Error];
};

type MeterSub = { refs: Set<(db: number[]) => void>; timer: ReturnType<typeof setInterval> };

/** Meter requests last 10 s on the mixer; renew a little before. */
const METER_RENEW_MS = 9000;

export class XAirMixer extends EventEmitter<Events> {
    readonly transport: XAirTransport;
    info: XAirInfo | undefined;
    model: Model = modelOf(undefined);
    private readonly cache = new Map<string, OscValue[]>();
    private readonly watchers = new Map<string, Set<(args: OscValue[]) => void>>();
    private readonly meters = new Map<number, MeterSub>();
    private readonly sender: LatestValueSender;
    private lastSeen = 0;
    private isOnline = false;
    private timers: ReturnType<typeof setInterval>[] = [];

    constructor(private readonly options: MixerOptions) {
        super();
        this.transport = new XAirTransport({ host: options.host, port: options.port });
        this.sender = new LatestValueSender((a, args) => this.transport.send(a, args), options.sendIntervalMs ?? 40, (e) => this.emit("error", e as Error));
        this.transport.on("message", (m) => this.receive(m));
        this.transport.on("error", (e) => this.emit("error", e));
    }

    get online(): boolean {
        return this.isOnline;
    }

    /** Open the socket, ask who the mixer is, and keep the connection alive. Resolves once it answered (or after the timeout). */
    async connect(timeoutMs = 2000): Promise<boolean> {
        await this.transport.open();
        this.keepAlive();
        const reply = await this.transport.query("/xinfo", timeoutMs);
        return !!reply;
    }

    close(): void {
        for (const t of this.timers) clearInterval(t);
        this.timers = [];
        for (const sub of this.meters.values()) clearInterval(sub.timer);
        this.meters.clear();
        this.sender.clear();
        this.transport.close();
        this.setOnline(false);
    }

    /** The cached value, or undefined if it was never read. */
    cached(address: string): OscValue[] | undefined {
        return this.cache.get(address);
    }

    /** The cached value, else ask the mixer. */
    async get(address: string, timeoutMs = 500): Promise<OscValue[] | undefined> {
        return this.cache.get(address) ?? (await this.transport.query(address, timeoutMs))?.args;
    }

    /** Ask for many values, a few at a time, so the mixer isn't flooded. Answers fill the cache. */
    async sync(addresses: string[], batch = 20, gapMs = 10): Promise<void> {
        for (let i = 0; i < addresses.length; i += batch) {
            await Promise.all(addresses.slice(i, i + batch).map((a) => this.transport.send(a)));
            await new Promise((r) => setTimeout(r, gapMs));
        }
    }

    /** Change a value. Fast repeats (a dial) are throttled per address; the cache updates at once. */
    set(address: string, args: OscArg[]): void {
        const values = args.map((a) => (typeof a === "object" && !Buffer.isBuffer(a) ? a.value : a));
        this.store(address, values);
        this.sender.push(address, args);
    }

    /** Listen to one address; returns a function that stops listening. */
    watch(address: string, fn: (args: OscValue[]) => void): () => void {
        let set = this.watchers.get(address);
        if (!set) this.watchers.set(address, (set = new Set()));
        set.add(fn);
        return () => set!.delete(fn);
    }

    /**
     * Receive a meter bank (e.g. 1 = all strips) in dB, about every 50 ms. The request is renewed
     * while anyone listens and stops when the last listener is gone. Returns the unsubscribe function.
     */
    subscribeMeters(bank: number, fn: (db: number[]) => void): () => void {
        let sub = this.meters.get(bank);
        if (!sub) {
            const request = () => void this.transport.send("/meters", [`/meters/${bank}`]).catch((e) => this.emit("error", e));
            request();
            sub = { refs: new Set(), timer: setInterval(request, METER_RENEW_MS) };
            this.meters.set(bank, sub);
        }
        sub.refs.add(fn);
        return () => {
            const s = this.meters.get(bank);
            if (!s) return;
            s.refs.delete(fn);
            if (s.refs.size) return;
            clearInterval(s.timer);
            this.meters.delete(bank);
        };
    }

    private keepAlive(): void {
        const remote = () => void this.transport.send("/xremote").catch((e) => this.emit("error", e));
        remote();
        this.timers.push(setInterval(remote, this.options.remoteMs ?? 8000));
        this.timers.push(
            setInterval(() => {
                const quiet = Date.now() - this.lastSeen;
                if (quiet >= (this.options.pingMs ?? 2000)) void this.transport.send("/status").catch(() => {});
                if (quiet >= (this.options.offlineMs ?? 5000)) this.setOnline(false);
            }, Math.min(this.options.pingMs ?? 2000, 1000)),
        );
    }

    private receive(m: DecodedMessage): void {
        this.lastSeen = Date.now();
        this.setOnline(true);
        if (m.address === "/xinfo") {
            const info = parseXinfo(m);
            if (info) {
                this.info = info;
                this.model = modelOf(info.model);
            }
            return;
        }
        const bank = /^\/meters\/(\d+)$/.exec(m.address);
        if (bank) {
            const sub = this.meters.get(Number(bank[1]));
            const blob = m.args[0];
            if (sub && Buffer.isBuffer(blob)) {
                const db = parseMeterBlob(blob);
                for (const fn of sub.refs) fn(db);
            }
            return;
        }
        if (m.address === "/status" || m.args.length === 0) return;
        this.store(m.address, m.args);
    }

    private store(address: string, args: OscValue[]): void {
        this.cache.set(address, args);
        this.emit("change", address, args);
        for (const fn of this.watchers.get(address) ?? []) fn(args);
    }

    private setOnline(online: boolean): void {
        if (online === this.isOnline) return;
        this.isOnline = online;
        this.emit("online", online);
    }
}
