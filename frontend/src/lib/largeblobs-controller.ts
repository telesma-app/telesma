import { get } from "svelte/store";

import { VerificationFlow } from "../../bindings/github.com/telesma-app/kit";
import {
  DecodeMode,
  MutationOperation,
  ReadState,
  type MutationResult,
} from "../../bindings/github.com/telesma-app/kit/model/largeblobs";
import type {
  LargeBlobDecodeEnvelope,
  LargeBlobDecodeRequest,
  LargeBlobGarbageCollectRequest,
  LargeBlobDeleteRequest,
  LargeBlobMutationEnvelope,
  LargeBlobReadEnvelope,
  LargeBlobReadRequest,
  LargeBlobWriteRequest,
  OperationRequest,
} from "../../bindings/telesma/service";
import { m } from "../paraglide/messages.js";
import { api } from "$lib/api.js";
import {
  largeBlobDecodeResult,
  largeBlobListReport,
  largeBlobMutationPreview,
  largeBlobMutationResult,
  largeBlobReadReport,
} from "$lib/ctapkit-results.js";
import {
  beginLargeBlobsInventoryLoad,
  completeLargeBlobsInventoryLoad,
  failLargeBlobsInventoryLoadAtRuntime,
  failLargeBlobsInventoryLoadWithResponse,
  invalidateLargeBlobArrayInventory,
  largeBlobsDecodeState,
  largeBlobsDecodeMode,
  largeBlobsInventoryState,
  largeBlobsMutation,
  largeBlobsPayloadEncoding,
  largeBlobsQuery,
  largeBlobsReadState,
  largeBlobsSelectedEntryIndex,
  largeBlobsStatusFilter,
  largeBlobsVerificationFlow,
  passkeyLargeBlobState,
  resetLargeBlobReadState,
  resetLargeBlobsDeviceState,
  type LargeBlobMutationState,
  type LargeBlobWriteDraft,
  type LargeBlobsStatusFilter,
} from "$lib/features/largeblobs/state.js";
import { selectedSelector, authenticatorStatus } from "$lib/features/authenticator/state.js";
import { activeScreen } from "$lib/features/workbench/state.js";
import {
  convertLargeBlobPayload,
  parseLargeBlobPayload,
  type LargeBlobPayloadEncoding,
  type LargeBlobPayloadValidationError,
} from "$lib/largeblobs-payload.js";
import { findLargeBlobEntry } from "$lib/largeblobs-presentation.js";
import { runtimeFailureFrom } from "$lib/failure.js";
import {
  editingConfirmedOperation,
  idleConfirmedOperation,
  runConfirmedExecution,
  runConfirmedPreview,
  type ConfirmedOperationError,
  type ConfirmedOperationExecuting,
  type ConfirmedOperationReview,
} from "$lib/confirmed-operation.js";
import { completeOperation, runOperation } from "$lib/operation-lifecycle.js";
import { setStatusOutcome } from "$lib/workbench-state.js";

function shouldAutoLoadLargeBlobs() {
  const inventory = get(largeBlobsInventoryState);

  return (
    get(activeScreen) === "large-blobs" &&
    Boolean(get(selectedSelector).trim() && get(authenticatorStatus).selectionId) &&
    !inventory.report &&
    inventory.phase !== "loading" &&
    inventory.phase !== "refreshing" &&
    inventory.phase !== "unsupported"
  );
}

function reconcileSelectedEntry() {
  const selectedIndex = get(largeBlobsSelectedEntryIndex);

  if (selectedIndex === null) return;

  const report = get(largeBlobsInventoryState).report;

  if (findLargeBlobEntry(report, selectedIndex)) return;

  largeBlobsSelectedEntryIndex.set(null);
  resetLargeBlobReadState();
  largeBlobsMutation.set({ kind: "idle", operation: idleConfirmedOperation() });
}

export async function maybeLoadLargeBlobs() {
  if (!shouldAutoLoadLargeBlobs()) return;

  await loadLargeBlobs();
}

export async function loadLargeBlobs() {
  const selector = get(selectedSelector).trim();

  if (!selector) {
    resetLargeBlobsDeviceState();

    return false;
  }

  beginLargeBlobsInventoryLoad();

  const label = m.large_blob_list();
  const request: OperationRequest = {
    verificationFlow: get(largeBlobsVerificationFlow),
  };
  const attempt = await runOperation({
    label,
    call: () => api.listLargeBlobs(request),
    onRuntimeFailure: failLargeBlobsInventoryLoadAtRuntime,
  });

  if (!attempt.ok) return false;

  const envelope = attempt.envelope;

  if (envelope.error) {
    failLargeBlobsInventoryLoadWithResponse(envelope);
  } else {
    completeLargeBlobsInventoryLoad(largeBlobListReport(envelope)!, new Date().toISOString());
    resetLargeBlobReadState();
    reconcileSelectedEntry();
  }

  completeOperation(label, envelope);

  const selectedEntryIndex = get(largeBlobsSelectedEntryIndex);

  if (!envelope.error && selectedEntryIndex !== null) {
    await readLargeBlob(selectedEntryIndex);
  }

  return !envelope.error;
}

export function setLargeBlobsQuery(value: string) {
  largeBlobsQuery.set(value);
}

export function setLargeBlobsStatusFilter(value: LargeBlobsStatusFilter) {
  largeBlobsStatusFilter.set(value);
}

export async function selectLargeBlobEntry(entryIndex: number | null): Promise<boolean> {
  if (get(largeBlobsSelectedEntryIndex) === entryIndex) return true;

  largeBlobsSelectedEntryIndex.set(entryIndex);
  resetLargeBlobReadState();
  largeBlobsMutation.set({ kind: "idle", operation: idleConfirmedOperation() });
  if (entryIndex === null) return true;

  const entry = findLargeBlobEntry(reportForActions(), entryIndex);

  return entryHasTarget(entry) ? readLargeBlob(entryIndex) : true;
}

export function setLargeBlobsVerificationFlow(value: VerificationFlow) {
  largeBlobsVerificationFlow.set(value);
}

export async function setLargeBlobsDecodeMode(value: DecodeMode): Promise<boolean> {
  largeBlobsDecodeMode.set(value);
  const readState = get(largeBlobsReadState);

  if (readState.phase !== "ready") {
    largeBlobsDecodeState.set({ phase: "idle" });

    return true;
  }

  const report = largeBlobReadReport(readState.responseEnvelope);

  if (report?.state !== ReadState.ReadStatePresent) {
    largeBlobsDecodeState.set({ phase: "idle" });

    return true;
  }

  return decodeLargeBlob(readState.entryIndex, report.rawHex ?? "", value);
}

export function setLargeBlobsPayloadEncoding(value: LargeBlobPayloadEncoding) {
  const current = get(largeBlobsMutation);

  if (current.kind !== "write") {
    largeBlobsPayloadEncoding.set(value);

    return true;
  }

  const payload = convertLargeBlobPayload(current.draft.payload, current.draft.encoding, value);

  if (payload === null) return false;

  largeBlobsPayloadEncoding.set(value);

  largeBlobsMutation.set(
    editingLargeBlobWrite(
      {
        ...writeMutationBase(current),
        draft: { payload, encoding: value },
      },
      null,
    ),
  );

  return true;
}

function reportForActions() {
  const inventory = get(largeBlobsInventoryState);

  if (inventory.phase === "loading" || inventory.phase === "refreshing") return null;

  const authenticator = get(authenticatorStatus);

  if (authenticator.state !== "ready" || !authenticator.selectionId) return null;

  const report = inventory.report;

  return report?.support.largeBlobs ? report : null;
}

function entryHasTarget(entry: ReturnType<typeof findLargeBlobEntry>): entry is NonNullable<
  ReturnType<typeof findLargeBlobEntry>
> & {
  target: NonNullable<NonNullable<ReturnType<typeof findLargeBlobEntry>>["target"]>;
} {
  return Boolean(entry?.target);
}

function entryForMutation(entryIndex: number) {
  const entry = findLargeBlobEntry(reportForActions(), entryIndex);

  return entryHasTarget(entry) ? entry : null;
}

function writeMutationBase(current: Extract<LargeBlobMutationState, { kind: "write" }>) {
  return {
    kind: "write" as const,
    entryIndex: current.entryIndex,
    credentialIDHex: current.credentialIDHex,
    verificationFlow: current.verificationFlow,
    existing: current.existing,
    draft: current.draft,
  };
}

function deleteMutationBase(
  entryIndex: number | null,
  credentialIDHex: string,
  verificationFlow: VerificationFlow,
) {
  return { kind: "delete" as const, entryIndex, credentialIDHex, verificationFlow };
}

function cleanupMutationBase() {
  return { kind: "cleanup" as const };
}

function editingLargeBlobWrite(
  base: ReturnType<typeof writeMutationBase>,
  validationError: LargeBlobPayloadValidationError | null,
) {
  return {
    ...base,
    operation: editingConfirmedOperation(validationError),
  };
}

function writeDraftFromRawHex(rawHex: string): LargeBlobWriteDraft {
  const payload = convertLargeBlobPayload(rawHex, "hex", "utf8");

  return payload === null ? { payload: rawHex, encoding: "hex" } : { payload, encoding: "utf8" };
}

function readError(
  entryIndex: number,
  responseEnvelope: LargeBlobReadEnvelope | null,
  runtimeError: ReturnType<typeof runtimeFailureFrom> | null,
) {
  largeBlobsReadState.set({
    phase: "error",
    entryIndex,
    responseEnvelope,
    runtimeError,
  });
}

function decodeError(
  entryIndex: number,
  mode: DecodeMode,
  responseEnvelope: LargeBlobDecodeEnvelope | null,
  runtimeError: ReturnType<typeof runtimeFailureFrom> | null,
) {
  largeBlobsDecodeState.set({
    phase: "error",
    entryIndex,
    mode,
    responseEnvelope,
    runtimeError,
  });
}

async function decodeLargeBlob(
  entryIndex: number,
  rawHex: string,
  mode = get(largeBlobsDecodeMode),
): Promise<boolean> {
  const request: LargeBlobDecodeRequest = { rawHex, mode };

  largeBlobsDecodeState.set({ phase: "loading", entryIndex, mode });

  try {
    const envelope = await api.decodeLargeBlob(request);

    if (envelope.error) {
      decodeError(entryIndex, mode, envelope, null);

      return false;
    }

    largeBlobsDecodeState.set({
      phase: "ready",
      entryIndex,
      mode,
      responseEnvelope: envelope,
      value: largeBlobDecodeResult(envelope)!,
    });

    return true;
  } catch (cause) {
    decodeError(entryIndex, mode, null, runtimeFailureFrom(cause));

    return false;
  }
}

export async function readLargeBlob(
  entryIndex = get(largeBlobsSelectedEntryIndex),
): Promise<boolean> {
  const inventory = reportForActions();
  if (entryIndex === null) return false;

  const entry = findLargeBlobEntry(inventory, entryIndex);
  if (!entryHasTarget(entry)) return false;

  const request: LargeBlobReadRequest = {
    verificationFlow: get(largeBlobsVerificationFlow),
    credentialIDHex: entry.target.credentialIDHex,
  };

  largeBlobsSelectedEntryIndex.set(entryIndex);
  resetLargeBlobReadState();
  largeBlobsReadState.set({ phase: "loading", entryIndex });

  const label = m.large_blob_read();
  const attempt = await runOperation({
    label,
    call: () => api.readLargeBlob(request),
    onRuntimeFailure: (error) => readError(entryIndex, null, error),
  });

  if (!attempt.ok) return false;

  const envelope = attempt.envelope;
  if (envelope.error) {
    readError(entryIndex, envelope, null);
  } else {
    largeBlobsReadState.set({ phase: "ready", entryIndex, responseEnvelope: envelope });
  }

  completeOperation(label, envelope);

  if (envelope.error) return false;

  const report = largeBlobReadReport(envelope)!;

  if (report.state === ReadState.ReadStatePresent) {
    await decodeLargeBlob(entryIndex, report.rawHex ?? "");
  }

  return true;
}

function passkeyLargeBlobError(
  credentialIDHex: string,
  responseEnvelope: LargeBlobReadEnvelope | null,
  runtimeError: ReturnType<typeof runtimeFailureFrom> | null,
) {
  passkeyLargeBlobState.set({
    phase: "error",
    credentialIDHex,
    responseEnvelope,
    runtimeError,
  });
}

export async function checkPasskeyLargeBlob(
  credentialIDHex: string,
  verificationFlow: VerificationFlow,
): Promise<boolean> {
  const request: LargeBlobReadRequest = { verificationFlow, credentialIDHex };

  passkeyLargeBlobState.set({ phase: "loading", credentialIDHex });

  const label = m.large_blob_read();
  const attempt = await runOperation({
    label,
    call: () => api.readLargeBlob(request),
    onRuntimeFailure: (error) => passkeyLargeBlobError(credentialIDHex, null, error),
  });

  if (!attempt.ok) return false;

  const envelope = attempt.envelope;

  if (envelope.error) {
    passkeyLargeBlobError(credentialIDHex, envelope, null);
  } else {
    const report = largeBlobReadReport(envelope)!;

    passkeyLargeBlobState.set(
      report.state === ReadState.ReadStatePresent
        ? {
            phase: "ready",
            credentialIDHex,
            state: ReadState.ReadStatePresent,
            rawByteCount: report.rawByteCount,
            draft: writeDraftFromRawHex(report.rawHex ?? ""),
          }
        : {
            phase: "ready",
            credentialIDHex,
            state: ReadState.ReadStateMissing,
            rawByteCount: 0,
            draft: null,
          },
    );
  }

  completeOperation(label, envelope);

  return !envelope.error;
}

export function buildLargeBlobDeletePreviewRequest(
  verificationFlow: VerificationFlow,
  credentialIDHex: string,
): LargeBlobDeleteRequest {
  return {
    verificationFlow,
    credentialIDHex,
    dryRun: true,
  };
}

export function buildLargeBlobCleanupPreviewRequest(
  verificationFlow: VerificationFlow,
): LargeBlobGarbageCollectRequest {
  return {
    verificationFlow,
    dryRun: true,
  };
}

export function beginLargeBlobWrite(entryIndex = get(largeBlobsSelectedEntryIndex)) {
  if (entryIndex === null) return false;

  const entry = entryForMutation(entryIndex);
  if (!entry) return false;

  const readState = get(largeBlobsReadState);

  if (readState.phase !== "ready" || readState.entryIndex !== entryIndex) return false;

  const report = largeBlobReadReport(readState.responseEnvelope);

  if (!report || report.state !== ReadState.ReadStatePresent) return false;

  const draft = writeDraftFromRawHex(report.rawHex ?? "");

  largeBlobsSelectedEntryIndex.set(entryIndex);
  largeBlobsMutation.set(
    editingLargeBlobWrite(
      {
        kind: "write" as const,
        entryIndex,
        credentialIDHex: entry.target.credentialIDHex,
        verificationFlow: get(largeBlobsVerificationFlow),
        existing: true,
        draft,
      },
      null,
    ),
  );

  return true;
}

export function beginPasskeyLargeBlobWrite(
  credentialIDHex: string,
  verificationFlow: VerificationFlow,
) {
  const state = get(passkeyLargeBlobState);

  if (state.phase !== "ready" || state.credentialIDHex !== credentialIDHex) return false;

  const existing = state.state === ReadState.ReadStatePresent;
  const draft = existing
    ? state.draft
    : ({ payload: "", encoding: get(largeBlobsPayloadEncoding) } satisfies LargeBlobWriteDraft);

  largeBlobsMutation.set(
    editingLargeBlobWrite(
      {
        kind: "write" as const,
        entryIndex: null,
        credentialIDHex,
        verificationFlow,
        existing,
        draft,
      },
      null,
    ),
  );

  return true;
}

export function updateLargeBlobWriteDraft(patch: Partial<LargeBlobWriteDraft>) {
  const current = get(largeBlobsMutation);

  if (current.kind !== "write") return false;

  const draft = { ...current.draft, ...patch };

  largeBlobsPayloadEncoding.set(draft.encoding);
  largeBlobsMutation.set(
    editingLargeBlobWrite(
      {
        ...writeMutationBase(current),
        draft,
      },
      null,
    ),
  );

  return true;
}

export function editLargeBlobWrite() {
  const current = get(largeBlobsMutation);

  if (
    current.kind !== "write" ||
    (current.operation.phase !== "review" && current.operation.phase !== "error")
  )
    return false;

  largeBlobsMutation.set(editingLargeBlobWrite(writeMutationBase(current), null));

  return true;
}

export async function previewLargeBlobWrite(): Promise<boolean> {
  const current = get(largeBlobsMutation);

  if (
    current.kind !== "write" ||
    (current.operation.phase !== "editing" && current.operation.phase !== "error")
  )
    return false;

  const payload = parseLargeBlobPayload(current.draft.payload, current.draft.encoding);

  if (!payload.ok) {
    largeBlobsMutation.set(editingLargeBlobWrite(writeMutationBase(current), payload.error));

    return false;
  }

  const request: LargeBlobWriteRequest = {
    verificationFlow: current.verificationFlow,
    credentialIDHex: current.credentialIDHex,
    payload: payload.base64,
    dryRun: true,
  };

  const base = writeMutationBase(current);

  return runConfirmedPreview({
    label: m.large_blob_write(),
    request,
    call: api.writeLargeBlob,
    extract: largeBlobMutationPreview,
    publish: (operation) => largeBlobsMutation.set({ ...base, operation }),
  });
}

export async function beginLargeBlobDelete(
  entryIndex = get(largeBlobsSelectedEntryIndex),
): Promise<boolean> {
  if (entryIndex === null) return false;

  const entry = entryForMutation(entryIndex);
  if (!entry) return false;

  const credentialIDHex = entry.target.credentialIDHex;

  return previewLargeBlobDelete(entryIndex, credentialIDHex, get(largeBlobsVerificationFlow));
}

export async function beginPasskeyLargeBlobDelete(
  credentialIDHex: string,
  verificationFlow: VerificationFlow,
): Promise<boolean> {
  const state = get(passkeyLargeBlobState);

  if (
    state.phase !== "ready" ||
    state.credentialIDHex !== credentialIDHex ||
    state.state !== ReadState.ReadStatePresent
  )
    return false;

  return previewLargeBlobDelete(null, credentialIDHex, verificationFlow);
}

async function previewLargeBlobDelete(
  entryIndex: number | null,
  credentialIDHex: string,
  verificationFlow: VerificationFlow,
) {
  const request = buildLargeBlobDeletePreviewRequest(verificationFlow, credentialIDHex);

  if (entryIndex !== null) largeBlobsSelectedEntryIndex.set(entryIndex);

  const base = deleteMutationBase(entryIndex, credentialIDHex, verificationFlow);

  return runConfirmedPreview({
    label: m.large_blob_delete(),
    request,
    call: api.deleteLargeBlob,
    extract: largeBlobMutationPreview,
    publish: (operation) => largeBlobsMutation.set({ ...base, operation }),
    shouldReview: (preview) =>
      !(
        preview.operation === MutationOperation.MutationNoBlob ||
        preview.noBlob ||
        preview.noop === true
      ),
    onSkipped: () => {
      largeBlobsMutation.set({ kind: "idle", operation: idleConfirmedOperation() });
      passkeyLargeBlobState.set({
        phase: "ready",
        credentialIDHex,
        state: ReadState.ReadStateMissing,
        rawByteCount: 0,
        draft: null,
      });
      setStatusOutcome({
        tone: "info",
        title: m.large_blob_delete(),
        message: m.large_blob_delete_noop(),
      });
    },
  });
}

export async function beginLargeBlobCleanup(): Promise<boolean> {
  if (!reportForActions()) return false;

  const request = buildLargeBlobCleanupPreviewRequest(get(largeBlobsVerificationFlow));

  const base = cleanupMutationBase();

  return runConfirmedPreview({
    label: m.large_blob_cleanup_preview(),
    request,
    call: api.garbageCollectLargeBlobs,
    extract: largeBlobMutationPreview,
    publish: (operation) => largeBlobsMutation.set({ ...base, operation }),
    shouldReview: (preview) => preview.noop !== true,
    onSkipped: () => {
      largeBlobsMutation.set({ kind: "idle", operation: idleConfirmedOperation() });
      setStatusOutcome({
        tone: "info",
        title: m.large_blob_cleanup(),
        message: m.large_blob_cleanup_noop(),
      });
    },
  });
}

async function refreshAfterMutation() {
  if (get(activeScreen) !== "large-blobs") {
    invalidateLargeBlobArrayInventory();

    return;
  }

  largeBlobsMutation.set({ kind: "idle", operation: idleConfirmedOperation() });
  largeBlobsSelectedEntryIndex.set(null);
  resetLargeBlobReadState();
  await loadLargeBlobs();
}

type LargeBlobExecutionRequest =
  LargeBlobWriteRequest | LargeBlobDeleteRequest | LargeBlobGarbageCollectRequest;

type LargeBlobExecutionOptions<TRequest extends LargeBlobExecutionRequest> = {
  label: string;
  operation:
    | ConfirmedOperationReview<TRequest, LargeBlobMutationEnvelope>
    | ConfirmedOperationError<TRequest, LargeBlobMutationEnvelope>;
  call: (request: TRequest) => Promise<LargeBlobMutationEnvelope>;
  onSuccess?: (result: MutationResult) => void;
  publish: (
    operation:
      | ConfirmedOperationExecuting<TRequest, LargeBlobMutationEnvelope>
      | ConfirmedOperationError<TRequest, LargeBlobMutationEnvelope>,
  ) => void;
};

async function executeReviewedLargeBlobMutation<TRequest extends LargeBlobExecutionRequest>({
  label,
  operation,
  call,
  onSuccess,
  publish,
}: LargeBlobExecutionOptions<TRequest>): Promise<boolean> {
  const succeeded = await runConfirmedExecution({
    label,
    operation,
    call,
    extract: largeBlobMutationResult,
    onSuccess,
    publish,
  });

  if (!succeeded) return false;

  await refreshAfterMutation();

  return true;
}

export async function confirmLargeBlobWrite(): Promise<boolean> {
  const current = get(largeBlobsMutation);

  if (
    current.kind !== "write" ||
    (current.operation.phase !== "review" && current.operation.phase !== "error")
  )
    return false;

  const base = writeMutationBase(current);

  return executeReviewedLargeBlobMutation({
    label: m.large_blob_write(),
    operation: current.operation,
    call: api.writeLargeBlob,
    onSuccess: (result) =>
      passkeyLargeBlobState.set({
        phase: "ready",
        credentialIDHex: current.credentialIDHex,
        state: ReadState.ReadStatePresent,
        rawByteCount: result.proposedByteCount,
        draft: current.draft,
      }),
    publish: (operation) => largeBlobsMutation.set({ ...base, operation }),
  });
}

export async function confirmLargeBlobDelete(): Promise<boolean> {
  const current = get(largeBlobsMutation);

  if (
    current.kind !== "delete" ||
    (current.operation.phase !== "review" && current.operation.phase !== "error")
  )
    return false;

  const base = deleteMutationBase(
    current.entryIndex,
    current.credentialIDHex,
    current.verificationFlow,
  );

  return executeReviewedLargeBlobMutation({
    label: m.large_blob_delete(),
    operation: current.operation,
    call: api.deleteLargeBlob,
    onSuccess: () =>
      passkeyLargeBlobState.set({
        phase: "ready",
        credentialIDHex: current.credentialIDHex,
        state: ReadState.ReadStateMissing,
        rawByteCount: 0,
        draft: null,
      }),
    publish: (operation) => largeBlobsMutation.set({ ...base, operation }),
  });
}

export async function confirmLargeBlobCleanup(): Promise<boolean> {
  const current = get(largeBlobsMutation);

  if (
    current.kind !== "cleanup" ||
    (current.operation.phase !== "review" && current.operation.phase !== "error")
  )
    return false;

  const base = cleanupMutationBase();

  return executeReviewedLargeBlobMutation({
    label: m.large_blob_cleanup(),
    operation: current.operation,
    call: api.garbageCollectLargeBlobs,
    publish: (operation) => largeBlobsMutation.set({ ...base, operation }),
  });
}

export function closeLargeBlobMutation() {
  largeBlobsMutation.set({ kind: "idle", operation: idleConfirmedOperation() });
}
