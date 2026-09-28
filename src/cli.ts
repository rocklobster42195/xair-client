#!/usr/bin/env node
// npx xair-client discover [ip]          find mixers (broadcast, or ask one IP, e.g. over a VPN)
// npx xair-client dump <ip> [out.json] [--usb]   read-only snapshot of a mixer (never sends a value);
//                                               --usb also probes the USB stick player
import fs from "node:fs";
import { discover } from "./discover.js";
import { dumpMixer } from "./dump.js";

const [command, ...args] = process.argv.slice(2);

async function main(): Promise<number> {
    switch (command) {
        case "discover": {
            const mixers = await discover({ address: args[0] });
            if (!mixers.length) console.log("No mixer answered.");
            for (const m of mixers) console.log(`${m.name} [${m.model}] – ${m.ip} (firmware ${m.firmware})`);
            return 0;
        }
        case "dump": {
            const usb = args.includes("--usb");
            const [host, out = "xair-dump.json"] = args.filter((a) => a !== "--usb");
            if (!host) return usage();
            const dump = await dumpMixer({ host, usb });
            // Blobs don't belong in the JSON; the meters are already decoded
            fs.writeFileSync(out, JSON.stringify(dump, (_k, v) => (v?.type === "Buffer" ? `<blob ${v.data.length} bytes>` : v), 1));
            const total = Object.keys(dump.values).length + dump.missing.length;
            console.log(`answered ${Object.keys(dump.values).length}/${total}, meter banks ${Object.keys(dump.meters).length}, written ${out}`);
            return 0;
        }
        default:
            return usage();
    }
}

function usage(): number {
    console.log("Usage:\n  xair-client discover [ip]\n  xair-client dump <ip> [out.json] [--usb]");
    return 1;
}

main().then(
    (code) => process.exit(code),
    (e) => {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
    },
);
