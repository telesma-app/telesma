# Telesma

Telesma is a desktop workbench for inspecting, testing, and managing local FIDO2/CTAP authenticators. It is built with Wails 3, Go, Svelte 5, and [`github.com/telesma-app/kit`](https://github.com/telesma-app/kit).

The application discovers connected authenticators, opens the selected device automatically, and keeps authenticator lifecycle and user-interaction prompts inside the desktop workflow.

## Features

- Inspect authenticator identity, CTAP versions, options, algorithms, transports, extensions, limits, and vendor metadata.
- Look up authenticator metadata and status reports through the FIDO Metadata Service (MDS).
- List, inspect, rename, and delete discoverable passkeys with operation previews and confirmations.
- Inspect and manage the authenticator large-blob array, including entry writes, deletes, and cleanup previews.
- Manage security settings supported by the selected authenticator: PIN, minimum-PIN policy, always-UV, enterprise attestation, biometric enrollments, and factory reset.
- Build and run WebAuthn-style MakeCredential and GetAssertion scenarios in the Lab, review the normalized CTAP request, inspect extension results, and perform local result verification.
- Review structured operation and diagnostic logs without exposing PINs or authentication-token material.
- Use the interface in English or Russian and switch between standard and advanced presentation modes.

Available operations depend on the capabilities and state of the connected authenticator.

## Requirements

- Go 1.27.0 or newer
- Wails 3 CLI compatible with the version pinned in `go.mod`
- Node.js and pnpm
- Native Wails build dependencies for your platform
- A locally accessible FIDO authenticator and a supported transport

Install the Wails CLI and check the platform dependencies with the instructions in the [Wails 3 documentation](https://v3.wails.io/). This repository currently uses Wails `v3.0.0-beta.5`.

## Development

Start the application in development mode:

```sh
wails3 dev
```

This launches the real native Wails window and watches both the Go application and the Vite frontend. A browser-only Vite preview is not a reliable smoke test for the Wails runtime or authenticator integration.

## Build and package

Build a production binary for the current platform:

```sh
wails3 build
```

The output is written to `bin/`. Run the built application with:

```sh
wails3 task run
```

Create the platform packages supported by the current host configuration:

```sh
wails3 package
```

Platform-specific tasks, including macOS universal builds and individual Linux or Windows package formats, are listed with:

```sh
wails3 task --list-all
```

Generated TypeScript bindings are refreshed as part of the normal frontend build. To regenerate them explicitly:

```sh
wails3 task common:generate:bindings
```

## Verification

Run backend tests:

```sh
go test ./... -count=1
```

For authenticator lifecycle, locking, interaction, or cancellation changes, also run:

```sh
go test -race ./... -count=1
```

Run frontend type checks, tests, and a production build:

```sh
pnpm --dir frontend check
pnpm --dir frontend test
pnpm --dir frontend build
```

For UI smoke testing, use `wails3 dev` with a real Wails window and, where relevant, a physical authenticator.

## Architecture

Telesma is the product and desktop boundary over `ctapkit`. Reusable authenticator, CTAP, device, transport, interaction, token, and selection behavior belongs in the toolkit; this repository owns the Wails integration, application state, presentation, and product workflows.

- `main.go` configures the Wails application and native window.
- `service/` contains application-owned discovery, selection, interaction, logging, metadata, and typed operation envelopes.
- `ctapkit_service.go` wires the service into the Wails lifecycle.
- `ctapkit_operations.go` exposes the Wails-facing operation facade.
- `appconfig/` persists application settings such as locale and advanced mode.
- `frontend/src/App.svelte` is the desktop shell.
- `frontend/src/screens/` contains the Overview, Passkeys, Large Blobs, Security, Lab, Logs, and Settings screens.
- `frontend/src/lib/` contains controllers, stores, typed result extraction, presentation builders, and product components.
- `frontend/bindings/` contains generated Wails bindings and should not be edited by hand.
- `build/` contains Wails build configuration, icons, packaging assets, and platform tasks.

## Security and privacy

Telesma is designed for local authenticator workflows. PINs, PIN/UV authentication tokens, reset confirmations, and other authentication-token material must never be logged or persisted. HMAC-secret and PRF outputs are transient Lab results: they remain hidden until explicitly revealed and are cleared at the relevant Lab or authenticator boundary.

Review every mutating or destructive operation in its preview dialog before confirming it, especially passkey deletion, large-blob changes, security configuration, biometric changes, and factory reset.
