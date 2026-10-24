import {
  SourceState,
  YubicoSource,
  Token2Source,
  Token2Report,
} from "../../bindings/github.com/telesma-app/kit/model/report";
import { DeviceInfo, FirmwareVersion } from "../../bindings/github.com/telesma-app/yubico";
import { Model } from "../../bindings/github.com/telesma-app/token2";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthenticatorGetInfoResponse } from "../../bindings/github.com/telesma-app/ctap/protocol";
import {
  AuthenticatorStatus,
  LookupResult,
  MetadataStatement,
  PayloadEntry,
  StatusReport,
} from "../../bindings/github.com/telesma-app/mds/model";
import { setAppLocale } from "$lib/i18n";
import { buildOverviewHero } from "$lib/overview-hero";
import { testHIDDevice } from "../test/device";

describe("buildOverviewHero", () => {
  beforeEach(() => setAppLocale("en"));
  it("keeps FIDO and FIPS statements within MDS facts", () => {
    const mds = new LookupResult({
      found: true,
      entry: new PayloadEntry({
        metadataStatement: new MetadataStatement({
          authenticatorGetInfo: new AuthenticatorGetInfoResponse({
            certifications: { "FIPS-CMVP-3": 2 },
          }),
        }),
        statusReports: [
          new StatusReport({ status: AuthenticatorStatus.AuthenticatorStatusFIDOCertifiedL2 }),
        ],
      }),
    });
    expect(buildOverviewHero({ mds }).mdsStatusFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "FIDO validation", value: "FIDO_CERTIFIED_L2" }),
        expect.objectContaining({ label: "FIPS validation", value: "FIPS-CMVP-3: L2" }),
      ]),
    );
  });
  it("attributes USB naming and keeps the MDS description separate", () => {
    const device = testHIDDevice("key", "USB product");
    const mds = new LookupResult({
      found: true,
      entry: new PayloadEntry({
        metadataStatement: new MetadataStatement({ description: "MDS model family" }),
      }),
    });
    const hero = buildOverviewHero({ device, mds });
    expect(hero.title).toBe("USB product");
    expect(hero.subtitle).toBe("USB · HID");
    expect(hero.mdsName).toBe("MDS model family");
    expect(hero.mdsDescription).toContain("does not authenticate");
  });
  it("keeps the vendor model above MDS and shows serial and firmware in the hero", () => {
    const device = testHIDDevice("key", "YubiKey FIDO+CCID");
    device.sources.yubico = new YubicoSource({
      state: SourceState.SourcePartial,
      modelName: "YubiKey 5C Nano",
      data: new DeviceInfo({
        serialNumber: 1234,
        firmwareVersion: new FirmwareVersion({ major: 5, minor: 7, build: 4 }),
      }),
    });
    const mds = new LookupResult({
      found: true,
      entry: new PayloadEntry({
        metadataStatement: new MetadataStatement({ description: "YubiKey 5 Series" }),
      }),
    });
    const hero = buildOverviewHero({ device, mds });
    expect(hero.title).toBe("YubiKey 5C Nano");
    expect(hero.mdsName).toBe("YubiKey 5 Series");
    expect(hero.serialNumber).toBe("1234");
    expect(hero.versionBadge).toBe("Firmware 5.7.4");
  });

  it("shows Token2 release as a hardware revision independently of firmware", () => {
    const device = testHIDDevice("key", "FIDO key");
    device.sources.token2 = new Token2Source({
      state: SourceState.SourcePartial,
      data: new Token2Report({
        model: new Model({ branding: "Token2", formFactor: "Dual PIN+ NFC", release: "R3.2" }),
      }),
    });
    const hero = buildOverviewHero({ device });
    expect(hero.title).toBe("Token2 Dual PIN+ NFC");
    expect(hero.versionBadge).toBe("Hardware release R3.2");
  });

  it("retains the MDS entry during refresh and exposes a refresh failure", () => {
    const mds = new LookupResult({
      found: true,
      entry: new PayloadEntry({
        metadataStatement: new MetadataStatement({ description: "Retained model" }),
      }),
    });
    expect(buildOverviewHero({ mds, mdsLoading: true }).mdsName).toBe("Retained model");
    expect(buildOverviewHero({ mds, mdsError: "HTTP 503" }).mdsRefreshMessage).toContain(
      "HTTP 503",
    );
  });
});
