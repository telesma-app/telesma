import { DescriptorState } from "../../bindings/github.com/telesma-app/kit/model/report";
import { USBReport } from "../../bindings/github.com/telesma-app/kit/model/report";
import { cleanup, render, screen, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Kind as OperationKind } from "../../bindings/github.com/telesma-app/kit/model/operation";
import { Code } from "../../bindings/github.com/telesma-app/kit/model/failure";
import {
  AuthenticatorConfigStatus,
  BioStatus,
  CapabilityState,
  LimitsStatus,
  PINStatus,
  ResetHints,
  RetryState,
  StateValue,
  StatusReport,
  UVStatus,
} from "../../bindings/github.com/telesma-app/kit/model/config";
import { EndpointReport } from "../../bindings/github.com/telesma-app/kit/model/report";
import type { ConfigStatusEnvelope } from "../../bindings/telesma/service";
import { Mode } from "../../bindings/github.com/telesma-app/kit/transport";

import {
  completeSecurityResourceLoad,
  emptySecurityResourceState,
  failSecurityResourceLoadAtRuntime,
  securityStatus,
} from "$lib/features/security/state";
import { setAppLocale } from "$lib/i18n";
import { resetAppStateForTest, seedSelectionForTest } from "$lib/test-support/store-utils";
import { failureForCode } from "$lib/test-support/failure";

import Security from "./Security.svelte";

const token = new EndpointReport({
  attachment: {
    id: "token-1",
    transport: Mode.ModeHID,
    usb: new USBReport({
      product: { state: DescriptorState.DescriptorRead, value: "Test authenticator" },
      vendorId: { state: DescriptorState.DescriptorRead, value: 1 },
      productId: { state: DescriptorState.DescriptorRead, value: 2 },
    }),
  },
});

function statusEnvelope(maxPINLength = 63): ConfigStatusEnvelope {
  const unsupported = new CapabilityState({
    state: StateValue.StateUnsupported,
    supported: false,
  });
  const report = new StatusReport({
    device: token,
    pin: new PINStatus({
      state: StateValue.StateConfigured,
      supported: true,
      configured: true,
      protocolSupported: true,
      minPINLength: 4,
      maxPINLength,
      retries: new RetryState({ state: StateValue.StateConfigured, remaining: 8 }),
    }),
    uv: new UVStatus({
      state: StateValue.StateSupported,
      supported: true,
      configured: false,
      retries: new RetryState({ state: StateValue.StateUnknown }),
    }),
    bio: new BioStatus({
      state: StateValue.StateUnsupported,
      supported: false,
      configured: false,
      uvBioEnroll: unsupported,
    }),
    authenticatorConfig: new AuthenticatorConfigStatus({
      state: StateValue.StateSupported,
      supported: true,
      uvAcfg: new CapabilityState({ state: StateValue.StateSupported, supported: true }),
      enterpriseAttestation: new CapabilityState({
        state: StateValue.StateNotConfigured,
        supported: true,
        configured: false,
      }),
      alwaysUv: new CapabilityState({
        state: StateValue.StateConfigured,
        supported: true,
        configured: false,
      }),
      setMinPINLength: new CapabilityState({ state: StateValue.StateSupported, supported: true }),
      longTouchForReset: unsupported,
      vendorPrototype: new CapabilityState({
        state: StateValue.StateSupported,
        supported: true,
      }),
      vendorPrototypeConfigCommands: ["7", "4294967296"],
    }),
    resetHints: new ResetHints({ longTouchForReset: StateValue.StateSupported }),
    limits: new LimitsStatus({
      minPINLength: 4,
      maxPINLength,
      maxRPIDsForSetMinPINLength: 3,
    }),
  });

  return {
    operationId: "security-status-1",
    selectionId: "authenticator-1",
    kind: OperationKind.ConfigStatus,
    result: report,
  } as ConfigStatusEnvelope;
}

describe("Security screen", () => {
  beforeEach(() => {
    setAppLocale("en");
    resetAppStateForTest();
    seedSelectionForTest(token.attachment.id, token, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    completeSecurityResourceLoad(securityStatus, statusEnvelope());
  });

  afterEach(() => cleanup());

  it("shows the current verification configuration and supported controls", () => {
    render(Security);

    const overview = document.querySelector<HTMLElement>("#security-overview");

    expect(overview).not.toBeNull();
    expect(within(overview!).getByText("Client PIN")).toBeInTheDocument();
    expect(
      within(overview!).getByText("Depends on request and credential policy"),
    ).toBeInTheDocument();
    expect(within(overview!).getByText("No immediate issues")).toBeInTheDocument();
    expect(within(overview!).queryByText("Ready")).not.toBeInTheDocument();
    expect(within(overview!).queryByText("PIN retries")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Authenticator configuration" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Client PIN or built-in UV/)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Always UV" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Enable enterprise attestation" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Enable long touch" })).toBeDisabled();
    expect(screen.getByText("4294967296")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Factory reset" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reload overview" })).not.toBeInTheDocument();
  });

  it("shows and enforces the effective CTAP maximum PIN length", () => {
    completeSecurityResourceLoad(securityStatus, statusEnvelope());
    render(Security);

    expect(screen.getByRole("spinbutton", { name: "Minimum PIN length" })).toHaveAttribute(
      "max",
      "63",
    );
    expect(screen.getByText(/Maximum PIN length: 63/)).toBeInTheDocument();
  });

  it("keeps a status-load failure out of the empty state", () => {
    securityStatus.set(emptySecurityResourceState());
    failSecurityResourceLoadAtRuntime(securityStatus, failureForCode(Code.CodePINInvalid));

    render(Security);

    expect(
      screen.getByText("This authenticator does not expose the requested security capability."),
    ).toBeInTheDocument();
    expect(screen.queryByText("The PIN is invalid.")).not.toBeInTheDocument();
  });
});
