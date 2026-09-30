# Twin Studio JSON Schema

Language-neutral descriptions of the files inside a `.twin.zip` project package, generated from the Zod schemas in `@twin-studio/core`. Use them to validate packages from other languages (Java, Go, Python …), to generate types, or as the field reference.

| File | Describes |
| --- | --- |
| `scene-document.v1.schema.json` | `scene.json` — the scene document, format version 1 |
| `package-manifest.v1.schema.json` | `manifest.json` — package metadata and asset list |

These files are generated; do not edit them by hand. After changing a schema in `packages/core`, run:

```bash
pnpm --filter @twin-studio/core schema:update
```

The unit tests fail when a file here is out of date.

A few rules cannot be expressed in JSON Schema and are enforced when a package is loaded: unique effect, rule and interaction ids; safe WebSocket URLs (ws/wss, no credentials or fragment); at most one enabled data source; interaction metadata limited to JSON nested 10 levels; and "highlight" actions only on hover-enter.
