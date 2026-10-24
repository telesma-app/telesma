import {
  DescriptorState,
  SourceState,
  YubicoSource,
  Token2Source,
  Token2Report,
} from "../../bindings/github.com/telesma-app/kit/model/report";
import { Model } from "../../bindings/github.com/telesma-app/token2";
import { testHIDDevice, testSmartCardDevice } from "../test/device";
import { afterEach, describe, expect, it } from "vitest";

import { bioSampleStatusLabel, permissionLabel, deviceName } from "$lib/format.js";
import { setAppLocale } from "$lib/i18n.js";

describe("ctapkit display labels", () => {
  afterEach(() => setAppLocale("en"));

  it("localizes symbolic and canonical permission names", () => {
    setAppLocale("ru");

    expect(permissionLabel("PermissionMakeCredential")).toBe("Создание ключа доступа");
    expect(permissionLabel("PermissionCredentialManagement")).toBe("Управление ключами доступа");
    expect(permissionLabel("credentialManagement")).toBe("Управление ключами доступа");
    expect(permissionLabel("credentialManagement,largeBlobWrite")).toBe(
      "Управление ключами доступа + Запись крупного блоба",
    );
  });

  it("localizes the MakeCredential permission", () => {
    expect(permissionLabel("makeCredential")).toBe("Create passkey");
  });

  it("localizes biometric sample statuses", () => {
    setAppLocale("ru");

    expect(bioSampleStatusLabel("LastEnrollSampleStatusFingerprintTooHigh")).toBe(
      "Приложите палец ниже",
    );
    expect(bioSampleStatusLabel("too-fast")).toBe("Держите палец на сенсоре дольше");
  });

  it("humanizes unknown future values", () => {
    expect(permissionLabel("PermissionVendorExtension")).toBe("Vendor Extension");
    expect(bioSampleStatusLabel("LastEnrollSampleStatusVendorResult")).toBe("Vendor Result");
  });
});

describe("device names", () => {
  it.each([SourceState.SourceAvailable, SourceState.SourcePartial, SourceState.SourceFailed])(
    "uses a Yubico model from usable data even when the source is %s",
    (state) => {
      const device = testHIDDevice("key", "YubiKey FIDO+CCID");
      device.sources.yubico = new YubicoSource({ state, modelName: "YubiKey 5C Nano" });
      expect(deviceName(device)).toBe("YubiKey 5C Nano");
    },
  );

  it.each([
    ["Token2", "Dual PIN+ NFC", "Token2 Dual PIN+ NFC"],
    ["Token2", "Token2 FIDO Card", "Token2 FIDO Card"],
    ["", "Mini USB-C PIN+", "Mini USB-C PIN+"],
  ])("formats Token2 catalogue fields without adding its release", (branding, formFactor, name) => {
    const device = testHIDDevice("key", "FIDO authenticator");
    device.sources.token2 = new Token2Source({
      state: SourceState.SourcePartial,
      data: new Token2Report({ model: new Model({ branding, formFactor, release: "R3.2" }) }),
    });
    expect(deviceName(device)).toBe(name);
  });

  it("finds the vendor model on a peer endpoint in the physical group", () => {
    const hid = testHIDDevice("hid", "YubiKey FIDO+CCID");
    const card = testSmartCardDevice("pcsc");
    card.sources.yubico = new YubicoSource({ modelName: "YubiKey 5C Nano" });
    expect(deviceName(hid, [hid, card])).toBe("YubiKey 5C Nano");
    expect(deviceName(card, [hid, card])).toBe("YubiKey 5C Nano");
    expect(deviceName(hid)).toBe("YubiKey FIDO+CCID");
  });

  it("uses observed USB names without guessing a vendor model", () => {
    const device = testHIDDevice("key", "USB security key");
    device.sources.token2 = new Token2Source({
      state: SourceState.SourceAvailable,
      data: new Token2Report(),
    });
    expect(deviceName(device)).toBe("USB security key");
    device.attachment.usb!.product = { state: DescriptorState.DescriptorUnknown };
    device.attachment.usb!.manufacturer = { state: DescriptorState.DescriptorRead, value: "Acme" };
    expect(deviceName(device)).toBe("Acme");
  });
});
