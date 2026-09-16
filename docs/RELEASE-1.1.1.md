# OpenTerminal v1.1.1

The first release you can simply download and run — and use before you have any API key.

## Highlights
- **Download instead of build** — Windows, macOS and Linux installers are attached to this release.
- **Start without a key** — the welcome screen offers everything that works with no API key as a one-click start: news wire with sentiment (`WIRE`), economic calendar (`ECAL`), Reddit stream (`SOCL`), crypto dashboard (`CRYP`), options flow (`FLOW`), space and flight boards (`SPACE`, `FLT`). `HELP` tags them **NO KEY**.
- **Skip means skip** — skipping the Finnhub key is remembered; the welcome screen no longer returns on every launch.

## Install
| System | File | First launch |
|---|---|---|
| Windows 10/11 | `OpenTerminal-1.1.1-win-x64.exe` | Per-user, no admin. SmartScreen: **More info → Run anyway** (unsigned build). |
| macOS (Apple Silicon) | `OpenTerminal-1.1.1-mac-arm64.dmg` | Drag to Applications. First open: **System Settings → Privacy & Security → Open Anyway** (macOS 14 and older: right-click → Open). "Is damaged": `xattr -cr /Applications/OpenTerminal.app`. |
| Linux (x64) | `OpenTerminal-1.1.1-linux-x86_64.AppImage` / `OpenTerminal-1.1.1-linux-amd64.deb` | AppImage: `chmod +x`, then run. Debian/Ubuntu: `sudo apt install ./OpenTerminal-1.1.1-linux-amd64.deb`. |

Then see *First steps* in the [README](https://github.com/JamievanRiel/openterminal#first-steps). For live stock quotes add a free Finnhub key in `SET` → Keys.

Auto-update is disabled in unsigned builds by design — download new versions from the Releases page.

## Notes
- Fixed: Linux installers failed to build on the v1.1.0 tag (missing author e-mail for the `.deb` maintainer field).
- Market data may be delayed. Not investment advice. Personal/educational use.
