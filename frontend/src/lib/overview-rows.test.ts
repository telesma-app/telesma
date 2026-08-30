import { describe, expect, it } from "vitest";

import type { Version } from "../../bindings/github.com/telesma-app/ctap/protocol";
import {
  FactID,
  FactOrigin,
  FactState,
  FactUnit,
  FactValue,
  FactValueKind,
  Info as InspectInfo,
} from "../../bindings/github.com/telesma-app/kit/model/inspect";
import {
  AttachmentReport,
  DeviceIdentityReport,
  DeviceReport,
  DeviceVendor,
  DeviceVendorMetadata,
  SmartCardReport,
} from "../../bindings/github.com/telesma-app/kit/model/report";
import { Mode, SmartCardInterface } from "../../bindings/github.com/telesma-app/kit/transport";
import {
  DeviceInfo as Token2DeviceInfo,
  FIDOVersion as Token2FIDOVersion,
} from "../../bindings/github.com/telesma-app/token2";
import {
  Capability as YubicoCapability,
  DeviceInfo as YubicoDeviceInfo,
  FirmwareVersion as YubicoFirmwareVersion,
  FormFactor as YubicoFormFactor,
} from "../../bindings/github.com/telesma-app/yubico";

import { setAppLocale } from "$lib/i18n";
import { buildOverviewRows, buildOverviewVendorPassport } from "$lib/overview-rows";
import { testOverviewAssessment, testOverviewFact } from "$lib/test-support/overview-facts";
import type { OverviewRow } from "$lib/overview-types";

function info(input: Partial<InspectInfo> = {}): InspectInfo {
  return new InspectInfo({
    versions: ["FIDO_2_1" as Version],
    aaguid: "00000000-0000-0000-0000-000000000000",
    assessment: testOverviewAssessment(),
    ...input,
  });
}

function booleanFact(
  id: FactID,
  source: string,
  state: FactState,
  origin: FactOrigin,
  boolean: boolean,
) {
  return testOverviewFact(
    id,
    source,
    state,
    origin,
    new FactValue({
      kind: FactValueKind.FactValueBoolean,
      boolean,
    }),
  );
}

function integerFact(
  id: FactID,
  source: string,
  integer: number,
  unit?: FactUnit,
  origin = FactOrigin.FactOriginReported,
) {
  return testOverviewFact(
    id,
    source,
    FactState.FactStateObserved,
    origin,
    new FactValue({
      kind: FactValueKind.FactValueInteger,
      integer,
      unit,
    }),
  );
}

function listFact(id: FactID, source: string, list: string[], state = FactState.FactStateObserved) {
  return testOverviewFact(
    id,
    source,
    state,
    FactOrigin.FactOriginReported,
    new FactValue({
      kind: FactValueKind.FactValueList,
      list,
    }),
  );
}

function rowBySource(rows: OverviewRow[], source: string) {
  const item = rows.find((row) => row.source === source);

  expect(item).toBeDefined();

  return item as OverviewRow;
}

describe("buildOverviewRows", () => {
  it("reads generated option fields through typed option keys", () => {
    setAppLocale("en");

    const rows = buildOverviewRows({
      info: info({
        assessment: testOverviewAssessment([
          booleanFact(
            FactID.FactIDLargeBlobs,
            "options.largeBlobs",
            FactState.FactStateSupported,
            FactOrigin.FactOriginReported,
            true,
          ),
          booleanFact(
            FactID.FactIDSetMinPINLength,
            "options.setMinPINLength",
            FactState.FactStateSupported,
            FactOrigin.FactOriginReported,
            true,
          ),
          booleanFact(
            FactID.FactIDExtensionLargeBlobKey,
            "extensions.largeBlobKey",
            FactState.FactStateSupported,
            FactOrigin.FactOriginDerived,
            true,
          ),
          integerFact(
            FactID.FactIDMaxSerializedLargeBlobArray,
            "maxSerializedLargeBlobArray",
            2048,
            FactUnit.FactUnitBytes,
          ),
        ]),
      }),
    });

    expect(rowBySource(rows, "options.setMinPINLength").status).toBe("supported");
    expect(rowBySource(rows, "extensions.largeBlobKey").status).toBe("supported");
    expect(rowBySource(rows, "options.largeBlobs").value).toContain("2048");
  });

  it("preserves absent versus false option semantics", () => {
    setAppLocale("en");

    const falseRows = buildOverviewRows({
      info: info({
        assessment: testOverviewAssessment([
          booleanFact(
            FactID.FactIDClientPIN,
            "options.clientPin",
            FactState.FactStateNotConfigured,
            FactOrigin.FactOriginReported,
            false,
          ),
        ]),
      }),
    });
    const absentRows = buildOverviewRows({
      info: info({
        assessment: testOverviewAssessment([
          booleanFact(
            FactID.FactIDClientPIN,
            "options.clientPin",
            FactState.FactStateUnsupported,
            FactOrigin.FactOriginSpecDefault,
            false,
          ),
        ]),
      }),
    });

    expect(rowBySource(falseRows, "options.clientPin").status).toBe("not configured");
    expect(rowBySource(falseRows, "options.clientPin").value).toBe("PIN not set");
    expect(rowBySource(absentRows, "options.clientPin").status).toBe("unsupported");
    expect(rowBySource(absentRows, "options.clientPin").value).toBe("Default false");
  });

  it("keeps numeric limits informational in the presentation matrix", () => {
    setAppLocale("en");

    const rows = buildOverviewRows({
      info: info({
        assessment: testOverviewAssessment([
          integerFact(
            FactID.FactIDEffectiveMaxMessageSize,
            "maxMsgSize",
            512,
            FactUnit.FactUnitBytes,
          ),
          integerFact(
            FactID.FactIDEffectiveMinPINLength,
            "minPINLength",
            3,
            FactUnit.FactUnitCodePoints,
          ),
          integerFact(
            FactID.FactIDEffectiveMaxPINLength,
            "maxPINLength",
            7,
            FactUnit.FactUnitCodePoints,
          ),
        ]),
      }),
    });

    expect(rowBySource(rows, "maxMsgSize").status).toBe("informational");
    expect(rowBySource(rows, "maxMsgSize").value).toContain("512");
    expect(rowBySource(rows, "minPINLength").status).toBe("informational");
    expect(rowBySource(rows, "minPINLength").value).toContain("3");
    expect(rowBySource(rows, "maxPINLength").status).toBe("informational");
    expect(rowBySource(rows, "maxPINLength").value).toContain("7");

    const defaultRows = buildOverviewRows({
      info: info({
        assessment: testOverviewAssessment([
          integerFact(
            FactID.FactIDEffectiveMaxMessageSize,
            "maxMsgSize",
            1024,
            FactUnit.FactUnitBytes,
            FactOrigin.FactOriginSpecDefault,
          ),
          integerFact(
            FactID.FactIDEffectiveMaxPINLength,
            "maxPINLength",
            63,
            FactUnit.FactUnitCodePoints,
            FactOrigin.FactOriginSpecDefault,
          ),
        ]),
      }),
    });

    expect(rowBySource(defaultRows, "maxMsgSize").status).toBe("informational");
    expect(rowBySource(defaultRows, "maxPINLength").status).toBe("informational");
  });

  it("keeps extension and certification localization", () => {
    setAppLocale("en");

    const rows = buildOverviewRows({
      info: info({
        assessment: testOverviewAssessment([
          booleanFact(
            FactID.FactIDExtensionCredBlob,
            "extensions.credBlob",
            FactState.FactStateSupported,
            FactOrigin.FactOriginDerived,
            true,
          ),
          booleanFact(
            FactID.FactIDExtensionPreviewSign,
            "extensions.previewSign",
            FactState.FactStateSupported,
            FactOrigin.FactOriginDerived,
            true,
          ),
          listFact(FactID.FactIDCertifications, "certifications", ["FIDO=2"]),
        ]),
      }),
    });

    expect(rowBySource(rows, "extensions.credBlob").status).toBe("supported");
    expect(rowBySource(rows, "extensions.previewSign")).toMatchObject({
      name: "Preview signing",
      status: "supported",
    });
    expect(rowBySource(rows, "certifications").value).toContain("FIDO L1+");
  });

  it("moves every available Yubico provider field into the vendor passport", () => {
    setAppLocale("en");
    const device = new DeviceReport({
      identity: new DeviceIdentityReport({
        vendor: DeviceVendor.DeviceVendorYubico,
        name: "YubiKey 5C Nano",
        serialNumber: "12345678",
      }),
      vendorMetadata: new DeviceVendorMetadata({
        yubico: new YubicoDeviceInfo({
          supportedUSBCapabilities:
            YubicoCapability.CapabilityU2F | YubicoCapability.CapabilityCTAP2,
          serial: 12345678,
          enabledUSBCapabilities: YubicoCapability.CapabilityCTAP2,
          formFactor: YubicoFormFactor.FormFactorUSBCNano,
          firmwareVersion: new YubicoFirmwareVersion({ major: 5, minor: 7, build: 1 }),
          autoEjectTimeout: 10,
          challengeResponseTimeout: 20,
          deviceFlags: 0x80,
          fipsCapable: YubicoCapability.CapabilityCTAP2,
          fipsApproved: YubicoCapability.$zero,
          resetBlocked: YubicoCapability.CapabilityU2F,
          unknownFields: { "153": "AQID" },
        }),
      }),
    });

    const passport = buildOverviewVendorPassport(device)!;
    const rows = buildOverviewRows({ info: info(), device });

    expect(passport.vendor).toBe("Yubico");
    expect(passport).not.toHaveProperty("model");
    expect(passport).not.toHaveProperty("modelHint");
    expect(passport.coreFacts.map((fact) => [fact.source, fact.value])).toEqual([
      ["device.identity.serialNumber", "12345678"],
      ["device.vendorMetadata.yubico.formFactor", "USB-C Nano (0x04)"],
    ]);
    expect(passport.summaryFacts.map((fact) => [fact.source, fact.value])).toEqual([
      ["device.vendorMetadata.yubico.supportedUSBCapabilities", "U2F, CTAP2 (0x0202)"],
      ["device.vendorMetadata.yubico.enabledUSBCapabilities", "CTAP2 (0x0200)"],
    ]);
    expect(passport.detailFacts).toContainEqual(
      expect.objectContaining({
        source: "device.vendorMetadata.yubico.deviceFlags",
        value: "0x80",
      }),
    );
    expect(passport.detailFacts).toContainEqual(
      expect.objectContaining({
        source: "device.vendorMetadata.yubico.unknownFields.0x99",
        value: "0x010203",
      }),
    );
    expect(
      rows.some(
        (row) =>
          row.source?.startsWith("device.identity.") ||
          row.source?.startsWith("device.vendorMetadata."),
      ),
    ).toBe(false);
  });

  it("summarizes full Token2 metadata in the vendor passport", () => {
    setAppLocale("en");
    const device = new DeviceReport({
      identity: new DeviceIdentityReport({
        vendor: DeviceVendor.DeviceVendorToken2,
        name: "Token2 Bio3 Dual A+C PIN+",
        serialNumber: "72103654095303",
      }),
      vendorMetadata: new DeviceVendorMetadata({
        token2: new Token2DeviceInfo({
          serialNumber: "72103654095303",
          release: "R3.2",
          formFactor: "Bio3 Dual A+C PIN+",
          branding: "Token2",
          productId: 0x0102,
          appearance: [1, 2, 3, 4],
          fidoVersion: new Token2FIDOVersion({ major: 2, minor: 1, patch: 0 }),
          interfaceStateKnown: true,
          fidoEnabled: true,
          hotpKeystrokeEnabled: false,
          ccidEnabled: true,
          capabilitiesKnown: true,
          fidoPINSet: true,
          fidoPINLocked: false,
          supportsHOTP: true,
          supportsTOTP: true,
          supportsNFC: true,
          supportsCCID: true,
          supportsFIDO21: true,
          hasFingerprintSensor: true,
          supportsFingerprintRegistration: true,
          supportsMandatoryFingerprint: true,
          otpRequiresFingerprint: true,
          supportsButtonHOTP: true,
          buttonHOTPConfigured: true,
          buttonHOTPSendsEnter: true,
          buttonHOTPRequiresLongPress: true,
          buttonHOTPUsesNumericKeypad: true,
        }),
      }),
    });

    const passport = buildOverviewVendorPassport(device)!;

    expect(passport.limited).toBe(false);
    expect(passport.coreFacts.map((fact) => [fact.source, fact.value])).toEqual([
      ["device.identity.serialNumber", "72103654095303"],
      ["device.vendorMetadata.token2.formFactor", "Bio3 Dual A+C PIN+"],
      ["device.vendorMetadata.token2.productId", "0x0102"],
    ]);
    expect(passport.summaryFacts.map((fact) => fact.value)).toEqual([
      "FIDO, CCID",
      "HOTP, TOTP, NFC, CCID, FIDO 2.1, Fingerprint sensor, Fingerprint registration support, Mandatory fingerprint support, Button HOTP support",
    ]);
    expect(passport.detailFacts).toContainEqual(
      expect.objectContaining({
        source: "device.vendorMetadata.token2.appearance",
        value: "0x01020304",
      }),
    );
    expect(passport.detailFacts).toContainEqual(
      expect.objectContaining({
        source: "device.vendorMetadata.token2.hotpKeystrokeEnabled",
        value: "Disabled",
      }),
    );
    expect(passport.detailFacts).toContainEqual(
      expect.objectContaining({
        source: "device.vendorMetadata.token2.buttonHOTPConfigured",
        value: "Configured",
      }),
    );
  });

  it("omits unavailable Token2 metadata groups instead of listing unknown values", () => {
    setAppLocale("en");
    const device = new DeviceReport({
      attachment: new AttachmentReport({
        id: "hid:token2",
        transport: Mode.ModeHID,
      }),
      identity: new DeviceIdentityReport({
        vendor: DeviceVendor.DeviceVendorToken2,
        name: "Token2 Mini USB-C PIN+",
        serialNumber: "72102935780528",
      }),
      vendorMetadata: new DeviceVendorMetadata({
        token2: new Token2DeviceInfo({
          serialNumber: "72102935780528",
          release: "R3.1",
          formFactor: "Mini USB-C PIN+",
          branding: "Token2",
          productId: 0x0016,
        }),
      }),
    });

    const passport = buildOverviewVendorPassport(device)!;

    expect(passport.summaryFacts).toEqual([]);
    expect(passport.detailFacts).toEqual([]);
  });

  it("limits Token2 NFC and ISO 7816 passports to the serial number", () => {
    setAppLocale("en");
    const device = new DeviceReport({
      attachment: new AttachmentReport({
        id: "smart-card:token2",
        transport: Mode.ModeSmartCard,
        smartCard: new SmartCardReport({
          reader: "Token2 NFC reader",
          interface: SmartCardInterface.SmartCardInterfaceContactless,
        }),
      }),
      identity: new DeviceIdentityReport({
        vendor: DeviceVendor.DeviceVendorToken2,
        name: "Token2 FIDO Card NFC with ISO 7816 PIN+ PIV+",
        serialNumber: "66202208969539",
      }),
      vendorMetadata: new DeviceVendorMetadata({
        token2: new Token2DeviceInfo({
          serialNumber: "66202208969539",
          release: "R3.3",
          formFactor: "FIDO Card NFC with ISO 7816 PIN+ PIV+",
          branding: "Token2",
          fidoVersion: new Token2FIDOVersion({ major: 2, minor: 1, patch: 2 }),
          interfaceStateKnown: true,
          fidoEnabled: true,
          capabilitiesKnown: true,
          supportsNFC: true,
          supportsFIDO21: true,
        }),
      }),
    });

    const passport = buildOverviewVendorPassport(device)!;

    expect(passport.limited).toBe(true);
    expect(passport.transport).toBe("NFC · ISO 7816");
    expect(passport.coreFacts.map((fact) => [fact.source, fact.value])).toEqual([
      ["device.identity.serialNumber", "66202208969539"],
    ]);
    expect(passport.summaryFacts).toEqual([]);
    expect(passport.detailFacts).toEqual([]);
  });
});
