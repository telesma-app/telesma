import { describe, expect, it } from "vitest";

import type { Version } from "../../bindings/github.com/telesma-app/ctap/protocol";
import {
  FactID,
  FactOrigin,
  FactState,
  FactUnit,
  FactValue,
  FactValueKind,
  Info as InspectInfo,
} from "../../bindings/github.com/telesma-app/kit/model/inspect";
import {
  AttachmentReport,
  EndpointReport,
  SmartCardReport,
} from "../../bindings/github.com/telesma-app/kit/model/report";
import { Mode, SmartCardInterface } from "../../bindings/github.com/telesma-app/kit/transport";

import { setAppLocale } from "$lib/i18n";
import { buildOverviewRows } from "$lib/overview-rows";
import { testOverviewAssessment, testOverviewFact } from "$lib/test-support/overview-facts";
import type { OverviewRow } from "$lib/overview-types";

function info(input: Partial<InspectInfo> = {}): InspectInfo {
  return new InspectInfo({
    versions: ["FIDO_2_1" as Version],
    aaguid: "00000000-0000-0000-0000-000000000000",
    assessment: testOverviewAssessment(),
    ...input,
  });
}

function booleanFact(
  id: FactID,
  source: string,
  state: FactState,
  origin: FactOrigin,
  boolean: boolean,
) {
  return testOverviewFact(
    id,
    source,
    state,
    origin,
    new FactValue({
      kind: FactValueKind.FactValueBoolean,
      boolean,
    }),
  );
}

function integerFact(
  id: FactID,
  source: string,
  integer: number,
  unit?: FactUnit,
  origin = FactOrigin.FactOriginReported,
) {
  return testOverviewFact(
    id,
    source,
    FactState.FactStateObserved,
    origin,
    new FactValue({
      kind: FactValueKind.FactValueInteger,
      integer,
      unit,
    }),
  );
}

function listFact(id: FactID, source: string, list: string[], state = FactState.FactStateObserved) {
  return testOverviewFact(
    id,
    source,
    state,
    FactOrigin.FactOriginReported,
    new FactValue({
      kind: FactValueKind.FactValueList,
      list,
    }),
  );
}

function rowBySource(rows: OverviewRow[], source: string) {
  const item = rows.find((row) => row.source === source);

  expect(item).toBeDefined();

  return item as OverviewRow;
}

describe("buildOverviewRows", () => {
  it("reads generated option fields through typed option keys", () => {
    setAppLocale("en");

    const rows = buildOverviewRows({
      info: info({
        assessment: testOverviewAssessment([
          booleanFact(
            FactID.FactIDLargeBlobs,
            "options.largeBlobs",
            FactState.FactStateSupported,
            FactOrigin.FactOriginReported,
            true,
          ),
          booleanFact(
            FactID.FactIDSetMinPINLength,
            "options.setMinPINLength",
            FactState.FactStateSupported,
            FactOrigin.FactOriginReported,
            true,
          ),
          booleanFact(
            FactID.FactIDExtensionLargeBlobKey,
            "extensions.largeBlobKey",
            FactState.FactStateSupported,
            FactOrigin.FactOriginDerived,
            true,
          ),
          integerFact(
            FactID.FactIDMaxSerializedLargeBlobArray,
            "maxSerializedLargeBlobArray",
            2048,
            FactUnit.FactUnitBytes,
          ),
        ]),
      }),
    });

    expect(rowBySource(rows, "options.setMinPINLength").status).toBe("supported");
    expect(rowBySource(rows, "extensions.largeBlobKey").status).toBe("supported");
    expect(rowBySource(rows, "options.largeBlobs").value).toContain("2048");
  });

  it("preserves absent versus false option semantics", () => {
    setAppLocale("en");

    const falseRows = buildOverviewRows({
      info: info({
        assessment: testOverviewAssessment([
          booleanFact(
            FactID.FactIDClientPIN,
            "options.clientPin",
            FactState.FactStateNotConfigured,
            FactOrigin.FactOriginReported,
            false,
          ),
        ]),
      }),
    });
    const absentRows = buildOverviewRows({
      info: info({
        assessment: testOverviewAssessment([
          booleanFact(
            FactID.FactIDClientPIN,
            "options.clientPin",
            FactState.FactStateUnsupported,
            FactOrigin.FactOriginSpecDefault,
            false,
          ),
        ]),
      }),
    });

    expect(rowBySource(falseRows, "options.clientPin").status).toBe("not configured");
    expect(rowBySource(falseRows, "options.clientPin").value).toBe("PIN not set");
    expect(rowBySource(absentRows, "options.clientPin").status).toBe("unsupported");
    expect(rowBySource(absentRows, "options.clientPin").value).toBe("Default false");
  });

  it("keeps numeric limits informational in the presentation matrix", () => {
    setAppLocale("en");

    const rows = buildOverviewRows({
      info: info({
        assessment: testOverviewAssessment([
          integerFact(
            FactID.FactIDEffectiveMaxMessageSize,
            "maxMsgSize",
            512,
            FactUnit.FactUnitBytes,
          ),
          integerFact(
            FactID.FactIDEffectiveMinPINLength,
            "minPINLength",
            3,
            FactUnit.FactUnitCodePoints,
          ),
          integerFact(
            FactID.FactIDEffectiveMaxPINLength,
            "maxPINLength",
            7,
            FactUnit.FactUnitCodePoints,
          ),
        ]),
      }),
    });

    expect(rowBySource(rows, "maxMsgSize").status).toBe("informational");
    expect(rowBySource(rows, "maxMsgSize").value).toContain("512");
    expect(rowBySource(rows, "minPINLength").status).toBe("informational");
    expect(rowBySource(rows, "minPINLength").value).toContain("3");
    expect(rowBySource(rows, "maxPINLength").status).toBe("informational");
    expect(rowBySource(rows, "maxPINLength").value).toContain("7");

    const defaultRows = buildOverviewRows({
      info: info({
        assessment: testOverviewAssessment([
          integerFact(
            FactID.FactIDEffectiveMaxMessageSize,
            "maxMsgSize",
            1024,
            FactUnit.FactUnitBytes,
            FactOrigin.FactOriginSpecDefault,
          ),
          integerFact(
            FactID.FactIDEffectiveMaxPINLength,
            "maxPINLength",
            63,
            FactUnit.FactUnitCodePoints,
            FactOrigin.FactOriginSpecDefault,
          ),
        ]),
      }),
    });

    expect(rowBySource(defaultRows, "maxMsgSize").status).toBe("informational");
    expect(rowBySource(defaultRows, "maxPINLength").status).toBe("informational");
  });

  it("keeps extension and certification localization", () => {
    setAppLocale("en");

    const rows = buildOverviewRows({
      info: info({
        assessment: testOverviewAssessment([
          booleanFact(
            FactID.FactIDExtensionCredBlob,
            "extensions.credBlob",
            FactState.FactStateSupported,
            FactOrigin.FactOriginDerived,
            true,
          ),
          booleanFact(
            FactID.FactIDExtensionPreviewSign,
            "extensions.previewSign",
            FactState.FactStateSupported,
            FactOrigin.FactOriginDerived,
            true,
          ),
          listFact(FactID.FactIDCertifications, "certifications", ["FIDO=2"]),
        ]),
      }),
    });

    expect(rowBySource(rows, "extensions.credBlob").status).toBe("supported");
    expect(rowBySource(rows, "extensions.previewSign")).toMatchObject({
      name: "Preview signing",
      status: "supported",
    });
    expect(rowBySource(rows, "certifications").value).toContain("FIDO L1+");
  });
});
