import { describe, expect, it } from "vitest";

import {
  Category,
  Code,
  CTAPDetail,
  Failure,
  Phase,
} from "../../bindings/github.com/telesma-app/kit/model/failure";

import { failureMessage, internalFailure, runtimeFailureFrom } from "$lib/failure.js";

describe("runtimeFailureFrom", () => {
  it("returns an existing generated Failure without rebuilding it", () => {
    const failure = new Failure({
      code: Code.CodeAuthenticatorClosed,
      category: Category.CategoryInvalidState,
      operation: "getInfo",
      phase: Phase.PhaseAuthenticator,
    });

    expect(runtimeFailureFrom(failure)).toBe(failure);
  });

  it("restores the complete generated Failure from the Wails Error cause", () => {
    const ctap = {
      command: "authenticatorLargeBlobs",
      commandCode: 0x0c,
      status: "limit-exceeded",
      statusCode: 0x15,
    };
    const error = new Error("CtapkitService.WriteLargeBlob failed", {
      cause: {
        code: Code.CodeLargeBlobArrayTooLarge,
        category: Category.CategoryInvalidState,
        params: { limit: "2048", requested: "4096" },
        operation: "largeBlobs.write",
        phase: Phase.PhaseDecode,
        ctap,
      },
    });

    const failure = runtimeFailureFrom(error);

    expect(failure).toBeInstanceOf(Failure);
    expect(failure).toMatchObject({
      code: Code.CodeLargeBlobArrayTooLarge,
      category: Category.CategoryInvalidState,
      params: { limit: "2048", requested: "4096" },
      operation: "largeBlobs.write",
      phase: Phase.PhaseDecode,
    });
    expect(failure.ctap).toEqual(new CTAPDetail(ctap));
  });

  it.each([
    { code: "NOT_A_FAILURE_CODE", category: Category.CategoryInternal },
    { code: Code.CodeInternalError, category: "not-a-failure-category" },
    { code: Code.$zero, category: Category.CategoryInternal },
    { code: Code.CodeInternalError, category: Category.$zero },
  ])("rejects an invalid Wails failure cause: $code / $category", (cause) => {
    expect(runtimeFailureFrom(new Error("service failed", { cause }))).toEqual(internalFailure());
  });

  it("uses INTERNAL_ERROR for unknown throws without parsing Error.message", () => {
    expect(runtimeFailureFrom(new Error(Code.CodeOperationTimeout))).toEqual(internalFailure());
    expect(runtimeFailureFrom(new Error("bridge offline"))).toEqual(internalFailure());
    expect(runtimeFailureFrom("bridge offline")).toEqual(internalFailure());
  });

  it("localizes failures by code instead of rendering runtime prose", () => {
    expect(
      failureMessage(
        new Failure({
          code: Code.CodeOperationTimeout,
          category: Category.CategoryTimeout,
        }),
      ),
    ).toBe("The operation timed out.");

    expect(
      failureMessage(
        new Failure({
          code: Code.CodeCTAPSpecViolation,
          category: Category.CategoryTransportFailure,
        }),
      ),
    ).toBe("The authenticator returned data that violates the CTAP specification.");
  });

  it("presents user-presence exhaustion as a terminal retry instruction", () => {
    expect(
      failureMessage(
        new Failure({
          code: Code.CodeUserPresenceRequired,
          category: Category.CategoryInvalidState,
        }),
      ),
    ).toBe(
      "Confirm presence on the authenticator, then retry the operation. " +
        "For an NFC key, remove it and present it again before retrying.",
    );
  });
});
