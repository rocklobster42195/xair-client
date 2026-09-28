// X-Air meter blobs: an int32 count, then that many int16 values, both little-endian (unlike the
// rest of OSC); dB = value / 256. Checked against an XR12, firmware 1.18.

/** The dB values of a meter blob (-128 dB = silence). Values the blob is too short for are left out. */
export function parseMeterBlob(blob: Buffer): number[] {
    if (blob.length < 4) return [];
    const count = blob.readInt32LE(0);
    const values: number[] = [];
    for (let i = 0; i < count && 4 + i * 2 + 2 <= blob.length; i++) values.push(blob.readInt16LE(4 + i * 2) / 256);
    return values;
}

/** Build a meter blob (for the emulator and tests). */
export function buildMeterBlob(db: number[]): Buffer {
    const blob = Buffer.alloc(4 + db.length * 2);
    blob.writeInt32LE(db.length, 0);
    db.forEach((v, i) => blob.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 256))), 4 + i * 2));
    return blob;
}
