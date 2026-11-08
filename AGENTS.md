# AGENTS.md

## Mission
- `Telesma` is a Wails 3 desktop workbench for local FIDO2/CTAP authenticators.
- The Go app is a product boundary over `github.com/telesma-app/kit`, pinned in `go.mod`.
- `ctapkit` is a runtime/toolkit for UI applications, not an abstract remote backend; generated Wails and `ctapkit` DTOs are UI-facing first-party model contracts.
- Keep reusable authenticator, CTAP, device, transport, interaction, token, and selection semantics in `ctapkit`.
- Keep product UX, Wails wiring, app state, screens, status/log presentation, and app-specific envelopes in this repo.
- The project is greenfield. Prefer clean architecture over preserving early shapes.

## Hard Rules
- Never log, persist, dump, or render PINs, `pinUvAuthToken`, reset confirmations, or authentication-token material.
- HMAC-secret and PRF output bytes are allowed only as transient Lab result data: keep them hidden by default, reveal one value only after an explicit eye action, never expose them through clipboard actions, status/log/toast output, general JSON, or diagnostic dumps, and clear them on the Lab result/authenticator boundaries defined by the product. Request salts and PRF inputs are not covered by this output-only exception.
- Treat generated Wails bindings and app-owned `service` DTOs as first-party contracts. Do not add defensive optional chaining, fallback object construction, or "unknown JSON" normalization around fields that are required by those Go types; open `service/`, `../kit`, and the generated bindings when in doubt.
- Operation responses use typed generated envelopes from `telesma/service`. Screens must not call raw generated Wails service methods directly. Centralize operation envelope/result traversal in named typed extractors/controllers under `frontend/src/lib/`; after extraction, UI builders and components may accept generated DTO types directly. Do not add `resultOf()`, `objectValue()`, defensive `Partial<>`, or `Record<string, unknown>` normalization around required generated DTO fields. `MDSLookupEnvelope.result` is a typed `LookupResult`; use it directly.
- Do not fabricate generated `telesma/service` operation envelopes or model DTOs to represent frontend, bridge, transport, or thrown runtime failures. If a service call returns a real generated envelope with `error`, pass that envelope through. If a call throws or fails before returning a generated envelope, keep the generated DTO `data` empty/null, store a `failure.Failure` as the error, and report status/log entries through an explicit runtime-failure path rather than constructing fake `CredentialsEnvelope`, `InspectEnvelope`, or similar objects.
- When selection is empty, discovery must automatically select and open the first available authenticator.
- The selected device is the authenticator boundary: changing selection must close the currently open authenticator, clear pending interaction UI state, clear per-device screen state, and open the newly selected device. The app should not expose manual authenticator lifecycle controls.
- Clearing selection or app shutdown must close the open authenticator and clear pending interaction UI state; `ctapkit` owns operation and interaction cancellation when the authenticator closes.
- Close/cancel paths must release the authenticator and resolve pending interactions without holding service locks while closing handles.
- Mutating or destructive authenticator actions need preview/confirmation semantics matching `ctapkit`.
- Do not add frontend epoch counters, stale-response filters, duplicate in-flight interaction guards, or current-selection revalidation layers for ordinary authenticator operations. `ctapkit` is the runtime boundary, local authenticators are single-operation devices, and frontend code should trust generated operation/selection/interaction contracts instead of modelling imagined concurrency.
- Do not hand-edit `frontend/bindings/` unless intentionally updating generated Wails artifacts.
- Treat Taskfile files as Wails integration-critical. Small targeted edits such as package-manager or lockfile updates are allowed, but never remove or broadly restructure tasks without an explicit user request.

## Git and Commits
- All commits must follow Conventional Commits 1.0.0: `<type>[optional scope][!]: <description>`.
- Prefer the most specific standard type: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `perf`, `style`, `chore`, or `revert`.
- Use a concise lowercase imperative description without a trailing period. Avoid generic messages such as `update files`, `misc changes`, or `fix stuff`.
- Keep scopes short and product-oriented when they add useful context, for example `feat(passkeys): improve empty inventory guidance`.
- Mark breaking changes with `!` and explain them in a `BREAKING CHANGE:` footer.

## Frontend
- Bindings are the model. Do not create local copies of `DeviceReport`, `LookupResult`, `AuthenticatorGetInfoResponse`, service envelopes, or other `ctapkit` model DTOs.
- Local frontend types are allowed only for genuine presentation shapes: rows, badges, modal props, sidebar/titlebar state, status/log display, and similar UI-only structures.
- View models are allowed only when they aggregate multiple UI states/stores or transform generated DTOs into a real presentation structure. Do not introduce `*Model`, `*ViewModel`, `*Info`, or `*Report` types that merely mirror generated DTOs, and do not add adapter/wrapper layers "just in case".
- `shadcn-svelte` is the preferred source for accessible UI primitives and locally owned component code.
- Before creating custom UI for controls, feedback, layout, overlays, or data display, always check existing shadcn-svelte components first; if a suitable primitive exists, use or add it instead of hand-rolling equivalent markup.
- Inspect `frontend/components.json` before adding shadcn components. Add components through the `shadcn-svelte` CLI/registry, then customize the generated local files intentionally.
- The `lyra` shadcn style is the visual baseline. Product CSS should provide layout, density, Wails shell behavior, and domain state hooks, not a parallel custom design system.
- Tailwind is acceptable inside shadcn-generated UI primitives and small primitive wrappers. Product screens and workbench components should prefer shadcn primitives plus minimal CSS classes for layout and state.
- Frontend CSS must follow CUBE CSS strictly: CSS/global rules first, then Composition, Utility, Block, and Exception.
- `data-*` attributes are the required CUBE Exception mechanism for real state/variant deviations. They are not an escape hatch from CUBE.
- Do not introduce Tailwind-like utility piles, custom visual themes, or component variants that bypass Lyra/shadcn styling and the CUBE layers.
- Do not import `bits-ui` directly outside generated/local shadcn UI components under `frontend/src/lib/components/ui/`. App/product code should consume shadcn components instead.
- Screens compose product/workbench components. Product components compose small UI components and shadcn UI primitives.
- Keep state in stores/controllers under `frontend/src/lib/`; screens should not call raw generated bindings directly.

## Local Map
- Backend entrypoint: `main.go`; app-owned orchestration and DTOs: `service/`; Wails service lifecycle: `ctapkit_service.go`; operation facade: `ctapkit_operations.go`.
- Frontend shell: `frontend/src/App.svelte`.
- Screens: `frontend/src/screens/`; reusable product/workbench components: `frontend/src/lib/components/` grouped by domain, with shadcn primitives under `frontend/src/lib/components/ui/`; app stores/controllers, typed extractors, and presentation builders: `frontend/src/lib/`. Do not use `frontend/src/lib/` for DTO mirrors.
- OpenSpec files under `openspec/` are history and requirements, not architectural handcuffs.

## Tooling
- Prioritize the GoLand MCP tools for code navigation, symbol lookup, usage searches, inspections, refactoring, and other IDE-assisted operations when they are available and applicable.

## Verify
- Backend: `go test ./... -count=1`.
- Authenticator lifecycle, locking, interaction, or cancellation changes: also consider `go test -race ./... -count=1`.
- Frontend: `cd frontend; pnpm run build`.
- Frontend type checking: `cd frontend; pnpm run check`.
- UI smoke tests must use the real Wails window. Wails 3 dev runtime is not reliable through browser automation; ask the user to run `wails3 dev` or `task dev`.

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
