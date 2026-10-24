import { get, type Writable } from "svelte/store";
import { toast } from "svelte-sonner";

import {
  AlwaysUVTarget,
  type StatusReport,
} from "../../bindings/github.com/telesma-app/kit/model/config";
import {
  type AlwaysUVRequest,
  type BioEnrollRequest,
  type BioRemoveRequest,
  type BioRenameRequest,
  type EnableEnterpriseAttestationRequest,
  type EnableLongTouchForResetRequest,
  type MinPINLengthRequest,
  type PINChangeRequest,
  type PINEnvelope,
  type PINSetRequest,
  type ResetFactoryRequest,
} from "../../bindings/telesma/service";

import { m } from "../paraglide/messages.js";
import { api, type OperationEnvelope } from "$lib/api.js";
import {
  authenticatorConfigPreview,
  authenticatorConfigResult,
  bioEnrollPreview,
  bioEnrollResult,
  bioListReport,
  bioMutationPreview,
  bioMutationResult,
  bioSensorReport,
  configStatusReport,
  resetFactoryPreview,
  resetFactoryResult,
} from "$lib/ctapkit-results.js";
import {
  beginSecurityResourceLoad,
  completeSecurityResourceLoad,
  emptySecurityResourceState,
  failSecurityResourceLoadAtRuntime,
  failSecurityResourceLoadWithResponse,
  securityEnrollments,
  securityMutation,
  securitySensor,
  securityStatus,
  type SecurityMutationState,
  type SecurityMutationValidationError,
  type SecurityPINPolicyDraft,
  type SecurityResourceState,
} from "$lib/features/security/state.js";
import { selectedSelector, authenticatorStatus } from "$lib/features/authenticator/state.js";
import { activeScreen } from "$lib/features/workbench/state.js";
import { failureMessage } from "$lib/failure.js";
import { invalidateOverviewCache, loadOverview } from "$lib/overview-controller.js";
import { rediscoverAfterFactoryReset } from "$lib/authenticator-controller.js";
import {
  editingConfirmedOperation,
  idleConfirmedOperation,
  runConfirmedExecution,
  runConfirmedPreview,
  type ConfirmedOperationError,
  type ConfirmedOperationReview,
} from "$lib/confirmed-operation.js";
import {
  completeOperation,
  runOperation,
  runTypedOperationStage,
} from "$lib/operation-lifecycle.js";
import { setStatusOutcome } from "$lib/workbench-state.js";

const BIO_ENROLL_TIMEOUT_MILLISECONDS = 60_000;

type PINSetInput = { newPIN: string };

type PINChangeInput = { currentPIN: string; newPIN: string };

type NonIdleSecurityMutation = Exclude<SecurityMutationState, { kind: "idle" }>;

function currentStatusReport(): StatusReport | null {
  return configStatusReport(get(securityStatus).lastSuccessfulEnvelope);
}

function mutationAvailable() {
  return Boolean(get(authenticatorStatus).selectionId);
}

function canAutoLoadSecurity() {
  const authenticator = get(authenticatorStatus);

  return (
    get(activeScreen) === "security" &&
    Boolean(get(selectedSelector).trim() && authenticator.selectionId) &&
    authenticator.state === "ready" &&
    get(securityStatus).phase === "idle"
  );
}

export async function maybeLoadSecurity() {
  if (!canAutoLoadSecurity()) return false;

  return loadSecurityStatus();
}

async function loadSecurityResource<E extends OperationEnvelope, TValue>(
  store: Writable<SecurityResourceState<E>>,
  label: string,
  call: () => Promise<E>,
  extract: (envelope: E) => TValue | null,
): Promise<TValue | null> {
  beginSecurityResourceLoad(store);

  const outcome = await runTypedOperationStage({
    label,
    call,
    extract,
    onFailure: (failure) => {
      switch (failure.reason) {
        case "runtime-error":
          failSecurityResourceLoadAtRuntime(store, failure.error);
          break;
        case "response-error":
          failSecurityResourceLoadWithResponse(store, failure.envelope);
          break;
      }
    },
    onSuccess: (_value, envelope) => completeSecurityResourceLoad(store, envelope),
  });

  return outcome.ok ? outcome.value : null;
}

export async function loadSecurityStatus(): Promise<boolean> {
  if (!get(selectedSelector).trim()) return false;

  const report = await loadSecurityResource(
    securityStatus,
    m.security_status_operation(),
    () => api.configStatus({}),
    configStatusReport,
  );

  if (!report) return false;

  if (report.bio.supported) {
    await loadSecurityBioSensor();
  } else {
    securitySensor.set(emptySecurityResourceState());
  }

  return true;
}

export async function loadSecurityBioSensor(): Promise<boolean> {
  const report = currentStatusReport();

  if (!report?.bio.supported) {
    securitySensor.set(emptySecurityResourceState());

    return false;
  }

  const sensor = await loadSecurityResource(
    securitySensor,
    m.security_bio_sensor_operation(),
    () => api.bioSensorInfo({}),
    bioSensorReport,
  );

  return Boolean(sensor);
}

export async function loadSecurityEnrollments(): Promise<boolean> {
  const report = currentStatusReport();

  if (!report?.bio.supported) return false;

  if (report.bio.configured === false) {
    securityEnrollments.set(emptySecurityResourceState());

    return true;
  }

  const list = await loadSecurityResource(
    securityEnrollments,
    m.security_bio_list_operation(),
    () => api.bioList({}),
    bioListReport,
  );

  return Boolean(list);
}

async function runPINOperation(label: string, call: () => Promise<PINEnvelope>): Promise<boolean> {
  const attempt = await runOperation({
    label,
    call,
    cardPresenceRecovery: false,
  });

  if (!attempt.ok) return false;

  const envelope = attempt.envelope;
  completeOperation(label, envelope);
  if (envelope.error) return false;

  toast.success(m.security_configuration_updated());
  await refreshSecurityAfterConfigurationChange();

  return true;
}

async function refreshSecurityAfterConfigurationChange() {
  invalidateOverviewCache();
  await loadSecurityStatus();
  await loadOverview();
}

export async function setAuthenticatorPIN(input: PINSetInput): Promise<boolean> {
  if (!input.newPIN) return false;

  const label = m.security_pin_set_operation();

  try {
    return await runPINOperation(label, () => {
      const request: PINSetRequest = {
        newPIN: input.newPIN,
      };

      try {
        return api.setPIN(request);
      } finally {
        request.newPIN = "";
        input.newPIN = "";
      }
    });
  } finally {
    input.newPIN = "";
  }
}

export async function changeAuthenticatorPIN(input: PINChangeInput): Promise<boolean> {
  if (!input.currentPIN || !input.newPIN) return false;

  const label = m.security_pin_change_operation();

  try {
    return await runPINOperation(label, () => {
      const request: PINChangeRequest = {
        currentPIN: input.currentPIN,
        newPIN: input.newPIN,
      };

      try {
        return api.changePIN(request);
      } finally {
        request.currentPIN = "";
        request.newPIN = "";
        input.currentPIN = "";
        input.newPIN = "";
      }
    });
  } finally {
    input.currentPIN = "";
    input.newPIN = "";
  }
}

function normalizedPINPolicyDraft(draft: SecurityPINPolicyDraft) {
  const seen = new Set<string>();
  const rpIDs = draft.rpIDs
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false;

      seen.add(value);

      return true;
    });

  return {
    minPINLength: draft.minPINLength.trim() ? Number(draft.minPINLength.trim()) : null,
    rpIDs,
    forceChangePin: draft.forceChangePin,
    pinComplexityPolicy: draft.pinComplexityPolicy,
  };
}

export function validatePINPolicyDraft(
  draft: SecurityPINPolicyDraft,
  report = currentStatusReport(),
): SecurityMutationValidationError | null {
  const normalized = normalizedPINPolicyDraft(draft);

  if (
    normalized.minPINLength !== null &&
    (!Number.isInteger(normalized.minPINLength) || normalized.minPINLength <= 0)
  ) {
    return "min-pin-length-invalid";
  }

  const current = report?.pin.minPINLength;

  if (
    normalized.minPINLength !== null &&
    current !== undefined &&
    normalized.minPINLength < current
  ) {
    return "min-pin-length-decrease";
  }

  const maximum = report?.pin.maxPINLength;

  if (
    normalized.minPINLength !== null &&
    maximum !== undefined &&
    normalized.minPINLength > maximum
  ) {
    return "min-pin-length-too-large";
  }

  const maxRPIDs = report?.limits.maxRPIDsForSetMinPINLength;

  if (maxRPIDs !== null && maxRPIDs !== undefined && normalized.rpIDs.length > maxRPIDs) {
    return "too-many-rp-ids";
  }

  const minimumUnchanged =
    normalized.minPINLength === null ||
    (current !== undefined && normalized.minPINLength === current);

  if (
    minimumUnchanged &&
    normalized.rpIDs.length === 0 &&
    !normalized.forceChangePin &&
    !normalized.pinComplexityPolicy
  ) {
    return "no-change";
  }

  return null;
}

function friendlyNameTooLong(value: string) {
  const sensor = bioSensorReport(get(securitySensor).lastSuccessfulEnvelope);
  const maximum = sensor?.maxTemplateFriendlyName;

  return (
    maximum !== null &&
    maximum !== undefined &&
    new TextEncoder().encode(value).byteLength > maximum
  );
}

export async function beginAlwaysUVChange(target: AlwaysUVTarget): Promise<boolean> {
  const report = currentStatusReport();
  const current = report?.authenticatorConfig.alwaysUv.configured;

  if (
    !report?.authenticatorConfig.supported ||
    !report.authenticatorConfig.alwaysUv.supported ||
    current === null ||
    current === undefined
  )
    return false;

  if ((target === AlwaysUVTarget.AlwaysUVTargetEnable) === current) return false;

  const label = m.security_always_uv_preview_operation();
  if (!mutationAvailable()) return false;

  const request: AlwaysUVRequest = { target, dryRun: true };

  return runConfirmedPreview({
    label,
    request,
    call: api.setAlwaysUV,
    extract: authenticatorConfigPreview,
    publish: (operation) =>
      securityMutation.set({
        kind: "alwaysUv",
        target,
        operation,
      }),
  });
}

export async function beginEnterpriseAttestation(): Promise<boolean> {
  const capability = currentStatusReport()?.authenticatorConfig.enterpriseAttestation;

  if (!capability?.supported || capability.configured !== false) return false;

  const label = m.security_enterprise_attestation_preview_operation();
  if (!mutationAvailable()) return false;

  const request: EnableEnterpriseAttestationRequest = { dryRun: true };

  return runConfirmedPreview({
    label,
    request,
    call: api.enableEnterpriseAttestation,
    extract: authenticatorConfigPreview,
    publish: (operation) =>
      securityMutation.set({
        kind: "enterpriseAttestation",
        operation,
      }),
  });
}

export async function beginLongTouchForReset(): Promise<boolean> {
  const capability = currentStatusReport()?.authenticatorConfig.longTouchForReset;

  if (!capability?.supported || capability.configured !== false) return false;

  const label = m.security_long_touch_preview_operation();
  if (!mutationAvailable()) return false;

  const request: EnableLongTouchForResetRequest = { dryRun: true };

  return runConfirmedPreview({
    label,
    request,
    call: api.enableLongTouchForReset,
    extract: authenticatorConfigPreview,
    publish: (operation) =>
      securityMutation.set({
        kind: "longTouch",
        operation,
      }),
  });
}

export async function beginPINPolicyChange(draft: SecurityPINPolicyDraft): Promise<boolean> {
  const validationError = validatePINPolicyDraft(draft);

  if (validationError) {
    securityMutation.set({
      kind: "pinPolicy",
      draft,
      operation: editingConfirmedOperation(validationError),
    });

    return false;
  }

  const normalized = normalizedPINPolicyDraft(draft);
  const label = m.security_pin_policy_preview_operation();
  if (!mutationAvailable()) return false;

  const request: MinPINLengthRequest = {
    ...(normalized.minPINLength === null ? {} : { newMinPINLength: normalized.minPINLength }),
    minPinLengthRPIDs: normalized.rpIDs,
    forceChangePin: normalized.forceChangePin,
    pinComplexityPolicy: normalized.pinComplexityPolicy,
    dryRun: true,
  };

  return runConfirmedPreview({
    label,
    request,
    call: api.setMinPINLength,
    extract: authenticatorConfigPreview,
    publish: (operation) =>
      securityMutation.set({
        kind: "pinPolicy",
        draft,
        operation,
      }),
  });
}

export async function beginBioEnrollment(): Promise<boolean> {
  if (!currentStatusReport()?.bio.supported) return false;

  const label = m.security_bio_enroll_preview_operation();
  if (!mutationAvailable()) return false;

  const request: BioEnrollRequest = {
    timeoutMilliseconds: BIO_ENROLL_TIMEOUT_MILLISECONDS,
    dryRun: true,
  };

  return runConfirmedPreview({
    label,
    request,
    call: api.bioEnroll,
    extract: bioEnrollPreview,
    publish: (operation) =>
      securityMutation.set({
        kind: "bioEnroll",
        operation,
      }),
  });
}

export async function beginBioRename(
  templateIDHex: string,
  friendlyName: string,
): Promise<boolean> {
  if (friendlyNameTooLong(friendlyName)) return false;

  const label = m.security_bio_rename_preview_operation();
  if (!mutationAvailable()) return false;

  const request: BioRenameRequest = {
    templateIDHex,
    friendlyName,
    dryRun: true,
  };

  return runConfirmedPreview({
    label,
    request,
    call: api.bioRename,
    extract: bioMutationPreview,
    publish: (operation) =>
      securityMutation.set({
        kind: "bioRename",
        templateIDHex,
        friendlyName,
        operation,
      }),
  });
}

export async function beginBioRemove(templateIDHex: string): Promise<boolean> {
  const label = m.security_bio_remove_preview_operation();
  if (!mutationAvailable()) return false;

  const request: BioRemoveRequest = { templateIDHex, dryRun: true };

  return runConfirmedPreview({
    label,
    request,
    call: api.bioRemove,
    extract: bioMutationPreview,
    publish: (operation) =>
      securityMutation.set({
        kind: "bioRemove",
        templateIDHex,
        operation,
      }),
  });
}

export async function beginFactoryReset(): Promise<boolean> {
  const label = m.security_reset_preview_operation();
  if (!mutationAvailable()) return false;

  const request: ResetFactoryRequest = { dryRun: true };

  return runConfirmedPreview({
    label,
    request,
    call: api.resetFactory,
    extract: resetFactoryPreview,
    publish: (operation) =>
      securityMutation.set({
        kind: "reset",
        operation,
      }),
  });
}

function beginSecurityPreview(current: NonIdleSecurityMutation): Promise<boolean> {
  switch (current.kind) {
    case "enterpriseAttestation":
      return beginEnterpriseAttestation();
    case "alwaysUv":
      return beginAlwaysUVChange(current.target);
    case "pinPolicy":
      return beginPINPolicyChange(current.draft);
    case "longTouch":
      return beginLongTouchForReset();
    case "bioEnroll":
      return beginBioEnrollment();
    case "bioRename":
      return beginBioRename(current.templateIDHex, current.friendlyName);
    case "bioRemove":
      return beginBioRemove(current.templateIDHex);
    case "reset":
      return beginFactoryReset();
  }
}

async function finishSuccessfulSecurityMutation(kind: NonIdleSecurityMutation["kind"]) {
  securityMutation.set({ kind: "idle", operation: idleConfirmedOperation() });
  switch (kind) {
    case "enterpriseAttestation":
    case "alwaysUv":
    case "pinPolicy":
    case "longTouch":
      toast.success(m.security_configuration_updated());
      await refreshSecurityAfterConfigurationChange();

      return;
    case "bioEnroll":
    case "bioRename":
    case "bioRemove":
      toast.success(m.security_configuration_updated());
      await refreshSecurityAfterConfigurationChange();
      await loadSecurityEnrollments();

      return;
    case "reset": {
      toast.success(m.security_reset_complete());

      const rediscoveryError = await rediscoverAfterFactoryReset();

      await maybeLoadSecurity();
      if (rediscoveryError) {
        setStatusOutcome({
          tone: "warning",
          title: m.security_reset_rediscovery_failed(),
          message: failureMessage(rediscoveryError),
        });
        toast.warning(m.security_reset_rediscovery_failed(), {
          description: failureMessage(rediscoveryError),
        });
      }
    }
  }
}

function operationLabel(kind: NonIdleSecurityMutation["kind"]) {
  switch (kind) {
    case "enterpriseAttestation":
      return m.security_enterprise_attestation_operation();
    case "alwaysUv":
      return m.security_always_uv_operation();
    case "pinPolicy":
      return m.security_pin_policy_operation();
    case "longTouch":
      return m.security_long_touch_operation();
    case "bioEnroll":
      return m.security_bio_enroll_operation();
    case "bioRename":
      return m.security_bio_rename_operation();
    case "bioRemove":
      return m.security_bio_remove_operation();
    case "reset":
      return m.security_reset_operation();
  }
}

async function runSecurityExecutionStage<
  TRequest extends { dryRun?: boolean },
  E extends OperationEnvelope,
  TValue,
>(
  current: NonIdleSecurityMutation,
  operation: ConfirmedOperationReview<TRequest, E> | ConfirmedOperationError<TRequest, E>,
  call: (request: TRequest) => Promise<E>,
  extract: (envelope: E) => TValue | null,
): Promise<boolean> {
  return runConfirmedExecution({
    label: operationLabel(current.kind),
    operation,
    call,
    extract,
    publish: (nextOperation) =>
      securityMutation.set({
        ...current,
        operation: nextOperation,
      } as SecurityMutationState),
  });
}

export async function confirmSecurityMutation(): Promise<boolean> {
  const current = get(securityMutation);

  if (
    current.kind === "idle" ||
    (current.operation.phase !== "review" && current.operation.phase !== "error")
  )
    return false;

  let succeeded = false;

  switch (current.kind) {
    case "enterpriseAttestation":
      succeeded = await runSecurityExecutionStage(
        current,
        current.operation,
        api.enableEnterpriseAttestation,
        authenticatorConfigResult,
      );
      break;
    case "alwaysUv":
      succeeded = await runSecurityExecutionStage(
        current,
        current.operation,
        api.setAlwaysUV,
        authenticatorConfigResult,
      );
      break;
    case "pinPolicy":
      succeeded = await runSecurityExecutionStage(
        current,
        current.operation,
        api.setMinPINLength,
        authenticatorConfigResult,
      );
      break;
    case "longTouch":
      succeeded = await runSecurityExecutionStage(
        current,
        current.operation,
        api.enableLongTouchForReset,
        authenticatorConfigResult,
      );
      break;
    case "bioEnroll":
      succeeded = await runSecurityExecutionStage(
        current,
        current.operation,
        api.bioEnroll,
        bioEnrollResult,
      );
      break;
    case "bioRename":
      succeeded = await runSecurityExecutionStage(
        current,
        current.operation,
        api.bioRename,
        bioMutationResult,
      );
      break;
    case "bioRemove":
      succeeded = await runSecurityExecutionStage(
        current,
        current.operation,
        api.bioRemove,
        bioMutationResult,
      );
      break;
    case "reset":
      succeeded = await runSecurityExecutionStage(
        current,
        current.operation,
        api.resetFactory,
        resetFactoryResult,
      );
      break;
  }

  if (!succeeded) return false;

  await finishSuccessfulSecurityMutation(current.kind);

  return true;
}

export async function restartSecurityPreview(): Promise<boolean> {
  const current = get(securityMutation);

  if (
    current.kind === "idle" ||
    current.operation.phase !== "error" ||
    current.operation.failedPhase !== "previewing"
  )
    return false;

  return beginSecurityPreview(current);
}

export function closeSecurityMutation() {
  securityMutation.set({ kind: "idle", operation: idleConfirmedOperation() });
}

export type { SecurityPINPolicyDraft } from "$lib/features/security/state.js";
export { AlwaysUVTarget };
