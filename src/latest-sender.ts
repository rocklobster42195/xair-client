// Values that change fast (a dial turning a fader) go out at most every `intervalMs` per address:
// the first right away, then only the latest one. The mixer ends up where the user stopped without
// being flooded with every step in between.
import type { OscArg } from "./osc/codec.js";

type Send = (address: string, args: OscArg[]) => Promise<void>;

export class LatestValueSender {
    private readonly pending = new Map<string, OscArg[]>();
    private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(
        private readonly send: Send,
        private readonly intervalMs = 40,
        private readonly onError: (e: unknown) => void = () => {},
    ) {}

    push(address: string, args: OscArg[]): void {
        if (this.timers.has(address)) {
            this.pending.set(address, args);
            return;
        }
        this.fire(address, args);
    }

    /** Drop everything not sent yet. */
    clear(): void {
        for (const t of this.timers.values()) clearTimeout(t);
        this.timers.clear();
        this.pending.clear();
    }

    private fire(address: string, args: OscArg[]): void {
        this.send(address, args).catch(this.onError);
        this.timers.set(
            address,
            setTimeout(() => {
                this.timers.delete(address);
                const next = this.pending.get(address);
                if (!next) return;
                this.pending.delete(address);
                this.fire(address, next);
            }, this.intervalMs),
        );
    }
}
