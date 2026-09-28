import { afterEach, describe, expect, it, vi } from "vitest";
import { LatestValueSender } from "../src/latest-sender.js";

afterEach(() => vi.useRealTimers());

describe("LatestValueSender", () => {
    it("sends the first value at once, then only the latest per interval and address", async () => {
        vi.useFakeTimers();
        const sent: string[] = [];
        const s = new LatestValueSender(async (a, args) => void sent.push(`${a}=${args[0]}`), 40);
        s.push("/ch/01/mix/fader", [0.1]);
        s.push("/ch/01/mix/fader", [0.2]);
        s.push("/ch/01/mix/fader", [0.3]);
        s.push("/ch/02/mix/fader", [0.5]);
        expect(sent).toEqual(["/ch/01/mix/fader=0.1", "/ch/02/mix/fader=0.5"]);
        await vi.advanceTimersByTimeAsync(40);
        expect(sent).toEqual(["/ch/01/mix/fader=0.1", "/ch/02/mix/fader=0.5", "/ch/01/mix/fader=0.3"]);
        await vi.advanceTimersByTimeAsync(100);
        expect(sent).toHaveLength(3);
    });

    it("drops pending values on clear", async () => {
        vi.useFakeTimers();
        const sent: number[] = [];
        const s = new LatestValueSender(async (_a, args) => void sent.push(args[0] as number), 40);
        s.push("/x", [1]);
        s.push("/x", [2]);
        s.clear();
        await vi.advanceTimersByTimeAsync(100);
        expect(sent).toEqual([1]);
    });
});
