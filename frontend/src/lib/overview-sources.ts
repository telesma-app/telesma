import { DescriptorState } from "../../bindings/github.com/telesma-app/kit/model/report";
import {
  SourceState,
  SourceReason,
  type EndpointReport,
  type USBReport,
  type Outcome,
} from "../../bindings/github.com/telesma-app/kit/model/report";
import {
  Capability,
  FormFactor,
  type DeviceInfo as YubicoDeviceInfo,
} from "../../bindings/github.com/telesma-app/yubico";
import {
  TransferType,
  DeviceConfiguration,
  DeviceExtension,
} from "../../bindings/github.com/telesma-app/token2";
import { m } from "../paraglide/messages.js";
import { failureMessage } from "$lib/failure";
import { Mode } from "../../bindings/github.com/telesma-app/kit/transport";
import type { OverviewVendorFact, OverviewVendorPassportPresentation } from "$lib/overview-types";

export type SourceFact = {
  label: string;
  value: string;
  source: string;
  status?: string;
  message?: string;
  endpoint?: string;
};
export type SourcePanel = {
  id: string;
  title: string;
  description: string;
  status: string;
  message: string;
  failed: boolean;
  facts: SourceFact[];
};

export function sourceStateLabel(state: SourceState) {
  switch (state) {
    case SourceState.SourceAvailable:
      return m.source_available();
    case SourceState.SourcePartial:
      return m.source_partial();
    case SourceState.SourceLoading:
      return m.source_loading();
    case SourceState.SourceAbsent:
      return m.source_absent();
    case SourceState.SourceUnavailable:
      return m.source_unavailable();
    case SourceState.SourceUnsupported:
      return m.source_unsupported();
    case SourceState.SourceFailed:
      return m.source_failed();
    case SourceState.SourceNotRequested:
    case SourceState.$zero:
      return m.source_not_requested();
  }
}

export function sourceMessage(outcome: Outcome) {
  if (outcome.state === SourceState.SourcePartial) return m.source_partial_description();
  if (outcome.error) return failureMessage(outcome.error);
  switch (outcome.reason) {
    case SourceReason.ReasonTransport:
      return m.source_reason_transport();
    case SourceReason.ReasonAdapterMissing:
      return m.source_reason_adapter();
    case SourceReason.ReasonAAGUIDMissing:
      return m.source_reason_aaguid();
    case SourceReason.ReasonVendorMismatch:
      return m.source_reason_vendor_mismatch();
    case SourceReason.ReasonVendorUnknown:
      return m.source_reason_vendor_unknown();
    default:
      return "";
  }
}

function panel(
  id: string,
  title: string,
  description: string,
  outcome: Outcome,
  facts: SourceFact[],
): SourcePanel {
  return {
    id,
    title,
    description,
    status: sourceStateLabel(outcome.state),
    message: sourceMessage(outcome),
    failed: outcome.state === SourceState.SourceFailed,
    facts,
  };
}

export function buildAttachmentPanel(
  device: EndpointReport,
  endpoints: EndpointReport[] = [device],
): SourcePanel {
  const { attachment } = device;
  const facts: SourceFact[] = [];
  if (attachment.usb) {
    const usb = attachment.usb;
    facts.push(
      descriptorFact(m.source_usb_manufacturer(), usb.manufacturer, "attachment.usb.manufacturer"),
      descriptorFact(m.source_usb_product(), usb.product, "attachment.usb.product"),
      descriptorFact(m.source_usb_serial(), usb.reportedSerial, "attachment.usb.reportedSerial"),
      descriptorFact("VID", usb.vendorId, "attachment.usb.vendorId"),
      descriptorFact("PID", usb.productId, "attachment.usb.productId"),
    );
  }
  if (attachment.smartCard) {
    const card = attachment.smartCard;
    facts.push(
      fact(m.matrix_name_smart_card_reader(), card.reader, "attachment.smartCard.reader"),
      fact(m.source_interface(), card.interface, "attachment.smartCard.interface"),
      {
        ...fact(
          "FIDO application",
          sourceStateLabel(card.fidoApplication.state),
          "attachment.smartCard.fidoApplication",
        ),
        message: sourceMessage(card.fidoApplication),
      },
    );
  }
  for (const [index, endpoint] of endpoints.entries()) {
    const peer = endpoint.attachment;
    if (peer.id === attachment.id) continue;
    const source = `endpoints[${index}].attachment`;
    facts.push(fact(m.source_interface(), String(peer.transport), `${source}.transport`));
    if (peer.smartCard) {
      facts.push(
        fact(
          m.matrix_name_smart_card_reader(),
          peer.smartCard.reader,
          `${source}.smartCard.reader`,
        ),
        {
          ...fact(
            "FIDO application",
            sourceStateLabel(peer.smartCard.fidoApplication.state),
            `${source}.smartCard.fidoApplication`,
          ),
          message: sourceMessage(peer.smartCard.fidoApplication),
        },
      );
    }
  }
  return {
    id: "attachment",
    title: m.source_attachment_title(),
    description: m.source_attachment_description(),
    status: String(attachment.transport),
    message: "",
    failed: false,
    facts,
  };
}

function descriptorFact(
  label: string,
  descriptor: USBReport["product"] | USBReport["vendorId"],
  source: string,
): SourceFact {
  return {
    label,
    source,
    value:
      descriptor.state === DescriptorState.DescriptorRead
        ? typeof descriptor.value === "number"
          ? hex(descriptor.value, 4)
          : descriptor.value === ""
            ? m.source_empty_value()
            : descriptor.value!
        : m.not_reported(),
    status:
      descriptor.state === DescriptorState.DescriptorRead
        ? m.source_available()
        : descriptor.state === DescriptorState.DescriptorFailed
          ? m.source_failed()
          : m.source_not_reported_by_platform(),
    message: descriptor.error?.message,
  };
}

export function buildFIDOPanels(device: EndpointReport): SourcePanel[] {
  const init = device.sources.hidInit;
  const info = device.sources.getInfo;
  return [
    panel(
      "hidInit",
      "CTAPHID INIT",
      m.source_init_description(),
      init,
      init.data
        ? [
            fact(
              m.source_protocol_version(),
              init.data.CTAPHIDProtocolVersionIdentifier,
              "sources.hidInit.data.CTAPHIDProtocolVersionIdentifier",
            ),
            fact(
              m.source_init_version(),
              `${init.data.MajorDeviceVersion}.${init.data.MinorDeviceVersion}.${init.data.BuildDeviceVersion}`,
              "sources.hidInit.data.*DeviceVersion",
            ),
            fact(
              m.source_capability_flags(),
              hex(init.data.CapabilityFlags),
              "sources.hidInit.data.CapabilityFlags",
            ),
          ]
        : [],
    ),
    panel(
      "getInfo",
      "FIDO GetInfo",
      m.source_getinfo_description(),
      info,
      info.data
        ? [
            fact("AAGUID", info.data.aaguid, "sources.getInfo.data.aaguid"),
            fact(
              m.matrix_name_reported_versions(),
              info.data.versions.join(", "),
              "sources.getInfo.data.versions",
            ),
            ...(info.data.firmwareVersion != null
              ? [
                  fact(
                    m.matrix_name_firmware_version(),
                    info.data.firmwareVersion,
                    "sources.getInfo.data.firmwareVersion",
                  ),
                ]
              : []),
          ]
        : [],
    ),
  ];
}

export function buildVendorPanels(device: EndpointReport, advanced = true): SourcePanel[] {
  const { yubico, token2 } = device.sources;
  const yubicoFacts = yubico.data ? buildYubicoFacts(yubico.data) : [];
  const token2Facts: SourceFact[] = [];
  if (token2.data) {
    const data = token2.data;
    const endpoint = device.attachment.id;
    const transport = device.attachment.transport === "smart-card" ? "pcsc" : "hid";
    const serial = data.serialNumber;
    if (serial.value != null || serial.error) {
      token2Facts.push({
        ...fact(
          `${m.matrix_name_device_serial()} · ${transport}`,
          serial.value ?? m.not_reported(),
          "sources.token2.data.serialNumber",
        ),
        status: serial.error ? m.source_failed() : m.source_available(),
        message: serial.error?.message,
        endpoint,
      });
    }
    const atr = data.atr;
    if (atr.value || atr.error) {
      token2Facts.push({
        ...fact(
          `ATR · ${transport === "hid" ? "ctaphid" : transport}`,
          atr.value
            ? Array.from(atob(atr.value.raw), (byte) =>
                byte.charCodeAt(0).toString(16).padStart(2, "0"),
              ).join(" ")
            : m.not_reported(),
          "sources.token2.data.atr",
        ),
        status: atr.error ? m.source_failed() : m.source_available(),
        message:
          atr.error?.message ??
          (atr.value && !atr.value.identity ? m.source_reason_atr_identity() : ""),
        endpoint,
      });
    }
    const reading = data.configuration;
    if (reading.value || reading.error) {
      const source = "sources.token2.data.configuration";
      token2Facts.push({
        ...fact(
          `${m.source_configuration()} · ${transport}`,
          reading.value ? m.source_available() : m.not_reported(),
          source,
        ),
        status: reading.error ? m.source_failed() : m.source_available(),
        message: reading.error?.message,
        endpoint,
      });
      const configuration = reading.value;
      if (configuration) {
        token2Facts.push(
          fact(
            m.overview_vendor_enabled_interfaces(),
            [
              !(configuration.transferType & TransferType.TransferTypeFIDODisabledMask) && "FIDO",
              !(configuration.transferType & TransferType.TransferTypeHOTPKeystrokeDisabledMask) &&
                "HOTP keystroke",
              !(configuration.transferType & TransferType.TransferTypeCCIDDisabledMask) && "CCID",
            ]
              .filter(Boolean)
              .join(", ") || m.matrix_value_empty_list(),
            `${source}.value.transferType`,
          ),
        );
        if (atob(configuration.raw).length > 1) {
          const flags = configuration.deviceConfiguration;
          const extensions = configuration.deviceExtension;
          token2Facts.push(
            fact(
              m.overview_vendor_supported_capabilities(),
              [
                flags & DeviceConfiguration.DeviceConfigurationHOTPMask && "HOTP",
                extensions & DeviceExtension.DeviceExtensionTOTPMask && "TOTP",
                flags & DeviceConfiguration.DeviceConfigurationNFCMask && "NFC",
                extensions & DeviceExtension.DeviceExtensionCCIDMask && "CCID",
                extensions & DeviceExtension.DeviceExtensionFIDO21Mask && "FIDO 2.1",
                flags & DeviceConfiguration.DeviceConfigurationFingerprintSensorMask &&
                  m.matrix_name_token2_fingerprint_sensor(),
                extensions & DeviceExtension.DeviceExtensionFingerprintRegistrationMask &&
                  m.matrix_name_token2_fingerprint_registration(),
                extensions & DeviceExtension.DeviceExtensionMandatoryFingerprintSupportMask &&
                  m.matrix_name_token2_mandatory_fingerprint(),
                !(extensions & DeviceExtension.DeviceExtensionButtonHOTPUnsupportedMask) &&
                  m.matrix_name_token2_button_hotp(),
              ]
                .filter(Boolean)
                .join(", ") || m.matrix_value_empty_list(),
              `${source}.value.deviceConfiguration + deviceExtension`,
            ),
          );
        }
      }
    }
  }
  const panels = [
    panel("yubico", "Yubico management", m.source_management_description(), yubico, yubicoFacts),
    panel("token2", "Token2 management", m.source_management_description(), token2, token2Facts),
  ];
  for (const item of panels) {
    item.id += `:${device.attachment.id}`;
    item.title += ` · ${device.attachment.transport === "smart-card" ? "PC/SC" : "HID"}`;
  }
  if (advanced) return panels;
  return panels.filter((item) => {
    const source = item.id.startsWith("yubico:") ? yubico : token2;
    return (
      source.data ||
      (source.reason !== SourceReason.ReasonVendorMismatch &&
        source.reason !== SourceReason.ReasonVendorUnknown &&
        source.reason !== SourceReason.ReasonAdapterMissing)
    );
  });
}

function buildYubicoFacts(data: YubicoDeviceInfo): SourceFact[] {
  const facts: SourceFact[] = [];
  const add = (
    key: keyof YubicoDeviceInfo,
    label: string,
    value: string | number | boolean | null | undefined,
  ) => {
    if (value != null) facts.push(fact(label, value, `sources.yubico.data.${key}`));
  };
  add("serialNumber", m.matrix_name_device_serial(), data.serialNumber);
  add(
    "firmwareVersion",
    m.matrix_name_device_firmware(),
    `${data.firmwareVersion.major}.${data.firmwareVersion.minor}.${data.firmwareVersion.build}`,
  );
  add("partNumber", m.matrix_name_yubico_part_number(), data.partNumber);
  add("formFactor", m.matrix_name_yubico_form_factor(), yubicoFormFactor(data.formFactor));
  add(
    "supportedUSBCapabilities",
    m.matrix_name_supported_applications({ interface: "USB" }),
    yubicoApplications(data.supportedUSBCapabilities),
  );
  add(
    "enabledUSBCapabilities",
    m.matrix_name_enabled_applications({ interface: "USB" }),
    data.enabledUSBCapabilities == null
      ? undefined
      : yubicoApplications(data.enabledUSBCapabilities),
  );
  add(
    "supportedNFCCapabilities",
    m.matrix_name_supported_applications({ interface: "NFC" }),
    data.supportedNFCCapabilities == null
      ? undefined
      : yubicoApplications(data.supportedNFCCapabilities),
  );
  add(
    "enabledNFCCapabilities",
    m.matrix_name_enabled_applications({ interface: "NFC" }),
    data.enabledNFCCapabilities == null
      ? undefined
      : yubicoApplications(data.enabledNFCCapabilities),
  );
  return facts;
}

function fact(label: string, value: string | number | boolean, source: string): SourceFact {
  return { label, value: String(value), source };
}
function hex(value: number, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function yubicoApplications(value: Capability) {
  const applications = [
    [Capability.CapabilityOTP, "OTP"],
    [Capability.CapabilityU2F, "U2F"],
    [Capability.CapabilityCCID, "CCID"],
    [Capability.CapabilityOpenPGP, "OpenPGP"],
    [Capability.CapabilityPIV, "PIV"],
    [Capability.CapabilityOATH, "OATH"],
    [Capability.CapabilityHSMAuth, "HSM Auth"],
    [Capability.CapabilityCTAP2, "CTAP2"],
  ]
    .filter(([bit]) => value & Number(bit))
    .map(([, name]) => name);
  return applications.join(", ") || m.matrix_value_empty_list();
}

function yubicoFormFactor(value: FormFactor) {
  switch (value) {
    case FormFactor.FormFactorUSBAKeychain:
      return "USB-A keychain";
    case FormFactor.FormFactorUSBANano:
      return "USB-A Nano";
    case FormFactor.FormFactorUSBCKeychain:
      return "USB-C keychain";
    case FormFactor.FormFactorUSBCNano:
      return "USB-C Nano";
    case FormFactor.FormFactorUSBCLightning:
      return "USB-C + Lightning";
    case FormFactor.FormFactorUSBABiometricKeychain:
      return "USB-A biometric keychain";
    case FormFactor.FormFactorUSBCBiometricKeychain:
      return "USB-C biometric keychain";
    default:
      return hex(value);
  }
}

export function buildOverviewVendorPassport(
  endpoints: EndpointReport[],
): OverviewVendorPassportPresentation | null {
  const coreFacts: OverviewVendorFact[] = [];
  const summaryFacts: OverviewVendorFact[] = [];
  const detailFacts: OverviewVendorFact[] = [];
  const vendors = new Set<string>();
  const transports = new Set<string>();
  const hasVendorData = endpoints.some(
    (endpoint) =>
      endpoint.sources.yubico.data ||
      endpoint.sources.yubico.modelName ||
      endpoint.sources.token2.data,
  );

  function add(facts: OverviewVendorFact[], label: string, value: string, source: string) {
    if (!value.trim() || facts.some((item) => item.label === label && item.value === value)) return;

    facts.push({ label, value, source });
  }

  function detail(item: SourceFact, prefix: string) {
    const value =
      item.value === m.not_reported() ||
      item.value === m.source_empty_value() ||
      item.value === m.source_not_requested() ||
      item.value === m.source_unavailable() ||
      item.value === m.source_unsupported() ||
      item.value === m.source_absent() ||
      item.value === m.source_loading()
        ? ""
        : item.value;
    add(
      detailFacts,
      item.label,
      [value, item.message].filter(Boolean).join(" · "),
      `${prefix}.${item.source}`,
    );
  }

  for (const [index, endpoint] of endpoints.entries()) {
    const prefix = `endpoints[${index}]`;
    const { yubico, token2 } = endpoint.sources;
    transports.add(
      endpoint.attachment.transport === Mode.ModeSmartCard
        ? "PC/SC"
        : endpoint.attachment.transport === Mode.ModeWindowsProxy
          ? "Windows"
          : "USB · HID",
    );
    if (yubico.data || yubico.modelName) vendors.add("Yubico");
    if (token2.data) vendors.add("Token2");

    for (const item of buildAttachmentPanel(endpoint).facts) {
      detail(item, prefix);
      if (
        !hasVendorData &&
        item.source.startsWith("attachment.usb.") &&
        item.status === m.source_available() &&
        item.value !== m.source_empty_value() &&
        !item.source.endsWith("vendorId") &&
        !item.source.endsWith("productId")
      ) {
        add(coreFacts, item.label, item.value, `${prefix}.${item.source}`);
      }
    }

    for (const panel of buildVendorPanels(endpoint, false)) {
      for (const item of panel.facts) {
        if (
          item.source === "sources.yubico.data.formFactor" &&
          yubico.data?.formFactor === FormFactor.FormFactorUnknown
        )
          continue;
        if (item.source === "sources.yubico.data.firmwareVersion" && item.value === "0.0.0")
          continue;

        const serial = item.source.endsWith("serialNumber");
        const core =
          serial || item.source.endsWith("formFactor") || item.source.endsWith("partNumber");
        const summary =
          item.source.endsWith("Capabilities") ||
          item.source.endsWith("transferType") ||
          item.source.endsWith("deviceConfiguration + deviceExtension");
        if (core && item.value !== m.not_reported()) {
          add(
            coreFacts,
            serial ? m.matrix_name_device_serial() : item.label,
            item.value,
            `${prefix}.${item.source}`,
          );
        } else if (summary) {
          add(summaryFacts, item.label, item.value, `${prefix}.${item.source}`);
        }
        if ((!core && !summary) || item.message) detail(item, prefix);
      }
    }

    const model = token2.data?.model;
    if (model) {
      add(
        coreFacts,
        m.matrix_name_token2_form_factor(),
        model.formFactor,
        `${prefix}.sources.token2.data.model.formFactor`,
      );
      add(
        coreFacts,
        m.matrix_name_token2_release(),
        model.release,
        `${prefix}.sources.token2.data.model.release`,
      );
      add(
        detailFacts,
        m.matrix_name_token2_branding(),
        model.branding,
        `${prefix}.sources.token2.data.model.branding`,
      );
    }
    if (yubico.modelName)
      add(
        detailFacts,
        m.matrix_name_device_model(),
        yubico.modelName,
        `${prefix}.sources.yubico.modelName`,
      );

    for (const panel of buildFIDOPanels(endpoint)) {
      for (const item of panel.facts) detail(item, prefix);
    }
    for (const key of ["hidInit", "getInfo", "yubico", "token2"] as const) {
      const outcome = endpoint.sources[key];
      if (outcome.error || outcome.state === SourceState.SourceFailed) {
        add(
          detailFacts,
          key === "yubico"
            ? "Yubico management"
            : key === "token2"
              ? "Token2 management"
              : key === "getInfo"
                ? "FIDO GetInfo"
                : "CTAPHID INIT",
          outcome.error
            ? failureMessage(outcome.error)
            : sourceMessage(outcome) || m.source_failed(),
          `${prefix}.sources.${key}.error`,
        );
      }
    }
  }

  if (!coreFacts.length && !summaryFacts.length && !detailFacts.length) return null;

  return {
    vendor: [...vendors].join(" · "),
    transport: [...transports].join(" · "),
    limited: false,
    scopeNote: "",
    coreFacts,
    summaryFacts,
    detailFacts,
  };
}
