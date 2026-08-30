import {
  FactID,
  FactOrigin,
  FactState,
  FactValueKind,
  type Fact,
} from "../../bindings/github.com/telesma-app/kit/model/inspect";
import {
  DeviceVendor,
  type DeviceReport,
} from "../../bindings/github.com/telesma-app/kit/model/report";
import { Mode, SmartCardInterface } from "../../bindings/github.com/telesma-app/kit/transport";
import type { DeviceInfo as Token2DeviceInfo } from "../../bindings/github.com/telesma-app/token2";
import {
  Capability,
  FormFactor,
  ReleaseType,
  type DeviceInfo as YubicoDeviceInfo,
  type FirmwareVersion as YubicoFirmwareVersion,
} from "../../bindings/github.com/telesma-app/yubico";

import {
  buildOverviewFactLookup,
  factBoolean,
  factInteger,
  factList,
  factText,
  factUnit,
  factUsesSpecDefault,
  overviewFact,
  overviewFactStatus,
  type OverviewFactLookup,
} from "$lib/overview-facts.js";
import { m, value } from "$lib/overview-i18n.js";
import { EXTENSION_ROWS, formatCertificationValue } from "$lib/overview-matrix-rules.js";
import { compactSecretValue, inlineList } from "$lib/overview-raw-format.js";
import { row } from "$lib/overview-shared.js";
import type {
  MessageText,
  OverviewContext,
  OverviewRow,
  OverviewRowStatus,
  OverviewVendorFact,
  OverviewVendorPassportPresentation,
} from "$lib/overview-types.js";
import { algorithmLabel, formatNumberWithUnit, textValue } from "$lib/overview-utils.js";

const configCommandNames = new Map<string, string>([
  ["1", "enableEnterpriseAttestation"],
  ["2", "toggleAlwaysUv"],
  ["3", "setMinPINLength"],
  ["4", "enableLongTouchForReset"],
  ["255", "vendorPrototype"],
]);

const extensionFactIDs = {
  credProtect: FactID.FactIDExtensionCredProtect,
  credBlob: FactID.FactIDExtensionCredBlob,
  largeBlobKey: FactID.FactIDExtensionLargeBlobKey,
  largeBlob: FactID.FactIDExtensionLargeBlob,
  minPinLength: FactID.FactIDExtensionMinPINLength,
  pinComplexityPolicy: FactID.FactIDExtensionPINComplexityPolicy,
  "hmac-secret": FactID.FactIDExtensionHMACSecret,
  "hmac-secret-mc": FactID.FactIDExtensionHMACSecretMC,
  thirdPartyPayment: FactID.FactIDExtensionThirdPartyPayment,
  previewSign: FactID.FactIDExtensionPreviewSign,
} as const;

export function buildOverviewRows(
  context: OverviewContext = {},
  factLookup?: OverviewFactLookup,
): OverviewRow[] {
  const info = context.info;

  if (!info) return [];

  const device = context.device ?? null;
  const bioSensor = context.bioSensor ?? null;
  const facts = factLookup ?? buildOverviewFactLookup(info.assessment);

  return [
    localizedFactRow(
      facts,
      FactID.FactIDAAGUID,
      "Identity",
      m.matrix_name_aaguid,
      m.matrix_desc_aaguid_model,
    ),
    row(
      "Identity",
      m.matrix_name_attachment_id,
      m.matrix_desc_attachment_id,
      valueStatus(device?.attachment.id),
      textValue(device?.attachment.id, value.notReported()),
      "device.attachment.id",
    ),
    transportRow(facts, device),
    ...connectionRows(device),
    localizedFactRow(
      facts,
      FactID.FactIDPlatformAttachment,
      "Identity",
      m.matrix_name_platform_attachment,
      m.matrix_desc_platform_attachment,
    ),
    secretFactRow(
      facts,
      FactID.FactIDEncryptedDeviceIdentifier,
      "Identity",
      m.matrix_name_encrypted_device_identifier,
      m.matrix_desc_encrypted_device_identifier,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDVersions,
      "Protocol",
      m.matrix_name_reported_versions,
      m.matrix_desc_versions,
    ),
    versionRow(facts, FactID.FactIDVersionU2FV2, "U2F", m.matrix_desc_u2f, "U2F_V2"),
    versionRow(facts, FactID.FactIDVersionFIDO20, "FIDO 2.0", m.matrix_desc_fido20, "FIDO_2_0"),
    versionRow(
      facts,
      FactID.FactIDVersionFIDO21Preview,
      "FIDO 2.1 Preview",
      m.matrix_desc_fido21_preview,
      "FIDO_2_1_PRE",
    ),
    versionRow(facts, FactID.FactIDVersionFIDO21, "FIDO 2.1", m.matrix_desc_fido21, "FIDO_2_1"),
    versionRow(facts, FactID.FactIDVersionFIDO23, "FIDO 2.3", m.matrix_desc_fido23, "FIDO_2_3"),
    algorithmsRow(facts),

    userPresenceRow(facts),
    localizedFactRow(
      facts,
      FactID.FactIDResidentCredentials,
      "Verification",
      m.matrix_name_discoverable_credentials,
      m.matrix_desc_rk,
    ),
    clientPINRow(facts),
    userVerificationRow(facts),
    localizedFactRow(
      facts,
      FactID.FactIDPinUvAuthToken,
      "Verification",
      m.matrix_name_pin_uv_auth_token_permissions,
      m.matrix_desc_pin_uv_auth_token,
    ),
    clientPINMCGAPermissionsRow(facts),
    localizedFactRow(
      facts,
      FactID.FactIDPinUvAuthProtocols,
      "Verification",
      m.matrix_name_pin_uv_auth_protocols,
      m.matrix_desc_pin_uv_protocols,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDBioEnrollment,
      "Verification",
      m.matrix_name_biometric_enrollment,
      m.matrix_desc_bio_enroll,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDBioEnrollmentPreview,
      "Verification",
      m.matrix_name_biometric_enrollment_preview,
      m.matrix_desc_bio_enroll_preview,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDUvBioEnroll,
      "Verification",
      m.matrix_name_uv_biometric_enrollment_permission,
      m.matrix_desc_uv_bio_enroll,
    ),
    row(
      "Verification",
      m.matrix_name_biometric_modality,
      m.matrix_desc_bio_modality,
      valueStatus(bioSensor?.modality),
      textValue(bioSensor?.modality, value.notReported()),
      "bioSensor.modality",
    ),
    localizedFactRow(
      facts,
      FactID.FactIDUvModality,
      "Verification",
      m.matrix_name_uv_modality_bit_flags,
      m.matrix_desc_uv_modality,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDPreferredPlatformUVAttempts,
      "Verification",
      m.matrix_name_preferred_platform_uv_attempts,
      m.matrix_desc_preferred_platform_uv_attempts,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDUVCountSinceLastPINEntry,
      "Verification",
      m.matrix_name_uv_count_since_last_pin_entry,
      m.matrix_desc_uv_count_since_last_pin_entry,
    ),

    largeBlobsRow(facts),
    largeBlobKeyRow(facts),
    localizedFactRow(
      facts,
      FactID.FactIDMaxSerializedLargeBlobArray,
      "Storage",
      m.matrix_name_serialized_large_blob_array_limit,
      m.matrix_desc_large_blob_capacity,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDMaxCredBlobLength,
      "Storage",
      m.matrix_name_max_credblob_length,
      m.matrix_desc_max_credblob_length,
    ),
    secretFactRow(
      facts,
      FactID.FactIDEncryptedCredentialStoreState,
      "Storage",
      m.matrix_name_encrypted_credential_store_state,
      m.matrix_desc_encrypted_credential_store_state,
    ),

    localizedFactRow(
      facts,
      FactID.FactIDCredentialManagement,
      "Management",
      m.matrix_name_credential_management,
      m.matrix_desc_cred_mgmt,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDCredentialManagementPreview,
      "Management",
      m.matrix_name_credential_management_preview,
      m.matrix_desc_cred_mgmt_preview,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDCredentialManagementReadOnly,
      "Management",
      m.matrix_name_credential_management_read_only,
      m.matrix_desc_cred_mgmt_ro,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDAuthenticatorConfig,
      "Management",
      m.matrix_name_authenticator_config,
      m.matrix_desc_authnr_cfg,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDUvAuthenticatorConfig,
      "Management",
      m.matrix_name_uv_authenticator_config_permission,
      m.matrix_desc_uv_acfg,
    ),
    configCommandsRow(facts),
    vendorConfigCommandsRow(facts),
    localizedFactRow(
      facts,
      FactID.FactIDLongTouchForReset,
      "Management",
      m.matrix_name_long_touch_for_reset,
      m.matrix_desc_long_touch_for_reset,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDTransportsForReset,
      "Management",
      m.matrix_name_reset_transports,
      m.matrix_desc_reset_transports,
    ),

    localizedFactRow(
      facts,
      FactID.FactIDEnterpriseAttestation,
      "Policy",
      m.matrix_name_enterprise_attestation,
      m.matrix_desc_ep,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDAlwaysUV,
      "Policy",
      m.matrix_name_always_require_uv,
      m.matrix_desc_always_uv,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDSetMinPINLength,
      "Policy",
      m.matrix_name_set_minimum_pin_length,
      m.matrix_desc_set_min_pin_length,
    ),
    makeCredentialUVRow(facts),
    forcePINChangeRow(facts),
    localizedFactRow(
      facts,
      FactID.FactIDPINComplexityPolicy,
      "Policy",
      m.matrix_name_pin_complexity_policy,
      m.matrix_desc_pin_complexity_policy,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDPINComplexityPolicyURL,
      "Policy",
      m.matrix_name_pin_complexity_policy_url,
      m.matrix_desc_pin_complexity_policy_url,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDMaxRPIDsForSetMinPINLength,
      "Policy",
      m.matrix_name_rp_ids_for_minimum_pin_length,
      m.matrix_desc_max_rpids_for_set_min_pin_length,
    ),

    ...EXTENSION_ROWS.map((entry) =>
      extensionRow(facts, extensionFactIDs[entry.id], entry.name, entry.description, entry.id),
    ),

    localizedFactRow(
      facts,
      FactID.FactIDEffectiveMaxMessageSize,
      "Limits",
      m.matrix_name_max_message_size,
      m.matrix_desc_max_msg_size,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDMaxCredentialCountInList,
      "Limits",
      m.matrix_name_max_credential_list_count,
      m.matrix_desc_max_credential_list_count,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDMaxCredentialIDLength,
      "Limits",
      m.matrix_name_max_credential_id_length,
      m.matrix_desc_max_credential_id_length,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDEffectiveMinPINLength,
      "Limits",
      m.matrix_name_minimum_pin_length,
      m.matrix_desc_min_pin_length,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDEffectiveMaxPINLength,
      "Limits",
      m.matrix_name_maximum_pin_length,
      m.matrix_desc_max_pin,
    ),
    localizedFactRow(
      facts,
      FactID.FactIDRemainingDiscoverableCredentials,
      "Limits",
      m.matrix_name_remaining_discoverable_credentials,
      m.matrix_desc_remaining_discoverable_credentials,
    ),

    attestationFormatsRow(facts),
    certificationsRow(facts),
    localizedFactRow(
      facts,
      FactID.FactIDFirmwareVersion,
      "Attestation",
      m.matrix_name_firmware_version,
      m.matrix_desc_firmware_version,
    ),
  ];
}

function localizedFactRow(
  facts: OverviewFactLookup,
  id: FactID,
  group: string,
  name: MessageText,
  description: MessageText,
) {
  const fact = overviewFact(facts, id);

  return row(
    group,
    name,
    description,
    overviewFactStatus(fact),
    formatFactValue(fact),
    fact.source,
  );
}

function secretFactRow(
  facts: OverviewFactLookup,
  id: FactID,
  group: string,
  name: MessageText,
  description: MessageText,
) {
  const fact = overviewFact(facts, id);
  const factValue =
    fact.state === FactState.FactStateUnknown
      ? value.notReported()
      : compactSecretValue(factText(fact));

  return row(group, name, description, overviewFactStatus(fact), factValue, fact.source);
}

function formatFactValue(fact: Fact): string {
  if (fact.state === FactState.FactStateUnknown) return value.notReported();

  switch (fact.value.kind) {
    case FactValueKind.FactValueBoolean: {
      const input = factBoolean(fact);

      if (input === undefined) return value.notReported();

      if (factUsesSpecDefault(fact)) return input ? value.defaultTrue() : value.defaultFalse();

      return String(input);
    }
    case FactValueKind.FactValueInteger: {
      const input = factInteger(fact);

      if (input === undefined) return value.notReported();

      const unit = factUnit(fact);

      if (factUsesSpecDefault(fact)) {
        if (unit === "bytes") return value.defaultBytes(input);

        if (unit === "codePoints") return value.defaultCodePoints(input);
      }

      return formatNumberWithUnit(input, unit);
    }
    case FactValueKind.FactValueText:
      return textValue(factText(fact), value.notReported());
    case FactValueKind.FactValueList:
      return inlineList(factList(fact) ?? [], value.emptyList());
    default:
      throw new Error(`Unexpected value kind for Overview fact ${fact.id}: ${fact.value.kind}`);
  }
}

function transportRow(facts: OverviewFactLookup, device: DeviceReport | null) {
  const fact = overviewFact(facts, FactID.FactIDTransports);

  if (fact.state !== FactState.FactStateUnknown) {
    return row(
      "Identity",
      m.matrix_name_transport,
      m.matrix_desc_transport_getinfo,
      overviewFactStatus(fact),
      formatFactValue(fact),
      fact.source,
    );
  }

  const transport = device?.attachment.transport;

  return row(
    "Identity",
    m.matrix_name_transport,
    m.matrix_desc_transport_fallback,
    valueStatus(transport),
    textValue(transport, value.notReported()),
    fact.source,
  );
}

function versionRow(
  facts: OverviewFactLookup,
  id: FactID,
  name: string,
  description: MessageText,
  version: string,
) {
  const fact = overviewFact(facts, id);

  return row(
    "Protocol",
    name,
    description,
    overviewFactStatus(fact),
    formatProtocolVersion(version),
    fact.source,
  );
}

function algorithmsRow(facts: OverviewFactLookup) {
  const fact = overviewFact(facts, FactID.FactIDAlgorithms);
  const formatted =
    fact.state === FactState.FactStateUnknown
      ? value.notReported()
      : inlineList((factList(fact) ?? []).map(formatCanonicalAlgorithm), value.emptyList());

  return row(
    "Protocol",
    m.matrix_name_reported_cose_algorithms,
    m.matrix_desc_algorithms,
    overviewFactStatus(fact),
    formatted,
    fact.source,
  );
}

function formatCanonicalAlgorithm(input: string) {
  const separator = input.lastIndexOf(":");

  if (separator < 0) return input;

  const type = input.slice(0, separator);
  const algorithm = Number(input.slice(separator + 1));

  return Number.isSafeInteger(algorithm) ? `${algorithmLabel(algorithm)} / ${type}` : input;
}

function userPresenceRow(facts: OverviewFactLookup) {
  const fact = overviewFact(facts, FactID.FactIDUserPresence);
  const present = fact.state === FactState.FactStateUnknown ? undefined : factBoolean(fact);

  return row(
    "Verification",
    m.matrix_name_user_presence_touch,
    present === false ? m.matrix_desc_up_false : m.matrix_desc_up_true,
    overviewFactStatus(fact),
    formatFactValue(fact),
    fact.source,
  );
}

function clientPINRow(facts: OverviewFactLookup) {
  const fact = overviewFact(facts, FactID.FactIDClientPIN);
  const description =
    fact.state === FactState.FactStateConfigured
      ? m.matrix_desc_client_pin_set
      : fact.state === FactState.FactStateNotConfigured
        ? m.matrix_desc_client_pin_not_set
        : m.matrix_desc_client_pin_absent;
  const factValue =
    fact.state === FactState.FactStateConfigured
      ? value.pinSet()
      : fact.state === FactState.FactStateNotConfigured
        ? value.pinNotSet()
        : formatFactValue(fact);

  return row(
    "Verification",
    m.matrix_name_client_pin,
    description,
    overviewFactStatus(fact),
    factValue,
    fact.source,
  );
}

function userVerificationRow(facts: OverviewFactLookup) {
  const fact = overviewFact(facts, FactID.FactIDUserVerification);
  const description =
    fact.state === FactState.FactStateConfigured
      ? m.matrix_desc_uv_configured
      : fact.state === FactState.FactStateNotConfigured
        ? m.matrix_desc_uv_not_configured
        : m.matrix_desc_uv_absent;
  const factValue =
    fact.state === FactState.FactStateConfigured
      ? value.configured()
      : fact.state === FactState.FactStateNotConfigured
        ? value.notConfigured()
        : formatFactValue(fact);

  return row(
    "Verification",
    m.matrix_name_built_in_user_verification,
    description,
    overviewFactStatus(fact),
    factValue,
    fact.source,
  );
}

function clientPINMCGAPermissionsRow(facts: OverviewFactLookup) {
  const fact = overviewFact(facts, FactID.FactIDClientPINMCGAPermissions);
  const available = fact.state === FactState.FactStateUnknown ? undefined : factBoolean(fact);
  const description =
    available === false
      ? m.matrix_desc_no_mc_ga_permissions_true
      : m.matrix_desc_no_mc_ga_permissions_false;
  const factValue =
    available === false
      ? value.notAvailableThroughClientPinToken()
      : fact.state === FactState.FactStateUnknown
        ? value.notReported()
        : factUsesSpecDefault(fact)
          ? value.availableByDefault()
          : value.available();

  return row(
    "Verification",
    m.matrix_name_client_pin_token_mc_ga_permissions,
    description,
    overviewFactStatus(fact),
    factValue,
    fact.source,
  );
}

function largeBlobsRow(facts: OverviewFactLookup) {
  const fact = overviewFact(facts, FactID.FactIDLargeBlobs);
  const capacity = overviewFact(facts, FactID.FactIDMaxSerializedLargeBlobArray);
  let factValue = formatFactValue(fact);

  if (fact.state === FactState.FactStateSupported) {
    factValue =
      capacity.state === FactState.FactStateUnknown
        ? value.capacityNotReported()
        : formatFactValue(capacity);
  } else if (fact.state === FactState.FactStateUnsupported) {
    factValue = value.falseOrAbsent();
  }

  return row(
    "Storage",
    m.matrix_name_large_blobs_command,
    m.matrix_desc_large_blobs_command,
    overviewFactStatus(fact),
    factValue,
    fact.source,
  );
}

function largeBlobKeyRow(facts: OverviewFactLookup) {
  const fact = overviewFact(facts, FactID.FactIDLargeBlobKey);
  const factValue =
    fact.state === FactState.FactStateSupported
      ? "largeBlobKey"
      : fact.state === FactState.FactStateUnsupported
        ? value.notListed()
        : value.extensionsNotReported();

  return row(
    "Storage",
    m.matrix_name_large_blob_key_extension,
    m.matrix_desc_large_blob_key,
    overviewFactStatus(fact),
    factValue,
    fact.source,
  );
}

function configCommandsRow(facts: OverviewFactLookup) {
  const fact = overviewFact(facts, FactID.FactIDAuthenticatorConfigCommands);
  const commands =
    fact.state === FactState.FactStateUnknown
      ? []
      : (factList(fact) ?? []).map((command) => {
          const name = configCommandNames.get(command);
          const formatted = formatUnsignedDecimalHex(command);

          return name ? `${name} (${formatted})` : formatted;
        });
  const factValue =
    fact.state === FactState.FactStateUnknown
      ? value.notReported()
      : inlineList(commands, value.emptyList());

  return row(
    "Management",
    m.matrix_name_authenticator_config_commands,
    m.matrix_desc_config_commands,
    overviewFactStatus(fact),
    factValue,
    fact.source,
  );
}

function vendorConfigCommandsRow(facts: OverviewFactLookup) {
  const fact = overviewFact(facts, FactID.FactIDVendorPrototypeConfigCommands);
  const commands =
    fact.state === FactState.FactStateUnknown
      ? []
      : (factList(fact) ?? []).map(formatUnsignedDecimalHex);
  const factValue =
    fact.state === FactState.FactStateUnknown
      ? value.notReported()
      : inlineList(commands, value.emptyList());

  return row(
    "Management",
    m.matrix_name_vendor_prototype_config_commands,
    m.matrix_desc_vendor_config_commands,
    overviewFactStatus(fact),
    factValue,
    fact.source,
  );
}

function formatUnsignedDecimalHex(input: string) {
  try {
    const amount = BigInt(input);

    if (amount < 0n) return input;

    const hex = amount.toString(16).toUpperCase();
    const width = amount <= 0xffn ? 2 : amount <= 0xffffn ? 4 : 0;

    return `0x${hex.padStart(width, "0")}`;
  } catch {
    return input;
  }
}

function makeCredentialUVRow(facts: OverviewFactLookup) {
  const fact = overviewFact(facts, FactID.FactIDMakeCredentialUVRequirement);
  const required = fact.state === FactState.FactStateUnknown ? undefined : factBoolean(fact);
  const description =
    required === false ? m.matrix_desc_make_cred_uv_skipped : m.matrix_desc_make_cred_uv_required;
  const factValue =
    required === false
      ? value.uvMayBeSkipped()
      : fact.state === FactState.FactStateUnknown
        ? value.notReported()
        : factUsesSpecDefault(fact)
          ? value.uvRequiredByDefault()
          : value.uvRequired();

  return row(
    "Policy",
    m.matrix_name_non_discoverable_credential_uv_requirement,
    description,
    overviewFactStatus(fact),
    factValue,
    fact.source,
  );
}

function forcePINChangeRow(facts: OverviewFactLookup) {
  const fact = overviewFact(facts, FactID.FactIDForcePINChange);
  const required = fact.state === FactState.FactStateWarning;

  return row(
    "Policy",
    m.matrix_name_force_pin_change,
    required ? m.matrix_desc_force_pin_required : m.matrix_desc_force_pin_not_required,
    overviewFactStatus(fact),
    required
      ? value.pinChangeRequired()
      : fact.origin === FactOrigin.FactOriginSpecDefault
        ? value.notRequiredByDefault()
        : value.notRequired(),
    fact.source,
  );
}

function extensionRow(
  facts: OverviewFactLookup,
  id: FactID,
  name: MessageText,
  description: MessageText,
  extension: string,
) {
  const fact = overviewFact(facts, id);
  const factValue =
    fact.state === FactState.FactStateSupported
      ? extension
      : fact.state === FactState.FactStateUnsupported
        ? value.notListed()
        : value.extensionsNotReported();

  return row("Extensions", name, description, overviewFactStatus(fact), factValue, fact.source);
}

function attestationFormatsRow(facts: OverviewFactLookup) {
  const fact = overviewFact(facts, FactID.FactIDAttestationFormats);
  const factValue =
    fact.state === FactState.FactStateUnknown
      ? value.notReported()
      : fact.origin === FactOrigin.FactOriginSpecDefault
        ? value.noneImpliedNoFormatsReported()
        : inlineList(factList(fact) ?? [], value.emptyList());

  return row(
    "Attestation",
    m.matrix_name_attestation_formats,
    m.matrix_desc_attestation_formats,
    overviewFactStatus(fact),
    factValue,
    fact.source,
  );
}

function certificationsRow(facts: OverviewFactLookup) {
  const fact = overviewFact(facts, FactID.FactIDCertifications);
  let factValue: string = value.certificationsNotReported();

  if (fact.state === FactState.FactStateUnsupported) {
    factValue = value.notListed();
  } else if (fact.state !== FactState.FactStateUnknown) {
    factValue = (factList(fact) ?? []).map(formatCertification).join(", ");
  }

  return row(
    "Attestation",
    m.mds_certification,
    m.matrix_desc_fido_certification,
    overviewFactStatus(fact),
    factValue,
    fact.source,
  );
}

function formatCertification(input: string) {
  const separator = input.lastIndexOf("=");

  if (separator < 0) return input;

  const id = input.slice(0, separator);
  const level = Number(input.slice(separator + 1));

  return `${id}: ${formatCertificationValue(id, Number.isSafeInteger(level) ? level : undefined)}`;
}

export function buildOverviewVendorPassport(
  device: DeviceReport | null,
): OverviewVendorPassportPresentation | null {
  if (!device?.identity && !device?.vendorMetadata) return null;

  const token2 = device.vendorMetadata?.token2;
  const yubico = device.vendorMetadata?.yubico;
  const limited = Boolean(token2 && device.attachment.transport === Mode.ModeSmartCard);
  const serialNumber =
    device.identity?.serialNumber?.trim() ||
    token2?.serialNumber.trim() ||
    (yubico?.serial ? String(yubico.serial) : "") ||
    value.notReported();
  const coreFacts: OverviewVendorFact[] = [
    passportFact(m.matrix_name_device_serial(), serialNumber, "device.identity.serialNumber"),
  ];
  const excludedSources = new Set(["device.identity.serialNumber"]);
  const summaryFacts: OverviewVendorFact[] = [];

  if (token2) {
    excludedSources.add("device.vendorMetadata.token2.serialNumber");
    excludedSources.add("device.vendorMetadata.token2.fidoVersion");

    if (!limited) {
      coreFacts.push(
        passportFact(
          m.matrix_name_token2_form_factor(),
          textValue(token2.formFactor, value.notReported()),
          "device.vendorMetadata.token2.formFactor",
        ),
      );
      excludedSources.add("device.vendorMetadata.token2.release");
      excludedSources.add("device.vendorMetadata.token2.formFactor");
      excludedSources.add("device.vendorMetadata.token2.branding");

      if (token2.productId !== undefined) {
        coreFacts.push(
          passportFact(
            m.matrix_name_token2_product_id(),
            formatHex(token2.productId, 4),
            "device.vendorMetadata.token2.productId",
          ),
        );
        excludedSources.add("device.vendorMetadata.token2.productId");
      }

      if (token2.interfaceStateKnown) {
        summaryFacts.push(
          passportFact(
            m.overview_vendor_enabled_interfaces(),
            inlineList(
              [
                token2.fidoEnabled && "FIDO",
                token2.hotpKeystrokeEnabled && "HOTP keystroke",
                token2.ccidEnabled && "CCID",
              ].filter((item): item is string => Boolean(item)),
              value.emptyList(),
            ),
            "device.vendorMetadata.token2.interfaceState",
          ),
        );
      }

      if (token2.capabilitiesKnown) {
        summaryFacts.push(
          passportFact(
            m.overview_vendor_supported_capabilities(),
            inlineList(
              [
                token2.supportsHOTP && "HOTP",
                token2.supportsTOTP && "TOTP",
                token2.supportsNFC && "NFC",
                token2.supportsCCID && "CCID",
                token2.supportsFIDO21 && "FIDO 2.1",
                token2.hasFingerprintSensor && m.matrix_name_token2_fingerprint_sensor(),
                token2.supportsFingerprintRegistration &&
                  m.matrix_name_token2_fingerprint_registration(),
                token2.supportsMandatoryFingerprint && m.matrix_name_token2_mandatory_fingerprint(),
                token2.supportsButtonHOTP && m.matrix_name_token2_button_hotp(),
              ].filter((item): item is string => Boolean(item)),
              value.emptyList(),
            ),
            "device.vendorMetadata.token2.capabilities",
          ),
        );
      }
    }
  } else if (yubico) {
    coreFacts.push(
      passportFact(
        m.matrix_name_yubico_form_factor(),
        `${yubicoFormFactorLabel(yubico.formFactor)} (${formatHex(yubico.formFactor, 2)})`,
        "device.vendorMetadata.yubico.formFactor",
      ),
    );
    excludedSources.add("device.vendorMetadata.yubico.firmwareVersion");
    excludedSources.add("device.vendorMetadata.yubico.formFactor");

    if (yubico.partNumber) {
      coreFacts.push(
        passportFact(
          m.matrix_name_yubico_part_number(),
          yubico.partNumber,
          "device.vendorMetadata.yubico.partNumber",
        ),
      );
      excludedSources.add("device.vendorMetadata.yubico.partNumber");
    }

    const applicationSources = new Set([
      "device.vendorMetadata.yubico.supportedUSBCapabilities",
      "device.vendorMetadata.yubico.enabledUSBCapabilities",
      "device.vendorMetadata.yubico.supportedNFCCapabilities",
      "device.vendorMetadata.yubico.enabledNFCCapabilities",
    ]);

    for (const metadataRow of vendorMetadataRows(device)) {
      if (!metadataRow.source || !applicationSources.has(metadataRow.source)) continue;

      summaryFacts.push(
        passportFact(
          metadataRow.name,
          metadataRow.value || value.notReported(),
          metadataRow.source,
        ),
      );
      excludedSources.add(metadataRow.source);
    }
  }

  const detailFacts = limited
    ? []
    : vendorMetadataRows(device)
        .filter((metadataRow) => metadataRow.source && !excludedSources.has(metadataRow.source))
        .filter((metadataRow) => token2MetadataReported(token2, metadataRow.source!))
        .map((metadataRow) =>
          passportFact(
            metadataRow.name,
            metadataRow.value || value.notReported(),
            metadataRow.source!,
          ),
        );

  return {
    vendor: vendorName(device),
    transport: vendorTransportLabel(device),
    limited,
    scopeNote: limited ? m.overview_vendor_token2_iso7816_scope() : "",
    coreFacts,
    summaryFacts,
    detailFacts,
  };
}

function token2MetadataReported(metadata: Token2DeviceInfo | null | undefined, source: string) {
  if (!metadata) return true;

  if (
    source === "device.vendorMetadata.token2.interfaceStateKnown" ||
    source === "device.vendorMetadata.token2.fidoEnabled" ||
    source === "device.vendorMetadata.token2.hotpKeystrokeEnabled" ||
    source === "device.vendorMetadata.token2.ccidEnabled"
  ) {
    return metadata.interfaceStateKnown;
  }

  if (
    source === "device.vendorMetadata.token2.capabilitiesKnown" ||
    source.startsWith("device.vendorMetadata.token2.fidoPIN") ||
    source.startsWith("device.vendorMetadata.token2.supports") ||
    source === "device.vendorMetadata.token2.hasFingerprintSensor" ||
    source === "device.vendorMetadata.token2.otpRequiresFingerprint" ||
    source.startsWith("device.vendorMetadata.token2.buttonHOTP")
  ) {
    return metadata.capabilitiesKnown;
  }

  return true;
}

function passportFact(label: string, factValue: string, source: string): OverviewVendorFact {
  return { label, value: factValue, source };
}

function vendorName(device: DeviceReport) {
  if (
    device.vendorMetadata?.token2 ||
    device.identity?.vendor === DeviceVendor.DeviceVendorToken2
  ) {
    return "Token2";
  }
  if (
    device.vendorMetadata?.yubico ||
    device.identity?.vendor === DeviceVendor.DeviceVendorYubico
  ) {
    return "Yubico";
  }

  return device.identity?.vendor || m.not_reported();
}

function vendorTransportLabel(device: DeviceReport) {
  switch (device.attachment.transport) {
    case Mode.ModeHID:
      return "USB · HID";
    case Mode.ModeWindowsProxy:
      return "Windows proxy";
    case Mode.ModeSmartCard:
      switch (device.attachment.smartCard?.interface) {
        case SmartCardInterface.SmartCardInterfaceContactless:
          return "NFC · ISO 7816";
        case SmartCardInterface.SmartCardInterfaceContact:
          return "Contact · ISO 7816";
        default:
          return "ISO 7816";
      }
    default:
      return textValue(device.attachment.transport, value.notReported());
  }
}

function vendorMetadataRows(device: DeviceReport | null) {
  const metadata = device?.vendorMetadata;

  if (metadata?.yubico) return yubicoMetadataRows(metadata.yubico);

  if (metadata?.token2) return token2MetadataRows(metadata.token2);

  return [];
}

function yubicoMetadataRows(metadata: YubicoDeviceInfo) {
  const rows: OverviewRow[] = [
    vendorRow(
      m.matrix_name_supported_applications({ interface: "USB" }),
      m.matrix_desc_supported_applications({ interface: "USB" }),
      yubicoCapabilityValue(metadata.supportedUSBCapabilities),
      "device.vendorMetadata.yubico.supportedUSBCapabilities",
    ),
    vendorRow(
      m.matrix_name_enabled_applications({ interface: "USB" }),
      m.matrix_desc_enabled_applications({ interface: "USB" }),
      yubicoCapabilityValue(metadata.enabledUSBCapabilities),
      "device.vendorMetadata.yubico.enabledUSBCapabilities",
    ),
    vendorRow(
      m.matrix_name_yubico_form_factor,
      m.matrix_desc_yubico_form_factor,
      `${yubicoFormFactorLabel(metadata.formFactor)} (${formatHex(metadata.formFactor, 2)})`,
      "device.vendorMetadata.yubico.formFactor",
    ),
    vendorBooleanRow(
      m.matrix_name_yubico_fips,
      m.matrix_desc_yubico_fips,
      metadata.isFIPS,
      "device.vendorMetadata.yubico.isFIPS",
    ),
    vendorBooleanRow(
      m.matrix_name_yubico_security_key,
      m.matrix_desc_yubico_security_key,
      metadata.isSecurityKey,
      "device.vendorMetadata.yubico.isSecurityKey",
    ),
    vendorRow(
      m.matrix_name_device_firmware,
      m.matrix_desc_device_firmware,
      yubicoFirmwareVersion(metadata.firmwareVersion),
      "device.vendorMetadata.yubico.firmwareVersion",
    ),
    vendorRow(
      m.matrix_name_yubico_auto_eject_timeout,
      m.matrix_desc_yubico_auto_eject_timeout,
      String(metadata.autoEjectTimeout),
      "device.vendorMetadata.yubico.autoEjectTimeout",
    ),
    vendorRow(
      m.matrix_name_yubico_challenge_response_timeout,
      m.matrix_desc_yubico_challenge_response_timeout,
      String(metadata.challengeResponseTimeout),
      "device.vendorMetadata.yubico.challengeResponseTimeout",
    ),
    vendorRow(
      m.matrix_name_yubico_device_flags,
      m.matrix_desc_yubico_device_flags,
      formatHex(metadata.deviceFlags, 2),
      "device.vendorMetadata.yubico.deviceFlags",
    ),
    vendorBooleanRow(
      m.matrix_name_yubico_locked,
      m.matrix_desc_yubico_locked,
      metadata.locked,
      "device.vendorMetadata.yubico.locked",
    ),
    vendorRow(
      m.matrix_name_yubico_fips_capable,
      m.matrix_desc_yubico_fips_capable,
      yubicoCapabilityValue(metadata.fipsCapable),
      "device.vendorMetadata.yubico.fipsCapable",
    ),
    vendorRow(
      m.matrix_name_yubico_fips_approved,
      m.matrix_desc_yubico_fips_approved,
      yubicoCapabilityValue(metadata.fipsApproved),
      "device.vendorMetadata.yubico.fipsApproved",
    ),
    vendorBooleanRow(
      m.matrix_name_yubico_pin_complexity,
      m.matrix_desc_yubico_pin_complexity,
      metadata.pinComplexity,
      "device.vendorMetadata.yubico.pinComplexity",
    ),
    vendorBooleanRow(
      m.matrix_name_yubico_nfc_restricted,
      m.matrix_desc_yubico_nfc_restricted,
      metadata.nfcRestricted,
      "device.vendorMetadata.yubico.nfcRestricted",
    ),
    vendorRow(
      m.matrix_name_yubico_reset_blocked,
      m.matrix_desc_yubico_reset_blocked,
      yubicoCapabilityValue(metadata.resetBlocked),
      "device.vendorMetadata.yubico.resetBlocked",
    ),
  ];

  if (metadata.versionQualifier) {
    rows.push(
      vendorRow(
        m.matrix_name_yubico_version_qualifier,
        m.matrix_desc_yubico_version_qualifier,
        `${yubicoFirmwareVersion(metadata.versionQualifier.version)} ${yubicoReleaseTypeLabel(metadata.versionQualifier.releaseType)} ${metadata.versionQualifier.iteration}`,
        "device.vendorMetadata.yubico.versionQualifier",
      ),
    );
  }
  if (metadata.partNumber) {
    rows.push(
      vendorRow(
        m.matrix_name_yubico_part_number,
        m.matrix_desc_yubico_part_number,
        metadata.partNumber,
        "device.vendorMetadata.yubico.partNumber",
      ),
    );
  }
  if (metadata.fpsVersion) {
    rows.push(
      vendorRow(
        m.matrix_name_yubico_fps_version,
        m.matrix_desc_yubico_fps_version,
        yubicoFirmwareVersion(metadata.fpsVersion),
        "device.vendorMetadata.yubico.fpsVersion",
      ),
    );
  }
  if (metadata.stmVersion) {
    rows.push(
      vendorRow(
        m.matrix_name_yubico_stm_version,
        m.matrix_desc_yubico_stm_version,
        yubicoFirmwareVersion(metadata.stmVersion),
        "device.vendorMetadata.yubico.stmVersion",
      ),
    );
  }
  if (
    metadata.supportedNFCCapabilities !== null &&
    metadata.supportedNFCCapabilities !== undefined
  ) {
    rows.push(
      vendorRow(
        m.matrix_name_supported_applications({ interface: "NFC" }),
        m.matrix_desc_supported_applications({ interface: "NFC" }),
        yubicoCapabilityValue(metadata.supportedNFCCapabilities),
        "device.vendorMetadata.yubico.supportedNFCCapabilities",
      ),
    );
  }
  if (metadata.enabledNFCCapabilities !== null && metadata.enabledNFCCapabilities !== undefined) {
    rows.push(
      vendorRow(
        m.matrix_name_enabled_applications({ interface: "NFC" }),
        m.matrix_desc_enabled_applications({ interface: "NFC" }),
        yubicoCapabilityValue(metadata.enabledNFCCapabilities),
        "device.vendorMetadata.yubico.enabledNFCCapabilities",
      ),
    );
  }
  for (const [rawTag, encodedValue] of Object.entries(metadata.unknownFields).sort(
    ([left], [right]) => Number(left) - Number(right),
  )) {
    const tag = formatHex(Number(rawTag), 2);

    rows.push(
      vendorRow(
        m.matrix_name_yubico_unknown_field({ tag }),
        m.matrix_desc_yubico_unknown_field,
        `0x${base64BytesToHex(encodedValue!)}`,
        `device.vendorMetadata.yubico.unknownFields.${tag}`,
      ),
    );
  }

  return rows;
}

function token2MetadataRows(metadata: Token2DeviceInfo) {
  const rows: OverviewRow[] = [
    vendorRow(
      m.matrix_name_token2_identity_serial,
      m.matrix_desc_token2_identity,
      textValue(metadata.serialNumber, value.notReported()),
      "device.vendorMetadata.token2.serialNumber",
    ),
    vendorRow(
      m.matrix_name_token2_release,
      m.matrix_desc_token2_model,
      textValue(metadata.release, value.notReported()),
      "device.vendorMetadata.token2.release",
    ),
    vendorRow(
      m.matrix_name_token2_form_factor,
      m.matrix_desc_token2_model,
      textValue(metadata.formFactor, value.notReported()),
      "device.vendorMetadata.token2.formFactor",
    ),
    vendorRow(
      m.matrix_name_token2_branding,
      m.matrix_desc_token2_model,
      textValue(metadata.branding, value.notReported()),
      "device.vendorMetadata.token2.branding",
    ),
  ];

  if (metadata.productId !== undefined) {
    rows.push(
      vendorRow(
        m.matrix_name_token2_product_id,
        m.matrix_desc_token2_product_id,
        formatHex(metadata.productId, 4),
        "device.vendorMetadata.token2.productId",
      ),
    );
  }

  if (metadata.appearance) {
    rows.push(
      vendorRow(
        m.matrix_name_token2_appearance,
        m.matrix_desc_token2_appearance,
        `0x${bytesToHex(metadata.appearance)}`,
        "device.vendorMetadata.token2.appearance",
      ),
    );
  }

  if (metadata.fidoVersion) {
    rows.push(
      vendorRow(
        m.matrix_name_token2_fido_version,
        m.matrix_desc_token2_fido_version,
        token2Version(metadata.fidoVersion),
        "device.vendorMetadata.token2.fidoVersion",
      ),
    );
  }

  rows.push(
    vendorRow(
      m.matrix_name_token2_interface_state_known,
      m.matrix_desc_token2_interface_state_known,
      metadata.interfaceStateKnown ? value.available() : value.notReported(),
      "device.vendorMetadata.token2.interfaceStateKnown",
    ),
    token2StateRow(
      m.matrix_name_token2_fido_enabled,
      m.matrix_desc_token2_interface_state,
      metadata.interfaceStateKnown,
      metadata.fidoEnabled,
      "device.vendorMetadata.token2.fidoEnabled",
    ),
    token2StateRow(
      m.matrix_name_token2_hotp_keystroke_enabled,
      m.matrix_desc_token2_interface_state,
      metadata.interfaceStateKnown,
      metadata.hotpKeystrokeEnabled,
      "device.vendorMetadata.token2.hotpKeystrokeEnabled",
    ),
    token2StateRow(
      m.matrix_name_token2_ccid_enabled,
      m.matrix_desc_token2_interface_state,
      metadata.interfaceStateKnown,
      metadata.ccidEnabled,
      "device.vendorMetadata.token2.ccidEnabled",
    ),
    vendorRow(
      m.matrix_name_token2_capabilities_known,
      m.matrix_desc_token2_capabilities_known,
      metadata.capabilitiesKnown ? value.available() : value.notReported(),
      "device.vendorMetadata.token2.capabilitiesKnown",
    ),
    token2StateRow(
      m.matrix_name_token2_fido_pin_set,
      m.matrix_desc_token2_capability,
      metadata.capabilitiesKnown,
      metadata.fidoPINSet,
      "device.vendorMetadata.token2.fidoPINSet",
      value.pinSet(),
      value.pinNotSet(),
    ),
    token2StateRow(
      m.matrix_name_token2_fido_pin_locked,
      m.matrix_desc_token2_capability,
      metadata.capabilitiesKnown,
      metadata.fidoPINLocked,
      "device.vendorMetadata.token2.fidoPINLocked",
      m.matrix_value_locked(),
      m.matrix_value_unlocked(),
    ),
    token2SupportRow(
      m.matrix_name_token2_hotp,
      metadata.capabilitiesKnown,
      metadata.supportsHOTP,
      "device.vendorMetadata.token2.supportsHOTP",
    ),
    token2SupportRow(
      m.matrix_name_token2_totp,
      metadata.capabilitiesKnown,
      metadata.supportsTOTP,
      "device.vendorMetadata.token2.supportsTOTP",
    ),
    token2SupportRow(
      m.matrix_name_token2_nfc,
      metadata.capabilitiesKnown,
      metadata.supportsNFC,
      "device.vendorMetadata.token2.supportsNFC",
    ),
    token2SupportRow(
      m.matrix_name_token2_ccid,
      metadata.capabilitiesKnown,
      metadata.supportsCCID,
      "device.vendorMetadata.token2.supportsCCID",
    ),
    token2SupportRow(
      m.matrix_name_token2_fido21,
      metadata.capabilitiesKnown,
      metadata.supportsFIDO21,
      "device.vendorMetadata.token2.supportsFIDO21",
    ),
    token2SupportRow(
      m.matrix_name_token2_fingerprint_sensor,
      metadata.capabilitiesKnown,
      metadata.hasFingerprintSensor,
      "device.vendorMetadata.token2.hasFingerprintSensor",
    ),
    token2SupportRow(
      m.matrix_name_token2_fingerprint_registration,
      metadata.capabilitiesKnown,
      metadata.supportsFingerprintRegistration,
      "device.vendorMetadata.token2.supportsFingerprintRegistration",
    ),
    token2SupportRow(
      m.matrix_name_token2_mandatory_fingerprint,
      metadata.capabilitiesKnown,
      metadata.supportsMandatoryFingerprint,
      "device.vendorMetadata.token2.supportsMandatoryFingerprint",
    ),
    token2StateRow(
      m.matrix_name_token2_otp_requires_fingerprint,
      m.matrix_desc_token2_capability,
      metadata.capabilitiesKnown,
      metadata.otpRequiresFingerprint,
      "device.vendorMetadata.token2.otpRequiresFingerprint",
      m.status_enabled(),
      m.status_disabled(),
    ),
    token2SupportRow(
      m.matrix_name_token2_button_hotp,
      metadata.capabilitiesKnown,
      metadata.supportsButtonHOTP,
      "device.vendorMetadata.token2.supportsButtonHOTP",
    ),
    token2StateRow(
      m.matrix_name_token2_button_hotp_configured,
      m.matrix_desc_token2_capability,
      metadata.capabilitiesKnown,
      metadata.buttonHOTPConfigured,
      "device.vendorMetadata.token2.buttonHOTPConfigured",
      value.configured(),
      value.notConfigured(),
    ),
    token2StateRow(
      m.matrix_name_token2_button_hotp_sends_enter,
      m.matrix_desc_token2_capability,
      metadata.capabilitiesKnown,
      metadata.buttonHOTPSendsEnter,
      "device.vendorMetadata.token2.buttonHOTPSendsEnter",
    ),
    token2StateRow(
      m.matrix_name_token2_button_hotp_long_press,
      m.matrix_desc_token2_capability,
      metadata.capabilitiesKnown,
      metadata.buttonHOTPRequiresLongPress,
      "device.vendorMetadata.token2.buttonHOTPRequiresLongPress",
    ),
    token2StateRow(
      m.matrix_name_token2_button_hotp_numeric_keypad,
      m.matrix_desc_token2_capability,
      metadata.capabilitiesKnown,
      metadata.buttonHOTPUsesNumericKeypad,
      "device.vendorMetadata.token2.buttonHOTPUsesNumericKeypad",
    ),
  );

  return rows;
}

function vendorRow(name: MessageText, description: MessageText, rowValue: string, source: string) {
  return row("Vendor", name, description, "informational", rowValue, source);
}

function vendorBooleanRow(
  name: MessageText,
  description: MessageText,
  enabled: boolean,
  source: string,
) {
  return vendorRow(name, description, enabled ? m.status_enabled() : m.status_disabled(), source);
}

function token2StateRow(
  name: MessageText,
  description: MessageText,
  known: boolean,
  enabled: boolean,
  source: string,
  enabledValue = m.status_enabled(),
  disabledValue = m.status_disabled(),
) {
  return vendorRow(
    name,
    description,
    known ? (enabled ? enabledValue : disabledValue) : value.notReported(),
    source,
  );
}

function token2SupportRow(name: MessageText, known: boolean, supported: boolean, source: string) {
  return token2StateRow(
    name,
    m.matrix_desc_token2_capability,
    known,
    supported,
    source,
    m.status_supported(),
    m.status_unsupported(),
  );
}

function yubicoCapabilityValue(capabilities: Capability) {
  const names = [
    [Capability.CapabilityOTP, "OTP"],
    [Capability.CapabilityU2F, "U2F"],
    [Capability.CapabilityCCID, "CCID"],
    [Capability.CapabilityOpenPGP, "OpenPGP"],
    [Capability.CapabilityPIV, "PIV"],
    [Capability.CapabilityOATH, "OATH"],
    [Capability.CapabilityHSMAuth, "HSM Auth"],
    [Capability.CapabilityCTAP2, "CTAP2"],
  ]
    .filter(([flag]) => capabilities & Number(flag))
    .map(([, name]) => String(name));
  const applications = inlineList(names, value.emptyList());

  return `${applications} (${formatHex(capabilities, 4)})`;
}

function yubicoFormFactorLabel(formFactor: FormFactor) {
  const labels: Record<FormFactor, string> = {
    [FormFactor.$zero]: value.notReported(),
    [FormFactor.FormFactorUSBAKeychain]: "USB-A keychain",
    [FormFactor.FormFactorUSBANano]: "USB-A Nano",
    [FormFactor.FormFactorUSBCKeychain]: "USB-C keychain",
    [FormFactor.FormFactorUSBCNano]: "USB-C Nano",
    [FormFactor.FormFactorUSBCLightning]: "USB-C + Lightning",
    [FormFactor.FormFactorUSBABiometricKeychain]: "USB-A biometric keychain",
    [FormFactor.FormFactorUSBCBiometricKeychain]: "USB-C biometric keychain",
  };

  return labels[formFactor] || value.notReported();
}

function yubicoReleaseTypeLabel(releaseType: ReleaseType) {
  const labels: Record<ReleaseType, string> = {
    [ReleaseType.$zero]: "alpha",
    [ReleaseType.ReleaseTypeBeta]: "beta",
    [ReleaseType.ReleaseTypeFinal]: "final",
  };

  return labels[releaseType] || value.notReported();
}

function yubicoFirmwareVersion(version: YubicoFirmwareVersion) {
  if (!version.major && !version.minor && !version.build) return value.notReported();

  return `${version.major}.${version.minor}.${version.build}`;
}

function token2Version(version: { major: number; minor: number; patch: number }) {
  if (!version.major && !version.minor && !version.patch) return value.notReported();

  return `${version.major}.${version.minor}.${version.patch}`;
}

function base64BytesToHex(input: string) {
  return bytesToHex(Uint8Array.from(atob(input), (character) => character.charCodeAt(0)));
}

function bytesToHex(input: ArrayLike<number>) {
  return Array.from(input, (byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join("");
}

function formatHex(input: number, width: number) {
  return `0x${input.toString(16).toUpperCase().padStart(width, "0")}`;
}

function connectionRows(device: DeviceReport | null) {
  const smartCard = device?.attachment.smartCard;

  if (!smartCard) return [];

  return [
    row(
      "Identity",
      m.matrix_name_smart_card_reader,
      m.matrix_desc_smart_card_reader,
      valueStatus(smartCard.reader),
      textValue(smartCard.reader, value.notReported()),
      "device.attachment.smartCard.reader",
    ),
    row(
      "Identity",
      m.matrix_name_smart_card_atr,
      m.matrix_desc_smart_card_atr,
      valueStatus(smartCard.atr),
      textValue(smartCard.atr, value.notReported()),
      "device.attachment.smartCard.atr",
    ),
  ];
}

function valueStatus(input: unknown): OverviewRowStatus {
  if (input === null || input === undefined || input === "") return "unknown";

  if (Array.isArray(input) && input.length === 0) return "unknown";

  return "informational";
}

function formatProtocolVersion(version: string) {
  const withPrefix = version.startsWith("FIDO_") ? `FIDO ${version.slice(5)}` : version;

  return withPrefix.replaceAll("_", ".");
}
