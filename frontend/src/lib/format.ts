import type { EndpointReport } from "../../bindings/github.com/telesma-app/kit/model/report";
import {
  DescriptorState,
  SourceState,
} from "../../bindings/github.com/telesma-app/kit/model/report";
import { Mode } from "../../bindings/github.com/telesma-app/kit/transport";

import { m } from "../paraglide/messages.js";

export function labelDevice(
  device: EndpointReport | null | undefined,
  endpoints: EndpointReport[] = device ? [device] : [],
) {
  if (!device) return m.no_token_selected();

  const name = deviceName(device, endpoints);
  const serialValue = deviceDetail(device);
  const serial = serialValue ? ` · ${serialValue}` : "";

  return `${name || device.attachment.id || m.authenticator()}${serial}`;
}

export function deviceName(
  device: EndpointReport | null | undefined,
  endpoints: EndpointReport[] = device ? [device] : [],
) {
  if (!device) return m.no_token_selected();

  for (const endpoint of endpoints) {
    const name = vendorModelName(endpoint);
    if (name) return name;
  }

  for (const endpoint of endpoints) {
    const usb = endpoint.attachment.usb;
    if (usb?.product.state === DescriptorState.DescriptorRead && usb.product.value!.trim())
      return usb.product.value!.trim();
  }
  for (const endpoint of endpoints) {
    const usb = endpoint.attachment.usb;
    if (
      usb?.manufacturer.state === DescriptorState.DescriptorRead &&
      usb.manufacturer.value!.trim()
    )
      return usb.manufacturer.value!.trim();
  }
  return device.attachment.transport === Mode.ModeSmartCard
    ? device.attachment.smartCard!.fidoApplication.state === SourceState.SourceAvailable
      ? m.fido_smart_card()
      : m.smart_card()
    : m.authenticator();
}

function vendorModelName(device: EndpointReport) {
  const yubico = device.sources.yubico.modelName?.trim();
  if (yubico) return yubico;

  const model = device.sources.token2.data?.model;
  if (!model?.formFactor.trim()) return "";

  // Token2 Model.Name joins these catalogue fields; release is a separate revision.
  return !model.branding || model.formFactor.startsWith(`${model.branding} `)
    ? model.formFactor
    : `${model.branding} ${model.formFactor}`;
}

export function deviceDetail(device: EndpointReport | null | undefined) {
  if (!device) return "";
  const serial = device.attachment.usb?.reportedSerial;
  return serial?.state === DescriptorState.DescriptorRead && serial.value
    ? `USB S/N ${serial.value}`
    : "";
}

export function authenticatorStateLabel(value: unknown) {
  const raw = String(value || "");

  if (["idle", "opening", "ready", "running", "error"].includes(raw)) {
    return authenticatorStateText(raw);
  }

  return raw
    ? m.unknown_authenticator_state({ state: raw.replaceAll("_", " ") })
    : m.state_unknown();
}

export function operationStageLabel(value: unknown) {
  const raw = String(value || "");
  const labels: Record<string, string> = {
    "interaction-required": m.stage_interaction_required(),
    "enumerating-rps": m.stage_enumerating_rps(),
    "enumerating-credentials": m.stage_enumerating_credentials(),
    "capturing-bio-sample": m.stage_capturing_bio_sample(),
  };

  return labels[raw] || raw.replaceAll("-", " ") || m.operation_running();
}

const permissionMessages: Readonly<Partial<Record<string, () => string>>> = {
  authenticatorconfiguration: m.permission_authenticator_configuration,
  bioenrollment: m.permission_bio_enrollment,
  credentialmanagement: m.permission_credential_management,
  getassertion: m.permission_get_assertion,
  largeblobwrite: m.permission_large_blob_write,
  makecredential: m.permission_make_credential,
  none: m.permission_none,
  persistentcredentialmanagementreadonly: m.permission_persistent_credential_management_read_only,
};

export function permissionLabel(value: unknown) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  return raw
    .split(",")
    .map((permission) => permission.trim())
    .filter(Boolean)
    .map((permission) => {
      const key = permission
        .replace(/^Permission/, "")
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase();

      return permissionMessages[key]?.() ?? humanizeIdentifier(permission, "Permission");
    })
    .join(" + ");
}

const sampleStatusMessages: Readonly<Partial<Record<string, () => string>>> = {
  exists: m.sample_status_fingerprint_exists,
  good: m.sample_status_fingerprint_good,
  mergefailure: m.sample_status_fingerprint_merge_failure,
  nouseractivity: m.sample_status_no_user_activity,
  nouserpresencetransition: m.sample_status_no_user_presence_transition,
  poorquality: m.sample_status_fingerprint_poor_quality,
  toofast: m.sample_status_fingerprint_too_fast,
  toohigh: m.sample_status_fingerprint_too_high,
  tooleft: m.sample_status_fingerprint_too_left,
  toolow: m.sample_status_fingerprint_too_low,
  tooright: m.sample_status_fingerprint_too_right,
  tooshort: m.sample_status_fingerprint_too_short,
  tooskewed: m.sample_status_fingerprint_too_skewed,
  tooslow: m.sample_status_fingerprint_too_slow,
};

export function bioSampleStatusLabel(value: unknown) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  const key = raw
    .replace(/^LastEnrollSampleStatus/, "")
    .replace(/^Fingerprint/, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();

  return sampleStatusMessages[key]?.() ?? humanizeIdentifier(raw, "LastEnrollSampleStatus");
}

function humanizeIdentifier(value: string, prefix: string) {
  return value
    .replace(new RegExp(`^${prefix}`), "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

function authenticatorStateText(raw: string) {
  const labels: Record<string, string> = {
    idle: m.authenticator_idle(),
    opening: m.authenticator_opening(),
    ready: m.authenticator_ready(),
    running: m.authenticator_running(),
    error: m.authenticator_error(),
  };

  return labels[raw] || raw;
}
