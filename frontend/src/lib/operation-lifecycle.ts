import type { Failure } from "../../bindings/github.com/telesma-app/kit/model/failure";

import type { OperationEnvelope } from "$lib/api.js";
import {
  applyAuthenticatorClosedError,
  applyOperationAuthenticatorBoundary,
} from "$lib/authenticator-boundary.js";
import { runtimeFailureFrom } from "$lib/failure.js";
import { offerOperationRecovery } from "$lib/operation-recovery.js";
import {
  beginOperation,
  finishOperation,
  summarizeEnvelope,
  summarizeOperationFailure,
} from "$lib/workbench-state.js";

export type OperationAttempt<E extends OperationEnvelope> =
  { ok: true; envelope: E } | { ok: false; error: Failure };

interface RunOperationOptions<E extends OperationEnvelope> {
  label: string;
  call: () => Promise<E>;
  cardPresenceRecovery?: boolean;
  onRuntimeFailure?: (error: Failure) => void;
}

export interface CompleteOperationOptions {
  summarize?: boolean;
}

export type TypedOperationStageFailure<E extends OperationEnvelope> =
  | { ok: false; reason: "runtime-error"; error: Failure }
  | { ok: false; reason: "response-error"; envelope: E };

export type TypedOperationStageOutcome<E extends OperationEnvelope, TValue> =
  { ok: true; envelope: E; value: TValue } | TypedOperationStageFailure<E>;

interface RunTypedOperationStageOptions<E extends OperationEnvelope, TValue> {
  label: string;
  call: () => Promise<E>;
  cardPresenceRecovery?: boolean;
  extract: (envelope: E) => TValue | null;
  onFailure: (failure: TypedOperationStageFailure<E>) => void;
  onSuccess?: (value: TValue, envelope: E) => void;
  completion?:
    CompleteOperationOptions | ((value: TValue | null, envelope: E) => CompleteOperationOptions);
}

/**
 * Runs the bridge portion of a typed authenticator operation.
 *
 * Runtime failures remain separate from generated service envelopes. Feature
 * state is updated before the authenticator boundary is applied so an invalid
 * selection can clear the just-failed device state consistently.
 */
export async function runOperation<E extends OperationEnvelope>({
  label,
  call,
  cardPresenceRecovery = true,
  onRuntimeFailure,
}: RunOperationOptions<E>): Promise<OperationAttempt<E>> {
  while (true) {
    beginOperation(label);
    try {
      const envelope = await call();
      const recovery =
        cardPresenceRecovery && envelope.error
          ? offerOperationRecovery(label, envelope.error)
          : null;

      if (recovery) {
        finishOperation();
        if ((await recovery) === "retry") continue;
      }

      return { ok: true, envelope };
    } catch (cause) {
      const error = runtimeFailureFrom(cause);

      onRuntimeFailure?.(error);
      summarizeOperationFailure(label, error);
      applyAuthenticatorClosedError(error);

      return { ok: false, error };
    }
  }
}

/**
 * Runs one typed preview or execution stage and classifies its outcome.
 *
 * Feature controllers retain ownership of their generated DTOs and state
 * transitions. This helper only enforces the shared ordering: runtime failure,
 * response failure, success, then operation-boundary completion.
 */
export async function runTypedOperationStage<E extends OperationEnvelope, TValue>({
  label,
  call,
  cardPresenceRecovery,
  extract,
  onFailure,
  onSuccess,
  completion,
}: RunTypedOperationStageOptions<E, TValue>): Promise<TypedOperationStageOutcome<E, TValue>> {
  const attempt = await runOperation({
    label,
    call,
    cardPresenceRecovery,
    onRuntimeFailure: (error) => {
      onFailure({ ok: false, reason: "runtime-error", error });
    },
  });

  if (!attempt.ok) {
    return { ok: false, reason: "runtime-error", error: attempt.error };
  }

  const envelope = attempt.envelope;
  let value: TValue | null = null;
  let outcome: TypedOperationStageOutcome<E, TValue>;

  if (envelope.error) {
    outcome = { ok: false, reason: "response-error", envelope };
    onFailure(outcome);
  } else {
    value = extract(envelope)!;
    onSuccess?.(value, envelope);
    outcome = { ok: true, envelope, value };
  }

  const options = typeof completion === "function" ? completion(value, envelope) : completion;

  completeOperation(label, envelope, options);

  return outcome;
}

/**
 * Completes a real generated operation response after feature state has
 * consumed it.
 */
export function completeOperation(
  label: string,
  envelope: OperationEnvelope,
  { summarize = true }: CompleteOperationOptions = {},
) {
  if (summarize) {
    summarizeEnvelope(label, envelope);
  } else {
    finishOperation();
  }

  applyOperationAuthenticatorBoundary(envelope);
}
