// Try xair-client without a mixer: a fake XR12 on localhost, the library talking to it.
//
//   npm install xair-client
//   node try-it.mjs
//
// Against a real mixer, leave the emulator out and give the mixer's address: new XAirMixer({ host: "192.168.1.50" }).
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
