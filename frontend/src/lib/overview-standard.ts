import type { LookupResult, StatusReport } from "../../bindings/github.com/telesma-app/mds/model";
import type { EndpointReport } from "../../bindings/github.com/telesma-app/kit/model/report";

import {
  factBoolean,
  factInteger,
  factList,
  FactID,
  FactState,
  overviewFact,
  overviewFactStatus,
  type OverviewFactLookup,
} from "$lib/overview-facts.js";
import { m, mdsStateText, overviewStatusLabel } from "$lib/overview-i18n.js";
import type {
  OverviewMDSState,
  OverviewRowStatus,
  OverviewStandardCapability,
  OverviewStandardFact,
  OverviewStandardPresentation,
  OverviewStandardTone,
} from "$lib/overview-types.js";

type StandardPresentationInput = {
  facts: OverviewFactLookup;
  mdsState: OverviewMDSState;
  mds: LookupResult | null;
  device: EndpointReport | null;
};

type VersionSummary = {
  supported: boolean;
  known: boolean;
  value: string;
};

const MODERN_VERSIONS = [
  { id: FactID.FactIDVersionFIDO23, label: "FIDO 2.3" },
  { id: FactID.FactIDVersionFIDO21, label: "FIDO 2.1" },
  { id: FactID.FactIDVersionFIDO21Preview, label: "FIDO 2.1 Preview" },
  { id: FactID.FactIDVersionFIDO20, label: "FIDO 2.0" },
] as const;

export function buildOverviewStandardPresentation(
  input: StandardPresentationInput,
): OverviewStandardPresentation {
  const modern = modernVersion(input.facts);
  const u2f = overviewFact(input.facts, FactID.FactIDVersionU2FV2);
  const presence = overviewFact(input.facts, FactID.FactIDUserPresence);
  const clientPIN = overviewFact(input.facts, FactID.FactIDClientPIN);
  const userVerification = overviewFact(input.facts, FactID.FactIDUserVerification);
  const residentCredentials = overviewFact(input.facts, FactID.FactIDResidentCredentials);
  const credentialManagement = credentialManagementFact(input.facts);
  const remaining = overviewFact(input.facts, FactID.FactIDRemainingDiscoverableCredentials);

  const capabilities: OverviewStandardCapability[] = [
    {
      id: "fido2",
      name: m.overview_standard_fido2_name(),
      description: m.overview_standard_fido2_description(),
      value: modern.known
        ? modern.supported
          ? modern.value
          : m.status_unsupported()
        : m.not_reported(),
      tone: modern.known ? (modern.supported ? "positive" : "muted") : "muted",
    },
    capability(
      "u2f",
      m.overview_standard_u2f_name(),
      m.overview_standard_u2f_description(),
      u2f,
      factBoolean(u2f) === true ? "U2F" : undefined,
    ),
    capability(
      "presence",
      m.overview_standard_presence_name(),
      m.overview_standard_presence_description(),
      presence,
      factBoolean(presence) === true ? m.overview_standard_touch_value() : undefined,
    ),
    capability(
      "pin",
      m.overview_standard_pin_name(),
      m.overview_standard_pin_description(),
      clientPIN,
      pinValue(overviewFactStatus(clientPIN)),
    ),
    capability(
      "built-in-verification",
      m.overview_standard_uv_name(),
      m.overview_standard_uv_description(),
      userVerification,
    ),
    capability(
      "passkey-storage",
      m.overview_standard_passkey_storage_name(),
      m.overview_standard_passkey_storage_description(),
      residentCredentials,
    ),
    capability(
      "passkey-management",
      m.overview_standard_passkey_management_name(),
      m.overview_standard_passkey_management_description(),
      credentialManagement,
      credentialManagementValue(input.facts),
    ),
  ];

  const remainingCount =
    remaining.state === FactState.FactStateUnknown ? undefined : factInteger(remaining);

  if (remainingCount !== undefined) {
    capabilities.push({
      id: "remaining-capacity",
      name: m.overview_standard_capacity_name(),
      description: m.overview_standard_capacity_description({ count: remainingCount }),
      value: String(remainingCount),
      tone: "neutral",
    });
  }

  return {
    title: standardTitle(
      modern.supported,
      factBoolean(u2f) === true,
      factBoolean(residentCredentials) === true,
    ),
    description: standardDescription(
      presence,
      clientPIN,
      userVerification,
      residentCredentials,
      credentialManagement,
      input.mdsState,
      input.mds,
    ),
    transports: transportSummary(input.facts, input.device),
    facts: standardFacts(
      input.mdsState,
      input.mds,
      presence,
      clientPIN,
      userVerification,
      residentCredentials,
      credentialManagement,
    ),
    capabilities,
  };
}

function modernVersion(facts: OverviewFactLookup): VersionSummary {
  let known = false;

  for (const version of MODERN_VERSIONS) {
    const fact = overviewFact(facts, version.id);

    if (fact.state !== FactState.FactStateUnknown) known = true;

    if (factBoolean(fact) === true) return { supported: true, known: true, value: version.label };
  }

  return { supported: false, known, value: "" };
}

function credentialManagementFact(facts: OverviewFactLookup) {
  const stable = overviewFact(facts, FactID.FactIDCredentialManagement);

  if (factBoolean(stable) === true) return stable;

  const preview = overviewFact(facts, FactID.FactIDCredentialManagementPreview);

  if (factBoolean(preview) === true) return preview;

  const readOnly = overviewFact(facts, FactID.FactIDCredentialManagementReadOnly);

  return factBoolean(readOnly) === true ? readOnly : stable;
}

function credentialManagementValue(facts: OverviewFactLookup) {
  const stable = overviewFact(facts, FactID.FactIDCredentialManagement);

  if (factBoolean(stable) === true) return m.overview_standard_management_available();

  const preview = overviewFact(facts, FactID.FactIDCredentialManagementPreview);

  if (factBoolean(preview) === true) return m.overview_standard_management_available();

  const readOnly = overviewFact(facts, FactID.FactIDCredentialManagementReadOnly);

  return factBoolean(readOnly) === true ? m.overview_standard_management_read_only() : undefined;
}

function capability(
  id: OverviewStandardCapability["id"],
  name: string,
  description: string,
  fact: ReturnType<typeof overviewFact>,
  value?: string,
): OverviewStandardCapability {
  const status = overviewFactStatus(fact);

  return {
    id,
    name,
    description,
    value: value ?? overviewStatusLabel(status),
    tone: toneForStatus(status),
  };
}

function pinValue(status: OverviewRowStatus) {
  if (status === "configured") return m.pin_set();

  if (status === "not configured") return m.pin_not_set();

  return undefined;
}

function toneForStatus(status: OverviewRowStatus): OverviewStandardTone {
  if (status === "supported" || status === "configured" || status === "enabled") return "positive";

  if (status === "not configured" || status === "warning") return "warning";

  if (status === "informational" || status === "disabled") return "neutral";

  return "muted";
}

function standardTitle(fido2: boolean, u2f: boolean, residentCredentials: boolean) {
  if (fido2 && residentCredentials) return m.overview_standard_title_passkeys();

  if (fido2) return m.overview_standard_title_fido2();

  if (u2f) return m.overview_standard_title_u2f();

  return m.overview_standard_title_generic();
}

function standardDescription(
  presence: ReturnType<typeof overviewFact>,
  clientPIN: ReturnType<typeof overviewFact>,
  userVerification: ReturnType<typeof overviewFact>,
  residentCredentials: ReturnType<typeof overviewFact>,
  credentialManagement: ReturnType<typeof overviewFact>,
  mdsState: OverviewMDSState,
  mds: LookupResult | null,
) {
  const parts: string[] = [];

  if (factBoolean(presence) === true) parts.push(m.overview_standard_summary_touch());

  if (overviewFactStatus(clientPIN) === "configured") parts.push(m.overview_standard_summary_pin());

  if (overviewFactStatus(userVerification) === "configured")
    parts.push(m.overview_standard_summary_uv());

  if (factBoolean(residentCredentials) === true) {
    parts.push(
      factBoolean(credentialManagement) === true
        ? m.overview_standard_summary_passkeys_managed()
        : m.overview_standard_summary_passkeys_stored(),
    );
  }

  const summary = parts.join(" ") || m.overview_standard_summary_generic();
  const metadata = metadataSummary(mdsState, mds);

  return metadata ? `${summary} ${metadata}` : summary;
}

function metadataSummary(mdsState: OverviewMDSState, mds: LookupResult | null) {
  if (mdsState !== "found" || mds?.found !== true) return "";

  const statusReports = mds.entry?.statusReports ?? [];
  const status =
    statusReports
      .find((report) => !report.status.toUpperCase().startsWith("FIPS140_CERTIFIED_"))
      ?.status.toUpperCase() ?? "";

  if (isDangerousMDSStatus(status)) return m.overview_standard_summary_mds_warning();

  const fips = fipsCertification(mds, statusReports);

  if (status === "FIDO_CERTIFIED" || status.startsWith("FIDO_CERTIFIED_L")) {
    const fido = m.overview_standard_summary_mds_certified({
      certification: fidoCertification(status),
    });

    if (!fips) return fido;

    const fipsSummary = fips.physicalLevel
      ? m.overview_standard_summary_mds_fips_physical_also(fips)
      : m.overview_standard_summary_mds_fips_also(fips);

    return `${fido} ${fipsSummary}`;
  }

  if (fips) {
    return fips.physicalLevel
      ? m.overview_standard_summary_mds_fips_physical(fips)
      : m.overview_standard_summary_mds_fips(fips);
  }

  return m.overview_standard_summary_mds_listed();
}

function fipsCertification(mds: LookupResult, statusReports: StatusReport[]) {
  const report = statusReports.find(({ status }) =>
    status.toUpperCase().startsWith("FIPS140_CERTIFIED_L"),
  );
  const level = report?.status.toUpperCase().match(/^FIPS140_CERTIFIED_L([1-4])$/)?.[1];

  if (report && level) {
    const revision = report.fipsRevision || 0;
    const physicalLevel = certificationLevel(report.fipsPhysicalSecurityLevel);

    return {
      standard: revision > 0 ? `FIPS 140-${revision}` : "FIPS 140",
      level,
      physicalLevel: physicalLevel ? String(physicalLevel) : "",
    };
  }

  const certifications = mds.entry?.metadataStatement?.authenticatorGetInfo?.certifications ?? {};

  for (const revision of [3, 2]) {
    const overallLevel = certificationLevel(certifications[`FIPS-CMVP-${revision}`]);

    if (!overallLevel) continue;

    const physicalLevel = certificationLevel(certifications[`FIPS-CMVP-${revision}-PHY`]);

    return {
      standard: `FIPS 140-${revision}`,
      level: String(overallLevel),
      physicalLevel: physicalLevel ? String(physicalLevel) : "",
    };
  }

  return null;
}

function certificationLevel(value: number | null | undefined) {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 4 ? Number(value) : null;
}

function fidoCertification(status: string) {
  const level = status.match(/^FIDO_CERTIFIED_L([1-3])(PLUS)?$/);

  return level ? `FIDO L${level[1]}${level[2] ? "+" : ""}` : "FIDO";
}

function isDangerousMDSStatus(status: string) {
  return (
    status === "REVOKED" ||
    status === "USER_VERIFICATION_BYPASS" ||
    status === "ATTESTATION_KEY_COMPROMISE" ||
    status === "USER_KEY_REMOTE_COMPROMISE" ||
    status === "USER_KEY_PHYSICAL_COMPROMISE"
  );
}

function standardFacts(
  mdsState: OverviewMDSState,
  mds: LookupResult | null,
  presence: ReturnType<typeof overviewFact>,
  clientPIN: ReturnType<typeof overviewFact>,
  userVerification: ReturnType<typeof overviewFact>,
  residentCredentials: ReturnType<typeof overviewFact>,
  credentialManagement: ReturnType<typeof overviewFact>,
): OverviewStandardFact[] {
  return [
    {
      id: "presence",
      label: m.overview_standard_fact_presence(),
      value:
        factBoolean(presence) === true
          ? m.overview_standard_touch_value()
          : overviewStatusLabel(overviewFactStatus(presence)),
      tone: toneForStatus(overviewFactStatus(presence)),
    },
    {
      id: "owner-verification",
      label: m.overview_standard_fact_owner_verification(),
      ...ownerVerification(clientPIN, userVerification),
    },
    {
      id: "passkeys",
      label: m.overview_standard_fact_passkeys(),
      ...passkeySummary(residentCredentials, credentialManagement),
    },
    {
      id: "certification",
      label: m.overview_standard_fact_certification(),
      ...certificationSummary(mdsState, mds),
    },
    {
      id: "metadata",
      label: m.overview_standard_fact_metadata(),
      value: mdsStateText(mdsState),
      tone:
        mdsState === "found"
          ? "positive"
          : mdsState === "error"
            ? "warning"
            : mdsState === "missing"
              ? "muted"
              : "neutral",
    },
  ];
}

function certificationSummary(
  mdsState: OverviewMDSState,
  mds: LookupResult | null,
): Pick<OverviewStandardFact, "value" | "tone"> {
  if (mdsState !== "found" || mds?.found !== true) {
    return {
      value: m.overview_standard_certification_unverified(),
      tone: mdsState === "error" ? "warning" : "muted",
    };
  }

  const statusReports = mds.entry?.statusReports ?? [];
  const statuses = statusReports.map(({ status }) => status.toUpperCase());

  if (statuses.some(isDangerousMDSStatus)) {
    return {
      value: m.overview_standard_certification_warning(),
      tone: "warning",
    };
  }

  const fidoStatus = statuses.find((status) => /^FIDO_CERTIFIED_L[1-3](PLUS)?$/.test(status));
  const fido = fidoStatus
    ? fidoCertification(fidoStatus)
    : statuses.includes("FIDO_CERTIFIED")
      ? m.overview_standard_certification_verified()
      : "";
  const fips = fipsCertification(mds, statusReports);
  const verified = [fido, fips ? `${fips.standard} L${fips.level}` : ""].filter(Boolean);

  return verified.length > 0
    ? { value: verified.join(" · "), tone: "positive" }
    : { value: m.overview_standard_certification_unverified(), tone: "muted" };
}

function ownerVerification(
  clientPIN: ReturnType<typeof overviewFact>,
  userVerification: ReturnType<typeof overviewFact>,
) {
  const pin = overviewFactStatus(clientPIN);
  const uv = overviewFactStatus(userVerification);

  if (pin === "configured" && uv === "configured") {
    return { value: m.overview_standard_owner_pin_and_uv(), tone: "positive" as const };
  }

  if (pin === "configured")
    return { value: m.overview_standard_owner_pin(), tone: "positive" as const };

  if (uv === "configured")
    return { value: m.overview_standard_owner_uv(), tone: "positive" as const };

  if (pin === "not configured" || uv === "not configured") {
    return { value: m.status_not_configured(), tone: "warning" as const };
  }

  if (pin === "unknown" && uv === "unknown")
    return { value: m.not_reported(), tone: "muted" as const };

  return { value: m.status_unsupported(), tone: "muted" as const };
}

function passkeySummary(
  residentCredentials: ReturnType<typeof overviewFact>,
  credentialManagement: ReturnType<typeof overviewFact>,
) {
  if (factBoolean(residentCredentials) === true && factBoolean(credentialManagement) === true) {
    return {
      value: m.overview_standard_passkeys_storage_and_management(),
      tone: "positive" as const,
    };
  }

  if (factBoolean(residentCredentials) === true) {
    return { value: m.overview_standard_passkeys_storage(), tone: "positive" as const };
  }

  const status = overviewFactStatus(residentCredentials);

  return { value: overviewStatusLabel(status), tone: toneForStatus(status) };
}

function transportSummary(facts: OverviewFactLookup, device: EndpointReport | null) {
  const transportFact = overviewFact(facts, FactID.FactIDTransports);
  const transports =
    transportFact.state === FactState.FactStateUnknown
      ? [device?.attachment.transport || ""]
      : (factList(transportFact) ?? []);

  return [...new Set(transports.map(transportLabel).filter(Boolean))].join(" · ");
}

function transportLabel(input: string) {
  const labels: Record<string, string> = {
    usb: "USB",
    hid: "USB",
    nfc: "NFC",
    ble: "Bluetooth LE",
    hybrid: "Hybrid",
    internal: "Internal",
    "smart-card": "PC/SC",
    "windows-proxy": "Windows",
  };

  return labels[input.toLowerCase()] || input;
}
