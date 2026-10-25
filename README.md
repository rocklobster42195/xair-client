# xair-client

[![npm](https://img.shields.io/npm/v/xair-client?color=00ACA8)](https://www.npmjs.com/package/xair-client)
[![CI](https://github.com/rocklobster42195/xair-client/actions/workflows/ci.yml/badge.svg)](https://github.com/rocklobster42195/xair-client/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Ko-fi](https://img.shields.io/badge/support-Ko--fi-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/rocklobster42195)

A TypeScript client for **Behringer X-Air** digital mixers (XR12, XR16, XR18) and the **Midas MR18**, over OSC on UDP. It has no runtime dependencies and runs on Node 20 or later. It is the mixer side of [X-Air Controller](https://github.com/rocklobster42195/streamdeck-xair-controller), a Stream Deck plugin, and works on its own.

> **Status: early (0.x).** The API may still change between minor versions.

This is an unofficial community package. It is not affiliated with or endorsed by Behringer, Midas or Music Tribe. "X-Air" is a trademark of Music Tribe.

## Install

```sh
npm install xair-client
```

## Try it without a mixer

The package ships a fake mixer, so you can run this right after installing, with nothing connected. Save it as `try-it.mjs` (the same file is in [`examples/`](examples/try-it.mjs)) and run `node try-it.mjs`:

```js
import { XAirMixer, XAirStrips, formatDb } from "xair-client";
import { XAirEmulator } from "xair-client/emulator";

// A fake mixer with a name on channel 1
const emulator = new XAirEmulator({ model: "XR12", values: { "/ch/01/config/name": ["Vocals"] } });
const port = await emulator.start();

// Connect, then read the names, colors, faders and mutes of every strip
const mixer = new XAirMixer({ host: "127.0.0.1", port });
await mixer.connect();
console.log("connected to", mixer.info?.name, "(" + mixer.model?.name + ")");

const strips = new XAirStrips(mixer);
await mixer.sync(strips.addresses());
for (const s of strips.list().slice(0, 3)) console.log(s.path, JSON.stringify(s.name), formatDb(s.db), s.muted ? "muted" : "");

// Be told when something changes, as if somebody moves the fader on the desk
strips.watch({ kind: "ch", n: 1 }, (s) => console.log("channel 1 is now at", formatDb(s.db)));
emulator.change("/ch/01/mix/fader", [0.5]);

// A level meter: the emulator streams made-up levels
const stop = mixer.subscribeMeters(1, (db) => console.log("meter of the first strip:", db[0]?.toFixed(1), "dB"));

await new Promise((done) => setTimeout(done, 400));
stop();
mixer.close();
emulator.stop();
process.exit(0);
```

It prints the channel names it read, a change the fake desk made, and a few levels. For a real mixer, leave the emulator out and give the mixer's address: `new XAirMixer({ host: "192.168.1.50" })`.

## Command line

```sh
npx xair-client discover               # find mixers on the local network
npx xair-client discover 192.168.1.50  # ask one address (e.g. over a VPN, where broadcasts don't pass)
npx xair-client dump 192.168.1.50      # read-only snapshot as JSON: names, faders, sends, links, meters
npx xair-client dump 192.168.1.50 out.json --usb   # also probe the USB stick player (XR12/XR16)
```

The dump only sends queries and meter requests, never a value. It is safe to run against a mixer that is in use.

## Library

### The mixer

```ts
import { XAirMixer, XAirStrips, formatDb } from "xair-client";

const mixer = new XAirMixer({ host: "192.168.1.50" });
await mixer.connect();                       // asks /xinfo, keeps /xremote alive
console.log(mixer.info?.name, mixer.model);  // e.g. "XR18-AA", { channels: 16, buses: 6, … }

const strips = new XAirStrips(mixer);
await mixer.sync(strips.addresses());        // read names, colors, faders, mutes, links
for (const s of strips.list()) console.log(s.path, s.name, formatDb(s.db), s.muted ? "muted" : "");

strips.watch({ kind: "ch", n: 1 }, (s) => console.log("channel 1 now", formatDb(s.db)));
strips.setDb({ kind: "ch", n: 1 }, -10);     // throttled when called fast, e.g. from a dial

const stop = mixer.subscribeMeters(1, (db) => console.log(db[0])); // renewed while subscribed
mixer.on("online", (online) => console.log(online ? "mixer online" : "mixer offline"));
```

- `XAirMixer`:
  - `connect()` asks `/xinfo` and keeps `/xremote` alive (every 8 s), so the mixer pushes every change made on the desk or in its app.
  - The `online` event fires when nothing has arrived for 5 s, and again when the mixer is back. The mixer is pinged with `/status` while it is quiet.
  - `get`, `set` and `watch` work for any OSC path. A value cache is filled by answers and pushes, and `sync(paths)` reads many values without flooding the mixer.
  - `subscribeMeters(bank, fn)` is reference-counted. The request is renewed every 9 s while anyone listens, before the mixer's 10-second limit, and stops when the last listener goes.
- `XAirStrips`: channels, aux, FX returns, buses, FX sends, Main LR and DCAs, each with name, color, fader (0..1 and dB), mute and stereo link. `setDb`, `setFader`, `setMuted` and `watch` work on a strip.
- `XAirSends`: a channel's sends to buses 1–6 and FX sends 1–4 (level in dB, tap, the target's name). X-Air has no on/off per send.
- `XAirScenes`: mute groups (state, members, switching) and snapshots (names, the current one, `loadSnapshot(n)`; loading is not yet verified on an X-Air).
- `faderToDb`, `dbToFader` and `formatDb`: the exact X-Air fader law, snapped to the mixer's 1024 steps.
- `MODELS` and `modelOf`: strip counts for XR12, XR16, XR18 and MR18.

### Emulator

`xair-client/emulator` is a fake mixer on localhost, for tests, simulators and screenshots. It answers queries, stores what it is sent, pushes changes to `/xremote` clients and streams synthetic meters.

```ts
import { XAirEmulator } from "xair-client/emulator";

const emu = new XAirEmulator({ model: "XR12", values: { "/ch/01/config/name": ["Vocals"] } });
const port = await emu.start();              // then: new XAirMixer({ host: "127.0.0.1", port })
emu.change("/ch/01/mix/fader", [0.5]);      // as if someone moved the fader on the desk
```

### Low level

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

## Ideas and feedback

Ideas from outside are very welcome: they show what I stopped seeing on my own mixer. Please open an [issue](https://github.com/rocklobster42195/xair-client/issues) with your idea or problem. Small fixes as pull requests are welcome too; for bigger things, please start with an issue.

## Support

This package started as part of my own Stream Deck plugin. It is free and MIT licensed, and everyone is welcome to use it. If you like it, a coffee and a beer are always welcome: **[ko-fi.com/rocklobster42195](https://ko-fi.com/rocklobster42195)**.

## License

MIT © Boris Kemper
