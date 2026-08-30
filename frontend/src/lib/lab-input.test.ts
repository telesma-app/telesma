import { describe, expect, it } from "vitest";

import { Algorithm } from "../../bindings/github.com/telesma-app/ctap/cose";
import { VerificationFlow } from "../../bindings/github.com/telesma-app/kit";
import { LargeBlobSupport } from "../../bindings/github.com/telesma-app/ctap/extension";
import {
  AuthenticationExtensionsLargeBlobInputs,
  AuthenticationExtensionsPaymentInputs,
  AuthenticationExtensionsPreviewSignInputs,
  AuthenticationExtensionsPRFInputs,
  AuthenticationExtensionsPRFValues,
  CreateAuthenticationExtensionsClientInputs,
  GetAuthenticationExtensionsClientInputs,
  HMACGetSecretInput,
  PreviewSignGenerateKeyInputs,
  PreviewSignSignInputs,
} from "../../bindings/github.com/telesma-app/ctap/webauthn";

import { createLabState } from "$lib/features/lab/state";
import {
  base64ToHex,
  base64ToUTF8,
  buildAuthenticatorOptions,
  buildClientDataJSON,
  buildGetAssertionRequest,
  buildMakeCredentialRequest,
  hexToBase64,
  hexToBase64URL,
  isHTTPOrigin,
  isWebAuthnOrigin,
  randomBase64URL,
  randomHex,
  rpIDMatchesOrigin,
  utf8ToBase64,
  validateGetAssertionDraft,
  validateMakeCredentialDraft,
} from "$lib/lab-input";

function base64URLToHex(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));

  return Array.from(binary, (character) =>
    character.charCodeAt(0).toString(16).padStart(2, "0"),
  ).join("");
}

function sequentialRandom() {
  let next = 0;

  return (target: Uint8Array) => {
    target.forEach((_, index) => {
      target[index] = next;
      next = (next + 1) & 0xff;
    });
  };
}

describe("WebAuthn Lab binary inputs", () => {
  it("generates deterministic byte-exact hex and unpadded base64url", () => {
    const source = sequentialRandom();

    expect(randomHex(4, source)).toBe("00010203");
    expect(randomBase64URL(4, source)).toBe("BAUGBw");
  });

  it("converts strict hex, base64, base64url, and UTF-8 without loss", () => {
    expect(hexToBase64("00ff10a5")).toBe("AP8QpQ==");
    expect(base64ToHex("AP8QpQ==")).toBe("00ff10a5");
    expect(hexToBase64URL("fbff00")).toBe("-_8A");

    const encoded = utf8ToBase64("Привет 👋");

    expect(encoded).toBe("0J/RgNC40LLQtdGCIPCfkYs=");
    expect(base64ToUTF8(encoded)).toBe("Привет 👋");
  });

  it("rejects odd or decorated hex and non-canonical base64 encodings", () => {
    expect(() => hexToBase64("abc")).toThrow("invalid hex");
    expect(() => hexToBase64("0x10")).toThrow("invalid hex");
    expect(() => base64ToHex("AP8QpQ")).toThrow("invalid base64");
  });
});

describe("WebAuthn Lab default state", () => {
  it("creates a minimal request with fresh independent identifiers and challenges", () => {
    const state = createLabState(sequentialRandom());

    expect(state.makeDraft.userIDHex).toBe("000102030405060708090a0b0c0d0e0f");
    expect(base64URLToHex(state.makeDraft.clientData.challenge)).toBe(
      "101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f",
    );
    expect(base64URLToHex(state.getDraft.clientData.challenge)).toBe(
      "303132333435363738393a3b3c3d3e3f404142434445464748494a4b4c4d4e4f",
    );
    expect(state.makeDraft.clientData.challenge).not.toBe(state.getDraft.clientData.challenge);
    expect(buildAuthenticatorOptions(state.makeDraft)).toBeUndefined();
    expect(buildGetAssertionRequest(state.getDraft).options).toBeUndefined();
    expect(
      Object.values(state.makeDraft.extensions).every((extension) => !extension.included),
    ).toBe(true);
    expect(Object.values(state.getDraft.extensions).every((extension) => !extension.included)).toBe(
      true,
    );
    expect(state.makeDraft.extensions.previewSign.algorithms).toEqual([
      String(Algorithm.AlgorithmESP256SplitARKGPlaceholder),
    ]);
  });
});

describe("WebAuthn Lab client data and validation", () => {
  it("builds fixed ordered create/get client data JSON", () => {
    const input = {
      challenge: "AQID",
      origin: "https://example.com",
      crossOrigin: false,
      topOrigin: "https://example.com",
    };

    expect(buildClientDataJSON("create", input)).toBe(
      '{"type":"webauthn.create","challenge":"AQID","origin":"https://example.com","crossOrigin":false}',
    );
    expect(buildClientDataJSON("get", input)).toBe(
      '{"type":"webauthn.get","challenge":"AQID","origin":"https://example.com","crossOrigin":false}',
    );

    expect(
      buildClientDataJSON("get", {
        ...input,
        crossOrigin: true,
        topOrigin: "https://top.example.com",
      }),
    ).toBe(
      '{"type":"webauthn.get","challenge":"AQID","origin":"https://example.com","crossOrigin":true,"topOrigin":"https://top.example.com"}',
    );
  });

  it("requires an exact HTTP(S) origin and a nonempty strict base64url challenge in builder mode", () => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.clientData.origin = "https://example.com/path";
    state.makeDraft.clientData.challenge = "not+padded=";

    expect(validateMakeCredentialDraft(state.makeDraft).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "make.clientData.origin", code: "invalid-origin" }),
        expect.objectContaining({ field: "make.clientData.challenge", code: "invalid-base64url" }),
      ]),
    );
  });

  it("accepts ports but rejects credentials, paths, queries, fragments, and a trailing slash", () => {
    expect(isHTTPOrigin("http://localhost:8080")).toBe(true);
    expect(isHTTPOrigin("https://example.com:443")).toBe(true);
    expect(isHTTPOrigin("https://user@example.com")).toBe(false);
    expect(isHTTPOrigin("https://example.com/")).toBe(false);
    expect(isHTTPOrigin("https://example.com/path")).toBe(false);
    expect(isHTTPOrigin("https://example.com?query=1")).toBe(false);
    expect(isHTTPOrigin("https://example.com#fragment")).toBe(false);
  });

  it("requires a secure WebAuthn origin and validates RP ID against the registrable domain", () => {
    expect(isWebAuthnOrigin("https://login.example.com:8443")).toBe(true);
    expect(isWebAuthnOrigin("http://localhost:8080")).toBe(true);
    expect(isWebAuthnOrigin("http://example.com")).toBe(false);

    expect(rpIDMatchesOrigin("login.example.com", "https://login.example.com:8443")).toBe(true);
    expect(rpIDMatchesOrigin("example.com", "https://login.example.com:8443")).toBe(true);
    expect(rpIDMatchesOrigin("other.example", "https://login.example.com")).toBe(false);
    expect(rpIDMatchesOrigin("com", "https://login.example.com")).toBe(false);
    expect(rpIDMatchesOrigin("github.io", "https://alice.github.io")).toBe(false);
    expect(rpIDMatchesOrigin("localhost", "http://localhost:8080")).toBe(true);
  });

  it("validates topOrigin only for cross-origin client data", () => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.clientData.crossOrigin = true;
    state.makeDraft.clientData.topOrigin = "http://example.com";

    expect(validateMakeCredentialDraft(state.makeDraft).errors).toContainEqual({
      field: "make.clientData.topOrigin",
      code: "insecure-origin",
    });

    state.makeDraft.clientData.crossOrigin = false;
    expect(validateMakeCredentialDraft(state.makeDraft).valid).toBe(true);
  });

  it("warns about invalid raw JSON without blocking exact raw UTF-8 bytes", () => {
    const state = createLabState(sequentialRandom());

    state.getDraft.clientData.mode = "raw";
    state.getDraft.clientData.rawJSON = "{not JSON}\nПривет";

    const validation = validateGetAssertionDraft(state.getDraft);

    expect(validation.valid).toBe(true);
    expect(validation.warnings).toEqual([
      { field: "get.clientData.rawJSON", code: "invalid-json" },
    ]);

    const request = buildGetAssertionRequest(state.getDraft);

    expect(base64ToUTF8(request.clientDataJSON)).toBe("{not JSON}\nПривет");
  });

  it("preserves valid raw client data JSON byte-for-byte", () => {
    const state = createLabState(sequentialRandom());
    const rawJSON = '{\n  "type": "webauthn.get",\n  "crossOrigin": false\n}';

    state.getDraft.clientData.mode = "raw";
    state.getDraft.clientData.rawJSON = rawJSON;

    const request = buildGetAssertionRequest(state.getDraft);

    expect(base64ToUTF8(request.clientDataJSON)).toBe(rawJSON);
  });
});

describe("WebAuthn Lab request builders", () => {
  it("keeps algorithm preference order and omits every Auto option", () => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.algorithms = ["-7", "-257", "42"];

    const request = buildMakeCredentialRequest(state.makeDraft);

    expect(request.pubKeyCredParams.map(({ alg }) => alg)).toEqual([-7, -257, 42]);
    expect(request.pubKeyCredParams.map(({ type }) => type)).toEqual([
      "public-key",
      "public-key",
      "public-key",
    ]);
    expect(request.options).toBeUndefined();
    expect(request.excludeList).toBeUndefined();
    expect(request.verificationFlow).toBeUndefined();
    expect(JSON.parse(JSON.stringify(request))).not.toHaveProperty("options");
  });

  it("passes explicit false, PIN flow, descriptors, and their order exactly", () => {
    const state = createLabState(sequentialRandom());

    state.getDraft.verificationFlow = VerificationFlow.VerificationFlowPIN;
    state.getDraft.userPresence = "false";
    state.getDraft.allowList = [
      { credentialIDHex: "00ff" },
      { credentialIDHex: "aabb" },
      { credentialIDHex: "00ff" },
    ];

    const request = buildGetAssertionRequest(state.getDraft);

    expect(request.verificationFlow).toBe("pin");
    expect(request.options).toEqual({ userPresence: false });
    expect(request.allowList?.map(({ id }) => base64ToHex(id))).toEqual(["00ff", "aabb", "00ff"]);
    expect(request.allowList?.every(({ transports }) => transports === undefined)).toBe(true);
  });

  it("reports zero, fractional, unsafe, and malformed algorithm IDs", () => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.algorithms = ["0", "1.5", "9007199254740992", "ES256"];

    const validation = validateMakeCredentialDraft(state.makeDraft);

    expect(validation.valid).toBe(false);
    expect(validation.errors.filter(({ code }) => code === "invalid-algorithm")).toHaveLength(4);
  });

  it("rejects duplicate algorithms and invalid MakeCredential user presence", () => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.algorithms = ["-7", "-257", "-7"];
    state.makeDraft.userPresence = "false";

    expect(validateMakeCredentialDraft(state.makeDraft).errors).toEqual(
      expect.arrayContaining([
        { field: "make.algorithms.2", code: "duplicate-algorithm" },
        { field: "make.userPresence", code: "invalid-user-presence" },
      ]),
    );
  });

  it("limits user IDs to 64 bytes", () => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.userIDHex = "11".repeat(65);

    expect(validateMakeCredentialDraft(state.makeDraft).errors).toContainEqual({
      field: "make.userIDHex",
      code: "user-id-too-long",
    });
  });

  it("passes CTAP attestation preferences and rejects duplicate formats", () => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.attestationFormatsPreference = ["packed", "none"];
    state.makeDraft.enterpriseAttestation = 2;

    const request = buildMakeCredentialRequest(state.makeDraft);

    expect(request.attestationFormatsPreference).toEqual(["packed", "none"]);
    expect(request.enterpriseAttestation).toBe(2);

    state.makeDraft.attestationFormatsPreference.push("packed");
    expect(validateMakeCredentialDraft(state.makeDraft).errors).toContainEqual({
      field: "make.attestationFormatsPreference.2",
      code: "duplicate-attestation-format",
    });
  });

  it("validates all user and descriptor IDs as nonempty even-length hex", () => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.userIDHex = "abc";
    state.makeDraft.excludeList = [{ credentialIDHex: "" }];
    state.getDraft.allowList = [{ credentialIDHex: "zz" }];

    expect(validateMakeCredentialDraft(state.makeDraft).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "make.userIDHex", code: "invalid-hex" }),
        expect.objectContaining({ field: "make.excludeList.0.credentialIDHex", code: "required" }),
      ]),
    );
    expect(validateGetAssertionDraft(state.getDraft).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "get.allowList.0.credentialIDHex", code: "invalid-hex" }),
      ]),
    );
  });

  it("builds credProps as the WebAuthn boolean while preserving CTAP extension DTOs", () => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.extensions.credentialProperties = { included: true };
    state.makeDraft.extensions.credentialBlob = {
      included: true,
      payload: { mode: "utf8", value: "" },
    };
    state.makeDraft.extensions.hmacSecret = { included: true, value: false };
    state.makeDraft.extensions.hmacSecretMC = {
      included: true,
      salt1Hex: "11".repeat(32),
      salt2Enabled: false,
      salt2Hex: "",
    };

    const request = buildMakeCredentialRequest(state.makeDraft);

    expect(request.extensions).toBeInstanceOf(CreateAuthenticationExtensionsClientInputs);
    expect(request.extensions?.credProps).toBe(true);
    expect(request.extensions?.credBlob).toBe("");
    expect(request.extensions?.hmacCreateSecret).toBe(false);
    expect(request.extensions?.hmacGetSecret).toBeInstanceOf(HMACGetSecretInput);
    expect(base64ToHex(request.extensions!.hmacGetSecret!.salt1)).toBe("11".repeat(32));
    expect(request.extensions?.hmacGetSecret?.salt2).toBeUndefined();
    expect(request.extensions?.previewSign).toBeUndefined();
    expect(JSON.parse(JSON.stringify(request.extensions))).not.toHaveProperty("previewSign");
  });

  it("builds a direct WebAuthn PRF eval with zero-length BufferSources intact", () => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.extensions.prf.included = true;
    state.makeDraft.extensions.prf.useEval = true;
    state.makeDraft.extensions.prf.eval = {
      first: { mode: "utf8", value: "" },
      secondEnabled: true,
      second: { mode: "hex", value: "" },
    };

    const request = buildMakeCredentialRequest(state.makeDraft);

    expect(request.extensions?.prf).toBeInstanceOf(AuthenticationExtensionsPRFInputs);
    expect(request.extensions?.prf?.eval).toBeInstanceOf(AuthenticationExtensionsPRFValues);
    expect(request.extensions?.prf?.eval?.first).toBe("");
    expect(request.extensions?.prf?.eval?.second).toBe("");
    expect(validateMakeCredentialDraft(state.makeDraft).valid).toBe(true);
  });

  it("builds WebAuthn PRF global and per-credential evaluations together", () => {
    const state = createLabState(sequentialRandom());

    state.getDraft.allowList = [{ credentialIDHex: "aabb" }];
    state.getDraft.extensions.prf.included = true;
    state.getDraft.extensions.prf.useGlobalEval = true;
    state.getDraft.extensions.prf.eval = {
      first: { mode: "utf8", value: "global" },
      secondEnabled: false,
      second: { mode: "utf8", value: "" },
    };
    state.getDraft.extensions.prf.evalByCredential = [
      {
        credentialIDHex: "aabb",
        values: {
          first: { mode: "hex", value: "0102" },
          secondEnabled: false,
          second: { mode: "utf8", value: "" },
        },
      },
    ];

    const request = buildGetAssertionRequest(state.getDraft);

    expect(request.extensions?.prf).toBeInstanceOf(AuthenticationExtensionsPRFInputs);
    expect(base64ToUTF8(request.extensions!.prf!.eval!.first)).toBe("global");
    expect(Object.keys(request.extensions!.prf!.evalByCredential!)).toEqual(["qrs"]);
    expect(base64ToHex(request.extensions!.prf!.evalByCredential!["qrs"]!.first)).toBe("0102");
  });

  it("builds an empty PRF input when evaluation is not requested", () => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.extensions.prf.included = true;
    state.getDraft.extensions.prf.included = true;

    const makePRF = buildMakeCredentialRequest(state.makeDraft).extensions?.prf;
    const getPRF = buildGetAssertionRequest(state.getDraft).extensions?.prf;

    expect(makePRF).toBeInstanceOf(AuthenticationExtensionsPRFInputs);
    expect(getPRF).toBeInstanceOf(AuthenticationExtensionsPRFInputs);
    expect(makePRF?.eval).toBeUndefined();
    expect(getPRF?.eval).toBeUndefined();
    expect(getPRF?.evalByCredential).toBeUndefined();
  });

  it("builds previewSign key generation and shared per-credential signing inputs", () => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.extensions.previewSign = {
      included: true,
      algorithms: [String(Algorithm.AlgorithmESP256SplitARKGPlaceholder)],
    };
    state.getDraft.allowList = [{ credentialIDHex: "aabb" }, { credentialIDHex: "ccdd" }];
    state.getDraft.extensions.previewSign = {
      included: true,
      keyHandleHex: "0102",
      toBeSigned: { mode: "utf8", value: "sign me" },
      additionalArgumentsHex: "a1033a00010002",
      verificationKeyCOSEHex: "",
    };

    const makePreviewSign = buildMakeCredentialRequest(state.makeDraft).extensions?.previewSign;
    const getPreviewSign = buildGetAssertionRequest(state.getDraft).extensions?.previewSign;

    expect(makePreviewSign).toBeInstanceOf(AuthenticationExtensionsPreviewSignInputs);
    expect(makePreviewSign?.generateKey).toBeInstanceOf(PreviewSignGenerateKeyInputs);
    expect(makePreviewSign?.generateKey?.algorithms).toEqual([
      Algorithm.AlgorithmESP256SplitARKGPlaceholder,
    ]);
    expect(getPreviewSign).toBeInstanceOf(AuthenticationExtensionsPreviewSignInputs);
    expect(Object.keys(getPreviewSign!.signByCredential!)).toEqual(["qrs", "zN0"]);

    for (const signInputs of Object.values(getPreviewSign!.signByCredential!)) {
      expect(signInputs).toBeInstanceOf(PreviewSignSignInputs);
      expect(base64ToHex(signInputs!.keyHandle)).toBe("0102");
      expect(base64ToUTF8(signInputs!.tbs)).toBe("sign me");
      expect(base64ToHex(signInputs!.additionalArgs!)).toBe("a1033a00010002");
    }
  });

  it("builds direct largeBlob and payment inputs without losing empty writes", () => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.extensions.largeBlob = {
      included: true,
      support: LargeBlobSupport.LargeBlobSupportRequired,
    };
    state.makeDraft.extensions.payment.included = true;
    state.getDraft.extensions.largeBlob = {
      included: true,
      mode: "write",
      payload: { mode: "hex", value: "" },
    };
    state.getDraft.extensions.payment.included = true;

    const makeExtensions = buildMakeCredentialRequest(state.makeDraft).extensions;
    const getExtensions = buildGetAssertionRequest(state.getDraft).extensions;

    expect(makeExtensions?.largeBlob).toBeInstanceOf(AuthenticationExtensionsLargeBlobInputs);
    expect(makeExtensions?.largeBlob?.support).toBe(LargeBlobSupport.LargeBlobSupportRequired);
    expect(makeExtensions?.payment).toBeInstanceOf(AuthenticationExtensionsPaymentInputs);
    expect(makeExtensions?.payment?.payment).toBe(true);
    expect(getExtensions?.largeBlob).toBeInstanceOf(AuthenticationExtensionsLargeBlobInputs);
    expect(getExtensions?.largeBlob?.read).toBeUndefined();
    expect(getExtensions?.largeBlob?.write).toBe("");
    expect(getExtensions?.payment).toBeInstanceOf(AuthenticationExtensionsPaymentInputs);
    expect(getExtensions?.payment?.payment).toBe(true);
  });
});

describe("WebAuthn Lab extension validation", () => {
  it("validates previewSign algorithms, handle, signed bytes, and additional arguments", () => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.extensions.previewSign = {
      included: true,
      algorithms: [
        String(Algorithm.AlgorithmESP256SplitARKGPlaceholder),
        String(Algorithm.AlgorithmESP256SplitARKGPlaceholder),
        "invalid",
      ],
    };
    state.getDraft.extensions.previewSign = {
      included: true,
      keyHandleHex: "abc",
      toBeSigned: { mode: "hex", value: "" },
      additionalArgumentsHex: "not-hex",
      verificationKeyCOSEHex: "",
    };

    expect(validateMakeCredentialDraft(state.makeDraft).errors).toEqual(
      expect.arrayContaining([
        {
          field: "make.extensions.previewSign.algorithms.1",
          code: "duplicate-algorithm",
        },
        {
          field: "make.extensions.previewSign.algorithms.2",
          code: "invalid-algorithm",
        },
      ]),
    );
    expect(validateGetAssertionDraft(state.getDraft).errors).toEqual(
      expect.arrayContaining([
        { field: "get.allowList", code: "required" },
        { field: "get.extensions.previewSign.keyHandleHex", code: "invalid-hex" },
        { field: "get.extensions.previewSign.toBeSigned", code: "required" },
        {
          field: "get.extensions.previewSign.additionalArgumentsHex",
          code: "invalid-hex",
        },
      ]),
    );
  });

  it("requires a 32-byte digest for transferred ESP256-split-ARKG signing material", () => {
    const state = createLabState(sequentialRandom());

    state.getDraft.allowList = [{ credentialIDHex: "aabb" }];
    state.getDraft.extensions.previewSign = {
      included: true,
      algorithm: Algorithm.AlgorithmESP256SplitARKGPlaceholder,
      keyHandleHex: "0102",
      toBeSigned: { mode: "utf8", value: "not a digest" },
      additionalArgumentsHex: "a1033a00010002",
      verificationKeyCOSEHex: "a5010203",
    };

    expect(validateGetAssertionDraft(state.getDraft).errors).toContainEqual({
      field: "get.extensions.previewSign.toBeSigned",
      code: "invalid-length",
    });
  });

  it("rejects malformed direct largeBlob write input", () => {
    const state = createLabState(sequentialRandom());

    state.getDraft.extensions.largeBlob = {
      included: true,
      mode: "write",
      payload: { mode: "hex", value: "abc" },
    };

    expect(validateGetAssertionDraft(state.getDraft).errors).toContainEqual({
      field: "get.extensions.largeBlob.payload",
      code: "invalid-hex",
    });
  });

  it.each([31, 33])("rejects a %i-byte HMAC salt", (byteLength) => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.extensions.hmacSecretMC.included = true;
    state.makeDraft.extensions.hmacSecretMC.salt1Hex = "11".repeat(byteLength);

    expect(validateMakeCredentialDraft(state.makeDraft).errors).toContainEqual({
      field: "make.extensions.hmacSecretMC.salt1Hex",
      code: "invalid-length",
    });
  });

  it("accepts one or two exact 32-byte HMAC salts", () => {
    const state = createLabState(sequentialRandom());

    state.getDraft.extensions.hmacSecret.included = true;
    state.getDraft.extensions.hmacSecret.salt1Hex = "11".repeat(32);

    expect(validateGetAssertionDraft(state.getDraft).valid).toBe(true);

    state.getDraft.extensions.hmacSecret.salt2Enabled = true;
    state.getDraft.extensions.hmacSecret.salt2Hex = "22".repeat(32);
    expect(validateGetAssertionDraft(state.getDraft).valid).toBe(true);

    const extensions = buildGetAssertionRequest(state.getDraft).extensions;

    expect(extensions).toBeInstanceOf(GetAuthenticationExtensionsClientInputs);
    expect(extensions?.hmacGetSecret).toBeInstanceOf(HMACGetSecretInput);
  });

  it("rejects raw HMAC/PRF conflicts even without PRF evaluation inputs", () => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.extensions.hmacSecretMC.included = true;
    state.makeDraft.extensions.prf.included = true;
    state.getDraft.extensions.hmacSecret.included = true;
    state.getDraft.extensions.prf.included = true;

    expect(validateMakeCredentialDraft(state.makeDraft).errors).toContainEqual({
      field: "make.extensions.hmac-prf",
      code: "extension-conflict",
    });
    expect(validateGetAssertionDraft(state.getDraft).errors).toContainEqual({
      field: "get.extensions.hmac-prf",
      code: "extension-conflict",
    });
  });

  it("warns without blocking when ctap will omit an oversized credBlob", () => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.extensions.credentialBlob.included = true;
    state.makeDraft.extensions.credentialBlob.payload = { mode: "utf8", value: "four" };

    const oversized = validateMakeCredentialDraft(state.makeDraft, 3);

    expect(oversized.valid).toBe(true);
    expect(oversized.warnings).toContainEqual({
      field: "make.extensions.credBlob",
      code: "too-long",
    });
    expect(validateMakeCredentialDraft(state.makeDraft, 4).warnings).toEqual([]);
  });

  it("allows MakeCredential hmac-secret and PRF inputs to coexist", () => {
    const state = createLabState(sequentialRandom());

    state.makeDraft.extensions.hmacSecret = { included: true, value: false };
    state.makeDraft.extensions.prf.included = true;

    expect(validateMakeCredentialDraft(state.makeDraft).valid).toBe(true);

    state.makeDraft.extensions.hmacSecret.value = true;
    expect(validateMakeCredentialDraft(state.makeDraft).valid).toBe(true);
  });

  it("accepts multi-credential PRF inputs and validates their credential ID encoding", () => {
    const state = createLabState(sequentialRandom());

    state.getDraft.extensions.prf.included = true;
    state.getDraft.allowList = [{ credentialIDHex: "aabb" }, { credentialIDHex: "ccdd" }];
    state.getDraft.extensions.prf.evalByCredential = [
      {
        credentialIDHex: "aabb",
        values: {
          first: { mode: "utf8", value: "input" },
          secondEnabled: false,
          second: { mode: "utf8", value: "" },
        },
      },
      {
        credentialIDHex: "ccdd",
        values: {
          first: { mode: "utf8", value: "input" },
          secondEnabled: false,
          second: { mode: "utf8", value: "" },
        },
      },
    ];

    expect(validateGetAssertionDraft(state.getDraft).valid).toBe(true);

    state.getDraft.extensions.prf.evalByCredential[1].credentialIDHex = "eeff";
    expect(validateGetAssertionDraft(state.getDraft).errors).toContainEqual({
      field: "get.extensions.prf.evalByCredential.1.credentialIDHex",
      code: "prf-credential-not-allowed",
    });

    state.getDraft.extensions.prf.evalByCredential[1].credentialIDHex = "not-hex";
    expect(validateGetAssertionDraft(state.getDraft).errors).toContainEqual({
      field: "get.extensions.prf.evalByCredential.1.credentialIDHex",
      code: "invalid-hex",
    });
  });
});
