# Platform testing — on-device checklists

Windows 10 is continuously tested during development. The macOS/Linux items below cover the platform-branched code added in v1.0.1 (title bar, shortcuts, tray, autostart) and must be run once on real hardware. CI builds the installers for all three OSes.

## macOS

1. [ ] App launches from the dmg; Gatekeeper workaround (right-click → Open) works as documented.
2. [ ] Native traffic lights appear inset in the custom title bar (no custom –/□/× buttons); brand text isn't overlapped.
3. [ ] Window drag works on the title bar; double-click title bar zooms.
4. [ ] App menu shows OpenTerminal → About/Quit; Edit menu gives Cmd+C/V/X in inputs.
5. [ ] Cmd+K focuses the command line; Cmd+1…6 switch panels; Cmd+Shift+P pops out; Cmd+Shift+S snapshots.
6. [ ] Tray (menu-bar) icon renders as a template image — legible in both light and dark menu bars.
7. [ ] Close with tray-minimize ON hides to the menu bar; alerts still fire; reopen via the tray menu.
8. [ ] Pop-out window drag/close works; traffic lights or frameless behavior acceptable on the pop-out.
9. [ ] Launch-at-startup toggle registers under System Settings → Login Items and reads back correctly.
10. [ ] safeStorage stores keys in the macOS Keychain (no plaintext warning shown).
11. [ ] Panel snapshot is pixel-correct on a Retina display; clipboard paste into Preview works.
12. [ ] Quit via Cmd+Q triggers a clean exit (workspace saved).

## Linux (test AppImage AND deb; GNOME + one other DE)

1. [ ] AppImage runs after `chmod +x`; deb installs and launches from the menu.
2. [ ] Frameless drag region works (title bar drags the window) under both X11 and Wayland.
3. [ ] Custom –/□/× buttons minimize/maximize/close correctly.
4. [ ] Without gnome-keyring/kwallet: the plaintext-storage disclaimer appears and declining aborts the save.
5. [ ] With a keyring: keys stored encrypted (no disclaimer).
6. [ ] Tray: on a DE with AppIndicator support the tray works; on one WITHOUT, close-to-tray falls back to a normal close (window never becomes unreachable).
7. [ ] Autostart toggle writes `~/.config/autostart/openterminal.desktop`; for the AppImage the `Exec=` line points at the AppImage path (`$APPIMAGE`), not the mount; toggle off removes the file.
8. [ ] Reboot with autostart on: app starts (hidden if tray-minimize is on and a tray exists).
9. [ ] Native notifications (alerts) appear; clicking focuses the app.
10. [ ] CSV/JSON export dialogs open and write files with correct permissions.
11. [ ] Pop-out windows place correctly under a tiling WM (bounds clamping doesn't fight the WM).
12. [ ] Fonts: JetBrains Mono fallback chain renders monospace everywhere (install `fonts-jetbrains-mono` or verify fallback).

## All OSes (quick regression set)

1. [ ] Fresh profile → wizard → key → default workspace live.
2. [ ] Restart → workspace + pop-out geometry restored.
3. [ ] Sleep 2+ minutes → wake: stream reconnects, quotes refresh, countdown correct.
4. [ ] `WS <name>` switch round-trip.
5. [ ] Second instance focuses the first.
