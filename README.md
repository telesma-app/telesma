# Telesma

<img src="build/appicon.png" alt="Telesma" width="96">

[![Build](https://github.com/telesma-app/telesma/actions/workflows/build.yml/badge.svg)](https://github.com/telesma-app/telesma/actions/workflows/build.yml)
[![Quality](https://github.com/telesma-app/telesma/actions/workflows/quality.yml/badge.svg)](https://github.com/telesma-app/telesma/actions/workflows/quality.yml)

Telesma is a desktop workbench for inspecting, testing, and managing local FIDO2/CTAP authenticators.

The application discovers connected authenticators, opens the selected device automatically, and keeps authenticator lifecycle and user-interaction prompts inside the desktop workflow.

## Features

- Inspect USB/HID and PC/SC device data, CTAP capabilities, and vendor-specific information.
- Look up authenticator metadata and status reports through the FIDO Metadata Service (MDS).
- List, inspect, rename, and delete discoverable passkeys with operation previews and confirmations.
- Inspect and manage the authenticator large-blob array, including entry writes, deletes, and cleanup previews.
- Manage security settings supported by the selected authenticator: PIN, minimum-PIN policy, always-UV, enterprise attestation, biometric enrollments, and factory reset.
- Build and run WebAuthn-style MakeCredential and GetAssertion scenarios in the Lab, review the normalized CTAP request, inspect extension results, and perform local result verification.
- Review structured operation and diagnostic logs without exposing PINs or authentication-token material.
- Use the interface in English or Russian and switch between standard and advanced presentation modes.

Available operations depend on the capabilities and state of the connected authenticator.

## Getting started

Download the archive for your platform from the
[latest release](https://github.com/telesma-app/telesma/releases/latest), extract
it and launch Telesma. Releases currently include macOS arm64, Linux amd64 and
Windows amd64 builds; available archives are listed on the release page.

1. Connect a FIDO2 security key through USB HID or a PC/SC reader.
2. Open Telesma and select the authenticator if more than one is connected.
3. Inspect its capabilities and metadata in Overview.
4. Use Passkeys, Large Blobs, Security or Lab for the supported workflows.

Device access depends on OS permissions and the selected transport. Windows
applications using HID without elevation need the
[Windows proxy service](https://github.com/telesma-app/windows-proxy).

## Development

Telesma uses Wails 3, Go, Svelte 5 and
[`telesma-app/kit`](https://github.com/telesma-app/kit).
See the [development guide](docs/development.md) for requirements, local startup,
builds, packaging, verification and the source map.

## Security and privacy

Telesma is designed for local authenticator workflows. PINs, PIN/UV authentication tokens, reset confirmations, and other authentication-token material must never be logged or persisted. HMAC-secret and PRF outputs are transient Lab results: they remain hidden until explicitly revealed and are cleared at the relevant Lab or authenticator boundary.

Review every mutating or destructive operation in its preview dialog before confirming it, especially passkey deletion, large-blob changes, security configuration, biometric changes, and factory reset.

## License

[Apache License 2.0](LICENSE).
