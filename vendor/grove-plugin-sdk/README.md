# Grove Plugin SDK 1.4 types

Vendored TypeScript declarations from the accompanying Town Client SDK implementation. There is no runtime in this package: the desktop host injects `window.grove` into each sandboxed plugin document.

`agent.d.ts` contains the generic plugin behavior/data API. Goal-specific models and rules are defined by this plugin's `src/` and `desktop.plugin.json`, not by the host SDK.

License: MIT (see the repository LICENSE).
