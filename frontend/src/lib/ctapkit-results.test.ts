import { Info } from "../../bindings/github.com/telesma-app/kit/model/inspect";
import { describe, expect, it } from "vitest";

import type { InventoryReport } from "../../bindings/github.com/telesma-app/kit/model/credentials";
import type {
  CredentialDeleteEnvelope,
  GetAssertionEnvelope,
  GetInfoEnvelope,
  LargeBlobDecodeEnvelope,
  MakeCredentialEnvelope,
} from "../../bindings/telesma/service";

import {
  credentialDeletePreview,
  credentialDeleteResult,
  credentialTarget,
  getAssertionResult,
  getInfoResult,
  largeBlobDecodeResult,
  makeCredentialPreview,
  makeCredentialResult,
} from "$lib/ctapkit-results";

describe("typed operation result traversal", () => {
  it("extracts direct results and rejects empty envelopes", () => {
    const inspect = new Info();
    const decoded = { mode: "json", value: { hello: true } };

    expect(getInfoResult({ result: inspect } as GetInfoEnvelope)).toBe(inspect);
    expect(largeBlobDecodeResult({ result: decoded } as LargeBlobDecodeEnvelope)).toBe(decoded);
    expect(getInfoResult(null)).toBeNull();
    expect(largeBlobDecodeResult({} as LargeBlobDecodeEnvelope)).toBeNull();
  });

  it("extracts preview and result from a typed mutation output", () => {
    const preview = { credentialIDHex: "cafe", rpID: "example.test" };
    const result = { attachmentId: "dev-1", credentialIDHex: "cafe", rpID: "example.test" };
    const envelope = { result: { preview, result } } as CredentialDeleteEnvelope;

    expect(credentialDeletePreview(envelope)).toBe(preview);
    expect(credentialDeleteResult(envelope)).toBe(result);
    expect(
      credentialDeleteResult({ result: { preview, result: null } } as CredentialDeleteEnvelope),
    ).toBeNull();
  });

  it("extracts both WebAuthn phases from their generated envelopes", () => {
    const makePreview = { device: {}, input: {}, warnings: [] };
    const makeResult = { attachmentId: "dev-1", rpID: "example.test" };
    const getResult = { attachmentId: "dev-1", rpID: "example.test", assertions: [] };

    const make = {
      result: { preview: makePreview, result: makeResult },
    } as unknown as MakeCredentialEnvelope;
    const assertion = { result: { result: getResult } } as unknown as GetAssertionEnvelope;

    expect(makeCredentialPreview(make)).toBe(makePreview);
    expect(makeCredentialResult(make)).toBe(makeResult);
    expect(getAssertionResult(assertion)).toBe(getResult);
  });
});

describe("credential target lookup", () => {
  it("combines the selected record with its RP and normalized user fields", () => {
    const report = {
      groups: [
        {
          rpID: "example.test",
          rpName: "Example",
          credentials: [
            {
              credentialIDHex: "cafe",
              userIDHex: "01",
              userName: "alice",
              displayName: "Alice",
            },
          ],
        },
      ],
    } as InventoryReport;

    expect(credentialTarget(report, "cafe")).toMatchObject({
      rp: { id: "example.test", name: "Example" },
      user: { userIDHex: "01", name: "alice", displayName: "Alice" },
      record: { credentialIDHex: "cafe" },
    });
    expect(credentialTarget(report, "missing")).toBeNull();
  });
});
