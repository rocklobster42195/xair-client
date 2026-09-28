// A small OSC 1.0 codec: exactly what X-Air mixers speak. Messages with int32 (i), float32 (f),
// string (s) and blob (b) arguments; bundles are unpacked into their messages.

export type OscArg = number | string | Buffer | OscTyped;

/** An argument with an explicit type, e.g. a whole number that must go out as a float. */
export type OscTyped = { type: "i" | "f"; value: number };

export type OscMessage = { address: string; args: OscArg[] };

/** A decoded argument: numbers from "i" and "f", strings, and blobs as Buffers. */
export type OscValue = number | string | Buffer;

export type DecodedMessage = { address: string; types: string; args: OscValue[] };

export function encodeMessage(address: string, args: OscArg[] = []): Buffer {
    let types = ",";
    const parts: Buffer[] = [];
    for (const arg of args) {
        const [type, data] = encodeArg(arg);
        types += type;
        parts.push(data);
    }
    return Buffer.concat([oscString(address), oscString(types), ...parts]);
}

/** Decode a packet; a bundle yields all its messages. Throws on malformed data. */
export function decodePacket(buf: Buffer): DecodedMessage[] {
    if (buf.length >= 8 && buf.toString("ascii", 0, 8) === "#bundle\0") return decodeBundle(buf);
    return [decodeMessage(buf)];
}

export function decodeMessage(buf: Buffer): DecodedMessage {
    const [address, start] = readString(buf, 0);
    let off = start;
    if (!address.startsWith("/")) throw new Error(`not an OSC address: "${address}"`);
    let types = ",";
    if (off < buf.length) [types, off] = readString(buf, off);
    const args: OscValue[] = [];
    for (const t of types.slice(1)) {
        switch (t) {
            case "i":
                args.push(buf.readInt32BE(off));
                off += 4;
                break;
            case "f":
                args.push(buf.readFloatBE(off));
                off += 4;
                break;
            case "s": {
                let s: string;
                [s, off] = readString(buf, off);
                args.push(s);
                break;
            }
            case "b": {
                const n = buf.readInt32BE(off);
                if (n < 0 || off + 4 + n > buf.length) throw new Error("blob runs past the packet");
                args.push(Buffer.from(buf.subarray(off + 4, off + 4 + n)));
                off += 4 + pad(n);
                break;
            }
            default:
                throw new Error(`unsupported OSC type "${t}"`);
        }
    }
    return { address, types, args };
}

function decodeBundle(buf: Buffer): DecodedMessage[] {
    const out: DecodedMessage[] = [];
    let off = 16; // "#bundle\0" + 8-byte time tag
    while (off + 4 <= buf.length) {
        const size = buf.readInt32BE(off);
        off += 4;
        if (size < 0 || off + size > buf.length) throw new Error("bundle element runs past the packet");
        out.push(...decodePacket(buf.subarray(off, off + size)));
        off += size;
    }
    return out;
}

function encodeArg(arg: OscArg): ["i" | "f" | "s" | "b", Buffer] {
    if (typeof arg === "string") return ["s", oscString(arg)];
    if (Buffer.isBuffer(arg)) {
        const size = Buffer.alloc(4);
        size.writeInt32BE(arg.length);
        return ["b", Buffer.concat([size, arg, Buffer.alloc(pad(arg.length) - arg.length)])];
    }
    const typed = typeof arg === "number" ? { type: Number.isInteger(arg) ? ("i" as const) : ("f" as const), value: arg } : arg;
    const data = Buffer.alloc(4);
    if (typed.type === "i") data.writeInt32BE(typed.value);
    else data.writeFloatBE(typed.value);
    return [typed.type, data];
}

/** A string, NUL-terminated and padded to a multiple of 4 bytes. */
function oscString(s: string): Buffer {
    const bytes = Buffer.from(s, "utf8");
    return Buffer.concat([bytes, Buffer.alloc(pad(bytes.length + 1) - bytes.length)]);
}

function readString(buf: Buffer, off: number): [string, number] {
    const end = buf.indexOf(0, off);
    if (end < 0) throw new Error("unterminated OSC string");
    return [buf.toString("utf8", off, end), off + pad(end - off + 1)];
}

const pad = (n: number) => Math.ceil(n / 4) * 4;
