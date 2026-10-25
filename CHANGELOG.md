# Changelog

All notable changes to `xair-client`. The format follows [Keep a Changelog](https://keepachangelog.com/), and versions follow [Semantic Versioning](https://semver.org/) (0.x: minor versions may break).

## [Unreleased]

## [0.1.1] — 2026-10-25

### Added

- `examples/try-it.mjs` ships with the package: a fake XR12 on localhost, the library reading its channels, a change and a meter, so it runs without a mixer. The README has the same code in "Try it without a mixer".

## [0.1.0] — 2026-10-25

### Added

- OSC codec (int, float, string, blob, bundles), with no dependencies.
- `XAirTransport`: one UDP socket per mixer, with `send`, `query` and message events. Packets from other addresses and malformed packets are ignored.
- `discover()`: finds mixers through an `/xinfo` broadcast or at a given address.
- Meter blobs: `parseMeterBlob` and `buildMeterBlob`.
- `LatestValueSender` for fast-changing values.
- `dumpMixer()` and the CLI `xair-client discover | dump <ip> [--usb]` (read-only; `--usb` probes the USB stick player).
- `XAirMixer`:
  - value cache, `get`, `set` (throttled), `watch` and `sync`;
  - `/xremote` kept alive and an online state;
  - reference-counted meter subscriptions that renew themselves.
- `XAirStrips`: every strip with name, color, fader in dB, mute and stereo link; `muteReason` tells whether a channel is muted by itself, a mute group or a DCA.
- `meterIndices`, `stripId` and `parseStripId`.
- The X-Air fader law (`faderToDb`, `dbToFader`, `formatDb`) and a model registry.
- `XAirSends` (channel sends to buses and FX sends: level in dB, tap, target name) and `XAirScenes` (mute groups with members, snapshot names, loading).
- `xair-client/emulator`: a fake mixer for tests and simulators (also loads snapshots).
