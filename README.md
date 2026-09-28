# xair-client

A TypeScript client for **Behringer X-Air** digital mixers (XR12, XR16, XR18) and the **Midas MR18**, over OSC on UDP. It has no runtime dependencies and runs on Node 20 or later.

> **Status: early (0.x).** Version 0.1 covers the base: the OSC codec, the connection, discovery, meter decoding and a read-only dump. The typed mixer model (strips, faders in dB, mute groups, snapshots) and an emulator for tests follow.

This is an unofficial community package. It is not affiliated with or endorsed by Behringer, Midas or Music Tribe. "X-Air" is a trademark of Music Tribe.

## Install

```sh
npm install xair-client
```

## Command line

```sh
npx xair-client discover               # find mixers on the local network
npx xair-client discover 192.168.1.50  # ask one address (e.g. over a VPN, where broadcasts don't pass)
npx xair-client dump 192.168.1.50      # read-only snapshot as JSON: names, faders, sends, links, meters
```

The dump only sends queries and meter requests, never a value. It is safe to run against a mixer that is in use.

## Library

```ts
import { XAirTransport, discover, parseMeterBlob } from "xair-client";

const [mixer] = await discover();                    // { ip, name, model, firmware }
const xair = new XAirTransport({ host: mixer.ip });

const name = await xair.query("/ch/01/config/name");  // → { address, types: ",s", args: ["Vocals"] }

xair.on("message", (m) => {
    if (m.address === "/meters/1") console.log(parseMeterBlob(m.args[0] as Buffer)); // dB per strip
});
await xair.send("/meters", ["/meters/1"]);           // meters for ~10 s, then request again
```

- `XAirTransport`: one UDP socket to one mixer. `send(address, args)`, `query(address)` (a value request that waits for the reply), and a `message` event for everything the mixer sends. Packets from other addresses and malformed packets are ignored.
- `discover({ address?, timeoutMs? })`: sends `/xinfo` as a broadcast (or to one address) and collects the answers.
- `encodeMessage` and `decodePacket`: the OSC codec, with int, float, string and blob arguments; bundles are unpacked. `{ type: "f", value: 1 }` sends a whole number as a float.
- `parseMeterBlob` and `buildMeterBlob`: X-Air meter blobs. They hold an int32 count followed by int16 values, both little-endian, with dB = value / 256.
- `LatestValueSender`: sends fast-changing values (e.g. a fader dragged by a dial) at most every 40 ms per address. The first value goes out at once, after that only the latest.
- `dumpMixer({ host })`: the read-only dump as an object.

## Mixer facts

These are verified on an XR12 with firmware 1.18:

- The mixer answers on UDP port 10024, to the port a request came from.
- `/meters ,s "/meters/N"` works for banks 0–9. The mixer sends a frame every 50 ms for 10 seconds, then stops, so a client renews the request before that. Bank 1 holds all strips plus LR and monitor, 40 values in total.
- Channel sends are `/ch/NN/mix/MM/level|tap|grpon`. MM 01–06 are the buses and 07–10 are FX sends 1–4.
- There is no `/config/icon` on X-Air.

## License

MIT © Boris Kemper
