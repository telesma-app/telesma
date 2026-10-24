import { derived, get, writable } from "svelte/store";

import { Code, type Failure } from "../../bindings/github.com/telesma-app/kit/model/failure";
import { Mode } from "../../bindings/github.com/telesma-app/kit/transport";

import {
  authenticatorStatus,
  endpoints,
  selectedDevice,
} from "$lib/features/authenticator/state.js";

export type OperationRecoveryDecision = "cancel" | "retry";

export type OperationRecoveryPresentation = {
  label: string;
  failure: Failure;
  mustRemove: boolean;
  cardVisible: boolean;
  wrongDevice: boolean;
  opening: boolean;
  canRetry: boolean;
};

type OperationRecoveryIntent = {
  label: string;
  failure: Failure;
  originalAttachmentID: string;
  sawRemoval: boolean;
  resolve: (decision: OperationRecoveryDecision) => void;
};

const candidateCodes = new Set<Code>([
  Code.CodeUserPresenceRequired,
  Code.CodeCredentialCreationDenied,
  Code.CodeAssertionDenied,
  Code.CodeAuthenticatorOperationDenied,
  Code.CodeCTAPOtherError,
]);

const intent = writable<OperationRecoveryIntent | null>(null);

export function isCardPresenceRecoveryCandidate(failure: Failure) {
  return candidateCodes.has(failure.code);
}

function noteRemoval() {
  intent.update((current) => {
    if (!current || current.sawRemoval) return current;

    const selected = get(selectedDevice);
    const originalPresent = get(endpoints).some(
      (device) => device.attachment.id === current.originalAttachmentID,
    );

    if (!selected || selected.attachment.id !== current.originalAttachmentID || !originalPresent) {
      return { ...current, sawRemoval: true };
    }

    return current;
  });
}

selectedDevice.subscribe(noteRemoval);
endpoints.subscribe(noteRemoval);

export const operationRecovery = derived(
  [intent, endpoints, selectedDevice, authenticatorStatus],
  ([
    $intent,
    $endpoints,
    $selectedDevice,
    $authenticatorStatus,
  ]): OperationRecoveryPresentation | null => {
    if (!$intent) return null;

    const selectedSmartCard = $selectedDevice?.attachment.transport === Mode.ModeSmartCard;
    const cardVisible = $endpoints.some(
      (device) => device.attachment.transport === Mode.ModeSmartCard,
    );
    const canRetry =
      $intent.sawRemoval &&
      selectedSmartCard &&
      $authenticatorStatus.state === "ready" &&
      Boolean($authenticatorStatus.selectionId);

    return {
      label: $intent.label,
      failure: $intent.failure,
      mustRemove: !$intent.sawRemoval,
      cardVisible,
      wrongDevice: $intent.sawRemoval && Boolean($selectedDevice) && !selectedSmartCard,
      opening: $intent.sawRemoval && cardVisible && !canRetry,
      canRetry,
    };
  },
);

export function offerOperationRecovery(label: string, failure: Failure) {
  const device = get(selectedDevice);

  if (
    device?.attachment.transport !== Mode.ModeSmartCard ||
    !isCardPresenceRecoveryCandidate(failure)
  )
    return null;

  return new Promise<OperationRecoveryDecision>((resolve) => {
    intent.set({
      label,
      failure,
      originalAttachmentID: device.attachment.id,
      sawRemoval: false,
      resolve,
    });
  });
}

export function cancelOperationRecovery() {
  const current = get(intent);

  intent.set(null);
  current?.resolve("cancel");
}

export function retryOperationRecovery() {
  const current = get(intent);

  if (!current || !get(operationRecovery)?.canRetry) return false;

  intent.set(null);
  current.resolve("retry");

  return true;
}
