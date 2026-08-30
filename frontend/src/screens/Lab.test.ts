import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { get } from "svelte/store";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Kind as OperationKind } from "../../bindings/github.com/telesma-app/kit/model/operation";
import { Code } from "../../bindings/github.com/telesma-app/kit/model/failure";
import { Severity, Warning } from "../../bindings/github.com/telesma-app/kit/model/safety";
import { PublicKeyCredentialType } from "../../bindings/github.com/telesma-app/ctap/credential";
import { ExtensionIdentifier } from "../../bindings/github.com/telesma-app/ctap/extension";
import { Option } from "../../bindings/github.com/telesma-app/ctap/protocol";
import { DeviceReport } from "../../bindings/github.com/telesma-app/kit/model/report";
import { Mode } from "../../bindings/github.com/telesma-app/kit/transport";
import {
  MakeCredentialInput,
  MakeCredentialPreview,
} from "../../bindings/github.com/telesma-app/kit/model/webauthn";
import {
  MakeCredentialEnvelope,
  MakeCredentialRequest,
  type InspectEnvelope,
} from "../../bindings/telesma/service";

import { createLabState, labState as mutableLabState } from "$lib/features/lab/state";
import { setAppLocale } from "$lib/i18n";
import { failureForCode } from "$lib/test-support/failure";
import {
  resetAppStateForTest,
  seedOverviewEnvelopeForTest,
  seedSelectionForTest,
} from "$lib/test-support/store-utils";
import { setStatusOperation } from "$lib/workbench-state";

import Lab from "./Lab.svelte";

const controllerMocks = vi.hoisted(() => ({
  previewMakeCredential: vi.fn(() => Promise.resolve(true)),
  runGetAssertion: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("$lib/features/lab", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/features/lab")>()),
  previewLabMakeCredential: controllerMocks.previewMakeCredential,
  runLabGetAssertion: controllerMocks.runGetAssertion,
}));

const token = new DeviceReport({
  attachment: {
    id: "token-1",
    transport: Mode.ModeHID,
    usb: { product: "Test authenticator", vendorId: 1, productId: 2 },
  },
});

function selectToken() {
  seedSelectionForTest(token.attachment.id, token, {
    state: "ready",
    selectionId: "authenticator-1",
  });
}

function stepLayout(name: string) {
  return screen.getByRole("heading", { level: 2, name }).closest(".lab-step-layout") as HTMLElement;
}

function cardTitle(scope: HTMLElement, name: string) {
  return within(scope).getByText(name, { selector: '[data-slot="card-title"]' });
}

function extensionCard(scope: HTMLElement, title: string) {
  return within(scope)
    .getByText(title, { selector: "code" })
    .closest('[data-slot="card"]') as HTMLElement;
}

function codeMirrorValue(editor: HTMLElement) {
  return Array.from(editor.querySelectorAll(".cm-line"), (line) => line.textContent).join("\n");
}

describe("WebAuthn Lab screen", () => {
  beforeEach(() => {
    setAppLocale("en");
    resetAppStateForTest();
    controllerMocks.previewMakeCredential.mockClear();
    controllerMocks.runGetAssertion.mockClear();
  });

  afterEach(async () => {
    cleanup();
    await tick();
    document.body.style.pointerEvents = "";
  });

  it("does not render a local token-selection empty state", () => {
    render(Lab);

    expect(screen.queryByText("Select an authenticator")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "WebAuthn Lab" })).not.toBeInTheDocument();
  });

  it("renders operation tabs and preserves the independent drafts", async () => {
    const user = userEvent.setup();

    selectToken();
    render(Lab);

    expect(screen.queryByRole("heading", { name: "WebAuthn Lab" })).not.toBeInTheDocument();
    expect(cardTitle(document.body, "Scenario")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Create a passkey, review the exact request, then exercise it with an assertion.",
      ),
    ).toBeInTheDocument();

    const commandCenter = screen.getByRole("complementary", { name: "Current run" });

    expect(within(commandCenter).getByText("Test authenticator")).toBeInTheDocument();
    expect(
      within(commandCenter).getByRole("heading", { name: "Request readiness" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("1. Test authenticator")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fill demo values" })).toBeEnabled();
    expect(screen.getByRole("tab", { name: "MakeCredential" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "GetAssertion" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "MakeCredential" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "GetAssertion" }),
    ).not.toBeInTheDocument();

    const make = stepLayout("MakeCredential");

    expect(within(make).getByLabelText("RP name")).toHaveValue("Example");
    expect((within(make).getByLabelText("User ID hex") as HTMLInputElement).value).toMatch(
      /^[0-9a-f]{32}$/,
    );
    await user.clear(within(make).getByLabelText("RP name"));
    await user.type(within(make).getByLabelText("RP name"), "Edited make RP");

    await user.click(screen.getByRole("tab", { name: "GetAssertion" }));

    const assertion = stepLayout("GetAssertion");

    expect(within(assertion).getByLabelText("RP ID")).toHaveValue("example.com");
    expect(
      within(assertion).getByText(/Leave empty to let the authenticator choose/),
    ).toBeInTheDocument();
    await user.clear(within(assertion).getByLabelText("RP ID"));
    await user.type(within(assertion).getByLabelText("RP ID"), "get.example.com");

    await user.click(screen.getByRole("tab", { name: "MakeCredential" }));
    expect(within(stepLayout("MakeCredential")).getByLabelText("RP name")).toHaveValue(
      "Edited make RP",
    );
    await user.click(screen.getByRole("tab", { name: "GetAssertion" }));
    expect(within(stepLayout("GetAssertion")).getByLabelText("RP ID")).toHaveValue(
      "get.example.com",
    );
  });

  it("renders configure sections sequentially and keeps extension include separate from expand", async () => {
    const user = userEvent.setup();

    selectToken();
    seedOverviewEnvelopeForTest({
      result: {
        info: {
          extensions: [ExtensionIdentifier.ExtensionIdentifierHMACSecret],
        },
      },
    } as unknown as InspectEnvelope);
    render(Lab);

    const make = stepLayout("MakeCredential");

    expect(within(make).queryByRole("tab")).not.toBeInTheDocument();
    expect(cardTitle(make, "Basics")).toBeInTheDocument();
    expect(within(make).getByRole("heading", { name: "clientDataJSON" })).toBeInTheDocument();
    expect(cardTitle(make, "Extensions · 0")).toBeInTheDocument();
    expect(cardTitle(make, "Advanced")).toBeInTheDocument();
    expect(within(make).getByRole("heading", { name: "Execution" })).toBeInTheDocument();
    expect(
      within(make).getByRole("heading", { name: "WebAuthn client extensions" }),
    ).toBeInTheDocument();
    expect(
      within(make).getByRole("heading", { name: "CTAP authenticator extensions" }),
    ).toBeInTheDocument();
    expect(within(extensionCard(make, "prf")).getByText("Supported")).toBeInTheDocument();

    const includeCredProps = within(make).getByRole("switch", { name: "Include credProps" });

    expect(within(extensionCard(make, "credProps")).getByText("Client-side")).toBeInTheDocument();

    await user.click(includeCredProps);
    expect(cardTitle(make, "Extensions · 1")).toBeInTheDocument();
    expect(within(make).queryByRole("switch", { name: "Enabled" })).not.toBeInTheDocument();
    expect(within(make).getByRole("switch", { name: "Include credProtect" })).toBeEnabled();
    expect(within(make).getByRole("switch", { name: "Include credBlob" })).toBeEnabled();
    expect(within(make).getByRole("switch", { name: "Include hmac-secret" })).toBeEnabled();
    expect(within(make).getByRole("switch", { name: "Include hmac-secret-mc" })).toBeEnabled();
    expect(within(make).queryByText("hmacCreateSecret")).toBeNull();
    expect(within(make).getByRole("switch", { name: "Include largeBlob" })).toBeEnabled();
    expect(within(make).getByRole("switch", { name: "Include payment" })).toBeEnabled();
    expect(within(make).getByRole("switch", { name: "Include previewSign" })).toBeEnabled();

    await user.click(screen.getByRole("tab", { name: "GetAssertion" }));

    const assertion = stepLayout("GetAssertion");

    expect(within(assertion).queryByRole("tab")).not.toBeInTheDocument();
    expect(within(assertion).getByRole("heading", { name: "clientDataJSON" })).toBeInTheDocument();
    expect(cardTitle(assertion, "Extensions · 0")).toBeInTheDocument();
    expect(
      within(assertion).getByRole("heading", { name: "WebAuthn client extensions" }),
    ).toBeInTheDocument();
    expect(
      within(assertion).getByRole("heading", { name: "CTAP authenticator extensions" }),
    ).toBeInTheDocument();

    const includePRF = within(assertion).getByRole("switch", { name: "Include prf" });

    expect(includePRF).toBeEnabled();
    expect(within(extensionCard(assertion, "prf")).getByText("Supported")).toBeInTheDocument();
    expect(within(assertion).getByRole("switch", { name: "Include credBlob" })).toBeEnabled();
    expect(within(assertion).getByRole("switch", { name: "Include hmac-secret" })).toBeEnabled();
    expect(within(assertion).getByRole("switch", { name: "Include largeBlob" })).toBeEnabled();
    expect(within(assertion).getByRole("switch", { name: "Include payment" })).toBeEnabled();
    expect(within(assertion).getByRole("switch", { name: "Include previewSign" })).toBeEnabled();

    await user.click(includePRF);

    const addOverride = within(assertion).getByRole("button", { name: "Add passkey override" });

    expect(addOverride).toBeDisabled();
    expect(
      within(assertion).getByText(/one override for each allow-list passkey/),
    ).toBeInTheDocument();

    mutableLabState.update((state) => ({
      ...state,
      getDraft: {
        ...state.getDraft,
        allowList: [{ credentialIDHex: "aabb" }],
      },
    }));
    await tick();
    expect(addOverride).toBeEnabled();
    await user.click(addOverride);
    expect(get(mutableLabState).getDraft.extensions.prf.evalByCredential).toHaveLength(1);
    expect(addOverride).toBeDisabled();

    const override = assertion.querySelector(".lab-prf-override") as HTMLElement;

    await user.click(within(override).getByRole("button", { name: "Remove" }));
    mutableLabState.update((state) => ({
      ...state,
      getDraft: {
        ...state.getDraft,
        allowList: [{ credentialIDHex: "aabb" }, { credentialIDHex: "ccdd" }],
      },
    }));
    await tick();
    expect(addOverride).toBeEnabled();
    await user.click(addOverride);
    expect(get(mutableLabState).getDraft.extensions.prf.evalByCredential).toHaveLength(1);
    expect(addOverride).toBeEnabled();
    await user.click(addOverride);
    expect(get(mutableLabState).getDraft.extensions.prf.evalByCredential).toHaveLength(2);
    expect(addOverride).toBeDisabled();
  });

  it.each([
    {
      backend: "the direct largeBlob extension",
      extensions: [ExtensionIdentifier.ExtensionIdentifierLargeBlob],
      options: undefined,
      status: "Supported",
    },
    {
      backend: "largeBlobKey and the largeBlobs command",
      extensions: [ExtensionIdentifier.ExtensionIdentifierLargeBlobKey],
      options: { [Option.OptionLargeBlobs]: true },
      status: "Supported",
    },
    {
      backend: "largeBlobKey without the largeBlobs command",
      extensions: [ExtensionIdentifier.ExtensionIdentifierLargeBlobKey],
      options: undefined,
      status: "Not reported",
    },
  ])(
    "reports WebAuthn largeBlob support from $backend",
    async ({ extensions, options, status }) => {
      const user = userEvent.setup();

      selectToken();
      seedOverviewEnvelopeForTest({
        result: {
          info: {
            extensions,
            options,
          },
        },
      } as unknown as InspectEnvelope);
      render(Lab);

      const make = stepLayout("MakeCredential");

      expect(within(extensionCard(make, "largeBlob")).getByText(status)).toBeInTheDocument();

      await user.click(screen.getByRole("tab", { name: "GetAssertion" }));

      const assertion = stepLayout("GetAssertion");

      expect(within(extensionCard(assertion, "largeBlob")).getByText(status)).toBeInTheDocument();
    },
  );

  it.each([
    {
      backend: "hmac-secret support",
      extensions: [ExtensionIdentifier.ExtensionIdentifierHMACSecret],
      status: "Supported",
    },
    {
      backend: "no hmac-secret support",
      extensions: [],
      status: "Not reported",
    },
  ])("reports WebAuthn PRF support from $backend", async ({ extensions, status }) => {
    const user = userEvent.setup();

    selectToken();
    seedOverviewEnvelopeForTest({
      result: {
        info: { extensions },
      },
    } as unknown as InspectEnvelope);
    render(Lab);

    const make = stepLayout("MakeCredential");

    expect(within(extensionCard(make, "prf")).getByText(status)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "GetAssertion" }));

    const assertion = stepLayout("GetAssertion");

    expect(within(extensionCard(assertion, "prf")).getByText(status)).toBeInTheDocument();
  });

  it("describes every extension and explains its configurable options", async () => {
    const user = userEvent.setup();

    selectToken();
    render(Lab);

    const make = stepLayout("MakeCredential");

    for (const description of [
      /Reports whether the newly created passkey is discoverable/,
      /Maps the WebAuthn PRF request to the authenticator's hmac-secret extension/,
      /Stores a policy with the passkey/,
      /Stores a small RP-defined opaque blob/,
      /associate passkey-scoped HMAC secret material/,
      /Evaluates the new passkey's HMAC secret during MakeCredential/,
      /current minimum PIN length during passkey creation/,
      /Requests whether a PIN complexity policy is configured/,
    ]) {
      expect(within(make).getByText(description)).toBeInTheDocument();
    }

    expect(within(make).queryByText("WebAuthn client extension input.")).not.toBeInTheDocument();
    expect(
      within(make).queryByText("Authenticator extension input sent through CTAP."),
    ).not.toBeInTheDocument();

    await user.click(within(make).getByRole("switch", { name: "Include prf" }));
    expect(
      within(make).getByRole("button", { name: "About prf: Evaluate during registration" }),
    ).toBeInTheDocument();

    await user.click(within(make).getByRole("switch", { name: "Include credProtect" }));
    expect(
      within(make).getByRole("button", { name: "About credProtect: Policy" }),
    ).toBeInTheDocument();
    expect(
      within(make).getByRole("button", { name: "About credProtect: Enforce" }),
    ).toBeInTheDocument();

    for (const [extension, helpName] of [
      ["hmac-secret", "About hmac-secret: Enabled"],
      ["minPinLength", "About minPinLength: Enabled"],
      ["pinComplexityPolicy", "About pinComplexityPolicy: Enabled"],
    ] as const) {
      await user.click(within(make).getByRole("switch", { name: `Include ${extension}` }));
      expect(within(make).getByRole("button", { name: helpName })).toBeInTheDocument();
    }

    await user.click(screen.getByRole("tab", { name: "GetAssertion" }));

    const assertion = stepLayout("GetAssertion");

    expect(
      within(assertion).getByText(
        /Maps the WebAuthn PRF request to the authenticator's hmac-secret extension/,
      ),
    ).toBeInTheDocument();
    expect(
      within(assertion).getByText(/Requests the opaque blob stored with the selected passkey/),
    ).toBeInTheDocument();
    expect(
      within(assertion).getByText(/Evaluates the selected passkey's HMAC secret/),
    ).toBeInTheDocument();

    await user.click(within(assertion).getByRole("switch", { name: "Include prf" }));
    expect(
      within(assertion).getByRole("button", { name: "About prf: Global evaluation" }),
    ).toBeInTheDocument();
    await user.click(within(assertion).getByRole("switch", { name: "Include credBlob" }));
    expect(
      within(assertion).getByRole("button", { name: "About credBlob: Enabled" }),
    ).toBeInTheDocument();
  });

  it("explains advanced CTAP options and runtime verification controls", async () => {
    const user = userEvent.setup();

    selectToken();
    render(Lab);

    const make = stepLayout("MakeCredential");
    const userPresence = within(make).getByLabelText("User presence");

    expect(userPresence).toHaveTextContent("Omit — recommended");
    expect(
      within(make).getByRole("button", { name: "About Discoverable passkey" }),
    ).toBeInTheDocument();
    expect(within(make).getByRole("button", { name: "About User presence" })).toBeInTheDocument();
    expect(
      within(make).getByRole("button", { name: "About User verification" }),
    ).toBeInTheDocument();
    expect(within(make).getByText(/Controls how a pinUvAuthToken is obtained/)).toBeInTheDocument();

    mutableLabState.update((state) => ({
      ...state,
      makeDraft: { ...state.makeDraft, userPresence: "true" },
    }));
    await tick();

    expect(userPresence).toHaveTextContent("Send true");
    expect(userPresence).not.toHaveTextContent("CTAP 2.1+");
    expect(within(make).queryByText("CTAP 2.1+", { exact: true })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "GetAssertion" }));

    const get = stepLayout("GetAssertion");

    expect(within(get).getByRole("button", { name: "About User presence" })).toBeInTheDocument();
    expect(
      within(get).getByRole("button", { name: "About User verification" }),
    ).toBeInTheDocument();
    expect(within(get).getByText(/Controls how a pinUvAuthToken is obtained/)).toBeInTheDocument();
  });

  it("separates browser-style clientDataJSON from exact UTF-8 input", async () => {
    const user = userEvent.setup();

    selectToken();
    render(Lab);

    const make = stepLayout("MakeCredential");
    const basics = within(make).getByRole("group", { name: "Basic request" });
    const clientData = within(make)
      .getByRole("heading", { name: "clientDataJSON" })
      .closest("section") as HTMLElement;

    expect(within(basics).queryByLabelText("Origin")).not.toBeInTheDocument();
    expect(within(basics).queryByLabelText("Challenge")).not.toBeInTheDocument();
    expect(within(clientData).getByLabelText("Origin")).toHaveValue("https://example.com");
    expect(within(clientData).getByLabelText("Challenge")).toBeInTheDocument();
    expect(within(clientData).getByText("webauthn.create")).toBeInTheDocument();

    const generated = await within(clientData).findByRole("textbox", {
      name: "Generated clientDataJSON",
    });

    expect(generated).toHaveAttribute("aria-disabled", "true");
    expect(generated).toHaveTextContent('"type": "webauthn.create"');

    const crossOrigin = within(clientData).getByRole("switch", { name: "crossOrigin" });

    expect(crossOrigin).not.toBeChecked();
    expect(within(clientData).queryByLabelText("topOrigin")).not.toBeInTheDocument();

    await user.click(crossOrigin);
    expect(crossOrigin).toBeChecked();
    expect(within(clientData).getByLabelText("topOrigin")).toHaveValue("https://example.com");
    expect(generated).toHaveTextContent('"topOrigin": "https://example.com"');

    const generatedValue = JSON.parse(codeMirrorValue(generated));

    await user.click(within(clientData).getByRole("radio", { name: "Exact UTF-8 bytes" }));
    expect(within(clientData).queryByLabelText("Origin")).not.toBeInTheDocument();
    expect(within(clientData).queryByLabelText("Challenge")).not.toBeInTheDocument();
    const raw = await within(clientData).findByRole("textbox", {
      name: "Exact clientDataJSON bytes (UTF-8)",
    });

    expect(JSON.parse(codeMirrorValue(raw))).toEqual(generatedValue);
    expect(within(clientData).getByText(/without normalization/)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "GetAssertion" }));

    const assertion = stepLayout("GetAssertion");
    const assertionClientData = within(assertion)
      .getByRole("heading", { name: "clientDataJSON" })
      .closest("section") as HTMLElement;

    expect(within(assertionClientData).getByText("webauthn.get")).toBeInTheDocument();
  });

  it("runs the primary action on single-line Enter but preserves editor Enter", async () => {
    const user = userEvent.setup();

    selectToken();
    mutableLabState.set(createLabState());
    render(Lab);

    const make = stepLayout("MakeCredential");
    const rpName = within(make).getByLabelText("RP name");

    rpName.focus();
    await user.keyboard("{Enter}");
    expect(controllerMocks.previewMakeCredential).toHaveBeenCalledOnce();

    controllerMocks.previewMakeCredential.mockClear();
    mutableLabState.update((state) => ({
      ...state,
      makeDraft: {
        ...state.makeDraft,
        clientData: { ...state.makeDraft.clientData, mode: "raw" },
      },
    }));
    await tick();
    expect(within(make).getByRole("heading", { name: "clientDataJSON" })).toBeInTheDocument();

    const raw = await within(make).findByRole("textbox", {
      name: "Exact clientDataJSON bytes (UTF-8)",
    });

    expect(await fireEvent.keyDown(raw, { key: "Enter" })).toBe(false);
    expect(controllerMocks.previewMakeCredential).not.toHaveBeenCalled();

    expect(await fireEvent.keyDown(raw, { key: "Enter", ctrlKey: true })).toBe(false);
    expect(controllerMocks.previewMakeCredential).not.toHaveBeenCalled();
  });

  it("locks action controls in both operation tabs while the authenticator is running", async () => {
    const user = userEvent.setup();

    seedSelectionForTest(token.attachment.id, token, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    setStatusOperation({ selectionId: "authenticator-1", label: "MakeCredential" });
    render(Lab);

    const make = stepLayout("MakeCredential");

    expect(within(make).getByLabelText("RP ID")).toBeDisabled();
    expect(within(make).getByRole("button", { name: "Preview" })).toBeDisabled();
    await user.click(screen.getByRole("tab", { name: "GetAssertion" }));

    const assertion = stepLayout("GetAssertion");

    expect(within(assertion).getByLabelText("RP ID")).toBeDisabled();
    expect(within(assertion).getByRole("button", { name: "Preview" })).toBeDisabled();
  });

  it("keeps the reviewed request visible and locks its draft", () => {
    selectToken();

    const current = get(mutableLabState);
    const previewRequest = new MakeCredentialRequest({
      rp: { id: "example.com", name: "Example" },
      user: { id: "AA==", name: "alice@example.com", displayName: "Alice" },
      clientDataJSON: "e30=",
      pubKeyCredParams: [
        { type: PublicKeyCredentialType.PublicKeyCredentialTypePublicKey, alg: -7 },
      ],
      dryRun: true,
    });
    const previewEnvelope = new MakeCredentialEnvelope({
      operationId: "make-preview-1",
      selectionId: "authenticator-1",
      kind: OperationKind.MakeCredential,
      result: {
        preview: new MakeCredentialPreview({
          device: token,
          input: new MakeCredentialInput({
            rp: { id: "example.com", name: "Example" },
            user: { id: "AA==", name: "alice@example.com", displayName: "Alice" },
            pubKeyCredParams: [
              { type: PublicKeyCredentialType.PublicKeyCredentialTypePublicKey, alg: -7 },
            ],
          }),
          warnings: [
            new Warning({
              severity: Severity.SeverityWarning,
              code: "webauthn.make_credential.mutation",
              message: "Backend fallback",
            }),
          ],
        }),
        result: null,
      },
    });

    mutableLabState.set({
      ...current,
      makeDraft: {
        ...current.makeDraft,
        clientData: {
          ...current.makeDraft.clientData,
          mode: "raw",
          rawJSON: "{not-json\n",
        },
      },
      makeStep: {
        phase: "review",
        previewRequest,
        previewEnvelope,
        previewValue: previewEnvelope.result!.preview,
      },
    });

    render(Lab);

    const make = stepLayout("MakeCredential");

    expect(within(make).queryByLabelText("RP ID")).not.toBeInTheDocument();
    expect(within(make).getByRole("heading", { name: "Reviewed snapshot" })).toBeInTheDocument();
    expect(within(make).getByText("Configure").closest("li")).not.toHaveAttribute("data-completed");
    expect(within(make).getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(within(make).getByRole("button", { name: "Execute" })).toBeInTheDocument();
    expect(within(make).queryByText(/not valid JSON/)).not.toBeInTheDocument();
    expect(
      within(make).getByText("A new passkey may be created on this authenticator."),
    ).toBeInTheDocument();
    expect(within(make).queryByText("webauthn.make_credential.mutation")).not.toBeInTheDocument();
  });

  it("keeps the original action for each failed MakeCredential phase", async () => {
    selectToken();

    const current = get(mutableLabState);
    const previewRequest = new MakeCredentialRequest({
      rp: { id: "example.com", name: "Example" },
      user: { id: "AA==", name: "alice@example.com", displayName: "Alice" },
      clientDataJSON: "e30=",
      pubKeyCredParams: [
        { type: PublicKeyCredentialType.PublicKeyCredentialTypePublicKey, alg: -7 },
      ],
      dryRun: true,
    });
    const previewEnvelope = new MakeCredentialEnvelope({
      operationId: "make-preview-1",
      selectionId: "authenticator-1",
      kind: OperationKind.MakeCredential,
      result: {
        preview: new MakeCredentialPreview({
          device: token,
          input: new MakeCredentialInput({
            rp: { id: "example.com", name: "Example" },
            user: { id: "AA==", name: "alice@example.com", displayName: "Alice" },
            pubKeyCredParams: [
              { type: PublicKeyCredentialType.PublicKeyCredentialTypePublicKey, alg: -7 },
            ],
          }),
        }),
        result: null,
      },
    });
    const executionRequest = new MakeCredentialRequest({
      ...previewRequest,
      dryRun: false,
    });

    mutableLabState.set({
      ...current,
      makeStep: {
        phase: "error",
        failedPhase: "previewing",
        responseEnvelope: new MakeCredentialEnvelope({
          operationId: "make-preview-error",
          selectionId: "authenticator-1",
          kind: OperationKind.MakeCredential,
          error: failureForCode(Code.CodeTransportFailure),
        }),
        runtimeError: null,
      },
    });
    render(Lab);

    const make = stepLayout("MakeCredential");

    expect(within(make).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(make).getByRole("button", { name: "Retry preview" })).toBeInTheDocument();
    expect(within(make).queryByRole("button", { name: "Execute" })).not.toBeInTheDocument();

    const failedPreviewRP = within(make).getByLabelText("RP ID");

    expect(failedPreviewRP).toBeEnabled();
    await fireEvent.input(failedPreviewRP, { target: { value: "edited.example.com" } });
    expect(get(mutableLabState).makeStep.phase).toBe("editing");

    mutableLabState.update((state) => ({
      ...state,
      makeStep: {
        phase: "error",
        failedPhase: "executing",
        previewEnvelope,
        previewValue: previewEnvelope.result!.preview,
        request: executionRequest,
        responseEnvelope: new MakeCredentialEnvelope({
          operationId: "make-execution-error",
          selectionId: "authenticator-1",
          kind: OperationKind.MakeCredential,
          error: failureForCode(Code.CodeTransportFailure),
        }),
        runtimeError: null,
      },
    }));
    await tick();
    expect(within(make).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(within(make).queryByRole("button", { name: "Retry preview" })).not.toBeInTheDocument();
    expect(within(make).getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("fills demo values for the active operation without replacing the scenario", async () => {
    const user = userEvent.setup();

    selectToken();
    render(Lab);

    const make = stepLayout("MakeCredential");
    const before = get(mutableLabState);

    await user.clear(within(make).getByLabelText("RP name"));
    await user.type(within(make).getByLabelText("RP name"), "Edited");

    await user.click(screen.getByRole("button", { name: "Fill demo values" }));

    const after = get(mutableLabState);

    expect(within(make).getByLabelText("RP name")).toHaveValue("Example");
    expect(after.makeDraft.userIDHex).not.toBe(before.makeDraft.userIDHex);
    expect(after.getDraft).toEqual(before.getDraft);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("renders and cancels a context-aware handoff replacement AlertDialog", async () => {
    const user = userEvent.setup();

    selectToken();
    mutableLabState.update((state) => ({
      ...state,
      pendingHandoff: {
        rpID: "other.example",
        credentialIDHex: "cafe",
        publicKeyCOSEHex: "a5010203",
        previousSignCount: 0,
      },
    }));
    render(Lab);

    const dialog = screen.getByRole("alertdialog", { name: "Replace the GetAssertion scenario?" });

    expect(within(dialog).getByText(/replaces its RP and allow list/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(get(mutableLabState).pendingHandoff).toBeNull();
  });
});
