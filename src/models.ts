// What each X-Air model has. The OSC address space is the same on all of them (an XR12 answers for
// /ch/01–/ch/16), so the strip counts come from here, not from probing. Checked on an XR12, fw 1.18.

export type ModelName = "XR12" | "XR16" | "XR18" | "MR18";

export type Model = {
    name: ModelName;
    /** Input channels /ch/01… */
    channels: number;
    /** Mix buses /bus/1…; channel sends /ch/NN/mix/01–06. */
    buses: number;
    /** FX slots /fx/1…, their returns /rtn/1… and sends /fxsend/1… (channel sends /ch/NN/mix/07–10). */
    fx: number;
    dcas: number;
    muteGroups: number;
    snapshots: number;
};

const base = { buses: 6, fx: 4, dcas: 4, muteGroups: 4, snapshots: 64 } as const;

export const MODELS: Record<ModelName, Model> = {
    XR12: { name: "XR12", channels: 12, ...base },
    XR16: { name: "XR16", channels: 16, ...base },
    XR18: { name: "XR18", channels: 16, ...base },
    MR18: { name: "MR18", channels: 16, ...base },
};

/** The model for a name from "/xinfo" (e.g. "XR18"); unknown names are treated as the largest model. */
export function modelOf(name: string | undefined): Model {
    return MODELS[(name ?? "").toUpperCase() as ModelName] ?? { ...MODELS.XR18, name: "XR18" };
}

/** Channel colors 0–15 as the mixer numbers them (8–15 are the same colors inverted). */
export const COLOR_NAMES = ["off", "red", "green", "yellow", "blue", "magenta", "cyan", "white"] as const;

export type StripColor = { index: number; name: (typeof COLOR_NAMES)[number]; inverted: boolean };

export function stripColor(index: number): StripColor {
    const i = Number.isInteger(index) && index >= 0 && index <= 15 ? index : 0;
    return { index: i, name: COLOR_NAMES[i % 8], inverted: i >= 8 };
}
