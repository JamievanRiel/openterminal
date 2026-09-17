# Security policy

## Status

OpenTerminal has **not** had an independent security review. Releases are unsigned, and
the app ships Electron 31, which is past its support window. The README section
"Security model" describes how the app is hardened and which advisories are known.

## Supported versions

Only the [latest release](https://github.com/JamievanRiel/openterminal/releases/latest)
receives fixes.

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Report them privately
through GitHub: open the **Security** tab of this repository and choose
**Report a vulnerability**.

Please include what you found, which part it affects (for example IPC, key storage,
a provider adapter, the installers), the version and operating system, and, if
possible, a way to reproduce it. You'll get a response as soon as possible. Once a fix
is available, the report will be published with credit to you, unless you prefer
otherwise.

## Scope

In scope: the code in this repository and the installers published on its Releases
page. Especially welcome are ways to:

- reach Node or the main process from the renderer, or bypass the IPC whitelist or its
  payload validation;
- read stored API keys, or find them in logs or diagnostics exports;
- make the app load or navigate to remote content.

Out of scope: vulnerabilities inside Electron, Node.js or third-party packages (please
report those upstream, and let us know when OpenTerminal is affected), the data
providers' own services, and warnings that exist only because builds are unsigned.
