import { get } from "svelte/store";

import type { Failure } from "../../bindings/github.com/telesma-app/kit/model/failure";

import type { OperationEnvelope } from "$lib/api.js";
import { resetDeviceState } from "$lib/device-state.js";
import { isAuthenticatorClosedFailure } from "$lib/failure.js";
import { pendingInteraction } from "$lib/features/interaction/state.js";
import { authenticatorSession } from "$lib/features/authenticator/state.js";

export function activeSelectionID() {
  return get(authenticatorSession).authenticator.selectionId || "";
}

export function applyAuthenticatorClosedError(error: Failure | null | undefined) {
  if (!isAuthenticatorClosedFailure(error)) return;

  clearAuthenticator(error);
}

export function applyOperationAuthenticatorBoundary(envelope: OperationEnvelope) {
  if (envelope.authenticatorClosed) {
    clearAuthenticator(envelope.error);

    return;
  }

  applyAuthenticatorClosedError(envelope.error);
}

function clearAuthenticator(error: Failure | null | undefined) {
  pendingInteraction.set(null);
  resetDeviceState();
  authenticatorSession.update((session) => {
    const state = session.authenticator;
    const { selectionId: _selectionId, error: _error, ...rest } = state;

    return {
      ...session,
      authenticator: !error
        ? { ...rest, state: "idle" }
        : {
            ...rest,
            state: "error",
            error,
          },
    };
  });
}
