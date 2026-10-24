import { describe, expect, it } from "vitest";

import {
  FactID,
  FactOrigin,
  FactState,
  FactValue,
  FactValueKind,
} from "../../bindings/github.com/telesma-app/kit/model/inspect";
import { AuthenticatorGetInfoResponse } from "../../bindings/github.com/telesma-app/ctap/protocol";
import {
  AuthenticatorStatus,
  LookupResult,
  MetadataStatement,
  PayloadEntry,
  StatusReport,
} from "../../bindings/github.com/telesma-app/mds/model";
import { EndpointReport } from "../../bindings/github.com/telesma-app/kit/model/report";
import { Mode } from "../../bindings/github.com/telesma-app/kit/transport";
import { setAppLocale } from "$lib/i18n";
import { testOverviewAssessment, testOverviewFact } from "$lib/test-support/overview-facts";

import { buildOverviewFactLookup } from "$lib/overview-facts";
import { buildOverviewStandardPresentation } from "$lib/overview-standard";

describe("buildOverviewStandardPresentation", () => {
  it("turns CTAP facts into a practical summary without requiring passkey inventory", () => {
    setAppLocale("en");

    const facts = buildOverviewFactLookup(
      testOverviewAssessment([
        booleanFact(
          FactID.FactIDVersionFIDO21,
          "versions.FIDO_2_1",
          FactState.FactStateSupported,
          true,
        ),
        booleanFact(
          FactID.FactIDVersionU2FV2,
          "versions.U2F_V2",
          FactState.FactStateSupported,
          true,
        ),
        booleanFact(FactID.FactIDUserPresence, "options.up", FactState.FactStateSupported, true),
        booleanFact(
          FactID.FactIDClientPIN,
          "options.clientPin",
          FactState.FactStateConfigured,
          true,
        ),
        booleanFact(
          FactID.FactIDUserVerification,
          "options.uv",
          FactState.FactStateUnsupported,
          false,
        ),
        booleanFact(
          FactID.FactIDResidentCredentials,
          "options.rk",
          FactState.FactStateSupported,
          true,
        ),
        booleanFact(
          FactID.FactIDCredentialManagement,
          "options.credMgmt",
          FactState.FactStateUnsupported,
          false,
        ),
        booleanFact(
          FactID.FactIDCredentialManagementPreview,
          "options.credentialMgmtPreview",
          FactState.FactStateSupported,
          true,
        ),
        booleanFact(
          FactID.FactIDCredentialManagementReadOnly,
          "options.perCredMgmtRO",
          FactState.FactStateUnsupported,
          false,
        ),
        integerFact(
          FactID.FactIDRemainingDiscoverableCredentials,
          "remainingDiscoverableCredentials",
          24,
        ),
        listFact(FactID.FactIDTransports, "transports", ["usb", "nfc"]),
      ]),
    );

    const presentation = buildOverviewStandardPresentation({
      facts,
      mdsState: "found",
      mds: mdsLookup(
        AuthenticatorStatus.AuthenticatorStatusFIDOCertifiedL2,
        new StatusReport({
          status: AuthenticatorStatus.AuthenticatorStatusFIPS140CertifiedL2,
          fipsRevision: 3,
        }),
      ),
      device: new EndpointReport({
        attachment: { id: "hid", transport: Mode.ModeHID },
      }),
    });

    expect(presentation.title).toBe("Supports passkeys stored on the device.");
    expect(presentation.description).toContain("Actions are confirmed by touching the device.");
    expect(presentation.description).toContain("The device PIN is set.");
    expect(presentation.description).toContain("managed in the app");
    expect(presentation.description).toContain("this model has passed FIDO L2 certification");
    expect(presentation.description).toContain("FIPS 140-3 Level 2 certification");
    expect(presentation.transports).toBe("USB · NFC");
    expect(presentation.facts.find((fact) => fact.id === "owner-verification")?.value).toBe(
      "Device PIN",
    );
    expect(presentation.facts.find((fact) => fact.id === "passkeys")?.value).toBe(
      "Storage and management",
    );
    expect(presentation.facts.find((fact) => fact.id === "certification")).toMatchObject({
      value: "FIDO L2 · FIPS 140-3 L2",
      tone: "positive",
    });
    expect(presentation.capabilities.find((capability) => capability.id === "fido2")?.value).toBe(
      "FIDO 2.1",
    );
    expect(
      presentation.capabilities.find((capability) => capability.id === "passkey-management")?.value,
    ).toBe("Available");
    expect(
      presentation.capabilities.find((capability) => capability.id === "remaining-capacity"),
    ).toMatchObject({ value: "24", tone: "neutral" });
  });

  it("does not invent remaining capacity when getInfo does not report it", () => {
    setAppLocale("en");

    const facts = buildOverviewFactLookup(
      testOverviewAssessment([
        booleanFact(
          FactID.FactIDVersionU2FV2,
          "versions.U2F_V2",
          FactState.FactStateSupported,
          true,
        ),
        booleanFact(
          FactID.FactIDClientPIN,
          "options.clientPin",
          FactState.FactStateNotConfigured,
          false,
        ),
        booleanFact(
          FactID.FactIDUserVerification,
          "options.uv",
          FactState.FactStateUnsupported,
          false,
        ),
        booleanFact(
          FactID.FactIDResidentCredentials,
          "options.rk",
          FactState.FactStateUnsupported,
          false,
        ),
      ]),
    );

    const presentation = buildOverviewStandardPresentation({
      facts,
      mdsState: "missing",
      mds: null,
      device: null,
    });

    expect(presentation.title).toBe("Works as a hardware second factor with U2F.");
    expect(
      presentation.capabilities.some((capability) => capability.id === "remaining-capacity"),
    ).toBe(false);
    expect(presentation.facts.find((fact) => fact.id === "owner-verification")).toMatchObject({
      value: "Not configured",
      tone: "warning",
    });
  });

  it("uses the PC/SC transport when a smart card does not report transports", () => {
    setAppLocale("en");

    const facts = buildOverviewFactLookup(testOverviewAssessment([]));

    const presentation = buildOverviewStandardPresentation({
      facts,
      mdsState: "missing",
      mds: null,
      device: new EndpointReport({
        attachment: { id: "smart-card", transport: Mode.ModeSmartCard },
      }),
    });

    expect(presentation.transports).toBe("PC/SC");
  });

  it("does not present every MDS record as certification", () => {
    setAppLocale("en");

    const facts = buildOverviewFactLookup(testOverviewAssessment([]));

    const listed = buildOverviewStandardPresentation({
      facts,
      mdsState: "found",
      mds: mdsLookup(AuthenticatorStatus.AuthenticatorStatusSelfAssertionSubmitted),
      device: null,
    });
    const warning = buildOverviewStandardPresentation({
      facts,
      mdsState: "found",
      mds: mdsLookup(AuthenticatorStatus.AuthenticatorStatusRevoked),
      device: null,
    });

    expect(listed.description).toContain("Information about this model is published");
    expect(listed.description).not.toContain("passed FIDO certification");
    expect(warning.description).toContain("contains a security warning");
    expect(listed.facts.find((fact) => fact.id === "certification")).toMatchObject({
      value: "Not confirmed in metadata",
      tone: "muted",
    });
    expect(warning.facts.find((fact) => fact.id === "certification")).toMatchObject({
      value: "Security warning",
      tone: "warning",
    });
  });

  it("describes an authoritative FIPS status even without FIDO certification", () => {
    setAppLocale("en");

    const facts = buildOverviewFactLookup(testOverviewAssessment([]));
    const presentation = buildOverviewStandardPresentation({
      facts,
      mdsState: "found",
      mds: mdsLookup(AuthenticatorStatus.AuthenticatorStatusFIPS140CertifiedL3),
      device: null,
    });

    expect(presentation.description).toContain("FIPS 140 Level 3 certification");
    expect(presentation.description).not.toContain("passed FIDO certification");
  });

  it("reads overall and physical FIPS levels from the MDS metadata statement", () => {
    setAppLocale("en");

    const facts = buildOverviewFactLookup(testOverviewAssessment([]));
    const presentation = buildOverviewStandardPresentation({
      facts,
      mdsState: "found",
      mds: mdsLookupWithCertifications({
        "FIPS-CMVP-3": 2,
        "FIPS-CMVP-3-PHY": 3,
      }),
      device: null,
    });

    expect(presentation.description).toContain("FIPS 140-3 Level 2 certification");
    expect(presentation.description).toContain("physical security at Level 3");
  });

  it("does not elevate the authenticator's certification hint to verified FIPS status", () => {
    setAppLocale("en");

    const facts = buildOverviewFactLookup(
      testOverviewAssessment([
        listFact(FactID.FactIDCertifications, "certifications", ["FIPS-CMVP-3=2"]),
      ]),
    );
    const presentation = buildOverviewStandardPresentation({
      facts,
      mdsState: "missing",
      mds: null,
      device: null,
    });

    expect(presentation.description).not.toContain("FIPS");
    expect(presentation.facts.find((fact) => fact.id === "certification")).toMatchObject({
      value: "Not confirmed in metadata",
      tone: "muted",
    });
  });
});

function mdsLookup(status: AuthenticatorStatus, ...additionalReports: StatusReport[]) {
  return new LookupResult({
    found: true,
    entry: new PayloadEntry({
      statusReports: [new StatusReport({ status }), ...additionalReports],
    }),
  });
}

function mdsLookupWithCertifications(certifications: Record<string, number>) {
  return new LookupResult({
    found: true,
    entry: new PayloadEntry({
      metadataStatement: new MetadataStatement({
        authenticatorGetInfo: new AuthenticatorGetInfoResponse({
          versions: [],
          aaguid: "",
          certifications,
        }),
      }),
      statusReports: [
        new StatusReport({
          status: AuthenticatorStatus.AuthenticatorStatusFIDOCertifiedL2,
        }),
      ],
    }),
  });
}

function booleanFact(id: FactID, source: string, state: FactState, value: boolean) {
  return testOverviewFact(
    id,
    source,
    state,
    FactOrigin.FactOriginReported,
    new FactValue({ kind: FactValueKind.FactValueBoolean, boolean: value }),
  );
}

function integerFact(id: FactID, source: string, value: number) {
  return testOverviewFact(
    id,
    source,
    FactState.FactStateObserved,
    FactOrigin.FactOriginReported,
    new FactValue({ kind: FactValueKind.FactValueInteger, integer: value }),
  );
}

function listFact(id: FactID, source: string, value: string[]) {
  return testOverviewFact(
    id,
    source,
    FactState.FactStateObserved,
    FactOrigin.FactOriginReported,
    new FactValue({ kind: FactValueKind.FactValueList, list: value }),
  );
}
