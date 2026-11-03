# Aetheris

![Road to v1.0: 80%](https://img.shields.io/badge/road%20to%20v1.0-80%25-22d3ee)

> **Development milestone: v0.8.0 — about 80% toward v1.0.** Aetheris is actively in development; this is a progress marker, not a claim that v1.0 is release-ready. [View the v0.8.0 pre-release](https://github.com/oscarceran-art/Aetheris/releases/tag/v0.8.0).

> **Windows support discontinued.** We’re sorry, Windows users: Aetheris no longer supports Windows. The Windows build
> has been removed. The macOS app in [`mac/`](mac/) is the only supported version.

## macOS

See [`mac/README.md`](mac/README.md) for requirements, setup, and app documentation.

## mac-v2 (improved build, in progress)

[`mac-v2/`](mac-v2/) is a copy of the macOS app where the v0.9 improvement batch is being built
(tests, split store, IndexedDB persistence, model picker, agent handoffs, onboarding, …).
It runs side-by-side with `mac/` on port 5174 with its own storage. The original `mac/` folder is
untouched. See [`mac-v2/README.md`](mac-v2/README.md).
