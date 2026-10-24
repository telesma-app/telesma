import { get } from "svelte/store";

import { VerificationFlow } from "../../bindings/github.com/telesma-app/kit";
import type {
  CredentialTarget,
  InventoryReport,
} from "../../bindings/github.com/telesma-app/kit/model/credentials";
import { Code } from "../../bindings/github.com/telesma-app/kit/model/failure";
import type {
  CredentialDeleteRequest,
  CredentialUpdateRequest,
  OperationRequest,
} from "../../bindings/telesma/service";
import { m } from "../paraglide/messages.js";
import { api } from "$lib/api.js";
import {
  credentialDeletePreview,
  credentialDeleteResult,
  credentialTarget,
  credentialsReport,
  credentialUpdatePreview,
  credentialUpdateResult,
} from "$lib/ctapkit-results.js";
import {
  beginPasskeysInventoryLoad,
  beginPasskeyDirectoryLookup,
  completePasskeyDirectoryLookup,
  completePasskeysInventoryLoad,
  failPasskeyDirectoryLookup,
  failPasskeysInventoryLoadAtRuntime,
  failPasskeysInventoryLoadWithResponse,
  passkeyDirectoryState,
  passkeysInventoryState,
  passkeysMutation,
  passkeysQuery,
  passkeysSelectedCredentialID,
  passkeysStatusFilter,
  passkeysVerificationFlow,
  resetPasskeyDirectoryLookup,
  resetPasskeysDeviceState,
  type CredentialUpdateForm,
  type CredentialUpdateValidationError,
  type PasskeysMutationState,
  type PasskeysStatusFilter,
} from "$lib/features/passkeys/state.js";
import { selectedSelector, authenticatorStatus } from "$lib/features/authenticator/state.js";
import { activeScreen } from "$lib/features/workbench/state.js";
import { passkeyDirectoryEnabled } from "$lib/preferences.js";
import {
  editingConfirmedOperation,
  idleConfirmedOperation,
  runConfirmedExecution,
  runConfirmedPreview,
} from "$lib/confirmed-operation.js";
import { completeOperation, runOperation } from "$lib/operation-lifecycle.js";

function shouldAutoLoadPasskeys() {
  const inventory = get(passkeysInventoryState);

  return (
    get(activeScreen) === "passkeys" &&
    Boolean(get(selectedSelector).trim() && get(authenticatorStatus).selectionId) &&
    !inventory.report &&
    inventory.phase !== "loading" &&
    inventory.phase !== "refreshing" &&
    inventory.phase !== "unsupported"
  );
}

function reconcileSelectedCredential() {
  const selectedID = get(passkeysSelectedCredentialID);

  if (!selectedID) return;

  if (credentialTarget(get(passkeysInventoryState).report, selectedID)) return;

  passkeysSelectedCredentialID.set("");
  passkeysMutation.set({ kind: "idle", operation: idleConfirmedOperation() });
}

export async function maybeLoadPasskeys() {
  if (shouldAutoLoadPasskeys()) {
    await loadPasskeys();

    return;
  }

  const report = get(passkeysInventoryState).report;

  if (get(activeScreen) === "passkeys" && report && get(passkeyDirectoryState).phase === "idle") {
    void loadPasskeyDirectory(report);
  }
}

async function loadPasskeyDirectory(report: InventoryReport) {
  if (!get(passkeyDirectoryEnabled)) {
    resetPasskeyDirectoryLookup();

    return;
  }

  const rpIDs = (report.groups ?? []).map((group) => group.rpID);

  if (rpIDs.length === 0) {
    resetPasskeyDirectoryLookup();

    return;
  }

  const lookupID = beginPasskeyDirectoryLookup();

  try {
    completePasskeyDirectoryLookup(lookupID, await api.lookupPasskeyDirectory({ rpIDs }));
  } catch {
    failPasskeyDirectoryLookup(lookupID);
  }
}

export async function loadPasskeys() {
  const selector = get(selectedSelector).trim();

  if (!selector) {
    resetPasskeysDeviceState();

    return false;
  }

  beginPasskeysInventoryLoad();

  const label = m.credential_inventory();
  const request: OperationRequest = {
    verificationFlow: get(passkeysVerificationFlow),
  };
  const attempt = await runOperation({
    label,
    call: () => api.listCredentials(request),
    onRuntimeFailure: failPasskeysInventoryLoadAtRuntime,
  });

  if (!attempt.ok) return false;

  const envelope = attempt.envelope;

  if (envelope.error) {
    failPasskeysInventoryLoadWithResponse(
      envelope.error.code === Code.CodeCredentialManagementUnsupported,
    );
  } else {
    const report = credentialsReport(envelope)!;

    completePasskeysInventoryLoad(report, new Date().toISOString());
    reconcileSelectedCredential();
    void loadPasskeyDirectory(report);
  }

  completeOperation(label, envelope);

  return !envelope.error;
}

export function setPasskeysQuery(value: string) {
  passkeysQuery.set(value);
}

export function setPasskeysStatusFilter(value: PasskeysStatusFilter) {
  passkeysStatusFilter.set(value);
}

export function selectPasskeyCredential(credentialIDHex: string) {
  passkeysSelectedCredentialID.set(credentialIDHex);
}

export function setPasskeysVerificationFlow(value: VerificationFlow) {
  passkeysVerificationFlow.set(value);
}

function mutationsAvailable(kind: "update" | "delete") {
  const inventory = get(passkeysInventoryState);

  if (inventory.phase === "loading" || inventory.phase === "refreshing") return false;

  const authenticator = get(authenticatorStatus);

  if (authenticator.state !== "ready" || !authenticator.selectionId) return false;

  const report = inventory.report;

  if (!report?.support.credentialManagement) return false;

  return kind === "delete" || !report.support.previewOnly;
}

function updateFormFor(target: CredentialTarget): CredentialUpdateForm {
  return {
    name: target.user.name ?? "",
    displayName: target.user.displayName ?? "",
  };
}

function updateMutationBase(current: Extract<PasskeysMutationState, { kind: "update" }>) {
  return {
    kind: "update" as const,
    target: current.target,
    form: current.form,
  };
}

function deleteMutationBase(credentialIDHex: string) {
  return { kind: "delete" as const, credentialIDHex };
}

function editingCredentialUpdate(
  base: ReturnType<typeof updateMutationBase>,
  validationError: CredentialUpdateValidationError | null,
) {
  return {
    ...base,
    operation: editingConfirmedOperation(validationError),
  };
}

export function beginCredentialUpdate(credentialIDHex = get(passkeysSelectedCredentialID)) {
  if (!mutationsAvailable("update")) return false;

  const target = credentialTarget(get(passkeysInventoryState).report, credentialIDHex);

  if (!target) return false;

  passkeysSelectedCredentialID.set(credentialIDHex);
  passkeysMutation.set(
    editingCredentialUpdate(
      {
        kind: "update" as const,
        target,
        form: updateFormFor(target),
      },
      null,
    ),
  );

  return true;
}

export function updateCredentialDraft(patch: Partial<CredentialUpdateForm>) {
  const current = get(passkeysMutation);

  if (current.kind !== "update") return false;

  passkeysMutation.set(
    editingCredentialUpdate(
      {
        ...updateMutationBase(current),
        form: { ...current.form, ...patch },
      },
      null,
    ),
  );

  return true;
}

export function editCredentialUpdate() {
  const current = get(passkeysMutation);

  if (
    current.kind !== "update" ||
    (current.operation.phase !== "review" && current.operation.phase !== "error")
  )
    return false;

  passkeysMutation.set(editingCredentialUpdate(updateMutationBase(current), null));

  return true;
}

export function normalizeCredentialUpdateForm(form: CredentialUpdateForm): CredentialUpdateForm {
  return {
    name: form.name.trim(),
    displayName: form.displayName.trim(),
  };
}

export function validateCredentialUpdate(
  original: CredentialUpdateForm,
  form: CredentialUpdateForm,
): CredentialUpdateValidationError | null {
  const current = normalizeCredentialUpdateForm(original);
  const proposed = normalizeCredentialUpdateForm(form);

  if (current.name === proposed.name && current.displayName === proposed.displayName)
    return "no-changes";

  return null;
}

export function buildCredentialUpdatePreviewRequest(
  verificationFlow: VerificationFlow,
  target: CredentialTarget,
  form: CredentialUpdateForm,
): CredentialUpdateRequest {
  const current = normalizeCredentialUpdateForm(updateFormFor(target));
  const proposed = normalizeCredentialUpdateForm(form);
  const nameChanged = proposed.name !== current.name;
  const displayNameChanged = proposed.displayName !== current.displayName;

  return {
    verificationFlow,
    target,
    ...(nameChanged ? { name: proposed.name, nameProvided: true } : {}),
    ...(displayNameChanged ? { displayName: proposed.displayName, displayProvided: true } : {}),
    dryRun: true,
  };
}

export async function previewCredentialUpdate(): Promise<boolean> {
  const current = get(passkeysMutation);

  if (
    current.kind !== "update" ||
    (current.operation.phase !== "editing" && current.operation.phase !== "error")
  )
    return false;

  if (!mutationsAvailable("update")) return false;

  const validationError = validateCredentialUpdate(updateFormFor(current.target), current.form);

  if (validationError) {
    passkeysMutation.set(editingCredentialUpdate(updateMutationBase(current), validationError));

    return false;
  }

  const request = buildCredentialUpdatePreviewRequest(
    get(passkeysVerificationFlow),
    current.target,
    current.form,
  );

  const base = updateMutationBase(current);

  return runConfirmedPreview({
    label: m.credential_update_preview(),
    request,
    call: api.updateCredentialUser,
    extract: credentialUpdatePreview,
    publish: (operation) => passkeysMutation.set({ ...base, operation }),
  });
}

export async function confirmCredentialUpdate(): Promise<boolean> {
  const current = get(passkeysMutation);

  if (
    current.kind !== "update" ||
    (current.operation.phase !== "review" && current.operation.phase !== "error")
  )
    return false;

  const base = updateMutationBase(current);
  const succeeded = await runConfirmedExecution({
    label: m.credential_update(),
    operation: current.operation,
    call: api.updateCredentialUser,
    extract: credentialUpdateResult,
    publish: (operation) => passkeysMutation.set({ ...base, operation }),
    onSuccess: () => {
      passkeysSelectedCredentialID.set(current.target.record.credentialIDHex);
      passkeysMutation.set({ kind: "idle", operation: idleConfirmedOperation() });
    },
  });

  if (!succeeded) return false;

  await loadPasskeys();

  return true;
}

async function previewCredentialDelete(credentialIDHex: string): Promise<boolean> {
  if (
    !mutationsAvailable("delete") ||
    !credentialTarget(get(passkeysInventoryState).report, credentialIDHex)
  )
    return false;

  const request: CredentialDeleteRequest = {
    verificationFlow: get(passkeysVerificationFlow),
    credentialIDHex,
    dryRun: true,
  };

  passkeysSelectedCredentialID.set(credentialIDHex);

  const base = deleteMutationBase(credentialIDHex);

  return runConfirmedPreview({
    label: m.credential_delete_preview(),
    request,
    call: api.deleteCredential,
    extract: credentialDeletePreview,
    publish: (operation) => passkeysMutation.set({ ...base, operation }),
  });
}

export function beginCredentialDelete(credentialIDHex = get(passkeysSelectedCredentialID)) {
  return previewCredentialDelete(credentialIDHex);
}

export async function confirmCredentialDelete(): Promise<boolean> {
  const current = get(passkeysMutation);

  if (
    current.kind !== "delete" ||
    (current.operation.phase !== "review" && current.operation.phase !== "error")
  )
    return false;

  const base = deleteMutationBase(current.credentialIDHex);
  const succeeded = await runConfirmedExecution({
    label: m.credential_delete(),
    operation: current.operation,
    call: api.deleteCredential,
    extract: credentialDeleteResult,
    publish: (operation) => passkeysMutation.set({ ...base, operation }),
    onSuccess: () => {
      passkeysSelectedCredentialID.set("");
      passkeysMutation.set({ kind: "idle", operation: idleConfirmedOperation() });
    },
  });

  if (!succeeded) return false;

  await loadPasskeys();

  return true;
}

export function closePasskeysMutation() {
  passkeysMutation.set({ kind: "idle", operation: idleConfirmedOperation() });
}
