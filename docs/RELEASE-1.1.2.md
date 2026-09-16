# OpenTerminal v1.1.2

Two keyless modules that looked broken now work.

## Fixed
- **Options flow (`FLOW`) loads data.** It never did: Yahoo's session handshake refused the way the app asked for its token. Fixed and verified live — put/call ratio, volume leaders and unusual-volume badges for any optionable ticker (`AAPL FLOW`, or `FLOW` for SPY).
- **News wire (`WIRE`) shows proper punctuation.** Headlines no longer contain codes like `&#x2018;` instead of quotes, and hover summaries no longer show `&nbsp;`.

## Install
| System | File | First launch |
|---|---|---|
| Windows 10/11 | `OpenTerminal-1.1.2-win-x64.exe` | Per-user, no admin. SmartScreen: **More info → Run anyway** (unsigned build). |
| macOS (Apple Silicon) | `OpenTerminal-1.1.2-mac-arm64.dmg` | Drag to Applications. First open: **System Settings → Privacy & Security → Open Anyway** (macOS 14 and older: right-click → Open). "Is damaged": `xattr -cr /Applications/OpenTerminal.app`. |
| Linux (x64) | `OpenTerminal-1.1.2-linux-x86_64.AppImage` / `OpenTerminal-1.1.2-linux-amd64.deb` | AppImage: `chmod +x`, then run. Debian/Ubuntu: `sudo apt install ./OpenTerminal-1.1.2-linux-amd64.deb`. |

Already on 1.1.1? Install over it — settings, keys and workspaces are kept. Auto-update is disabled in unsigned builds by design.

## Notes
- Market data may be delayed. Not investment advice. Personal/educational use.
