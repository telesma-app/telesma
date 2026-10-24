import { get } from "svelte/store";

import type { Failure } from "../../bindings/github.com/telesma-app/kit/model/failure";

import { m } from "../paraglide/messages.js";
import { api } from "$lib/api.js";
import { authenticatorSession } from "$lib/features/authenticator/state.js";
import { pendingInteraction } from "$lib/features/interaction/state.js";
import { failureMessage, runtimeFailureFrom } from "$lib/failure.js";
import { reportForSelector } from "$lib/authenticator-model.js";
import {
  clearAuthenticatorSession,
  finishOperation,
  setAuthenticatorError,
  setStatusOutcome,
} from "$lib/workbench-state.js";

let resolveInitialSessionUpdate: (() => void) | null = null;

function waitForInitialSessionUpdate() {
  return new Promise<void>((resolve) => {
    resolveInitialSessionUpdate = resolve;
  });
}

export function sessionUpdateApplied() {
  const resolve = resolveInitialSessionUpdate;
  resolveInitialSessionUpdate = null;
  resolve?.();
}

export async function bootstrapAuthenticatorSession() {
  const initialSessionUpdate = waitForInitialSessionUpdate();

  try {
    await api.discover();
    await initialSessionUpdate;
  } catch (error) {
    resolveInitialSessionUpdate = null;
    const runtimeError = runtimeFailureFrom(error);

    setAuthenticatorError(runtimeError);
    setStatusOutcome({
      tone: "error",
      title: m.discovery_issue(),
      message: failureMessage(runtimeError),
    });
  }
}

export async function selectAuthenticatorSession(selector: string) {
  const requestedSelector = selector.trim();
  const device = reportForSelector(get(authenticatorSession).devices, requestedSelector);
  const deviceId = device?.id ?? "";

  pendingInteraction.set(null);

  try {
    await api.setSelection({ deviceId });
  } catch (error) {
    const runtimeError = runtimeFailureFrom(error);

    setStatusOutcome({
      tone: "error",
      title: m.token_selection_issue(),
      message: failureMessage(runtimeError),
    });
  }
}

export async function selectAuthenticatorEndpoint(attachmentId: string) {
  pendingInteraction.set(null);

  try {
    await api.setEndpointSelection({ attachmentId });
  } catch (error) {
    const runtimeError = runtimeFailureFrom(error);

    setStatusOutcome({
      tone: "error",
      title: m.token_selection_issue(),
      message: failureMessage(runtimeError),
    });
  }
}

/**
 * Factory reset invalidates the selected authenticator as an application
 * boundary. Recreate the device manager, then apply its fresh selection.
 */
export async function rediscoverAfterFactoryReset(): Promise<Failure | null> {
  pendingInteraction.set(null);
  finishOperation();
  clearAuthenticatorSession();

  try {
    await api.reconnectSelection();

    return null;
  } catch (error) {
    const runtimeError = runtimeFailureFrom(error);

    return runtimeError;
  }
}

export function shutdownWorkbench() {
  pendingInteraction.set(null);
  finishOperation();
  clearAuthenticatorSession();
}
