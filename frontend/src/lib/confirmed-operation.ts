import type { Failure } from "../../bindings/github.com/telesma-app/kit/model/failure";

import type { OperationEnvelope } from "$lib/api.js";
import {
  runTypedOperationStage,
  type CompleteOperationOptions,
  type TypedOperationStageFailure,
} from "$lib/operation-lifecycle.js";

export type ConfirmedOperationIdle = { phase: "idle" };

export type ConfirmedOperationEditing<TValidationError extends string> = {
  phase: "editing";
  validationError: TValidationError | null;
};

type ReviewContext<TRequest, TEnvelope, TPreview = unknown> = {
  previewRequest: TRequest;
  previewEnvelope: TEnvelope;
  previewValue: TPreview;
};

export type ConfirmedOperationExecution<TRequest, TEnvelope, TPreview = unknown> = {
  previewEnvelope: TEnvelope;
  previewValue: TPreview;
  request: TRequest;
};

type RuntimeFailure = {
  responseEnvelope: null;
  runtimeError: Failure;
};

type ResponseFailure<TEnvelope> = {
  responseEnvelope: TEnvelope;
  runtimeError: null;
};

type PreviewFailure<TEnvelope> = {
  phase: "error";
  failedPhase: "previewing";
} & (RuntimeFailure | ResponseFailure<TEnvelope>);

type ExecutionFailure<TRequest, TEnvelope, TPreview = unknown> = {
  phase: "error";
  failedPhase: "executing";
} & ConfirmedOperationExecution<TRequest, TEnvelope, TPreview> &
  (RuntimeFailure | ResponseFailure<TEnvelope>);

export type ConfirmedOperationPreviewing = {
  phase: "previewing";
};

export type ConfirmedOperationReview<TRequest, TEnvelope, TPreview = unknown> = {
  phase: "review";
} & ReviewContext<TRequest, TEnvelope, TPreview>;

export type ConfirmedOperationExecuting<TRequest, TEnvelope, TPreview = unknown> = {
  phase: "executing";
} & ConfirmedOperationExecution<TRequest, TEnvelope, TPreview>;

type ConfirmedOperationSuccess<TRequest, TEnvelope, TPreview, TValue> = {
  phase: "success";
  responseEnvelope: TEnvelope;
  value: TValue;
} & ConfirmedOperationExecution<TRequest, TEnvelope, TPreview>;

export type ConfirmedOperationError<TRequest, TEnvelope, TPreview = unknown> =
  PreviewFailure<TEnvelope> | ExecutionFailure<TRequest, TEnvelope, TPreview>;

export type ConfirmableOperation<
  TRequest,
  TEnvelope,
  TValidationError extends string,
  TPreview = unknown,
> =
  | ConfirmedOperationEditing<TValidationError>
  | ConfirmedOperationPreviewing
  | ConfirmedOperationReview<TRequest, TEnvelope, TPreview>
  | ConfirmedOperationExecuting<TRequest, TEnvelope, TPreview>
  | ConfirmedOperationError<TRequest, TEnvelope, TPreview>;

export type ConfirmedOperation<TRequest, TEnvelope, TPreview = unknown, TValue = unknown> =
  | { phase: "editing" }
  | ConfirmedOperationPreviewing
  | ConfirmedOperationReview<TRequest, TEnvelope, TPreview>
  | ConfirmedOperationExecuting<TRequest, TEnvelope, TPreview>
  | ConfirmedOperationSuccess<TRequest, TEnvelope, TPreview, TValue>
  | ConfirmedOperationError<TRequest, TEnvelope, TPreview>;

export type ConfirmableMutation<
  TBase,
  TRequest,
  TEnvelope,
  TValidationError extends string,
  TPreview = unknown,
> = TBase & {
  operation: ConfirmableOperation<TRequest, TEnvelope, TValidationError, TPreview>;
};

export type NonEditableConfirmedMutation<TBase, TRequest, TEnvelope, TPreview = unknown> = TBase & {
  operation: Exclude<
    ConfirmableOperation<TRequest, TEnvelope, never, TPreview>,
    { phase: "editing" }
  >;
};

export type ConfirmedPreviewTransition<TRequest, TEnvelope, TPreview> =
  | ConfirmedOperationPreviewing
  | ConfirmedOperationReview<TRequest, TEnvelope, TPreview>
  | ConfirmedOperationError<TRequest, TEnvelope, TPreview>;

export type ConfirmedExecutionTransition<TRequest, TEnvelope, TPreview> =
  | ConfirmedOperationExecuting<TRequest, TEnvelope, TPreview>
  | ConfirmedOperationError<TRequest, TEnvelope, TPreview>;

type PreviewReviewPolicy<TValue, TEnvelope> =
  | {
      shouldReview?: undefined;
      onSkipped?: never;
    }
  | {
      shouldReview: (value: TValue, envelope: TEnvelope) => boolean;
      onSkipped: (value: TValue, envelope: TEnvelope) => void;
    };

type RunConfirmedPreviewOptions<TRequest, TEnvelope extends OperationEnvelope, TValue> = {
  label: string;
  request: TRequest;
  call: (request: TRequest) => Promise<TEnvelope>;
  extract: (envelope: TEnvelope) => TValue | null;
  publish: (transition: ConfirmedPreviewTransition<TRequest, TEnvelope, TValue>) => void;
  completion?:
    | CompleteOperationOptions
    | ((value: TValue | null, envelope: TEnvelope) => CompleteOperationOptions);
} & PreviewReviewPolicy<TValue, TEnvelope>;

interface RunConfirmedExecutionOptions<
  TRequest extends { dryRun?: boolean },
  TEnvelope extends OperationEnvelope,
  TPreview,
  TValue,
> {
  label: string;
  operation:
    | ConfirmedOperationReview<TRequest, NoInfer<TEnvelope>, TPreview>
    | ConfirmedOperationError<TRequest, NoInfer<TEnvelope>, TPreview>;
  makeRequest?: (previewRequest: TRequest) => TRequest;
  call: (request: TRequest) => Promise<TEnvelope>;
  extract: (envelope: TEnvelope) => TValue | null;
  publish: (transition: ConfirmedExecutionTransition<TRequest, TEnvelope, TPreview>) => void;
  onSuccess?: (
    value: TValue,
    envelope: TEnvelope,
    execution: ConfirmedOperationExecution<TRequest, TEnvelope, TPreview>,
  ) => void;
  completion?:
    | CompleteOperationOptions
    | ((value: TValue | null, envelope: TEnvelope) => CompleteOperationOptions);
}

export function idleConfirmedOperation(): ConfirmedOperationIdle {
  return { phase: "idle" };
}

export function editingConfirmedOperation<TValidationError extends string>(
  validationError: TValidationError | null,
): ConfirmedOperationEditing<TValidationError> {
  return { phase: "editing", validationError };
}

function failureDetails<TEnvelope extends OperationEnvelope>(
  failure: TypedOperationStageFailure<TEnvelope>,
): RuntimeFailure | ResponseFailure<TEnvelope> {
  return failure.reason === "runtime-error"
    ? {
        responseEnvelope: null,
        runtimeError: failure.error,
      }
    : {
        responseEnvelope: failure.envelope,
        runtimeError: null,
      };
}

export function confirmedOperationExecution<TRequest, TEnvelope, TPreview = unknown>(
  operation:
    | ConfirmedOperationReview<TRequest, TEnvelope, TPreview>
    | ConfirmedOperationError<TRequest, TEnvelope, TPreview>,
  makeRequest: (previewRequest: TRequest) => TRequest,
): ConfirmedOperationExecution<TRequest, TEnvelope, TPreview> | null {
  if (operation.phase === "review") {
    return {
      previewEnvelope: operation.previewEnvelope,
      previewValue: operation.previewValue,
      request: makeRequest(operation.previewRequest),
    };
  }

  if (operation.failedPhase !== "executing") return null;

  return {
    previewEnvelope: operation.previewEnvelope,
    previewValue: operation.previewValue,
    request: operation.request,
  };
}

export async function runConfirmedPreview<TRequest, TEnvelope extends OperationEnvelope, TValue>({
  label,
  request,
  call,
  extract,
  publish,
  shouldReview,
  onSkipped,
  completion,
}: RunConfirmedPreviewOptions<TRequest, TEnvelope, TValue>): Promise<boolean> {
  publish({ phase: "previewing" });
  let skipped = false;

  const outcome = await runTypedOperationStage({
    label,
    call: () => call(request),
    extract,
    onFailure: (failure) =>
      publish({ phase: "error", failedPhase: "previewing", ...failureDetails(failure) }),
    onSuccess: (value, envelope) => {
      if (!shouldReview || shouldReview(value, envelope)) {
        publish({
          phase: "review",
          previewRequest: request,
          previewEnvelope: envelope,
          previewValue: value,
        });

        return;
      }

      skipped = true;
      onSkipped(value, envelope);
    },
    completion: (value, envelope) => {
      if (skipped) return { summarize: false };

      return typeof completion === "function" ? completion(value, envelope) : (completion ?? {});
    },
  });

  return outcome.ok;
}

export async function runConfirmedExecution<
  TRequest extends { dryRun?: boolean },
  TEnvelope extends OperationEnvelope,
  TPreview,
  TValue,
>({
  label,
  operation,
  makeRequest = (request): TRequest => ({ ...request, dryRun: false }),
  call,
  extract,
  publish,
  onSuccess,
  completion,
}: RunConfirmedExecutionOptions<TRequest, TEnvelope, TPreview, TValue>): Promise<boolean> {
  const execution = confirmedOperationExecution<TRequest, TEnvelope, TPreview>(
    operation,
    makeRequest,
  );

  if (!execution) return false;

  publish({ phase: "executing", ...execution });

  const outcome = await runTypedOperationStage({
    label,
    call: () => call(execution.request),
    extract,
    onFailure: (failure) =>
      publish({
        phase: "error",
        failedPhase: "executing",
        ...execution,
        ...failureDetails(failure),
      }),
    onSuccess: (value, envelope) => onSuccess?.(value, envelope, execution),
    completion,
  });

  return outcome.ok;
}
