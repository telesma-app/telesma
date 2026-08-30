import { writable } from "svelte/store";

import { Algorithm } from "../../../../bindings/github.com/telesma-app/ctap/cose";
import {
  CredentialProtectionPolicy,
  LargeBlobSupport,
} from "../../../../bindings/github.com/telesma-app/ctap/extension";
import { VerificationFlow } from "../../../../bindings/github.com/telesma-app/kit";
import type { Failure } from "../../../../bindings/github.com/telesma-app/kit/model/failure";
import type {
  CredentialVerificationMaterial,
  GetAssertionPreview,
  GetAssertionResult,
  GetAssertionVerification,
  MakeCredentialPreview,
  MakeCredentialResult,
  MakeCredentialVerification,
} from "../../../../bindings/github.com/telesma-app/kit/model/webauthn";
import type { AttestationTrustAssessment } from "../../../../bindings/github.com/telesma-app/mds/model";
import type {
  GetAssertionEnvelope,
  GetAssertionRequest,
  MakeCredentialEnvelope,
  MakeCredentialRequest,
} from "../../../../bindings/telesma/service";

import type { ConfirmedOperation } from "$lib/confirmed-operation";
import {
  buildClientDataJSON,
  randomBase64URL,
  randomHex,
  type LabRandomSource,
} from "$lib/lab-input";

export type LabTriState = "auto" | "true" | "false";

export type LabClientDataMode = "builder" | "raw";

export type LabOperationTab = "make" | "get";

export type LabBinaryMode = "utf8" | "hex";

export type LabEnterpriseAttestation = 0 | 1 | 2;

export type LabBinaryDraft = {
  mode: LabBinaryMode;
  value: string;
};

export type LabBooleanExtensionDraft = {
  included: boolean;
  value: boolean;
};

export type LabHMACSecretDraft = {
  included: boolean;
  salt1Hex: string;
  salt2Enabled: boolean;
  salt2Hex: string;
};

export type LabPRFValuesDraft = {
  first: LabBinaryDraft;
  secondEnabled: boolean;
  second: LabBinaryDraft;
};

export type LabPRFCredentialEvaluationDraft = {
  credentialIDHex: string;
  values: LabPRFValuesDraft;
};

export type LabLargeBlobGetMode = "read" | "write";

export type MakeCredentialExtensionsDraft = {
  credentialProperties: { included: boolean };
  credentialProtection: {
    included: boolean;
    policy: CredentialProtectionPolicy;
    enforce: boolean;
  };
  credentialBlob: {
    included: boolean;
    payload: LabBinaryDraft;
  };
  hmacSecret: LabBooleanExtensionDraft;
  hmacSecretMC: LabHMACSecretDraft;
  largeBlob: {
    included: boolean;
    support: LargeBlobSupport;
  };
  minPINLength: LabBooleanExtensionDraft;
  pinComplexityPolicy: LabBooleanExtensionDraft;
  prf: {
    included: boolean;
    useEval: boolean;
    eval: LabPRFValuesDraft;
  };
  previewSign: {
    included: boolean;
    algorithms: string[];
  };
  payment: { included: boolean };
};

export type GetAssertionExtensionsDraft = {
  getCredentialBlob: LabBooleanExtensionDraft;
  hmacSecret: LabHMACSecretDraft;
  largeBlob: {
    included: boolean;
    mode: LabLargeBlobGetMode;
    payload: LabBinaryDraft;
  };
  prf: {
    included: boolean;
    useGlobalEval: boolean;
    eval: LabPRFValuesDraft;
    evalByCredential: LabPRFCredentialEvaluationDraft[];
  };
  previewSign: {
    included: boolean;
    algorithm?: Algorithm;
    keyHandleHex: string;
    toBeSigned: LabBinaryDraft;
    additionalArgumentsHex: string;
    verificationKeyCOSEHex: string;
  };
  payment: { included: boolean };
};

export type LabDescriptorDraft = {
  credentialIDHex: string;
};

export type LabClientDataDraft = {
  mode: LabClientDataMode;
  origin: string;
  challenge: string;
  crossOrigin: boolean;
  topOrigin: string;
  rawJSON: string;
};

export type MakeCredentialDraft = {
  rpID: string;
  rpName: string;
  userIDHex: string;
  userName: string;
  userDisplayName: string;
  clientData: LabClientDataDraft;
  algorithms: string[];
  attestationFormatsPreference: string[];
  enterpriseAttestation: LabEnterpriseAttestation;
  excludeList: LabDescriptorDraft[];
  residentKey: LabTriState;
  userPresence: LabTriState;
  userVerification: LabTriState;
  verificationFlow: VerificationFlow;
  extensions: MakeCredentialExtensionsDraft;
};

export type GetAssertionDraft = {
  rpID: string;
  clientData: LabClientDataDraft;
  allowList: LabDescriptorDraft[];
  userPresence: LabTriState;
  userVerification: LabTriState;
  verificationFlow: VerificationFlow;
  extensions: GetAssertionExtensionsDraft;
  verificationMaterial: CredentialVerificationMaterial[];
};

export type LabVerificationState<T> =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; verification: T }
  | { phase: "error"; error: Failure };

export type LabMakeStep = ConfirmedOperation<
  MakeCredentialRequest,
  MakeCredentialEnvelope,
  MakeCredentialPreview,
  MakeCredentialResult
>;

export type LabGetStep = ConfirmedOperation<
  GetAssertionRequest,
  GetAssertionEnvelope,
  GetAssertionPreview,
  GetAssertionResult
>;

export type LabPendingHandoff = {
  rpID: string;
  credentialIDHex: string;
  publicKeyCOSEHex: string;
  previousSignCount: number;
  previewSign?: {
    algorithm: Algorithm;
    keyHandleHex: string;
    arkgP256?: {
      additionalArgumentsHex: string;
      verificationKeyCOSEHex: string;
    };
  };
};

export type LabState = {
  activeOperation: LabOperationTab;
  makeDraft: MakeCredentialDraft;
  getDraft: GetAssertionDraft;
  makeStep: LabMakeStep;
  getStep: LabGetStep;
  makeVerification: LabVerificationState<MakeCredentialVerification>;
  makeAttestationTrust: LabVerificationState<AttestationTrustAssessment>;
  getVerification: LabVerificationState<GetAssertionVerification>;
  pendingHandoff: LabPendingHandoff | null;
};

function prfValues(first = ""): LabPRFValuesDraft {
  return {
    first: { mode: "utf8", value: first },
    secondEnabled: false,
    second: { mode: "utf8", value: "" },
  };
}

function makeExtensionDefaults(randomSource?: LabRandomSource): MakeCredentialExtensionsDraft {
  return {
    credentialProperties: { included: false },
    credentialProtection: {
      included: false,
      policy: CredentialProtectionPolicy.CredentialProtectionPolicyUserVerificationOptional,
      enforce: false,
    },
    credentialBlob: { included: false, payload: { mode: "utf8", value: "" } },
    hmacSecret: { included: false, value: true },
    hmacSecretMC: {
      included: false,
      salt1Hex: randomHex(32, randomSource),
      salt2Enabled: false,
      salt2Hex: "",
    },
    largeBlob: { included: false, support: LargeBlobSupport.LargeBlobSupportPreferred },
    minPINLength: { included: false, value: true },
    pinComplexityPolicy: { included: false, value: true },
    prf: { included: false, useEval: false, eval: prfValues("registration-prf") },
    previewSign: {
      included: false,
      algorithms: [String(Algorithm.AlgorithmESP256SplitARKGPlaceholder)],
    },
    payment: { included: false },
  };
}

function getExtensionDefaults(randomSource?: LabRandomSource): GetAssertionExtensionsDraft {
  return {
    getCredentialBlob: { included: false, value: true },
    hmacSecret: {
      included: false,
      salt1Hex: randomHex(32, randomSource),
      salt2Enabled: false,
      salt2Hex: "",
    },
    largeBlob: {
      included: false,
      mode: "read",
      payload: { mode: "utf8", value: "" },
    },
    prf: {
      included: false,
      useGlobalEval: false,
      eval: prfValues("authentication-prf"),
      evalByCredential: [],
    },
    previewSign: {
      included: false,
      keyHandleHex: "",
      toBeSigned: {
        mode: "hex",
        value: "2064e899b1e7bae82340c5214bed6b9009efcc9f9b3999dbe66f67349c9b88ad",
      },
      additionalArgumentsHex: "",
      verificationKeyCOSEHex: "",
    },
    payment: { included: false },
  };
}

export function createLabState(randomSource?: LabRandomSource): LabState {
  const userIDHex = randomHex(16, randomSource);
  const makeChallenge = randomBase64URL(32, randomSource);
  const getChallenge = randomBase64URL(32, randomSource);
  const makeClientData: LabClientDataDraft = {
    mode: "builder",
    origin: "https://example.com",
    challenge: makeChallenge,
    crossOrigin: false,
    topOrigin: "https://example.com",
    rawJSON: "",
  };
  const getClientData: LabClientDataDraft = {
    mode: "builder",
    origin: "https://example.com",
    challenge: getChallenge,
    crossOrigin: false,
    topOrigin: "https://example.com",
    rawJSON: "",
  };

  makeClientData.rawJSON = buildClientDataJSON("create", makeClientData);
  getClientData.rawJSON = buildClientDataJSON("get", getClientData);

  return {
    activeOperation: "make",
    makeDraft: {
      rpID: "example.com",
      rpName: "Example",
      userIDHex,
      userName: "alice@example.com",
      userDisplayName: "Alice",
      clientData: makeClientData,
      algorithms: ["-7"],
      attestationFormatsPreference: [],
      enterpriseAttestation: 0,
      excludeList: [],
      residentKey: "auto",
      userPresence: "auto",
      userVerification: "auto",
      verificationFlow: VerificationFlow.VerificationFlowDefault,
      extensions: makeExtensionDefaults(randomSource),
    },
    getDraft: {
      rpID: "example.com",
      clientData: getClientData,
      allowList: [],
      userPresence: "auto",
      userVerification: "auto",
      verificationFlow: VerificationFlow.VerificationFlowDefault,
      extensions: getExtensionDefaults(randomSource),
      verificationMaterial: [],
    },
    makeStep: { phase: "editing" },
    getStep: { phase: "editing" },
    makeVerification: { phase: "idle" },
    makeAttestationTrust: { phase: "idle" },
    getVerification: { phase: "idle" },
    pendingHandoff: null,
  };
}

export const labState = writable<LabState>(createLabState());

export function resetLabDeviceState() {
  labState.set(createLabState());
}

export function resetLabStateForTest(randomSource?: LabRandomSource) {
  labState.set(createLabState(randomSource));
}
