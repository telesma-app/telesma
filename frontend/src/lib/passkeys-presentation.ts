import type {
  CredentialGroup,
  CredentialRecord,
  InventoryReport,
} from "../../bindings/github.com/telesma-app/kit/model/credentials";
import type { EndpointReport } from "../../bindings/github.com/telesma-app/kit/model/report";
import type { PasskeyDirectoryMatch } from "../../bindings/telesma/passkeydirectory";

import { m } from "../paraglide/messages.js";
import type { PasskeysInventoryState, PasskeysStatusFilter } from "$lib/features/passkeys/state.js";
import { normalizedRPID, passkeysInventoryIsStale } from "$lib/features/passkeys/state.js";
import { deviceName } from "$lib/format.js";

export type PasskeyCredentialRow = {
  id: string;
  rpID: string;
  rpName: string;
  credentialIDHex: string;
  credentialType: string;
  userID: string;
  userIDEncoding: "utf8" | "hex" | "unavailable";
  userIDHex: string;
  userName: string;
  displayName: string;
  largeBlobKeyAvailable: boolean;
  credProtect: string;
  credProtectLevel: number | null;
  thirdPartyPaymentEnabled: boolean;
  raw: {
    relyingParty: Omit<CredentialGroup, "credentials">;
    credential: CredentialRecord;
  };
};

export type PasskeyRelyingParty = {
  id: string;
  rpID: string;
  rpName: string;
  credentials: PasskeyCredentialRow[];
  directory: PasskeyDirectoryMatch | null;
};

export type PasskeysCapacity = {
  stored: number;
  remainingUpperBound: number;
  percentage: number;
};

export type PasskeysPresentationInput = {
  selectedSelector: string;
  selectedDevice: EndpointReport | null;
  authenticatorBusy: boolean;
  authenticatorReady: boolean;
  inventoryState: PasskeysInventoryState;
  query: string;
  statusFilter: PasskeysStatusFilter;
  selectedCredentialID: string;
  directoryMatches?: ReadonlyMap<string, PasskeyDirectoryMatch>;
};

export type PasskeysPresentation = ReturnType<typeof buildPasskeysPresentation>;

function displayValue(value: string | number | boolean | null | undefined) {
  if (value === true) return m.state_available();

  if (value === false) return m.state_not_available();

  const text = String(value ?? "").trim();

  return text || m.not_reported();
}

function relyingPartyName(group: CredentialGroup) {
  const rpName = group.rpName?.trim() ?? "";
  const rpID = group.rpID.trim();

  return rpName || rpID || m.unknown_rp();
}

function readableUTF8UserID(hex: string) {
  if (!/^(?:[0-9a-f]{2})+$/iu.test(hex)) return null;

  const bytes = new Uint8Array(hex.length / 2);

  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);

    if (!text.trim() || /[\p{C}\uFFFD]/u.test(text)) return null;

    return text;
  } catch {
    return null;
  }
}

function userIDPresentation(userIDHex: string | undefined) {
  const hex = userIDHex?.trim() ?? "";

  if (!hex) {
    return {
      value: m.not_reported(),
      encoding: "unavailable" as const,
    };
  }

  const utf8 = readableUTF8UserID(hex);

  return utf8 === null
    ? { value: hex, encoding: "hex" as const }
    : { value: utf8, encoding: "utf8" as const };
}

export function credProtectLabel(level: number | undefined) {
  switch (level) {
    case 1:
      return m.cred_protect_level_1();
    case 2:
      return m.cred_protect_level_2();
    case 3:
      return m.cred_protect_level_3();
    default:
      return m.cred_protect_not_reported();
  }
}

function rowFor(group: CredentialGroup, credential: CredentialRecord): PasskeyCredentialRow {
  const userID = userIDPresentation(credential.userIDHex);

  return {
    id: credential.credentialIDHex,
    rpID: group.rpID,
    rpName: relyingPartyName(group),
    credentialIDHex: credential.credentialIDHex,
    credentialType: displayValue(credential.credentialType),
    userID: userID.value,
    userIDEncoding: userID.encoding,
    userIDHex: displayValue(credential.userIDHex),
    userName: displayValue(credential.userName),
    displayName: displayValue(credential.displayName),
    largeBlobKeyAvailable: credential.largeBlobKeyState === "available",
    credProtect: credProtectLabel(credential.credProtect),
    credProtectLevel: credential.credProtect || null,
    thirdPartyPaymentEnabled: credential.thirdPartyPayment === true,
    raw: {
      relyingParty: {
        rpID: group.rpID,
        rpName: group.rpName,
        rpIDHashHex: group.rpIDHashHex,
      },
      credential,
    },
  };
}

function searchMatches(
  group: CredentialGroup,
  credential: CredentialRecord,
  normalizedQuery: string,
) {
  if (!normalizedQuery) return true;

  const userID = userIDPresentation(credential.userIDHex);

  return [
    group.rpName,
    group.rpID,
    group.rpIDHashHex,
    credential.credentialIDHex,
    credential.userIDHex,
    userID.value,
    credential.userName,
    credential.displayName,
  ].some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function statusMatches(credential: CredentialRecord, filter: PasskeysStatusFilter) {
  switch (filter) {
    case "large-blob-available":
      return credential.largeBlobKeyState === "available";
    case "large-blob-missing":
      return credential.largeBlobKeyState === "missing";
    case "third-party-payment":
      return credential.thirdPartyPayment === true;
    case "cred-protect-1":
      return credential.credProtect === 1;
    case "cred-protect-2":
      return credential.credProtect === 2;
    case "cred-protect-3":
      return credential.credProtect === 3;
    case "cred-protect-not-reported":
      return !credential.credProtect;
    case "all":
      return true;
  }
}

export function buildPasskeyRows(
  report: InventoryReport | null,
  query = "",
  statusFilter: PasskeysStatusFilter = "all",
): PasskeyCredentialRow[] {
  const normalizedQuery = query.trim().toLowerCase();

  return (report?.groups ?? []).flatMap((group) =>
    (group.credentials ?? [])
      .filter(
        (credential) =>
          searchMatches(group, credential, normalizedQuery) &&
          statusMatches(credential, statusFilter),
      )
      .map((credential) => rowFor(group, credential)),
  );
}

export function buildPasskeyRelyingParties(
  rows: PasskeyCredentialRow[],
  directoryMatches: ReadonlyMap<string, PasskeyDirectoryMatch> = new Map(),
): PasskeyRelyingParty[] {
  const relyingParties: PasskeyRelyingParty[] = [];
  const byRPID = new Map<string, PasskeyRelyingParty>();

  for (const row of rows) {
    const id = normalizedRPID(row.rpID);
    let relyingParty = byRPID.get(id);

    if (!relyingParty) {
      relyingParty = {
        id,
        rpID: row.rpID,
        rpName: row.rpName,
        credentials: [],
        directory: directoryMatches.get(id) ?? null,
      };
      byRPID.set(id, relyingParty);
      relyingParties.push(relyingParty);
    }

    relyingParty.credentials.push(row);
  }

  return relyingParties;
}

export function passkeysCapacity(report: InventoryReport | null): PasskeysCapacity | null {
  if (!report) return null;

  const stored = report.summary.existingResidentCredentialsCount;
  const remainingUpperBound = report.summary.maxPossibleRemainingResidentCredentialsCount;
  const estimatedTotal = stored + remainingUpperBound;

  return {
    stored,
    remainingUpperBound,
    percentage:
      estimatedTotal > 0 ? Math.min(100, Math.max(0, (stored / estimatedTotal) * 100)) : 0,
  };
}

export function buildPasskeysPresentation(input: PasskeysPresentationInput) {
  const query = input.query;
  const statusFilter = input.statusFilter;
  const report = input.inventoryState.report;
  const directoryMatches = input.directoryMatches;
  const allRows = buildPasskeyRows(report);
  const rows = buildPasskeyRows(report, query, statusFilter);
  const relyingParties = buildPasskeyRelyingParties(rows, directoryMatches);
  const selectedCredentialID = input.selectedCredentialID;
  const selectedCredential = rows.find((row) => row.id === selectedCredentialID) ?? rows[0] ?? null;
  const selectedRelyingParty =
    relyingParties.find((relyingParty) =>
      relyingParty.credentials.some((credential) => credential.id === selectedCredential?.id),
    ) ?? null;
  const support = report?.support;
  const loading =
    input.inventoryState.phase === "loading" || input.inventoryState.phase === "refreshing";
  const stale = passkeysInventoryIsStale(input.inventoryState);
  const mutationsBlocked = loading || input.authenticatorBusy || !input.authenticatorReady;

  return {
    selector: input.selectedSelector,
    loading,
    stale,
    lastSuccessfulAt: input.inventoryState.lastSuccessfulAt,
    unsupported: report
      ? !report.support.credentialManagement
      : input.inventoryState.phase === "unsupported",
    reloadDisabled: loading || input.authenticatorBusy,
    updateDisabled:
      mutationsBlocked || !support?.credentialManagement || Boolean(support.previewOnly),
    deleteDisabled: mutationsBlocked || !support?.credentialManagement,
    hasReport: Boolean(report),
    report,
    query,
    statusFilter,
    rows,
    relyingParties,
    selectedRelyingParty,
    selectedCredential,
    selectedCredentialID,
    emptyInventory: Boolean(report && allRows.length === 0),
    emptyFilteredResult: Boolean(report && allRows.length > 0 && rows.length === 0),
    capacity: passkeysCapacity(report),
    selectedDeviceName: input.selectedDevice ? deviceName(input.selectedDevice) : m.authenticator(),
  };
}
