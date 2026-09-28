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
