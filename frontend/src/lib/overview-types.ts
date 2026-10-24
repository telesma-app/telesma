import type { Info as InspectInfo } from "../../bindings/github.com/telesma-app/kit/model/inspect";
import type { BioSensorReport } from "../../bindings/github.com/telesma-app/kit/model/config";
import type { LookupResult } from "../../bindings/github.com/telesma-app/mds/model";
import type { EndpointReport } from "../../bindings/github.com/telesma-app/kit/model/report";

export type OverviewRowStatus =
  | "supported"
  | "unsupported"
  | "configured"
  | "not configured"
  | "enabled"
  | "disabled"
  | "warning"
  | "unknown"
  | "informational";

export type OverviewRow = {
  group: string;
  name: string;
  description: string;
  status: OverviewRowStatus;
  value?: string;
  source?: string;
};

export type OverviewGroup = {
  name: string;
  rows: OverviewRow[];
};

export type OverviewVendorFact = {
  label: string;
  value: string;
  source: string;
};

export type OverviewVendorPassportPresentation = {
  vendor: string;
  transport: string;
  limited: boolean;
  scopeNote: string;
  coreFacts: OverviewVendorFact[];
  summaryFacts: OverviewVendorFact[];
  detailFacts: OverviewVendorFact[];
};

export type OverviewMDSObservationSeverity = "critical" | "warning" | "info";

export type OverviewMDSObservation = {
  severity: OverviewMDSObservationSeverity;
  finding: string;
  token: string;
  mds: string;
  source: string;
  description: string;
};

export type OverviewHeroSignalGroupId = "authentication" | "credentials-management";

export type OverviewHeroSignalId =
  | "up"
  | "clientPin"
  | "uv"
  | "pinUvAuthToken"
  | "alwaysUv"
  | "rk"
  | "credMgmt"
  | "largeBlobs"
  | "authnrCfg"
  | "setMinPINLength";

export type OverviewHeroSignal = {
  id: OverviewHeroSignalId;
  flag: string;
  title: string;
  value: string;
  valueNote?: string;
  status: OverviewRowStatus;
  statusLabel: string;
  tooltip: string;
};

export type OverviewHeroSignalGroup = {
  id: OverviewHeroSignalGroupId;
  title: string;
  signals: OverviewHeroSignal[];
};

export type OverviewHeroFactTone = "default" | "success" | "warning" | "error" | "muted";

export type OverviewMDSState = "loading" | "found" | "missing" | "error" | "idle";

export type OverviewHeroFact = {
  label: string;
  value: string;
  tone?: OverviewHeroFactTone;
  placeholder?: boolean;
  href?: string;
};

export type OverviewHeroPresentation = {
  title: string;
  subtitle: string;
  serialNumber: string;
  versionBadge: string;
  iconSrc: string;
  aaguid: string;
  aaguidAvailable: boolean;
  mdsState: OverviewMDSState;
  mdsStateLabel: string;
  mdsDescription: string;
  mdsName: string;
  mdsRefreshMessage: string;
  mdsStatusFacts: OverviewHeroFact[];
  mdsBlobFacts: OverviewHeroFact[];
};

export type OverviewStandardTone = "positive" | "neutral" | "muted" | "warning";

export type OverviewStandardFactId =
  "presence" | "owner-verification" | "passkeys" | "certification" | "metadata";

export type OverviewStandardCapabilityId =
  | "fido2"
  | "u2f"
  | "presence"
  | "pin"
  | "built-in-verification"
  | "passkey-storage"
  | "passkey-management"
  | "remaining-capacity";

export type OverviewStandardFact = {
  id: OverviewStandardFactId;
  label: string;
  value: string;
  tone: OverviewStandardTone;
};

export type OverviewStandardCapability = {
  id: OverviewStandardCapabilityId;
  name: string;
  description: string;
  value: string;
  tone: OverviewStandardTone;
};

export type OverviewStandardPresentation = {
  title: string;
  description: string;
  transports: string;
  facts: OverviewStandardFact[];
  capabilities: OverviewStandardCapability[];
};

export type OverviewContext = {
  info?: InspectInfo | null;
  device?: EndpointReport | null;
  bioSensor?: BioSensorReport | null;
  mds?: LookupResult | null;
};

export type OverviewHeroContext = OverviewContext & {
  endpoints?: EndpointReport[];
  mdsLoading?: boolean;
  mdsError?: string | null;
  authenticatorLabel?: string;
};

export type MessageText = string | (() => string);
