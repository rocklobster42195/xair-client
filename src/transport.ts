// One UDP socket to one mixer. X-Air mixers answer to the port a request came from, so a single
// socket bound to any free port carries requests, replies and pushed updates.
import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { decodePacket, encodeMessage, type DecodedMessage, type OscArg } from "./osc/codec.js";

export const XAIR_PORT = 10024;

export type TransportOptions = {
    host: string;
    /** Mixer port (default 10024). */
    port?: number;
    /** Local port to bind (default: any free port). */
    localPort?: number;
};

type Events = { message: [DecodedMessage]; error: [Error] };

export class XAirTransport extends EventEmitter<Events> {
    readonly host: string;
    readonly port: number;
    private readonly socket = dgram.createSocket("udp4");
    private opened: Promise<void> | undefined;
    /** The address replies come from ("localhost" answers from 127.0.0.1). */
    private readonly from: string;

    constructor(private readonly options: TransportOptions) {
        super();
        this.host = options.host;
        this.port = options.port ?? XAIR_PORT;
        this.from = options.host === "localhost" ? "127.0.0.1" : options.host;
        this.socket.on("message", (buf, rinfo) => {
            // Only the mixer we talk to; anything else on the port is ignored
            if (rinfo.address !== this.from) return;
            let messages: DecodedMessage[];
            try {
                messages = decodePacket(buf);
            } catch {
                return; // a malformed packet is dropped, it never takes the connection down
            }
            for (const m of messages) this.emit("message", m);
        });
        this.socket.on("error", (e) => this.emit("error", e));
    }

    open(): Promise<void> {
        this.opened ??= new Promise((resolve, reject) => {
            this.socket.once("error", reject);
            this.socket.bind(this.options.localPort ?? 0, () => {
                this.socket.off("error", reject);
                resolve();
            });
        });
        return this.opened;
    }

    async send(address: string, args: OscArg[] = []): Promise<void> {
        await this.open();
        const data = encodeMessage(address, args);
        await new Promise<void>((resolve, reject) => this.socket.send(data, this.port, this.host, (e) => (e ? reject(e) : resolve())));
    }

    /** Ask for a value (a message without arguments) and wait for the first reply to that address. */
    async query(address: string, timeoutMs = 500): Promise<DecodedMessage | undefined> {
        return new Promise((resolve) => {
            const onMessage = (m: DecodedMessage) => {
                if (m.address !== address) return;
                clearTimeout(timer);
                this.off("message", onMessage);
                resolve(m);
            };
            const timer = setTimeout(() => {
                this.off("message", onMessage);
                resolve(undefined);
            }, timeoutMs);
            this.on("message", onMessage);
            this.send(address).catch(() => {
                clearTimeout(timer);
                this.off("message", onMessage);
                resolve(undefined);
            });
        });
    }

    close(): void {
        this.socket.close();
    }
}
