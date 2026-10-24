import { get } from "svelte/store";
import { beforeEach, describe, expect, it } from "vitest";

import { InteractionKind } from "../../bindings/github.com/telesma-app/kit/model";
import { Kind as OperationKind } from "../../bindings/github.com/telesma-app/kit/model/operation";
import { Code } from "../../bindings/github.com/telesma-app/kit/model/failure";
import type { CredentialsEnvelope, InteractionPrompt } from "../../bindings/telesma/service";

import { pendingInteraction } from "$lib/features/interaction/state.js";
import { applyOperationAuthenticatorBoundary } from "$lib/authenticator-boundary.js";
import { failureForCode } from "$lib/test-support/failure.js";
import { seedSelectionForTest } from "$lib/test-support/store-utils.js";
import {
  authenticatorGetInfo,
  authenticatorStatus,
  selectedSelector,
} from "$lib/features/authenticator/state.js";
import { readyLoadState } from "$lib/load-state.js";

function envelope(authenticatorClosed: boolean, code: Code): CredentialsEnvelope {
  return {
    operationId: "operation-1",
    selectionId: "authenticator-1",
    kind: OperationKind.ListCredentials,
    authenticatorClosed,
    error: failureForCode(code),
  } as CredentialsEnvelope;
}

describe("operation authenticator boundary", () => {
  beforeEach(() => {
    seedSelectionForTest("token-1", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    pendingInteraction.set({
      operationId: "operation-1",
      selectionId: "authenticator-1",
      interactionId: "interaction-1",
      request: { kind: InteractionKind.InteractionKindTouch },
    } as InteractionPrompt);
  });

  it("clears a closed authenticator independently of the failure category", () => {
    const response = envelope(true, Code.CodeOperationCanceled);

    authenticatorGetInfo.set(readyLoadState(response as never));
    applyOperationAuthenticatorBoundary(response);

    expect(get(authenticatorStatus)).toEqual({ state: "error", error: response.error });
    expect(get(authenticatorGetInfo).state).toBe("idle");
    expect(get(selectedSelector)).toBe("token-1");
    expect(get(pendingInteraction)).toBeNull();
  });

  it("keeps the authenticator after a non-closing transport failure", () => {
    applyOperationAuthenticatorBoundary(envelope(false, Code.CodeTransportFailure));

    expect(get(authenticatorStatus)).toEqual({ state: "ready", selectionId: "authenticator-1" });
    expect(get(pendingInteraction)?.interactionId).toBe("interaction-1");
  });
});
