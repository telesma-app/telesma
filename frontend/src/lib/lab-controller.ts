import { get } from "svelte/store";
import { toast } from "svelte-sonner";

import { Algorithm } from "../../bindings/github.com/telesma-app/ctap/cose";
import {
  GetAssertionVerificationRequest,
  GetAssertionRequest,
  MakeCredentialAttestationAssessmentRequest,
  MakeCredentialRequest,
  MakeCredentialVerificationRequest,
  MDSLookupRequest,
  DerivePreviewSignARKGP256Request,
} from "../../bindings/telesma/service";
import {
  CredentialVerificationMaterial,
  GetAssertionInput,
  MakeCredentialInput,
  type GetAssertionResult,
  type MakeCredentialResult,
} from "../../bindings/github.com/telesma-app/kit/model/webauthn";
import { m } from "../paraglide/messages.js";
import { api } from "$lib/api.js";
import {
  getAssertionPreview,
  getAssertionResult,
  inspectResult,
  makeCredentialPreview,
  makeCredentialResult,
} from "$lib/ctapkit-results.js";
import {
  labState,
  type GetAssertionDraft,
  type LabPendingHandoff,
  type LabState,
  type MakeCredentialDraft,
} from "$lib/features/lab/state.js";
import { invalidateLargeBlobsInventory } from "$lib/features/largeblobs/state.js";
import { invalidatePasskeysInventory } from "$lib/features/passkeys/state.js";
import { authenticatorInspection } from "$lib/features/authenticator/state.js";
import {
  buildClientDataJSON,
  buildGetAssertionRequest,
  buildMakeCredentialRequest,
  randomBase64URL,
  randomHex,
  validateGetAssertionDraft,
  validateMakeCredentialDraft,
} from "$lib/lab-input.js";
import { failureMessage, runtimeFailureFrom } from "$lib/failure.js";
import { runConfirmedExecution, runConfirmedPreview } from "$lib/confirmed-operation.js";
import { setStatusOutcome } from "$lib/workbench-state.js";

export function selectLabOperation(activeOperation: LabState["activeOperation"]) {
  labState.update((state) => ({ ...state, activeOperation }));
}

async function verifyMakeCredentialResult(
  request: MakeCredentialRequest,
  result: MakeCredentialResult,
) {
  try {
    const verification = await api.verifyMakeCredential(
      new MakeCredentialVerificationRequest({
        input: new MakeCredentialInput(request),
        result,
      }),
    );

    labState.update((state) => ({
      ...state,
      makeVerification: { phase: "ready", verification },
    }));
  } catch (cause) {
    const error = runtimeFailureFrom(cause);

    labState.update((state) => ({
      ...state,
      makeVerification: { phase: "error", error },
    }));
  }
}

async function assessMakeCredentialAttestation(
  request: MakeCredentialRequest,
  result: MakeCredentialResult,
) {
  try {
    const metadata = await api.lookupMDS(
      new MDSLookupRequest({
        aaguid: result.aaguid,
      }),
    );
    const assessment = await api.assessMakeCredentialAttestation(
      new MakeCredentialAttestationAssessmentRequest({
        input: new MakeCredentialInput(request),
        result,
        metadata: metadata.result,
      }),
    );

    labState.update((state) => ({
      ...state,
      makeAttestationTrust: { phase: "ready", verification: assessment },
    }));
  } catch (cause) {
    const error = runtimeFailureFrom(cause);

    labState.update((state) => ({
      ...state,
      makeAttestationTrust: { phase: "error", error },
    }));
  }
}

async function verifyGetAssertionResult(
  request: GetAssertionRequest,
  result: GetAssertionResult,
  verificationMaterial: CredentialVerificationMaterial[],
) {
  try {
    const verification = await api.verifyGetAssertion(
      new GetAssertionVerificationRequest({
        input: new GetAssertionInput(request),
        result,
        verificationMaterial,
      }),
    );

    labState.update((state) => ({
      ...state,
      getVerification: { phase: "ready", verification },
    }));
  } catch (cause) {
    const error = runtimeFailureFrom(cause);

    labState.update((state) => ({
      ...state,
      getVerification: { phase: "error", error },
    }));
  }
}

function demoClientData(
  type: "create" | "get",
  current: MakeCredentialDraft["clientData"] | GetAssertionDraft["clientData"],
) {
  const clientData = {
    ...current,
    origin: "https://example.com",
    challenge: randomBase64URL(32),
  };

  return {
    ...clientData,
    rawJSON: buildClientDataJSON(type, clientData),
  };
}

export function fillLabDemoValues() {
  const current = get(labState);

  if (current.activeOperation === "make") {
    return updateLabMakeCredentialDraft({
      rpID: "example.com",
      rpName: "Example",
      userIDHex: randomHex(16),
      userName: "alice@example.com",
      userDisplayName: "Alice",
      clientData: demoClientData("create", current.makeDraft.clientData),
      algorithms: ["-7"],
    });
  }

  return updateLabGetAssertionDraft({
    rpID: "example.com",
    clientData: demoClientData("get", current.getDraft.clientData),
  });
}

export function updateLabMakeCredentialDraft(patch: Partial<MakeCredentialDraft>) {
  const current = get(labState);

  if (
    current.makeStep.phase !== "editing" &&
    !(current.makeStep.phase === "error" && current.makeStep.failedPhase === "previewing")
  )
    return false;

  const makeDraft = { ...current.makeDraft, ...patch };

  labState.set({
    ...current,
    makeDraft,
    makeStep: { phase: "editing" },
    makeVerification: { phase: "idle" },
    makeAttestationTrust: { phase: "idle" },
  });

  return true;
}

export function updateLabGetAssertionDraft(patch: Partial<GetAssertionDraft>) {
  const current = get(labState);

  if (
    current.getStep.phase !== "editing" &&
    !(current.getStep.phase === "error" && current.getStep.failedPhase === "previewing")
  )
    return false;

  const getDraft = { ...current.getDraft, ...patch };

  labState.set({
    ...current,
    getDraft,
    getStep: { phase: "editing" },
    getVerification: { phase: "idle" },
  });

  return true;
}

export function regenerateLabUserID() {
  return updateLabMakeCredentialDraft({ userIDHex: randomHex(16) });
}

export function regenerateLabMakeChallenge() {
  const current = get(labState);

  return updateLabMakeCredentialDraft({
    clientData: { ...current.makeDraft.clientData, challenge: randomBase64URL(32) },
  });
}

export function regenerateLabGetChallenge() {
  const current = get(labState);

  return updateLabGetAssertionDraft({
    clientData: { ...current.getDraft.clientData, challenge: randomBase64URL(32) },
  });
}

export async function previewLabMakeCredential(): Promise<boolean> {
  const current = get(labState);

  if (
    current.makeStep.phase !== "editing" &&
    !(current.makeStep.phase === "error" && current.makeStep.failedPhase === "previewing")
  )
    return false;

  const maxCredBlobLength = inspectResult(get(authenticatorInspection).data)?.info
    .maxCredBlobLength;
  const validation = validateMakeCredentialDraft(current.makeDraft, maxCredBlobLength);

  if (!validation.valid) return false;

  const previewRequest = new MakeCredentialRequest({
    ...buildMakeCredentialRequest(current.makeDraft),
    dryRun: true,
  });

  return runConfirmedPreview({
    label: m.lab_make_credential_preview(),
    request: previewRequest,
    call: api.makeCredential,
    extract: makeCredentialPreview,
    publish: (makeStep) =>
      labState.update((state) => ({
        ...state,
        makeStep,
        makeVerification: { phase: "idle" },
        makeAttestationTrust: { phase: "idle" },
      })),
  });
}

export async function confirmLabMakeCredential(): Promise<boolean> {
  const current = get(labState);
  const step = current.makeStep;

  if (step.phase !== "review" && step.phase !== "error") return false;

  return runConfirmedExecution({
    label: m.lab_make_credential(),
    operation: step,
    makeRequest: (request) => new MakeCredentialRequest({ ...request, dryRun: false }),
    call: api.makeCredential,
    extract: makeCredentialResult,
    publish: (makeStep) =>
      labState.update((state) => ({
        ...state,
        makeStep,
        makeVerification: { phase: "idle" },
        makeAttestationTrust: { phase: "idle" },
      })),
    onSuccess: (result, responseEnvelope, execution) => {
      labState.update((state) => ({
        ...state,
        makeStep: {
          phase: "success",
          ...execution,
          responseEnvelope,
          value: result,
        },
        makeVerification: { phase: "loading" },
        makeAttestationTrust: { phase: "loading" },
      }));
      void verifyMakeCredentialResult(execution.request, result);
      void assessMakeCredentialAttestation(execution.request, result);
      invalidatePasskeysInventory();
      invalidateLargeBlobsInventory();
    },
  });
}

export function editLabMakeCredential() {
  const current = get(labState);

  if (current.makeStep.phase === "editing") return true;

  labState.set({
    ...current,
    pendingHandoff: null,
    makeStep: { phase: "editing" },
    makeVerification: { phase: "idle" },
    makeAttestationTrust: { phase: "idle" },
  });

  return true;
}

export function newLabMakeCredentialRun() {
  const current = get(labState);
  const makeDraft =
    current.makeDraft.clientData.mode === "builder"
      ? {
          ...current.makeDraft,
          clientData: { ...current.makeDraft.clientData, challenge: randomBase64URL(32) },
        }
      : current.makeDraft;

  labState.set({
    ...current,
    pendingHandoff: null,
    makeDraft,
    makeStep: { phase: "editing" },
    makeVerification: { phase: "idle" },
    makeAttestationTrust: { phase: "idle" },
  });

  return true;
}

export async function runLabGetAssertion(): Promise<boolean> {
  const current = get(labState);

  if (
    current.getStep.phase !== "editing" &&
    !(current.getStep.phase === "error" && current.getStep.failedPhase === "previewing")
  )
    return false;

  const validation = validateGetAssertionDraft(current.getDraft);

  if (!validation.valid) return false;

  const previewRequest = new GetAssertionRequest({
    ...buildGetAssertionRequest(current.getDraft),
    dryRun: true,
  });

  return runConfirmedPreview({
    label: m.lab_get_assertion(),
    request: previewRequest,
    call: api.getAssertion,
    extract: getAssertionPreview,
    publish: (getStep) =>
      labState.update((state) => ({
        ...state,
        getStep,
        getVerification: { phase: "idle" },
      })),
  });
}

export async function confirmLabGetAssertion(): Promise<boolean> {
  const current = get(labState);
  const step = current.getStep;

  if (step.phase !== "review" && step.phase !== "error") return false;

  const verificationMaterial = current.getDraft.verificationMaterial;

  return runConfirmedExecution({
    label: m.lab_get_assertion(),
    operation: step,
    makeRequest: (request) => new GetAssertionRequest({ ...request, dryRun: false }),
    call: api.getAssertion,
    extract: getAssertionResult,
    publish: (getStep) =>
      labState.update((state) => ({
        ...state,
        getStep,
        getVerification: { phase: "idle" },
      })),
    onSuccess: (result, responseEnvelope, execution) => {
      labState.update((state) => ({
        ...state,
        getStep: { phase: "success", ...execution, responseEnvelope, value: result },
        getVerification: { phase: "loading" },
      }));
      void verifyGetAssertionResult(execution.request, result, verificationMaterial);
      if (execution.request.extensions?.largeBlob?.write !== undefined) {
        invalidateLargeBlobsInventory();
      }
    },
  });
}

/** GetAssertion retries the exact frozen execution request. */
export async function rerunLabGetAssertion(): Promise<boolean> {
  const current = get(labState);

  if (current.getStep.phase !== "error") return false;

  if (current.getStep.failedPhase === "previewing") return runLabGetAssertion();

  return confirmLabGetAssertion();
}

export function editLabGetAssertion() {
  const current = get(labState);

  if (current.getStep.phase === "editing") return true;

  labState.set({
    ...current,
    pendingHandoff: null,
    activeOperation: "get",
    getStep: { phase: "editing" },
    getVerification: { phase: "idle" },
  });

  return true;
}

export function newLabGetAssertionRun() {
  const current = get(labState);
  const getDraft =
    current.getDraft.clientData.mode === "builder"
      ? {
          ...current.getDraft,
          clientData: { ...current.getDraft.clientData, challenge: randomBase64URL(32) },
        }
      : current.getDraft;

  labState.set({
    ...current,
    pendingHandoff: null,
    activeOperation: "get",
    getDraft,
    getStep: { phase: "editing" },
    getVerification: { phase: "idle" },
  });

  return true;
}

export function retryLabMakeCredentialVerification() {
  const current = get(labState);

  if (current.makeStep.phase !== "success") return false;

  const result = current.makeStep.value;
  const { request } = current.makeStep;

  labState.set({
    ...current,
    makeVerification: { phase: "loading" },
  });
  void verifyMakeCredentialResult(request, result);

  return true;
}

export function retryLabMakeCredentialAttestationTrust() {
  const current = get(labState);

  if (current.makeStep.phase !== "success") return false;

  const result = current.makeStep.value;

  labState.set({
    ...current,
    makeAttestationTrust: { phase: "loading" },
  });
  void assessMakeCredentialAttestation(current.makeStep.request, result);

  return true;
}

export function retryLabGetAssertionVerification() {
  const current = get(labState);

  if (current.getStep.phase !== "success") return false;

  const result = current.getStep.value;
  const { request } = current.getStep;

  labState.set({
    ...current,
    getVerification: { phase: "loading" },
  });
  void verifyGetAssertionResult(request, result, current.getDraft.verificationMaterial);

  return true;
}

export function updateLabVerificationMaterial(material: CredentialVerificationMaterial[]) {
  const current = get(labState);
  const getDraft = {
    ...current.getDraft,
    verificationMaterial: material.map((entry) => new CredentialVerificationMaterial(entry)),
  };

  labState.set({
    ...current,
    getDraft,
    getVerification: current.getStep.phase === "success" ? { phase: "loading" } : { phase: "idle" },
  });
  if (current.getStep.phase !== "success") return true;

  const result = current.getStep.value;

  void verifyGetAssertionResult(current.getStep.request, result, getDraft.verificationMaterial);

  return true;
}

function completeHandoff(handoff: LabPendingHandoff, replace: boolean) {
  const current = get(labState);
  const { rpID, credentialIDHex, publicKeyCOSEHex, previousSignCount, previewSign } = handoff;
  const duplicate = current.getDraft.allowList.some(
    (entry) => entry.credentialIDHex.trim().toLowerCase() === credentialIDHex.toLowerCase(),
  );
  const created = { credentialIDHex };
  const allowList = replace
    ? [created]
    : duplicate
      ? current.getDraft.allowList
      : [...current.getDraft.allowList, created];
  const verification = new CredentialVerificationMaterial({
    credentialIDHex,
    publicKeyCOSEHex,
    previousSignCount,
  });
  const verificationMaterial = replace
    ? [verification]
    : [
        ...current.getDraft.verificationMaterial.filter(
          (entry) => entry.credentialIDHex.trim().toLowerCase() !== credentialIDHex.toLowerCase(),
        ),
        verification,
      ];
  const extensions =
    previewSign === undefined
      ? current.getDraft.extensions
      : {
          ...current.getDraft.extensions,
          previewSign: {
            ...current.getDraft.extensions.previewSign,
            included: true,
            algorithm: previewSign.algorithm,
            keyHandleHex: previewSign.keyHandleHex,
            additionalArgumentsHex: previewSign.arkgP256?.additionalArgumentsHex ?? "",
            verificationKeyCOSEHex: previewSign.arkgP256?.verificationKeyCOSEHex ?? "",
          },
        };
  const getDraft = { ...current.getDraft, rpID, allowList, extensions, verificationMaterial };

  labState.set({
    ...current,
    pendingHandoff: null,
    activeOperation: "get",
    getDraft,
    getStep: { phase: "editing" },
    getVerification: { phase: "idle" },
  });

  const outcome = {
    tone: "success" as const,
    title: m.lab_handoff_complete(),
    message: m.lab_handoff_complete_message(),
  };

  setStatusOutcome(outcome);
  toast.success(outcome.title, { description: outcome.message });

  return true;
}

/** Starts handoff. Returns false when confirmation is needed or ARKG derivation fails. */
export async function handoffLabCredential(): Promise<boolean> {
  const current = get(labState);

  if (current.makeStep.phase !== "success") return false;

  const result = current.makeStep.value;
  const generatedKey = result.extensionResults?.client?.previewSign?.generatedKey;
  let handoffPreviewSign: LabPendingHandoff["previewSign"];

  if (generatedKey) {
    handoffPreviewSign = {
      algorithm: generatedKey.algorithm,
      keyHandleHex: generatedKey.keyHandleHex,
    };

    if (generatedKey.algorithm === Algorithm.AlgorithmESP256SplitARKGPlaceholder) {
      try {
        const arkgP256 = await api.derivePreviewSignARKGP256(
          new DerivePreviewSignARKGP256Request({
            generatedKey,
            context: result.rpID,
          }),
        );
        handoffPreviewSign.arkgP256 = arkgP256;
      } catch (cause) {
        const error = runtimeFailureFrom(cause);
        const outcome = {
          tone: "error" as const,
          title: m.lab_handoff_failed(),
          message: failureMessage(error),
        };

        setStatusOutcome(outcome);
        toast.error(outcome.title, { description: outcome.message });

        return false;
      }
    }
  }

  const handoff: LabPendingHandoff = {
    rpID: result.rpID,
    credentialIDHex: result.credentialIDHex,
    publicKeyCOSEHex: result.publicKeyCOSEHex,
    previousSignCount: result.signCount,
    ...(handoffPreviewSign === undefined ? {} : { previewSign: handoffPreviewSign }),
  };
  const differentRP = Boolean(current.getDraft.rpID && current.getDraft.rpID !== result.rpID);
  const fixedResult = current.getStep.phase === "success";

  if (differentRP || fixedResult) {
    labState.set({
      ...current,
      pendingHandoff: handoff,
    });

    return false;
  }

  return completeHandoff(handoff, false);
}

export function confirmLabHandoff() {
  const pending = get(labState).pendingHandoff;

  if (!pending) return false;

  return completeHandoff(pending, true);
}

export function cancelLabHandoff() {
  labState.update((state) => ({ ...state, pendingHandoff: null }));
}
