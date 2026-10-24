import { get } from "svelte/store";

import type { Failure } from "../../bindings/github.com/telesma-app/kit/model/failure";
import type { AuthenticatorSessionSnapshot } from "../../bindings/telesma/service";
import { m } from "../paraglide/messages.js";
import type { OperationEnvelope } from "$lib/api.js";
import { resetDeviceState } from "$lib/device-state.js";
import { pendingInteraction } from "$lib/features/interaction/state.js";
import { authenticatorSession } from "$lib/features/authenticator/state.js";
import {
  statusBar,
  type ActiveOperation,
  type StatusBarOutcome,
} from "$lib/features/workbench/state.js";
import { activeSelectionID } from "$lib/authenticator-boundary.js";
import { failureMessage, isCanceledFailure } from "$lib/failure.js";

export type SessionChange = {
  boundaryChanged: boolean;
  attachmentChanged: boolean;
  becameReady: boolean;
};

export function applySessionSnapshot(snapshot: AuthenticatorSessionSnapshot): SessionChange {
  const nextSelector = snapshot.selectedAttachmentId;
  const current = get(authenticatorSession);
  const nextReady = Boolean(snapshot.selection);
  const nextSelectionID = snapshot.selection?.id ?? "";
  const currentReady = current.authenticator.state === "ready";
  const currentSelectionID = current.authenticator.selectionId ?? "";
  const attachmentChanged = nextSelector !== current.selectedAttachmentId;
  const boundaryChanged = attachmentChanged || nextSelectionID !== currentSelectionID;
  const becameReady = nextReady && (!currentReady || nextSelectionID !== currentSelectionID);

  authenticatorSession.set({
    devices: snapshot.devices,
    endpoints: snapshot.endpoints,
    selectedDeviceId: snapshot.selectedDeviceId,
    selectedAttachmentId: nextSelector,
    authenticator: nextReady
      ? { selectionId: nextSelectionID, state: "ready" }
      : snapshot.error
        ? { state: "error", error: snapshot.error }
        : { state: "idle" },
  });

  if (boundaryChanged) {
    pendingInteraction.set(null);
    clearWorkbenchScreenCaches();
  }

  return { boundaryChanged, attachmentChanged, becameReady };
}

export function setAuthenticatorError(error: Failure) {
  authenticatorSession.update((session) => ({
    ...session,
    selectedAttachmentId: "",
    selectedDeviceId: "",
    authenticator: { state: "error", error },
  }));
  clearWorkbenchScreenCaches();
}

export function clearAuthenticatorSession() {
  authenticatorSession.set({
    devices: [],
    endpoints: [],
    selectedDeviceId: "",
    selectedAttachmentId: "",
    authenticator: { state: "idle" },
  });
  clearWorkbenchScreenCaches();
}

export function setStatusOperation(operation: ActiveOperation | null) {
  statusBar.update((state) => ({ ...state, activeOperation: operation }));
}

export function beginOperation(label: string) {
  setStatusOperation({
    selectionId: activeSelectionID() || undefined,
    label,
  });
}

export function finishOperation() {
  setStatusOperation(null);
  pendingInteraction.set(null);
}

export function setStatusOutcome(outcome: StatusBarOutcome | null) {
  statusBar.update((state) => ({ ...state, lastOutcome: outcome }));
}

export function clearWorkbenchScreenCaches() {
  resetDeviceState();
}

export function summarizeEnvelope(label: string, envelope: OperationEnvelope) {
  const error = envelope.error;

  if (error) {
    summarizeOperationFailure(label, error);

    return;
  }

  finishOperation();
  setStatusOutcome({
    tone: "success",
    title: m.operation_complete_with_label({ label }),
    message: m.operation_finished_successfully(),
  });
}

export function summarizeOperationFailure(label: string, error: Failure) {
  finishOperation();

  const canceled = isCanceledFailure(error);
  const title = canceled
    ? m.operation_canceled_with_label({ label })
    : m.operation_failed_with_label({ label });
  const outcome: StatusBarOutcome = {
    tone: canceled ? "info" : "error",
    title,
    message: failureMessage(error),
  };

  setStatusOutcome(outcome);
}
