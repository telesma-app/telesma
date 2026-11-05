import { Clipboard } from "@wailsio/runtime";
import { cleanup, render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { get } from "svelte/store";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VerificationFlow } from "../../bindings/github.com/telesma-app/kit";
import { ReadState } from "../../bindings/github.com/telesma-app/kit/model/largeblobs";
import { Kind as OperationKind } from "../../bindings/github.com/telesma-app/kit/model/operation";
import type { CredentialTarget } from "../../bindings/github.com/telesma-app/kit/model/credentials";
import { Code } from "../../bindings/github.com/telesma-app/kit/model/failure";
import type {
  CredentialDeleteEnvelope,
  CredentialUpdateEnvelope,
  CredentialsEnvelope,
  LargeBlobReadEnvelope,
} from "../../bindings/telesma/service";
import { PasskeySupportMode } from "../../bindings/telesma/passkeydirectory";

import { api } from "$lib/api";
import {
  beginPasskeyDirectoryLookup,
  completePasskeyDirectoryLookup,
  failPasskeysInventoryLoadAtRuntime,
  failPasskeysInventoryLoadWithResponse,
  passkeysMutation as mutablePasskeysMutation,
  passkeysVerificationFlow as mutablePasskeysVerificationFlow,
} from "$lib/features/passkeys/state";
import { setAppLocale } from "$lib/i18n";
import { setAdvancedMode, setPasskeyDirectoryEnabled } from "$lib/preferences";
import { failureForCode } from "$lib/test-support/failure";
import {
  resetAppStateForTest,
  seedPasskeysEnvelopeForTest,
  seedSelectionForTest,
} from "$lib/test-support/store-utils";
import { testHIDDevice } from "../test/device.js";

import Passkeys from "./Passkeys.svelte";

const controllerMocks = vi.hoisted(() => ({
  reloadPasskeys: vi.fn(() => Promise.resolve(true)),
}));

const workbenchMocks = vi.hoisted(() => ({
  navigateToScreen: vi.fn(() => Promise.resolve()),
}));

const toastMocks = vi.hoisted(() => ({ success: vi.fn() }));

const clipboardSetText = vi.spyOn(Clipboard, "SetText");

vi.mock("$lib/features/passkeys", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/features/passkeys")>()),
  reloadPasskeys: controllerMocks.reloadPasskeys,
}));
vi.mock("$lib/features/workbench", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/features/workbench")>()),
  navigateToScreen: workbenchMocks.navigateToScreen,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMocks }));

function credentialsEnvelope(readOnlyPermission = false): CredentialsEnvelope {
  return {
    operationId: "operation-1",
    selectionId: "authenticator-1",
    kind: OperationKind.ListCredentials,
    result: {
      device: testHIDDevice(),
      support: {
        credentialManagement: true,
        previewOnly: false,
        readOnlyPermission,
      },
      summary: {
        existingResidentCredentialsCount: 1,
        maxPossibleRemainingResidentCredentialsCount: 4,
        totalRPs: 1,
        totalCredentials: 1,
      },
      groups: [
        {
          rpID: "example.com",
          rpName: "Example",
          rpIDHashHex: "abcd",
          credentials: [
            {
              credentialIDHex: "cafe",
              credentialType: "public-key",
              userIDHex: "01",
              userName: "user@example.com",
              displayName: "Example User",
              credProtect: 2,
            },
          ],
        },
      ],
    },
  } as CredentialsEnvelope;
}

function emptyCredentialsEnvelope(): CredentialsEnvelope {
  const envelope = credentialsEnvelope();

  envelope.result!.summary.existingResidentCredentialsCount = 0;
  envelope.result!.summary.totalRPs = 0;
  envelope.result!.summary.totalCredentials = 0;
  envelope.result!.groups = [];

  return envelope;
}

function credentialUpdateTarget(): CredentialTarget {
  return {
    record: {
      credentialIDHex: "cafe",
      credentialType: "public-key",
      userIDHex: "01",
      userName: "user@example.com",
      displayName: "Example User",
      credProtect: 2,
    },
    rp: { id: "example.com", name: "Example", idHashHex: "abcd" },
    user: { userIDHex: "01", name: "user@example.com", displayName: "Example User" },
  };
}

function mixedRelyingPartyEnvelope(): CredentialsEnvelope {
  const envelope = credentialsEnvelope();

  envelope.result!.summary.existingResidentCredentialsCount = 3;
  envelope.result!.summary.totalRPs = 2;
  envelope.result!.summary.totalCredentials = 3;
  envelope.result!.groups = [
    {
      rpID: "solo.example",
      rpName: "Solo",
      rpIDHashHex: "aaaa",
      credentials: [
        {
          credentialIDHex: "a1",
          userIDHex: "01",
          userName: "solo@example.com",
          displayName: "Solo User",
          credProtect: 2,
        },
      ],
    },
    {
      rpID: "team.example",
      rpName: "Team",
      rpIDHashHex: "bbbb",
      credentials: [
        {
          credentialIDHex: "b1",
          userIDHex: "02",
          userName: "alice@team.example",
          displayName: "Alice",
          credProtect: 1,
        },
        {
          credentialIDHex: "b2",
          userIDHex: "03",
          userName: "bob@team.example",
          displayName: "Bob",
          credProtect: 3,
        },
      ],
    },
  ];

  return envelope;
}

describe("Passkeys", () => {
  beforeEach(() => {
    setAppLocale("en");
    setAdvancedMode(true);
    setPasskeyDirectoryEnabled(false);
    controllerMocks.reloadPasskeys.mockClear();
    workbenchMocks.navigateToScreen.mockClear();
    clipboardSetText.mockReset();
    clipboardSetText.mockResolvedValue();
    toastMocks.success.mockClear();
    resetAppStateForTest();
  });

  afterEach(async () => {
    cleanup();
    await tick();
    document.body.style.pointerEvents = "";
  });

  it("shows the not-loaded state before inventory is available", () => {
    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });

    render(Passkeys);

    expect(screen.getByText("Passkeys not loaded")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Read state" })).not.toBeInTheDocument();
  });

  it("keeps an empty inventory in context and offers useful next actions", async () => {
    const user = userEvent.setup();

    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(emptyCredentialsEnvelope());

    render(Passkeys);

    expect(screen.getByText("This authenticator has no discoverable passkeys")).toBeInTheDocument();
    expect(screen.getByText(/The inventory loaded successfully\./)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open WebAuthn Lab" }));
    expect(workbenchMocks.navigateToScreen).toHaveBeenCalledWith("lab");

    await user.click(screen.getByRole("button", { name: "Reload inventory" }));
    await waitFor(() => expect(controllerMocks.reloadPasskeys).toHaveBeenCalledOnce());
  });

  it("shows the unavailable perCredMgmtRO badge when unsupported", () => {
    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(credentialsEnvelope());

    render(Passkeys);

    expect(screen.getByText("Read-only passkey management: Not available")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Read state" })).not.toBeInTheDocument();
  });

  it("shows only the perCredMgmtRO badge when supported", () => {
    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(credentialsEnvelope(true));

    render(Passkeys);

    expect(screen.getByText("Read-only passkey management: Supported")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Read state" })).not.toBeInTheDocument();
  });

  it("keeps a typed inventory error out of the empty state", () => {
    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    failPasskeysInventoryLoadWithResponse(false);

    render(Passkeys);

    expect(
      screen.getByText("Load discoverable passkeys from the selected authenticator."),
    ).toBeInTheDocument();
    expect(screen.queryByText("The PIN is invalid.")).not.toBeInTheDocument();
  });

  it("does not turn an unsupported verification flow into unsupported credential management", () => {
    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    failPasskeysInventoryLoadWithResponse(false);

    render(Passkeys);

    expect(
      screen.getByText("Load discoverable passkeys from the selected authenticator."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("The requested verification flow is not supported."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Passkey management unavailable")).not.toBeInTheDocument();
  });

  it("shows the single credential directly inside the selected RP workspace", async () => {
    const user = userEvent.setup();

    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(credentialsEnvelope());

    render(Passkeys);

    const navigation = screen.getByRole("complementary", { name: "Relying parties" });
    const relyingParty = within(navigation).getByRole("button", {
      name: /example\.com Example 1 passkey/,
    });
    const domainHeader = screen.getByRole("heading", { name: "Example" }).closest("header");
    const details = screen.getByRole("article", { name: "Passkey details" });

    expect(domainHeader).not.toBeNull();
    expect(within(domainHeader!).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(domainHeader!).getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(within(details).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(within(details).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(relyingParty).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Selected passkey" })).not.toBeInTheDocument();
    expect(within(details).getByRole("heading", { name: "Example User" })).toBeInTheDocument();
    expect(within(details).getByText("public-key")).toBeInTheDocument();
    expect(within(details).getAllByText("01").length).toBeGreaterThan(0);
    expect(within(details).getByText("User ID")).toBeInTheDocument();
    expect(within(details).getByTitle("cafe").closest("header")).toBe(
      details.querySelector("header"),
    );

    const associatedData = within(details).getByRole("region", { name: "Associated data" });

    expect(associatedData.parentElement).toBe(details);
    expect(associatedData.firstElementChild).toHaveAttribute("data-slot", "separator");

    const copyJson = within(details).getByRole("button", { name: "Copy JSON" });

    expect(copyJson).toBeInTheDocument();
    await user.click(copyJson);
    await waitFor(() => expect(clipboardSetText).toHaveBeenCalledOnce());
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("JSON copied"));
    expect(within(details).queryByText("Passkey Directory")).not.toBeInTheDocument();
  });

  it("keeps a vertical RP list on narrow layouts and opens details in a sheet", async () => {
    const user = userEvent.setup();
    const clientWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);

    try {
      seedSelectionForTest("token-1", null, {
        state: "ready",
        selectionId: "authenticator-1",
      });
      seedPasskeysEnvelopeForTest(mixedRelyingPartyEnvelope());

      render(Passkeys);

      const navigation = screen.getByRole("complementary", { name: "Relying parties" });
      const workspace = navigation.parentElement;
      const team = within(navigation).getByRole("button", {
        name: /team\.example Team 2 passkeys/,
      });

      expect(workspace).toHaveAttribute("data-layout", "list");
      expect(within(navigation).getAllByRole("button")).toHaveLength(2);
      expect(screen.queryByRole("article", { name: "Passkey details" })).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await user.click(team);

      const sheet = screen.getByRole("dialog", { name: "Team" });
      const previous = within(sheet).getByRole("button", { name: "Previous relying party" });
      const next = within(sheet).getByRole("button", { name: "Next relying party" });

      expect(within(sheet).getByRole("article", { name: "Passkey details" })).toBeInTheDocument();
      expect(within(sheet).getByText("Passkey 1 of 2")).toBeInTheDocument();
      expect(within(sheet).getByText("Relying party 2 of 2")).toBeInTheDocument();
      expect(previous).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowUp");
      expect(previous).toBeEnabled();
      expect(next).toBeDisabled();
      expect(team).toHaveAttribute("aria-current", "page");

      await user.click(previous);

      expect(sheet).toHaveAccessibleName("Solo");
      expect(within(sheet).getByTitle("a1")).toBeInTheDocument();
      expect(within(sheet).getByText("Relying party 1 of 2")).toBeInTheDocument();
      expect(previous).toBeDisabled();
      expect(next).toBeEnabled();

      await user.keyboard("{Alt>}{ArrowDown}{/Alt}");

      expect(sheet).toHaveAccessibleName("Team");
      expect(within(sheet).getByText("Relying party 2 of 2")).toBeInTheDocument();
      expect(team).toHaveAttribute("aria-current", "page");

      await user.click(within(sheet).getByRole("button", { name: "Close" }));
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Team" })).not.toBeInTheDocument(),
      );
      expect(screen.queryByRole("article", { name: "Passkey details" })).not.toBeInTheDocument();
    } finally {
      clientWidth.mockRestore();
    }
  });

  it("decodes readable user IDs and integrates the passkey ID into the credential header", async () => {
    const user = userEvent.setup();
    const envelope = credentialsEnvelope();
    const credentialID = "00112233445566778899aabbccddeeff0011223344556677";
    const userIDHex = "616c6963652d696e7465726e616c";

    envelope.result!.groups![0].credentials![0].credentialIDHex = credentialID;
    envelope.result!.groups![0].credentials![0].userIDHex = userIDHex;
    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(envelope);

    render(Passkeys);

    const details = screen.getByRole("article", { name: "Passkey details" });
    const header = details.querySelector("header")!;
    const passkeyID = within(header).getByTitle(credentialID);

    expect(passkeyID).toHaveTextContent("00112233445566778899…44556677");
    expect(within(details).getByText("alice-internal")).toBeInTheDocument();
    expect(within(details).queryByText(userIDHex)).not.toBeInTheDocument();

    await user.click(within(details).getByRole("button", { name: "Copy User ID" }));
    await waitFor(() => expect(clipboardSetText).toHaveBeenCalledWith("alice-internal"));

    await user.click(within(header).getByRole("button", { name: "Copy Passkey ID" }));
    await waitFor(() => expect(clipboardSetText).toHaveBeenCalledWith(credentialID));
  });

  it("does not repeat an RP name that is equivalent to its RP ID", () => {
    const envelope = credentialsEnvelope();

    envelope.result!.groups![0].rpName = "EXAMPLE.COM.";
    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(envelope);

    render(Passkeys);

    const navigation = screen.getByRole("complementary", { name: "Relying parties" });
    const relyingParty = within(navigation).getByRole("button", {
      name: "example.com 1 passkey",
    });

    expect(within(relyingParty).getAllByText("example.com")).toHaveLength(1);
    expect(within(relyingParty).queryByText("EXAMPLE.COM.")).not.toBeInTheDocument();
  });

  it("shows exact Passkey Directory enrichment once at RP level", () => {
    vi.spyOn(api, "saveApplicationConfig").mockResolvedValue();
    setPasskeyDirectoryEnabled(true);
    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(credentialsEnvelope());
    completePasskeyDirectoryLookup(beginPasskeyDirectoryLookup(), {
      matches: [
        {
          rpID: "example.com",
          canonicalDomain: "accounts.example.com",
          passwordless: PasskeySupportMode.PasskeySupportModeAllowed,
          mfa: PasskeySupportMode.PasskeySupportModeRequired,
          documentation: "https://example.com/passkeys",
          recovery: "https://example.com/recovery",
          notes: "Community note: <strong>plain text</strong>",
        },
      ],
    });

    render(Passkeys);

    const directory = screen.getByRole("heading", { name: "Passkey Directory" }).closest("section");
    const details = screen.getByRole("article", { name: "Passkey details" });

    expect(directory).not.toBeNull();
    expect(screen.getAllByRole("heading", { name: "Passkey Directory" })).toHaveLength(1);
    expect(within(directory!).getByText("Community reference")).toBeInTheDocument();
    expect(
      within(directory!).getByText("Informational only · not a security indicator"),
    ).toBeInTheDocument();
    expect(within(directory!).getByText("accounts.example.com")).toBeInTheDocument();
    expect(within(directory!).getByText("Passwordless")).toBeInTheDocument();
    expect(within(directory!).getByText("Optional")).toBeInTheDocument();
    expect(within(directory!).getByText("Passkey as MFA/2FA")).toBeInTheDocument();
    expect(within(directory!).getByText("Required")).toBeInTheDocument();
    expect(
      within(directory!).getByText("Community note: <strong>plain text</strong>"),
    ).toBeInTheDocument();
    expect(within(directory!).getByRole("link", { name: "Setup guide" })).toHaveAttribute(
      "href",
      "https://example.com/passkeys",
    );
    expect(within(directory!).getByRole("link", { name: "Account recovery" })).toHaveAttribute(
      "href",
      "https://example.com/recovery",
    );
    expect(within(directory!).queryByText("https://example.com/passkeys")).not.toBeInTheDocument();
    expect(within(directory!).getByRole("link", { name: /2factorauth/ })).toBeInTheDocument();
    expect(directory).toHaveTextContent("Community note: <strong>plain text</strong>");
    expect(within(details).queryByText("Passkey Directory")).not.toBeInTheDocument();
    expect(
      directory!.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("reads and attaches data from the selected passkey inspector", async () => {
    const user = userEvent.setup();
    const envelope = credentialsEnvelope();

    envelope.result!.groups![0].credentials![0].largeBlobKeyState = "available";
    vi.spyOn(api, "readLargeBlob").mockResolvedValue({
      operationId: "large-blob-read-1",
      selectionId: "authenticator-1",
      kind: OperationKind.ReadLargeBlob,
      authenticatorClosed: false,
      result: {
        device: testHIDDevice(),
        target: {
          credentialIDHex: "cafe",
          rp: { id: "example.com", name: "Example", idHashHex: "abcd" },
          user: {
            userIDHex: "01",
            name: "user@example.com",
            displayName: "Example User",
          },
        },
        state: ReadState.ReadStateMissing,
        rawByteCount: 0,
      },
    } as LargeBlobReadEnvelope);
    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(envelope);

    render(Passkeys);

    expect(screen.getByRole("heading", { name: "Associated data" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("No data attached")).toBeInTheDocument());
    expect(api.readLargeBlob).toHaveBeenCalledWith({
      verificationFlow: VerificationFlow.VerificationFlowDefault,
      credentialIDHex: "cafe",
    });
    expect(screen.queryByRole("button", { name: "Check data" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Attach data" }));

    expect(screen.getByRole("dialog", { name: "Attach data" })).toBeInTheDocument();
  });

  it("explains why data cannot be attached when largeBlobKey is missing", () => {
    const envelope = credentialsEnvelope();

    envelope.result!.groups![0].credentials![0].largeBlobKeyState = "missing";
    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(envelope);

    render(Passkeys);

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(
      screen.getByText("This passkey has no large-blob key, so data cannot be attached later."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check data" })).not.toBeInTheDocument();
  });

  it("removes the raw JSON region and its divider when Advanced Mode is disabled", () => {
    setAdvancedMode(false);
    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(credentialsEnvelope());

    render(Passkeys);

    const details = screen.getByRole("article", { name: "Passkey details" });

    expect(details.querySelector(".passkey-raw-separator")).not.toBeInTheDocument();
    expect(details.querySelector(".passkey-raw")).not.toBeInTheDocument();
    expect(within(details).queryByRole("button", { name: "Copy JSON" })).not.toBeInTheDocument();
  });

  it("keeps a single credential direct when its RP is selected again", async () => {
    const user = userEvent.setup();

    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(credentialsEnvelope());

    render(Passkeys);

    const relyingParty = screen.getByRole("button", { name: /example\.com Example 1 passkey/ });

    expect(screen.getByRole("article", { name: "Passkey details" })).toBeInTheDocument();
    await user.click(relyingParty);
    await tick();

    expect(screen.getByText("public-key")).toBeInTheDocument();
    expect(relyingParty).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("combobox", { name: "Selected passkey" })).not.toBeInTheDocument();
  });

  it("supports keyboard selection through semantic RP buttons", async () => {
    const user = userEvent.setup();

    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(mixedRelyingPartyEnvelope());

    render(Passkeys);

    const relyingParty = screen.getByRole("button", { name: /team\.example Team 2 passkeys/ });

    relyingParty.focus();
    await user.keyboard("{Enter}");

    expect(relyingParty).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("combobox", { name: "Selected passkey" })).toHaveTextContent(
      "Alice · alice@team.example",
    );
  });

  it("hides the RP workspace with a filtered credential and restores it when filters are cleared", async () => {
    const user = userEvent.setup();

    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(credentialsEnvelope());

    render(Passkeys);
    expect(screen.getByText("public-key")).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("Search RP, user, passkey ID, or hash"),
      "does-not-exist",
    );
    await tick();

    expect(screen.getByText("No matching passkeys")).toBeInTheDocument();
    expect(screen.queryByText("public-key")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    expect(screen.getByText("public-key")).toBeInTheDocument();
  });

  it("keeps the compact UV badge together with its full explanation", () => {
    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(credentialsEnvelope());

    render(Passkeys);

    const compact = screen.getByText("UV 2");

    expect(compact).toHaveAttribute("title", "Level 2 · UV optional with passkey list");
    expect(screen.getByText("Level 2 · UV optional with passkey list")).toBeInTheDocument();
  });

  it("groups by RP and adds a credential selector only for multi-credential RPs", async () => {
    const user = userEvent.setup();

    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(mixedRelyingPartyEnvelope());

    render(Passkeys);

    const navigation = screen.getByRole("complementary", { name: "Relying parties" });
    const solo = within(navigation).getByRole("button", {
      name: /solo\.example Solo 1 passkey/,
    });
    const team = within(navigation).getByRole("button", {
      name: /team\.example Team 2 passkeys/,
    });

    expect(within(navigation).getAllByRole("button")).toHaveLength(2);
    expect(solo).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("combobox", { name: "Selected passkey" })).not.toBeInTheDocument();

    await user.click(team);

    const credential = screen.getByRole("combobox", { name: "Selected passkey" });

    expect(team).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Passkey 1 of 2")).toBeInTheDocument();
    expect(credential).toHaveTextContent("Alice · alice@team.example");

    await user.click(credential);
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByText("Passkey 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Selected passkey" })).toHaveTextContent(
      "Bob · bob@team.example",
    );
    expect(screen.getByTitle("b2")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    const edit = screen.getByRole("button", { name: "Edit" });

    edit.focus();
    await user.keyboard("{Enter}");

    const dialog = screen.getByRole("dialog", { name: "Edit passkey user" });

    expect(within(dialog).getByLabelText("User name")).toHaveValue("bob@team.example");
    expect(within(dialog).getByLabelText("Display name")).toHaveValue("Bob");
  });

  it("opens the typed update dialog from the inspector", async () => {
    const user = userEvent.setup();

    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(credentialsEnvelope());

    render(Passkeys);
    await user.click(screen.getByRole("button", { name: "Edit" }));

    const dialog = screen.getByRole("dialog", { name: "Edit passkey user" });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByLabelText("User name")).toHaveValue("user@example.com");
    expect(within(dialog).getByLabelText("Display name")).toHaveValue("Example User");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
  });

  it("keeps exactly one verification mode selected when the active mode is clicked again", async () => {
    const user = userEvent.setup();

    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(credentialsEnvelope());

    render(Passkeys);

    const auto = screen.getByRole("radio", { name: "Auto" });
    const pin = screen.getByRole("radio", { name: "PIN" });

    expect(auto).toHaveAttribute("aria-checked", "true");
    await user.click(auto);
    await tick();
    expect(auto).toHaveAttribute("aria-checked", "true");
    expect(get(mutablePasskeysVerificationFlow)).toBe(VerificationFlow.VerificationFlowDefault);

    await user.click(pin);
    expect(pin).toHaveAttribute("aria-checked", "true");
    expect(get(mutablePasskeysVerificationFlow)).toBe(VerificationFlow.VerificationFlowPIN);
    await user.click(pin);
    await tick();
    expect(pin).toHaveAttribute("aria-checked", "true");
    expect(get(mutablePasskeysVerificationFlow)).toBe(VerificationFlow.VerificationFlowPIN);
  });

  it("keeps stale rows actionable while showing the failed refresh warning", async () => {
    const user = userEvent.setup();

    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(credentialsEnvelope());
    failPasskeysInventoryLoadAtRuntime();

    render(Passkeys);

    expect(screen.getByText("Passkey inventory could not be refreshed")).toBeInTheDocument();
    expect(
      screen.getByText(
        /The last successfully loaded data remains visible\. Reload passkeys to try again\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Communication with the authenticator failed\./),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload passkeys" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit passkey user" })).toBeInTheDocument();
  });

  it("renders unsupported credential management as a non-retry state", () => {
    const unsupported = credentialsEnvelope();

    unsupported.result!.support.credentialManagement = false;
    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(unsupported);

    render(Passkeys);

    expect(screen.getByText("Passkey management unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("distinguishes an authenticator's real empty inventory", () => {
    const empty = credentialsEnvelope();

    empty.result!.groups = [];
    empty.result!.summary.existingResidentCredentialsCount = 0;
    empty.result!.summary.totalRPs = 0;
    empty.result!.summary.totalCredentials = 0;
    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(empty);

    render(Passkeys);

    expect(screen.getByText("This authenticator has no discoverable passkeys")).toBeInTheDocument();
    expect(screen.queryByText("No matching passkeys")).not.toBeInTheDocument();
  });

  it("closes the update dialog during work and restores it for review or error", async () => {
    const envelope = credentialsEnvelope();

    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(envelope);

    const previewEnvelope = {
      operationId: "update-preview-1",
      selectionId: "authenticator-1",
      kind: OperationKind.UpdateCredentialUser,
      result: {
        preview: {
          credentialIDHex: "cafe",
          rpID: "example.com",
          current: { userIDHex: "01", name: "user@example.com", displayName: "Example User" },
          proposed: { userIDHex: "01", name: "updated@example.com", displayName: "Example User" },
          warnings: [
            {
              severity: "warning",
              code: "credential.update_user.mutation",
              message: "toolkit fallback",
            },
          ],
        },
        result: null,
      },
    } as CredentialUpdateEnvelope;
    const previewRequest = {
      selectionId: "authenticator-1",
      target: credentialUpdateTarget(),
      name: "updated@example.com",
      nameProvided: true,
      dryRun: true,
    };
    const mutation = {
      kind: "update",
      target: credentialUpdateTarget(),
      form: { name: "updated@example.com", displayName: "Example User" },
    } as const;

    mutablePasskeysMutation.set({
      ...mutation,
      operation: { phase: "previewing" },
    });

    render(Passkeys);

    expect(screen.queryByRole("dialog", { name: "Edit passkey user" })).not.toBeInTheDocument();

    mutablePasskeysMutation.set({
      ...mutation,
      operation: {
        phase: "review",
        previewRequest,
        previewEnvelope,
        previewValue: previewEnvelope.result!.preview,
      },
    });

    const dialog = await screen.findByRole("dialog", { name: "Edit passkey user" });

    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByText(
        "Changing this information may prevent you from signing in with this passkey.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("credential.update_user.mutation")).not.toBeInTheDocument();
    expect(screen.getByText("Current value")).toBeInTheDocument();
    expect(screen.getByText("Proposed value")).toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Preview JSON" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(within(dialog).getByRole("button", { name: "Confirm update" })).toBeEnabled();

    mutablePasskeysMutation.set({
      ...mutation,
      operation: {
        phase: "executing",
        previewEnvelope,
        previewValue: previewEnvelope.result!.preview,
        request: { ...previewRequest, dryRun: false },
      },
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit passkey user" })).not.toBeInTheDocument();
    });

    mutablePasskeysMutation.set({
      ...mutation,
      operation: {
        phase: "error",
        failedPhase: "executing",
        previewEnvelope,
        previewValue: previewEnvelope.result!.preview,
        request: { ...previewRequest, dryRun: false },
        responseEnvelope: {
          operationId: "update-error-1",
          selectionId: "authenticator-1",
          kind: OperationKind.UpdateCredentialUser,
          error: failureForCode(Code.CodeTransportFailure),
        } as CredentialUpdateEnvelope,
        runtimeError: null,
      },
    });

    const errorDialog = await screen.findByRole("dialog", { name: "Edit passkey user" });

    expect(
      within(errorDialog).getByText("Communication with the authenticator failed."),
    ).toBeInTheDocument();
    expect(within(errorDialog).getByRole("button", { name: "Confirm update" })).toBeEnabled();
    expect(within(errorDialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("renders the typed delete preview in an accessible alert dialog", async () => {
    const user = userEvent.setup();

    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(credentialsEnvelope());

    const previewEnvelope = {
      operationId: "delete-preview-1",
      selectionId: "authenticator-1",
      kind: OperationKind.DeleteCredential,
      authenticatorClosed: false,
      result: {
        preview: {
          credentialIDHex: "cafe",
          rpID: "example.com",
          rpName: "Example",
          userIDHex: "01",
          userName: "user@example.com",
          displayName: "Example User",
          warnings: [
            {
              severity: "destructive",
              code: "credential.delete.destructive",
              message: "toolkit fallback",
            },
          ],
        },
        result: null,
      },
    } as CredentialDeleteEnvelope;

    mutablePasskeysMutation.set({
      kind: "delete",
      credentialIDHex: "cafe",
      operation: {
        phase: "review",
        previewRequest: { credentialIDHex: "cafe", dryRun: true },
        previewEnvelope,
        previewValue: previewEnvelope.result!.preview,
      },
    });

    render(Passkeys);

    const dialog = screen.getByRole("alertdialog", { name: "Confirm delete" });

    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByText("Deleting this discoverable passkey is destructive and cannot be undone."),
    ).toBeInTheDocument();
    expect(screen.queryByText("credential.delete.destructive")).not.toBeInTheDocument();
    expect(screen.getAllByText("cafe").length).toBeGreaterThan(0);
    expect(within(dialog).getByRole("button", { name: "Preview JSON" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
  });

  it("shows a regular error dialog instead of delete confirmation when dry-run fails without a preview", () => {
    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    seedPasskeysEnvelopeForTest(credentialsEnvelope());

    const errorEnvelope = {
      operationId: "delete-preview-1",
      selectionId: "authenticator-1",
      kind: OperationKind.DeleteCredential,
      authenticatorClosed: false,
      error: failureForCode(Code.CodeTransportFailure),
    } as CredentialDeleteEnvelope;

    mutablePasskeysMutation.set({
      kind: "delete",
      credentialIDHex: "cafe",
      operation: {
        phase: "error",
        failedPhase: "previewing",
        responseEnvelope: errorEnvelope,
        runtimeError: null,
      },
    });

    render(Passkeys);

    expect(screen.queryByRole("alertdialog", { name: "Confirm delete" })).not.toBeInTheDocument();

    const dialog = screen.getByRole("dialog", { name: "Passkey deletion preview" });

    expect(
      within(dialog).getByText("Communication with the authenticator failed."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeEnabled();
    expect(within(dialog).queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});
