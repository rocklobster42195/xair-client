// Find X-Air mixers on the local network: every mixer answers a broadcast "/xinfo" with its IP,
// network name, model and firmware.
import dgram from "node:dgram";
import { decodePacket, encodeMessage, type DecodedMessage } from "./osc/codec.js";
import { XAIR_PORT } from "./transport.js";

export type XAirInfo = {
    /** The IP address the mixer reports for itself. */
    ip: string;
    /** Network name, e.g. "XR12-24-7D-57". */
    name: string;
    /** "XR12", "XR16", "XR18" or "MR18". */
    model: string;
    firmware: string;
};

/** The mixer info from a "/xinfo" reply, or undefined if it isn't one. */
export function parseXinfo(m: DecodedMessage): XAirInfo | undefined {
    if (m.address !== "/xinfo" || m.args.length < 4) return undefined;
    const [ip, name, model, firmware] = m.args.map(String);
    return { ip, name, model, firmware };
}

export type DiscoverOptions = {
    /** How long to wait for answers (default 1500 ms). */
    timeoutMs?: number;
    /** Where to send the request (default the broadcast address; a single IP also works). */
    address?: string;
    port?: number;
};

/** All mixers that answered within the timeout, one entry per IP. */
export async function discover(options: DiscoverOptions = {}): Promise<XAirInfo[]> {
    const socket = dgram.createSocket("udp4");
    const found = new Map<string, XAirInfo>();
    socket.on("message", (buf) => {
        try {
            for (const m of decodePacket(buf)) {
                const info = parseXinfo(m);
                if (info) found.set(info.ip, info);
            }
        } catch {
            // not an OSC packet
        }
    });
    await new Promise<void>((resolve) => socket.bind(0, resolve));
    socket.setBroadcast(true);
    await new Promise<void>((resolve, reject) =>
        socket.send(encodeMessage("/xinfo"), options.port ?? XAIR_PORT, options.address ?? "255.255.255.255", (e) => (e ? reject(e) : resolve())),
    );
    await new Promise((r) => setTimeout(r, options.timeoutMs ?? 1500));
    socket.close();
    return [...found.values()];
}
