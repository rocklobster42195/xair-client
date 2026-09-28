# Changelog

All notable changes to `xair-client`. The format follows [Keep a Changelog](https://keepachangelog.com/), and versions follow [Semantic Versioning](https://semver.org/) (0.x: minor versions may break).

## [Unreleased]

### Added

- OSC codec (int, float, string, blob, bundles), with no dependencies.
- `XAirTransport`: one UDP socket per mixer, with `send`, `query` and message events. Packets from other addresses and malformed packets are ignored.
- `discover()`: finds mixers through an `/xinfo` broadcast or at a given address.
- Meter blobs: `parseMeterBlob` and `buildMeterBlob`.
- `LatestValueSender` for fast-changing values.
- `dumpMixer()` and the CLI `xair-client discover | dump <ip>` (read-only).
- `XAirMixer`:
  - value cache, `get`, `set` (throttled), `watch` and `sync`;
  - `/xremote` kept alive and an online state;
  - reference-counted meter subscriptions that renew themselves.
- `XAirStrips`: every strip with name, color, fader in dB, mute and stereo link; `muteReason` tells whether a channel is muted by itself, a mute group or a DCA.
- `meterIndices`, `stripId` and `parseStripId`.
- The X-Air fader law (`faderToDb`, `dbToFader`, `formatDb`) and a model registry.
- `xair-client/emulator`: a fake mixer for tests and simulators.
