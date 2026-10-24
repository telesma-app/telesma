import {
  CreditCard,
  FingerprintPattern,
  Grid3X3,
  Hand,
  KeyRound,
  MapPin,
  Mic,
  Nfc,
  ScanEye,
  ScanFace,
  ShieldCheck,
  TriangleAlert,
  Usb,
} from "@lucide/svelte";
import type { Component } from "svelte";

import {
  InteractionKind,
  type PINInteractionState,
} from "../../bindings/github.com/telesma-app/kit/model";
import type {
  DeviceReport,
  EndpointReport,
} from "../../bindings/github.com/telesma-app/kit/model/report";
import { Mode, SmartCardInterface } from "../../bindings/github.com/telesma-app/kit/transport";
import { UserVerify } from "../../bindings/github.com/telesma-app/ctap/protocol";
import type { InteractionPrompt } from "../../bindings/telesma/service";

import { m } from "../paraglide/messages.js";
import {
  bioSampleStatusLabel,
  deviceDetail,
  deviceName,
  labelDevice,
  operationStageLabel,
  permissionLabel,
  authenticatorStateLabel,
} from "$lib/format.js";
import { failureMessage } from "$lib/failure.js";
import { type AuthenticatorStatus } from "$lib/authenticator-model.js";
import type { ActiveScreen, StatusBarState } from "$lib/features/workbench";

export type SidebarTokenItem = {
  value: string;
  label: string;
  name: string;
  detail: string;
  icon: Component;
};

export type SidebarPresentation = {
  activeScreen: ActiveScreen;
  activeScreenLabel: string;
  tokens: SidebarTokenItem[];
  selectedValue: string;
  busy: boolean;
};

export type ShellStatusTone = "neutral" | "info" | "success" | "warning" | "error";

export type ShellStatusProgress = {
  value: number;
  max: number;
  label: string;
  ariaLabel: string;
};

export type ShellStatusAction = {
  label: string;
  ariaLabel: string;
  disabled: boolean;
};

export type ShellStatusPresentation = {
  source: "operation" | "authenticator" | "outcome" | "idle";
  tone: ShellStatusTone;
  title: string;
  detail: string;
  busy: boolean;
  progress: ShellStatusProgress | null;
  cancel: ShellStatusAction | null;
};

export type InteractionModalPresentation = {
  interactionId: string;
  title: string;
  destructive: boolean;
  message: string;
  permission: string;
  preview: unknown;
  kind: InteractionKind;
  pinState: PINInteractionState | null;
  icon: Component;
};

function sidebarDeviceIcon(endpoint: EndpointReport): Component {
  if (endpoint.attachment.transport !== Mode.ModeSmartCard) return Usb;
  return endpoint.attachment.smartCard!.interface ===
    SmartCardInterface.SmartCardInterfaceContactless
    ? Nfc
    : CreditCard;
}

export function buildSidebarPresentation(input: {
  activeScreen: ActiveScreen;
  devices: DeviceReport[];
  endpoints: EndpointReport[];
  selectedSelector: string;
  busy: boolean;
}): SidebarPresentation {
  return {
    activeScreen: input.activeScreen,
    activeScreenLabel: screenLabel(input.activeScreen),
    tokens: input.devices.map((device) => {
      const endpoints = device.endpointIds.map((id) =>
        input.endpoints.find((endpoint) => endpoint.attachment.id === id)!,
      );
      const endpoint = endpoints.find((endpoint) => endpoint.attachment.usb) ?? endpoints[0];
      const interfaces = endpoints
        .map((endpoint) => (endpoint.attachment.transport === Mode.ModeSmartCard ? "PC/SC" : "HID"))
        .join(" · ");
      const detail = device.identity
        ? `S/N ${device.identity.serialNumber}`
        : deviceDetail(endpoint);
      const reader = endpoint.attachment.smartCard?.reader ?? "";
      return {
        value: device.id,
        label: labelDevice(endpoint, endpoints),
        name: deviceName(endpoint, endpoints),
        detail:
          endpoints.length > 1
            ? [detail, interfaces].filter(Boolean).join(" · ")
            : detail || (reader ? `${reader} · PC/SC` : ""),
        icon: sidebarDeviceIcon(endpoint),
      };
    }),
    selectedValue: input.selectedSelector,
    busy: input.busy,
  };
}

function screenLabel(screen: ActiveScreen) {
  const labels: Record<ActiveScreen, string> = {
    overview: m.overview(),
    passkeys: m.passkeys(),
    lab: m.webauthn_lab(),
    "large-blobs": m.nav_large_blobs(),
    security: m.security(),
    logs: m.logs(),
    settings: m.settings(),
  };

  return labels[screen];
}

function activeProgress(statusBar: StatusBarState): ShellStatusProgress | null {
  const completed = statusBar.activeOperation?.completed;
  const total = statusBar.activeOperation?.total;

  if (
    completed === null ||
    completed === undefined ||
    total === null ||
    total === undefined ||
    total < 0
  )
    return null;

  return {
    value: total === 0 ? 0 : Math.min(Math.max(completed, 0), total),
    max: Math.max(total, 1),
    label: m.progress_completed_of_total({ completed, total }),
    ariaLabel: m.operation_progress(),
  };
}

export function buildShellStatusPresentation(input: {
  authenticatorStatus: AuthenticatorStatus;
  selectedDevice: EndpointReport | null;
  endpoints?: EndpointReport[];
  statusBar: StatusBarState;
}): ShellStatusPresentation {
  const active = input.statusBar.activeOperation;
  const outcome = input.statusBar.lastOutcome;

  if (active) {
    const cancellationPending = active.cancelPending || active.cancelRequested;

    return {
      source: "operation",
      tone: active.cancelError ? "error" : "info",
      title: active.cancelRequested ? m.cancel_requested() : active.label || m.operation_running(),
      detail: cancellationPending
        ? m.cancel_requested_message()
        : failureMessage(active.cancelError) ||
          [operationStageLabel(active.stage), bioSampleStatusLabel(active.sampleStatus)]
            .filter(Boolean)
            .join(" · "),
      busy: true,
      progress: activeProgress(input.statusBar),
      cancel:
        active.operationId && !active.cancelRequested
          ? {
              label: m.cancel(),
              ariaLabel: m.cancel_operation(),
              disabled: Boolean(active.cancelPending),
            }
          : null,
    };
  }

  if (["opening", "running", "error"].includes(input.authenticatorStatus.state)) {
    const error = input.authenticatorStatus.state === "error";

    return {
      source: "authenticator",
      tone: error ? "error" : "info",
      title: authenticatorStateLabel(input.authenticatorStatus.state),
      detail:
        failureMessage(input.authenticatorStatus.error) ||
        (input.selectedDevice
          ? deviceName(input.selectedDevice, input.endpoints)
          : m.no_token_selected()),
      busy: !error,
      progress: null,
      cancel: null,
    };
  }

  if (outcome) {
    return {
      source: "outcome",
      tone: outcome.tone,
      title: outcome.title,
      detail:
        outcome.message ||
        (input.selectedDevice
          ? deviceName(input.selectedDevice, input.endpoints)
          : m.no_token_selected()),
      busy: false,
      progress: null,
      cancel: null,
    };
  }

  return {
    source: "idle",
    tone: "neutral",
    title: authenticatorStateLabel(input.authenticatorStatus.state),
    detail: input.selectedDevice
      ? deviceName(input.selectedDevice, input.endpoints)
      : m.no_token_selected(),
    busy: false,
    progress: null,
    cancel: null,
  };
}

function userVerificationIcon(modality: UserVerify | null): Component {
  if (modality == null) return ShieldCheck;

  if (modality & UserVerify.UserVerifyFingerprintInternal) return FingerprintPattern;

  if (modality & UserVerify.UserVerifyFaceprintInternal) return ScanFace;

  if (modality & UserVerify.UserVerifyEyeprintInternal) return ScanEye;

  if (modality & UserVerify.UserVerifyVoiceprintInternal) return Mic;

  if (modality & UserVerify.UserVerifyHandprintInternal) return Hand;

  if (modality & (UserVerify.UserVerifyPasscodeInternal | UserVerify.UserVerifyPasscodeExternal))
    return KeyRound;

  if (modality & (UserVerify.UserVerifyPatternInternal | UserVerify.UserVerifyPatternExternal))
    return Grid3X3;

  if (modality & UserVerify.UserVerifyLocationInternal) return MapPin;

  if (modality & UserVerify.UserVerifyPresenceInternal) return Hand;

  return ShieldCheck;
}

function interactionTitle(kind: InteractionKind, destructive: boolean) {
  if (destructive) return m.confirm_destructive_operation();

  if (kind === InteractionKind.InteractionKindPIN) return m.interaction_pin_title();

  if (kind === InteractionKind.InteractionKindTouch) return m.interaction_touch_title();

  if (kind === InteractionKind.InteractionKindUserVerification)
    return m.interaction_user_verification_title();

  return m.authenticator_needs_you();
}

function interactionMessage(kind: InteractionKind) {
  if (kind === InteractionKind.InteractionKindPIN) return m.interaction_pin_description();

  if (kind === InteractionKind.InteractionKindTouch) return m.interaction_touch_description();

  if (kind === InteractionKind.InteractionKindUserVerification)
    return m.interaction_user_verification_description();

  return m.continue_on_authenticator();
}

function interactionIcon(
  kind: InteractionKind,
  destructive: boolean,
  uvModality: UserVerify | null,
): Component {
  if (destructive) return TriangleAlert;

  if (kind === InteractionKind.InteractionKindPIN) return KeyRound;

  if (kind === InteractionKind.InteractionKindTouch) return Hand;

  if (kind === InteractionKind.InteractionKindUserVerification)
    return userVerificationIcon(uvModality);

  return ShieldCheck;
}

export function buildInteractionModalPresentation(
  prompt: InteractionPrompt,
): InteractionModalPresentation {
  const request = prompt.request;
  const destructive = request.destructive === true;

  return {
    interactionId: prompt.interactionId,
    title: interactionTitle(request.kind, destructive),
    destructive,
    message: request.message ?? interactionMessage(request.kind),
    permission: permissionLabel(request.permission),
    preview: request.preview ?? null,
    kind: request.kind,
    pinState: request.pinState ?? null,
    icon: interactionIcon(request.kind, destructive, request.uvModality ?? null),
  };
}
