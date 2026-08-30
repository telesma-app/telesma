import { Clipboard } from "@wailsio/runtime";
import { cleanup, render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Algorithm } from "../../../../bindings/github.com/telesma-app/ctap/cose";
import {
  PublicKeyCredentialDescriptor,
  PublicKeyCredentialType,
  PublicKeyCredentialUserEntity,
} from "../../../../bindings/github.com/telesma-app/ctap/credential";
import { AttestationStatementFormatIdentifier } from "../../../../bindings/github.com/telesma-app/ctap/attestation";
import {
  AuthenticationExtensionsPRFValues,
  CredentialPropertiesOutput,
} from "../../../../bindings/github.com/telesma-app/ctap/webauthn";
import {
  Assertion,
  CredentialBlobCreateOutput,
  CredentialBlobGetOutput,
  GetAssertionClientExtensionResults,
  GetAssertionExtensionResults,
  GetAssertionInput,
  GetAssertionPRFOutput,
  GetAssertionPreview,
  GetAssertionPreviewSignOutput,
  GetAssertionResult as GetAssertionResultDTO,
  MakeCredentialClientExtensionResults,
  MakeCredentialExtensionResults,
  MakeCredentialInput,
  MakeCredentialPRFOutput,
  MakeCredentialPreview,
  MakeCredentialPreviewSignOutput,
  MakeCredentialResult as MakeCredentialResultDTO,
  PreviewSignGeneratedKey,
} from "../../../../bindings/github.com/telesma-app/kit/model/webauthn";

import GetAssertionResult from "$lib/components/lab/GetAssertionResult.svelte";
import MakeCredentialResult from "$lib/components/lab/MakeCredentialResult.svelte";
import { setAppLocale } from "$lib/i18n";
import { hexToBase64, utf8ToBase64 } from "$lib/lab-input";

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("svelte-sonner", () => ({ toast: toastMocks }));

const clipboardSetText = vi.spyOn(Clipboard, "SetText");

const makeClientDataJSON =
  '{"type":"webauthn.create", "challenge":"make-challenge", "origin":"https://example.com"}';

const getClientDataJSON =
  '{"type":"webauthn.get", "challenge":"get-challenge", "origin":"https://example.com"}';

function getAssertionPreview(clientDataJSON = getClientDataJSON) {
  return new GetAssertionPreview({
    input: new GetAssertionInput({
      rpID: "example.com",
      clientDataJSON: utf8ToBase64(clientDataJSON),
    }),
  });
}

function makeCredentialPreview(clientDataJSON = makeClientDataJSON) {
  return new MakeCredentialPreview({
    input: new MakeCredentialInput({
      clientDataJSON: utf8ToBase64(clientDataJSON),
    }),
  });
}

function renderGetResult(result: GetAssertionResultDTO, clientDataJSON = getClientDataJSON) {
  return render(GetAssertionResult, {
    preview: getAssertionPreview(clientDataJSON),
    result,
  });
}

function renderMakeResult(result: MakeCredentialResultDTO, clientDataJSON = makeClientDataJSON) {
  return render(MakeCredentialResult, {
    preview: makeCredentialPreview(clientDataJSON),
    result,
  });
}

describe("WebAuthn Lab results", () => {
  beforeEach(() => {
    setAppLocale("en");
    clipboardSetText.mockReset();
    clipboardSetText.mockResolvedValue();
    toastMocks.success.mockClear();
    toastMocks.error.mockClear();
  });

  afterEach(async () => {
    cleanup();
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 30));
    document.body.style.pointerEvents = "";
  });

  it("distinguishes a successful GetAssertion response with 0 assertions", () => {
    const result = new GetAssertionResultDTO({
      attachmentId: "token-1",
      rpID: "example.com",
      assertions: [],
    });

    renderGetResult(result);

    expect(screen.getByText("0 assertions")).toBeInTheDocument();
    expect(screen.getByText("The authenticator returned 0 assertions.")).toBeInTheDocument();
  });

  it("selects assertions and preserves explicit 0 and false values", async () => {
    const user = userEvent.setup();
    const assertions = [
      new Assertion({
        index: 0,
        credential: new PublicKeyCredentialDescriptor({
          type: PublicKeyCredentialType.PublicKeyCredentialTypePublicKey,
          id: "AA==",
        }),
        authenticatorDataHex: "cafe",
        signatureHex: "aa",
        user: new PublicKeyCredentialUserEntity({
          id: "AQ==",
          name: "alice@example.com",
          displayName: "Alice",
        }),
        numberOfCredentials: 0,
        userSelected: false,
        signCount: 0,
        userPresent: false,
        userVerified: false,
      }),
      new Assertion({
        index: 1,
        credential: new PublicKeyCredentialDescriptor({
          type: PublicKeyCredentialType.PublicKeyCredentialTypePublicKey,
          id: "Ag==",
        }),
        authenticatorDataHex: "beef",
        signatureHex: "bb",
        numberOfCredentials: 2,
        userSelected: true,
        signCount: 7,
        userPresent: true,
        userVerified: true,
      }),
    ];

    const result = new GetAssertionResultDTO({
      attachmentId: "token-1",
      rpID: "example.com",
      assertions,
    });

    renderGetResult(result);

    expect(screen.getByText("2 assertions")).toBeInTheDocument();
    expect(screen.getByText("00")).toBeInTheDocument();
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getAllByText("0")).toHaveLength(2);
    expect(screen.getAllByText("False")).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "Technical details" }));

    const technicalTabs = screen.getByRole("tablist", { name: "Technical details" });

    expect(
      within(technicalTabs)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["clientDataJSON", "Signature", "Authenticator data", "Result"]);
    await user.click(screen.getByRole("tab", { name: "Signature" }));
    expect(screen.getByRole("region", { name: "Signature" })).toHaveTextContent("aa");

    await user.click(screen.getByRole("tab", { name: "Assertion 1" }));
    expect(screen.getAllByText("True")).toHaveLength(3);
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Signature" })).toHaveTextContent("bb");
  });

  it("renders authentication PRF results without a registration-only enabled field", () => {
    const secret = "cd".repeat(32);
    const result = new GetAssertionResultDTO({
      attachmentId: "token-1",
      rpID: "example.com",
      assertions: [
        new Assertion({
          index: 0,
          credential: new PublicKeyCredentialDescriptor({
            type: PublicKeyCredentialType.PublicKeyCredentialTypePublicKey,
            id: "AA==",
          }),
          authenticatorDataHex: "cafe",
          signatureHex: "aa",
          extensionResults: new GetAssertionExtensionResults({
            client: new GetAssertionClientExtensionResults({
              prf: new GetAssertionPRFOutput({
                results: new AuthenticationExtensionsPRFValues({ first: hexToBase64(secret) }),
              }),
            }),
          }),
        }),
      ],
    });

    renderGetResult(result);

    expect(screen.getByText("prf · first")).toBeInTheDocument();
    expect(screen.queryByText("prf · enabled")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(secret);
  });

  it("labels credential blob output with the extension identifier", () => {
    const result = new GetAssertionResultDTO({
      attachmentId: "token-1",
      rpID: "example.com",
      assertions: [
        new Assertion({
          index: 0,
          credential: new PublicKeyCredentialDescriptor({
            type: PublicKeyCredentialType.PublicKeyCredentialTypePublicKey,
            id: "AA==",
          }),
          authenticatorDataHex: "cafe",
          signatureHex: "aa",
          extensionResults: new GetAssertionExtensionResults({
            client: new GetAssertionClientExtensionResults({
              getCredBlob: new CredentialBlobGetOutput({ valueHex: "0102" }),
            }),
          }),
        }),
      ],
    });

    renderGetResult(result);

    expect(screen.getByText("credBlob")).toBeInTheDocument();
    expect(screen.queryByText("getCredBlob")).not.toBeInTheDocument();
  });

  it("renders and copies the generated previewSign key material", async () => {
    const user = userEvent.setup();
    const result = new MakeCredentialResultDTO({
      attachmentId: "token-1",
      rpID: "example.com",
      fmt: AttestationStatementFormatIdentifier.AttestationStatementFormatIdentifierPacked,
      credentialIDHex: "0011",
      publicKeyCOSEHex: "aabb",
      authenticatorDataHex: "ccdd",
      attestationObjectCBORHex: "eeff",
      extensionResults: new MakeCredentialExtensionResults({
        client: new MakeCredentialClientExtensionResults({
          previewSign: new MakeCredentialPreviewSignOutput({
            generatedKey: new PreviewSignGeneratedKey({
              keyHandleHex: "0102",
              publicKeyCOSEHex: "a103",
              algorithm: Algorithm.AlgorithmESP256SplitARKGPlaceholder,
              attestationObjectCBORHex: "a204",
            }),
          }),
        }),
      }),
    });

    renderMakeResult(result);

    expect(screen.getByText("previewSign")).toBeInTheDocument();
    expect(screen.getByText("ESP256-split-ARKG")).toBeInTheDocument();
    expect(
      screen.getByText(String(Algorithm.AlgorithmESP256SplitARKGPlaceholder)),
    ).toBeInTheDocument();
    expect(screen.getByText("keyHandle")).toBeInTheDocument();
    expect(screen.getByText("publicKey")).toBeInTheDocument();
    expect(screen.getByText("attestationObject")).toBeInTheDocument();
    expect(screen.getByText("0102")).toBeInTheDocument();
    expect(screen.getByText("a103")).toBeInTheDocument();
    expect(screen.getByText("a204")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy previewSign key handle" }));
    expect(clipboardSetText).toHaveBeenLastCalledWith("0102");
  });

  it("renders the previewSign assertion signature as a regular inspectable output", () => {
    const result = new GetAssertionResultDTO({
      attachmentId: "token-1",
      rpID: "example.com",
      assertions: [
        new Assertion({
          index: 0,
          credential: new PublicKeyCredentialDescriptor({
            type: PublicKeyCredentialType.PublicKeyCredentialTypePublicKey,
            id: "AA==",
          }),
          authenticatorDataHex: "cafe",
          signatureHex: "aa",
          extensionResults: new GetAssertionExtensionResults({
            client: new GetAssertionClientExtensionResults({
              previewSign: new GetAssertionPreviewSignOutput({ signatureHex: "deadbeef" }),
            }),
          }),
        }),
      ],
    });

    renderGetResult(result);

    expect(screen.getByText("previewSign · signature")).toBeInTheDocument();
    expect(screen.getByText("deadbeef")).toBeInTheDocument();
    expect(screen.queryByText("prf · results")).not.toBeInTheDocument();
  });

  it("shows exact client data and copies only the selected inline technical value", async () => {
    const user = userEvent.setup();
    const credentialIDHex = "00112233445566778899aabbccddeeff0011223344556677";
    const exactClientDataJSON =
      '{\n  "type": "webauthn.create",\n  "challenge": "signed bytes stay exact"\n}';
    const result = new MakeCredentialResultDTO({
      attachmentId: "token-1",
      rpID: "example.com",
      fmt: AttestationStatementFormatIdentifier.AttestationStatementFormatIdentifierPacked,
      credentialIDHex,
      publicKeyCOSEHex: "aabb",
      authenticatorDataHex: "ccdd",
      attestationObjectCBORHex: "eeff",
      signCount: 0,
      userPresent: true,
      userVerified: false,
      enterpriseAttestation: false,
    });

    renderMakeResult(result, exactClientDataJSON);

    expect(screen.getByText("24 bytes")).toBeInTheDocument();
    expect(screen.queryByText(credentialIDHex)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy Passkey ID" }));
    expect(clipboardSetText).toHaveBeenCalledWith(credentialIDHex);

    expect(screen.queryByRole("tab", { name: "clientDataJSON" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Technical details" }));

    const technicalTabs = screen.getByRole("tablist", { name: "Technical details" });

    expect(
      within(technicalTabs)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual([
      "clientDataJSON",
      "Public key COSE",
      "Authenticator data",
      "Attestation object",
      "Result",
    ]);

    const clientDataRegion = screen.getByRole("region", { name: "clientDataJSON" });

    await waitFor(() => expect(clientDataRegion.textContent).toContain(exactClientDataJSON));
    expect(
      screen.getByText(
        `UTF-8 JSON · ${new TextEncoder().encode(exactClientDataJSON).byteLength} bytes`,
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy clientDataJSON" }));
    expect(clipboardSetText).toHaveBeenLastCalledWith(exactClientDataJSON);

    await user.click(screen.getByRole("tab", { name: "Result" }));

    const resultRegion = screen.getByRole("region", { name: "Result" });

    await waitFor(() => expect(resultRegion).toHaveTextContent(credentialIDHex));
    expect(resultRegion).not.toHaveTextContent("operationId");
    expect(resultRegion).not.toHaveTextContent("selectionId");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy Result" }));

    const copiedResult = clipboardSetText.mock.calls.at(-1)?.[0] ?? "";

    expect(copiedResult).toContain(credentialIDHex);
    expect(copiedResult).not.toContain("operationId");
    expect(copiedResult).not.toContain("selectionId");
  });

  it("keeps PRF outputs out of the DOM until one value is explicitly revealed", async () => {
    const user = userEvent.setup();
    const secret = "ab".repeat(32);
    const result = new MakeCredentialResultDTO({
      attachmentId: "token-1",
      rpID: "example.com",
      fmt: AttestationStatementFormatIdentifier.AttestationStatementFormatIdentifierPacked,
      credentialIDHex: "0011",
      publicKeyCOSEHex: "aabb",
      authenticatorDataHex: "ccdd",
      attestationObjectCBORHex: "eeff",
      extensionResults: new MakeCredentialExtensionResults({
        client: new MakeCredentialClientExtensionResults({
          credBlob: new CredentialBlobCreateOutput({ accepted: true }),
          credProps: new CredentialPropertiesOutput({ rk: false }),
          prf: new MakeCredentialPRFOutput({
            enabled: true,
            results: new AuthenticationExtensionsPRFValues({ first: hexToBase64(secret) }),
          }),
        }),
      }),
    });

    renderMakeResult(result);

    expect(document.body).not.toHaveTextContent(secret);
    expect(screen.getByLabelText("Hidden secret, 32 bytes")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "WebAuthn client outputs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "CTAP extension outputs" })).toBeInTheDocument();

    const credentialPropertiesRow = screen
      .getByText("credProps · rk")
      .closest("div") as HTMLElement;

    expect(within(credentialPropertiesRow).getByText("False")).toBeInTheDocument();

    const secretRow = screen.getByText("prf · first").closest("div") as HTMLElement;

    expect(within(secretRow).queryByRole("button", { name: /copy/i })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Technical details" }));
    await user.click(screen.getByRole("tab", { name: "Result" }));

    const resultRegion = screen.getByRole("region", { name: "Result" });

    await waitFor(() => expect(resultRegion).toHaveTextContent("[redacted]"));
    expect(resultRegion).not.toHaveTextContent(secret);

    await user.click(screen.getByRole("button", { name: "Copy Result" }));

    const copiedResult = clipboardSetText.mock.calls.at(-1)?.[0] ?? "";

    expect(copiedResult).toContain("[redacted]");
    expect(copiedResult).not.toContain(secret);

    await user.click(screen.getByRole("button", { name: "Reveal this secret" }));
    expect(screen.getByText(secret)).toBeInTheDocument();
  });
});
