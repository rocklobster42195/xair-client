// A read-only snapshot of a mixer: only queries without values and meter requests. Never sends a
// value, so it is safe to run against a mixer that is in use.
import { parseMeterBlob } from "./osc/meters.js";
import type { DecodedMessage, OscValue } from "./osc/codec.js";
import { XAirTransport } from "./transport.js";

export type MeterBank = { frames: number; count: number; sample: number[] };

export type Dump = {
    host: string;
    at: string;
    values: Record<string, OscValue | OscValue[] | null>;
    meters: Record<string, MeterBank>;
    /** Queried paths the mixer didn't answer (not available on this model or firmware). */
    missing: string[];
};

const n2 = (i: number) => String(i).padStart(2, "0");

/** Every path the dump asks for: strips, sends, links, mute groups, DCAs, snapshots, status. */
export function dumpPaths(): string[] {
    const paths = ["/xinfo", "/status", "/-prefs/name"];
    const strip = (p: string) => [`${p}/config/name`, `${p}/config/color`, `${p}/mix/on`, `${p}/mix/fader`, `${p}/mix/pan`];
    for (let c = 1; c <= 16; c++) {
        const p = `/ch/${n2(c)}`;
        paths.push(...strip(p), `${p}/config/insrc`, `${p}/mix/lr`, `${p}/grp/dca`, `${p}/grp/mute`);
        for (let m = 1; m <= 10; m++) paths.push(`${p}/mix/${n2(m)}/level`, `${p}/mix/${n2(m)}/tap`, `${p}/mix/${n2(m)}/grpon`);
        paths.push(`/headamp/${n2(c)}/gain`, `/headamp/${n2(c)}/phantom`);
    }
    paths.push(...strip("/rtn/aux"), ...strip("/lr"));
    for (let i = 1; i <= 4; i++) {
        paths.push(...strip(`/rtn/${i}`), `/fxsend/${i}/config/name`, `/fxsend/${i}/config/color`, `/fxsend/${i}/mix/on`, `/fxsend/${i}/mix/fader`);
        paths.push(`/fx/${i}/type`, `/dca/${i}/on`, `/dca/${i}/fader`, `/dca/${i}/config/name`, `/dca/${i}/config/color`, `/config/mute/${i}`);
    }
    for (let i = 1; i <= 6; i++) paths.push(...strip(`/bus/${i}`));
    for (let c = 1; c <= 15; c += 2) paths.push(`/config/chlink/${c}-${c + 1}`);
    for (let b = 1; b <= 5; b += 2) paths.push(`/config/buslink/${b}-${b + 1}`);
    paths.push("/-snap/index", "/-snap/name");
    for (let s = 1; s <= 64; s++) paths.push(`/-snap/${n2(s)}/name`);
    return paths;
}

export type DumpOptions = {
    host: string;
    port?: number;
    /** Meter banks to sample (default 0–9); each is watched for `meterMs`. */
    meterBanks?: number[];
    meterMs?: number;
    /** Pause between queries, so the mixer isn't flooded (default 4 ms; 0 = none). */
    gapMs?: number;
    /** Wait for late replies after the queries (default 1500 ms). */
    settleMs?: number;
};

export async function dumpMixer(options: DumpOptions): Promise<Dump> {
    const transport = new XAirTransport({ host: options.host, port: options.port });
    const values: Dump["values"] = {};
    const meters: Dump["meters"] = {};
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    transport.on("message", (m: DecodedMessage) => {
        if (m.address.startsWith("/meters/")) {
            const blob = m.args[0];
            if (!Buffer.isBuffer(blob)) return;
            const sample = parseMeterBlob(blob).map((v) => Math.round(v * 10) / 10);
            const bank = (meters[m.address] ??= { frames: 0, count: sample.length, sample });
            bank.frames++;
            return;
        }
        values[m.address] = m.args.length === 0 ? null : m.args.length === 1 ? m.args[0] : m.args;
    });
    try {
        await transport.open();
        const paths = dumpPaths();
        for (const p of paths) {
            await transport.send(p);
            // A 0 ms timer still waits ~15 ms on Windows, so skip it instead
            if ((options.gapMs ?? 4) > 0) await sleep(options.gapMs ?? 4);
        }
        await sleep(options.settleMs ?? 1500);
        for (const bank of options.meterBanks ?? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
            await transport.send("/meters", [`/meters/${bank}`]);
            await sleep(options.meterMs ?? 700);
        }
        await sleep(300);
        return { host: options.host, at: new Date().toISOString(), values, meters, missing: paths.filter((p) => !(p in values)) };
    } finally {
        transport.close();
    }
}
