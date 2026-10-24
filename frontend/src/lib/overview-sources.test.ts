import { beforeEach, describe, expect, it } from "vitest";
import { DescriptorState } from "../../bindings/github.com/telesma-app/kit/model/report";
import { Descriptor } from "../../bindings/github.com/telesma-app/kit/model/report";
import {
  SourceState,
  SourceReason,
  Token2Source,
  YubicoSource,
  GetInfoSource,
  SourceReadError,
  Token2Report,
} from "../../bindings/github.com/telesma-app/kit/model/report";
import {
  Configuration,
  DeviceConfiguration,
  DeviceExtension,
  TransferType,
  ATR,
  Model,
} from "../../bindings/github.com/telesma-app/token2";
import { Capability, DeviceInfo, FormFactor } from "../../bindings/github.com/telesma-app/yubico";
import { Info } from "../../bindings/github.com/telesma-app/kit/model/inspect";
import { Code } from "../../bindings/github.com/telesma-app/kit/model/failure";
import {
  buildAttachmentPanel,
  buildVendorPanels,
  buildFIDOPanels,
  buildOverviewVendorPassport,
} from "$lib/overview-sources";
import { failureForCode } from "$lib/test-support/failure";
import { setAppLocale } from "$lib/i18n";
import { testHIDDevice, testSmartCardDevice } from "../test/device";

describe("independent device sources", () => {
  beforeEach(() => setAppLocale("en"));
  it("distinguishes unknown descriptors, read empty values and read failures", () => {
    const device = testHIDDevice();
    device.attachment.usb!.manufacturer = new Descriptor({
      state: DescriptorState.DescriptorRead,
      value: "",
    });
    device.attachment.usb!.product = new Descriptor({
      state: DescriptorState.DescriptorFailed,
      error: { message: "OS read failed" },
    });
    device.attachment.usb!.reportedSerial = new Descriptor();
    const facts = buildAttachmentPanel(device).facts;
    expect(facts[0]).toMatchObject({ value: "(empty value)", status: "Read" });
    expect(facts[1]).toMatchObject({ status: "Read failed", message: "OS read failed" });
    expect(facts[2]).toMatchObject({ status: "Not supplied by the OS" });
  });
  it("keeps successful serial and configuration data beside a failed command", () => {
    const device = testSmartCardDevice();
    device.sources.token2 = new Token2Source({
      state: SourceState.SourcePartial,
      error: failureForCode(Code.CodeTransportFailure),
      data: new Token2Report({
        serialNumber: { value: "123456789" },
        atr: { value: null, error: new SourceReadError({ message: "ATR read failed" }) },
        configuration: { value: new Configuration({ raw: "AA==", transferType: 0 }) },
      }),
    });
    const panel = buildVendorPanels(device)[1];
    expect(panel.failed).toBe(false);
    expect(panel.status).toBe("Partially read");
    expect(panel.facts.map((fact) => fact.value)).toContain("123456789");
    expect(panel.facts.map((fact) => fact.message)).toContain("ATR read failed");
    expect(panel.facts.map((fact) => fact.value)).toContain("FIDO, HOTP keystroke, CCID");
  });
  it("retains a Token2 value and its cleanup failure after binding decoding", () => {
    const device = testSmartCardDevice();
    device.sources.token2 = Token2Source.createFrom(
      JSON.stringify({
        state: SourceState.SourcePartial,
        data: {
          serialNumber: {
            value: "123456789",
            error: { message: "Serial transaction cleanup failed" },
          },
          atr: { value: null },
          configuration: { value: null },
        },
      }),
    );

    const panel = buildVendorPanels(device)[1];

    expect(panel.status).toBe("Partially read");
    expect(panel.facts).toEqual([
      expect.objectContaining({
        value: "123456789",
        status: "Read failed",
        message: "Serial transaction cleanup failed",
        source: "sources.token2.data.serialNumber",
      }),
    ]);
  });
  it("shows the PCSC ATR without turning absent Token2 identity into a read failure", () => {
    const device = testHIDDevice();
    device.sources.token2 = new Token2Source({
      state: SourceState.SourceAvailable,
      data: new Token2Report({
        atr: { value: new ATR({ raw: btoa(String.fromCharCode(0x3b, 0x8f, 0x80, 0x01)) }) },
      }),
    });
    const panel = buildVendorPanels(device)[1];
    expect(panel.failed).toBe(false);
    expect(panel.message).toBe("");
    expect(panel.facts[0]).toMatchObject({
      value: "3b 8f 80 01",
      status: "Read",
      message: "ATR was read, but does not contain Token2 identity data.",
    });
  });
  it("retains the correlated PCSC endpoint in the physical token details", () => {
    const device = testHIDDevice();
    const card = testSmartCardDevice();
    const panel = buildAttachmentPanel(device, [device, card]);
    expect(panel.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: "Test reader",
          source: "endpoints[1].attachment.smartCard.reader",
        }),
      ]),
    );
  });
  it("decodes modern Token2 configuration on PCSC using protocol masks", () => {
    const device = testSmartCardDevice();
    device.sources.token2 = new Token2Source({
      state: SourceState.SourceAvailable,
      data: new Token2Report({
        configuration: {
          value: new Configuration({
            raw: btoa(String.fromCharCode(...new Array(10).fill(0))),
            transferType: TransferType.TransferTypeHOTPKeystrokeDisabledMask,
            deviceConfiguration: DeviceConfiguration.DeviceConfigurationNFCMask,
            deviceExtension:
              DeviceExtension.DeviceExtensionTOTPMask |
              DeviceExtension.DeviceExtensionCCIDMask |
              DeviceExtension.DeviceExtensionButtonHOTPUnsupportedMask,
          }),
        },
      }),
    });
    const panel = buildVendorPanels(device)[1];
    expect(panel.facts.map((fact) => fact.value)).toContain("FIDO, CCID");
    expect(panel.facts.map((fact) => fact.value)).toContain("TOTP, NFC, CCID");
  });
  it("preserves reported zero Yubico values and omits absent fields", () => {
    const device = testHIDDevice();
    device.sources.yubico = new YubicoSource({
      state: SourceState.SourceAvailable,
      data: new DeviceInfo({ serialNumber: 0, enabledUSBCapabilities: 0 }),
    });
    const panel = buildVendorPanels(device)[0];
    expect(panel.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "0", source: "sources.yubico.data.serialNumber" }),
        expect.objectContaining({
          value: "Empty list",
          source: "sources.yubico.data.enabledUSBCapabilities",
        }),
      ]),
    );
    expect(panel.facts.some((fact) => fact.source.endsWith("partNumber"))).toBe(false);
  });
  it("keeps standard GetInfo available when no management adapter exists", () => {
    const device = testHIDDevice();
    device.sources.getInfo = new GetInfoSource({
      state: SourceState.SourceAvailable,
      data: new Info({ aaguid: "00000000-0000-0000-0000-000000000001" }),
    });
    device.sources.yubico = new YubicoSource({
      state: SourceState.SourceUnavailable,
      reason: SourceReason.ReasonAdapterMissing,
    });
    expect(buildFIDOPanels(device)[1].facts).not.toHaveLength(0);
    expect(buildVendorPanels(device)[0].message).toContain("No adapter");
  });
});

describe("physical token passport", () => {
  beforeEach(() => setAppLocale("en"));

  it("retains Yubico core identity and application summaries from a partial source", () => {
    const device = testHIDDevice();
    device.sources.yubico = new YubicoSource({
      state: SourceState.SourcePartial,
      modelName: "YubiKey 5C Nano",
      error: failureForCode(Code.CodeTransportFailure),
      data: new DeviceInfo({
        serialNumber: 123456,
        formFactor: FormFactor.FormFactorUSBCNano,
        partNumber: "50604000",
        firmwareVersion: { major: 5, minor: 7, build: 4 },
        supportedUSBCapabilities: Capability.CapabilityCTAP2 | Capability.CapabilityPIV,
        enabledUSBCapabilities: Capability.CapabilityCTAP2,
      }),
    });

    const passport = buildOverviewVendorPassport([device])!;

    expect(passport.vendor).toBe("Yubico");
    expect(passport.coreFacts.map((fact) => fact.value)).toEqual([
      "123456",
      "50604000",
      "USB-C Nano",
    ]);
    expect(passport.summaryFacts.map((fact) => fact.value)).toEqual(["PIV, CTAP2", "CTAP2"]);
    expect(passport.detailFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "5.7.4" }),
        expect.objectContaining({ value: "YubiKey 5C Nano" }),
        expect.objectContaining({ source: "endpoints[0].sources.yubico.error" }),
      ]),
    );
  });

  it("shows Token2 catalogue release separately from firmware and keeps command failures in details", () => {
    const device = testSmartCardDevice();
    device.sources.token2 = new Token2Source({
      state: SourceState.SourcePartial,
      data: new Token2Report({
        model: new Model({ branding: "Token2", formFactor: "Dual PIN+ NFC", release: "R3.2" }),
        serialNumber: { value: "77103001" },
        atr: { value: null, error: new SourceReadError({ message: "ATR read failed" }) },
        configuration: {
          value: new Configuration({
            raw: btoa(String.fromCharCode(0, 0)),
            transferType: TransferType.TransferTypeHOTPKeystrokeDisabledMask,
            deviceExtension: DeviceExtension.DeviceExtensionButtonHOTPUnsupportedMask,
          }),
        },
      }),
    });

    const passport = buildOverviewVendorPassport([device])!;

    expect(passport.vendor).toBe("Token2");
    expect(passport.coreFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "77103001" }),
        expect.objectContaining({ value: "Dual PIN+ NFC" }),
        expect.objectContaining({ label: "Hardware release", value: "R3.2" }),
      ]),
    );
    expect(passport.coreFacts.some((fact) => fact.label.includes("Firmware"))).toBe(false);
    expect(passport.summaryFacts.map((fact) => fact.value)).toContain("FIDO, CCID");
    expect(passport.detailFacts).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "ATR read failed" })]),
    );
  });

  it("deduplicates confirmed group facts while retaining differing endpoint observations", () => {
    const hid = testHIDDevice("hid", "Token HID interface");
    const card = testSmartCardDevice("card");
    for (const endpoint of [hid, card]) {
      endpoint.sources.token2 = new Token2Source({
        state: SourceState.SourceAvailable,
        data: new Token2Report({
          serialNumber: { value: "77103001" },
          model: new Model({ branding: "Token2", formFactor: "Dual PIN+ NFC", release: "R3.2" }),
        }),
      });
    }

    const passport = buildOverviewVendorPassport([hid, card])!;

    expect(passport.transport).toBe("USB · HID · PC/SC");
    expect(passport.coreFacts.filter((fact) => fact.value === "77103001")).toHaveLength(1);
    expect(passport.coreFacts.filter((fact) => fact.value === "Dual PIN+ NFC")).toHaveLength(1);
    expect(passport.detailFacts.map((fact) => fact.value)).toEqual(
      expect.arrayContaining(["Token HID interface", "Test reader"]),
    );
  });

  it("keeps known USB observations without unavailable management or empty descriptor noise", () => {
    const device = testHIDDevice("usb", "Generic FIDO token");
    device.attachment.usb!.manufacturer = new Descriptor({
      state: DescriptorState.DescriptorRead,
      value: "USB vendor",
    });
    device.sources.yubico = new YubicoSource({
      state: SourceState.SourceUnavailable,
      reason: SourceReason.ReasonAdapterMissing,
    });
    device.sources.token2 = new Token2Source({
      state: SourceState.SourceUnavailable,
      reason: SourceReason.ReasonVendorUnknown,
    });

    const passport = buildOverviewVendorPassport([device])!;

    expect(passport.coreFacts.map((fact) => fact.value)).toEqual([
      "USB vendor",
      "Generic FIDO token",
    ]);
    expect(passport.summaryFacts).toEqual([]);
    expect(passport.detailFacts.map((fact) => fact.value)).toEqual([
      "USB vendor",
      "Generic FIDO token",
      "0x0001",
      "0x0002",
    ]);
  });

  it("retains actual FIDO read failures in the existing technical disclosure", () => {
    const device = testHIDDevice();
    device.sources.getInfo = new GetInfoSource({
      state: SourceState.SourceFailed,
      error: failureForCode(Code.CodeTransportFailure),
    });

    const passport = buildOverviewVendorPassport([device])!;

    expect(passport.detailFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "FIDO GetInfo",
          source: "endpoints[0].sources.getInfo.error",
        }),
      ]),
    );
  });
});
