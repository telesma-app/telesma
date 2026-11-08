# Development guide

[Back to Telesma](../README.md).

Run commands from the repository root.

## Requirements

- Go matching [`go.mod`](../go.mod)
- Wails 3 CLI compatible with the version pinned in `go.mod`
- Node.js and pnpm
- Native Wails build dependencies for your platform
- A locally accessible FIDO authenticator and a supported transport

This repository pins Wails and `@wailsio/runtime` to `v3.1.0`. Install the matching CLI:

```sh
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0
```

Check the platform dependencies with the instructions in the [Wails 3 documentation](https://v3.wails.io/).

The macOS build tasks enable `private_mac_apis` to preserve the Liquid Glass backdrop and WebView transparency. Direct Go builds on macOS also need this tag; see [Wails' private macOS API guide](https://v3.wails.io/guides/build/private-macos-apis/).

## Development

`go.mod` and `go.sum` define dependency versions. Optional `go.work` and
`go.work.sum` files stay local and are ignored by Git. CI and module verification
run with `GOWORK=off`.

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

Run Go linters with [golangci-lint v2](https://golangci-lint.run/) (v2.2.0 or newer):

```sh
wails3 task lint
```

Run backend tests:

```sh
GOWORK=off go test ./... -count=1
```

For authenticator lifecycle, locking, interaction, or cancellation changes, also run:

```sh
GOWORK=off go test -race ./... -count=1
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
- `service/wails.go` wires the service into the Wails lifecycle.
- `service/operations.go` exposes the Wails-facing operation facade.
- `appconfig/` persists application settings such as locale and advanced mode.
- `frontend/src/App.svelte` is the desktop shell.
- `frontend/src/screens/` contains the Overview, Passkeys, Large Blobs, Security, Lab, Logs, and Settings screens.
- `frontend/src/lib/` contains controllers, stores, typed result extraction, presentation builders, and product components.
- `frontend/bindings/` contains generated Wails bindings and should not be edited by hand.
- `build/` contains Wails build configuration, icons, packaging assets, and platform tasks.
