import { testTopology, testHIDDevice, testSmartCardDevice } from "../test/device.js";
import { DeviceReport, YubicoSource } from "../../bindings/github.com/telesma-app/kit/model/report";
import { SmartCardReport } from "../../bindings/github.com/telesma-app/kit/model/report";
import { DescriptorState } from "../../bindings/github.com/telesma-app/kit/model/report";
import { USBReport } from "../../bindings/github.com/telesma-app/kit/model/report";
import { beforeEach, describe, expect, it } from "vitest";
import { CreditCard, Nfc, Usb } from "@lucide/svelte";

import { OperationStage } from "../../bindings/github.com/telesma-app/kit/model";
import { Code } from "../../bindings/github.com/telesma-app/kit/model/failure";
import { EndpointReport } from "../../bindings/github.com/telesma-app/kit/model/report";
import { Mode, SmartCardInterface } from "../../bindings/github.com/telesma-app/kit/transport";

import { setAppLocale } from "$lib/i18n.js";
import { failureForCode } from "$lib/test-support/failure.js";
import { buildShellStatusPresentation, buildSidebarPresentation } from "$lib/shell-presentation.js";
import type { AuthenticatorStatus } from "$lib/authenticator-model.js";
import type { StatusBarState } from "$lib/features/workbench";

const token = new EndpointReport({
  attachment: {
    id: "token-1",
    transport: Mode.ModeHID,
    usb: new USBReport({
      product: { state: DescriptorState.DescriptorRead, value: "Test key" },
      vendorId: { state: DescriptorState.DescriptorRead, value: 1 },
      productId: { state: DescriptorState.DescriptorRead, value: 2 },
    }),
  },
});

function authenticator(state: AuthenticatorStatus["state"]): AuthenticatorStatus {
  return {
    state,
    selectionId: "authenticator-1",
  };
}

function statusBar(patch: Partial<StatusBarState> = {}): StatusBarState {
  return { activeOperation: null, lastOutcome: null, ...patch };
}

describe("shell status presentation", () => {
  beforeEach(() => setAppLocale("en"));

  it("prioritizes active operation progress and exposes cancel after an operation id arrives", () => {
    const presentation = buildShellStatusPresentation({
      selectedDevice: token,
      authenticatorStatus: authenticator("error"),
      statusBar: statusBar({
        activeOperation: {
          operationId: "operation-1",
          label: "Credential inventory",
          stage: OperationStage.OperationStageEnumeratingCredentials,
          completed: 2,
          total: 5,
        },
        lastOutcome: { tone: "error", title: "Older failure" },
      }),
    });

    expect(presentation).toMatchObject({
      source: "operation",
      title: "Credential inventory",
      detail: "Enumerating passkeys",
      busy: true,
      progress: { value: 2, max: 5, label: "2 of 5" },
      cancel: { disabled: false, ariaLabel: "Cancel operation" },
    });
  });

  it("keeps known zero progress determinate and shows its count", () => {
    const presentation = buildShellStatusPresentation({
      selectedDevice: token,
      authenticatorStatus: authenticator("ready"),
      statusBar: statusBar({
        activeOperation: {
          stage: OperationStage.OperationStageEnumeratingRPs,
          completed: 0,
          total: 0,
        },
      }),
    });

    expect(presentation.progress).toMatchObject({ value: 0, max: 1, label: "0 of 0" });
  });

  it("uses indeterminate operation state until both progress values are known", () => {
    const presentation = buildShellStatusPresentation({
      selectedDevice: token,
      authenticatorStatus: authenticator("ready"),
      statusBar: statusBar({
        activeOperation: { stage: OperationStage.OperationStageEnumeratingRPs },
      }),
    });

    expect(presentation.source).toBe("operation");
    expect(presentation.detail).toBe("Enumerating relying parties");
    expect(presentation.progress).toBeNull();
    expect(presentation.cancel).toBeNull();
  });

  it("prioritizes opening and authenticator errors over the last outcome", () => {
    const outcome = statusBar({ lastOutcome: { tone: "success", title: "Old success" } });
    const opening = buildShellStatusPresentation({
      selectedDevice: token,
      authenticatorStatus: authenticator("opening"),
      statusBar: outcome,
    });
    const errored = buildShellStatusPresentation({
      selectedDevice: token,
      authenticatorStatus: {
        ...authenticator("error"),
        error: failureForCode(Code.CodeAuthenticatorClosed),
      },
      statusBar: outcome,
    });

    expect(opening).toMatchObject({ source: "authenticator", title: "Opening", busy: true });
    expect(errored).toMatchObject({
      source: "authenticator",
      title: "Error",
      detail: "The authenticator is closed.",
      busy: false,
      tone: "error",
    });
  });
});

describe("sidebar presentation", () => {
  beforeEach(() => setAppLocale("en"));

  it("builds the active screen title and discovered token rows", () => {
    const presentation = buildSidebarPresentation({
      activeScreen: "security",
      ...testTopology([token]),
      selectedSelector: "token-1",
      busy: false,
    });

    expect(presentation.activeScreenLabel).toBe("Security");
    expect(presentation.tokens).toEqual([
      {
        value: "token-1",
        label: "Test key",
        name: "Test key",
        detail: "",
        icon: Usb,
      },
    ]);
  });

  it("uses the USB product without inventing a Yubico model", () => {
    const enriched = new EndpointReport({
      ...token,
      attachment: {
        ...token.attachment,
        usb: new USBReport({
          product: { state: DescriptorState.DescriptorRead, value: "Yubico Security Key" },
          vendorId: { state: DescriptorState.DescriptorRead, value: 0x1050 },
          productId: { state: DescriptorState.DescriptorRead, value: 0x0407 },
        }),
      },
    });

    const presentation = buildSidebarPresentation({
      activeScreen: "overview",
      ...testTopology([enriched]),
      selectedSelector: "token-1",
      busy: false,
    });

    expect(presentation.tokens[0]).toEqual({
      value: "token-1",
      label: "Yubico Security Key",
      name: "Yubico Security Key",
      detail: "",
      icon: Usb,
    });
  });

  it("uses the USB product without inventing a Token2 model", () => {
    const token2 = new EndpointReport({
      ...token,
      attachment: {
        ...token.attachment,
        usb: new USBReport({
          product: { state: DescriptorState.DescriptorRead, value: "TOKEN2 FIDO2 Security Key" },
          vendorId: { state: DescriptorState.DescriptorRead, value: 0x349e },
          productId: { state: DescriptorState.DescriptorRead, value: 1 },
        }),
      },
    });

    const presentation = buildSidebarPresentation({
      activeScreen: "overview",
      ...testTopology([token2]),
      selectedSelector: "token-1",
      busy: false,
    });

    expect(presentation.tokens[0]).toEqual({
      value: "token-1",
      label: "TOKEN2 FIDO2 Security Key",
      name: "TOKEN2 FIDO2 Security Key",
      detail: "",
      icon: Usb,
    });
  });

  it("keeps a smart-card reader separate from the card identity", () => {
    const smartCard = new EndpointReport({
      ...token,
      attachment: {
        id: "smart-card-1",
        transport: Mode.ModeSmartCard,
        smartCard: new SmartCardReport({
          reader: "ACS ACR1252 Dual Reader",
          interface: SmartCardInterface.SmartCardInterfaceContact,
        }),
      },
    });

    const presentation = buildSidebarPresentation({
      activeScreen: "overview",
      ...testTopology([smartCard]),
      selectedSelector: "smart-card-1",
      busy: false,
    });

    expect(presentation.tokens[0]).toEqual({
      value: "smart-card-1",
      label: "Smart card",
      name: "Smart card",
      detail: "ACS ACR1252 Dual Reader · PC/SC",
      icon: CreditCard,
    });
  });

  it("uses a generic card name and keeps the contactless reader separate", () => {
    const smartCard = new EndpointReport({
      ...token,
      attachment: {
        id: "smart-card-1",
        transport: Mode.ModeSmartCard,
        smartCard: new SmartCardReport({
          reader: "Token2 Smart Reader",
          interface: SmartCardInterface.SmartCardInterfaceContactless,
        }),
      },
    });

    const presentation = buildSidebarPresentation({
      activeScreen: "overview",
      ...testTopology([smartCard]),
      selectedSelector: "smart-card-1",
      busy: false,
    });

    expect(presentation.tokens[0]).toEqual({
      value: "smart-card-1",
      label: "Smart card",
      name: "Smart card",
      detail: "Token2 Smart Reader · PC/SC",
      icon: Nfc,
    });
  });
});

it("renders one physical token with HID and PCSC and preserves its selected endpoint", () => {
  setAppLocale("en");
  const hid = token.attachment;
  const card = new EndpointReport({
    attachment: {
      id: "card-of-token-1",
      transport: Mode.ModeSmartCard,
      smartCard: new SmartCardReport({ reader: "Test reader" }),
    },
  }).attachment;
  const device = new DeviceReport({ id: "physical-token", endpointIds: [hid.id, card.id] });
  const sidebar = buildSidebarPresentation({
    devices: [device],
    endpoints: [new EndpointReport({ attachment: hid }), new EndpointReport({ attachment: card })],
    activeScreen: "overview",
    selectedSelector: device.id,
    busy: false,
  });
  expect(sidebar.tokens).toHaveLength(1);
  expect(sidebar.tokens[0]).toMatchObject({
    value: device.id,
    name: "Test key",
    detail: "HID · PC/SC",
    icon: Usb,
  });
  expect(sidebar.selectedValue).toBe(device.id);
});

it("names each physical group from its own endpoints without joining matching USB products", () => {
  const hid = testHIDDevice("hid", "YubiKey FIDO+CCID");
  const card = testSmartCardDevice("card");
  card.sources.yubico = new YubicoSource({ modelName: "YubiKey 5C Nano" });
  const second = testHIDDevice("second", "YubiKey FIDO+CCID");
  const sidebar = buildSidebarPresentation({
    activeScreen: "overview",
    devices: [
      new DeviceReport({ id: "first", endpointIds: ["hid", "card"] }),
      new DeviceReport({ id: "second", endpointIds: ["second"] }),
    ],
    endpoints: [hid, card, second],
    selectedSelector: "first",
    busy: false,
  });
  expect(sidebar.tokens.map(({ value, name }) => ({ value, name }))).toEqual([
    { value: "first", name: "YubiKey 5C Nano" },
    { value: "second", name: "YubiKey FIDO+CCID" },
  ]);
});
