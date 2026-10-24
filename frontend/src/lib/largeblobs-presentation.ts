import {
  EntryState,
  type ArrayEntry,
  type ListReport,
} from "../../bindings/github.com/telesma-app/kit/model/largeblobs";
import type { EndpointReport } from "../../bindings/github.com/telesma-app/kit/model/report";

import { m } from "../paraglide/messages.js";
import type {
  LargeBlobsInventoryState,
  LargeBlobsStatusFilter,
} from "$lib/features/largeblobs/state.js";
import { largeBlobsInventoryIsStale } from "$lib/features/largeblobs/state.js";
import { deviceName } from "$lib/format.js";

export type LargeBlobEntryRow = {
  id: string;
  index: number;
  state: EntryState;
  hasTarget: boolean;
  credentialIDHex: string;
  rpID: string;
  rpName: string;
  userIDHex: string;
  userName: string;
  displayName: string;
  ciphertextByteCount: number;
  declaredPayloadByteCount: number;
  payloadByteCount: number | null;
  raw: ArrayEntry;
};

export type LargeBlobsPresentationInput = {
  selectedSelector: string;
  selectedDevice: EndpointReport | null;
  authenticatorBusy: boolean;
  authenticatorReady: boolean;
  inventoryState: LargeBlobsInventoryState;
  query: string;
  statusFilter: LargeBlobsStatusFilter;
  selectedEntryIndex: number | null;
};

export type LargeBlobsPresentation = ReturnType<typeof buildLargeBlobsPresentation>;

function displayValue(value: string | null | undefined) {
  const text = value?.trim() ?? "";

  return text || m.not_reported();
}

function rowFor(entry: ArrayEntry): LargeBlobEntryRow {
  const target = entry.target;

  return {
    id: `entry-${entry.index}`,
    index: entry.index,
    state: entry.state,
    hasTarget: Boolean(target),
    credentialIDHex: target?.credentialIDHex ?? "",
    rpID: target?.rp.id ?? "",
    rpName: target ? displayValue(target.rp.name || target.rp.id) : m.not_reported(),
    userIDHex: target ? displayValue(target.user.userIDHex) : m.not_reported(),
    userName: target ? displayValue(target.user.name) : m.not_reported(),
    displayName: target ? displayValue(target.user.displayName) : m.not_reported(),
    ciphertextByteCount: entry.ciphertextByteCount,
    declaredPayloadByteCount: entry.declaredPayloadByteCount,
    payloadByteCount: entry.payloadByteCount ?? null,
    raw: entry,
  };
}

function searchMatches(entry: ArrayEntry, normalizedQuery: string) {
  if (!normalizedQuery) return true;

  const target = entry.target;

  return [
    String(entry.index),
    entry.state,
    target?.credentialIDHex,
    target?.rp.id,
    target?.rp.name,
    target?.rp.idHashHex,
    target?.user.userIDHex,
    target?.user.name,
    target?.user.displayName,
  ].some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function statusMatches(entry: ArrayEntry, filter: LargeBlobsStatusFilter) {
  if (filter === "all") return true;

  return entry.state === filter;
}

export function buildLargeBlobRows(
  report: ListReport | null,
  query = "",
  statusFilter: LargeBlobsStatusFilter = "all",
): LargeBlobEntryRow[] {
  const normalizedQuery = query.trim().toLowerCase();

  return (report?.entries ?? [])
    .filter((entry) => searchMatches(entry, normalizedQuery) && statusMatches(entry, statusFilter))
    .map(rowFor);
}

export function findLargeBlobEntry(
  report: ListReport | null,
  entryIndex: number,
): ArrayEntry | null {
  return report?.entries?.find((entry) => entry.index === entryIndex) ?? null;
}

export function buildLargeBlobsPresentation(input: LargeBlobsPresentationInput) {
  const query = input.query;
  const statusFilter = input.statusFilter;
  const report = input.inventoryState.report;
  const allRows = buildLargeBlobRows(report);
  const rows = buildLargeBlobRows(report, query, statusFilter);
  const selectedEntryIndex = input.selectedEntryIndex;
  const loading =
    input.inventoryState.phase === "loading" || input.inventoryState.phase === "refreshing";
  const stale = largeBlobsInventoryIsStale(input.inventoryState);
  const actionsBlocked = loading || input.authenticatorBusy || !input.authenticatorReady;
  const supported = Boolean(report?.support.largeBlobs);
  const device = input.selectedDevice ?? report?.device ?? null;

  return {
    selector: input.selectedSelector,
    loading,
    stale,
    lastSuccessfulAt: input.inventoryState.lastSuccessfulAt,
    unsupported: report ? !report.support.largeBlobs : input.inventoryState.phase === "unsupported",
    reloadDisabled: loading || input.authenticatorBusy,
    mutationDisabled: actionsBlocked || !supported,
    cleanupDisabled: actionsBlocked || !supported,
    hasReport: Boolean(report),
    support: report?.support ?? null,
    maxSerializedLargeBlobArray: report?.support.maxSerializedLargeBlobArray ?? null,
    blobCount: report?.array.blobCount ?? 0,
    matchedBlobCount: report?.array.matchedBlobCount ?? 0,
    orphanedBlobCount: report?.array.orphanedBlobCount ?? 0,
    nonconformingBlobCount: report?.array.nonconformingBlobCount ?? 0,
    corruptBlobCount: report?.array.corruptBlobCount ?? 0,
    query,
    statusFilter,
    rows,
    selectedEntryIndex,
    emptyInventory: Boolean(report && allRows.length === 0),
    emptyFilteredResult: Boolean(report && allRows.length > 0 && rows.length === 0),
    selectedDeviceName: device ? deviceName(device) : m.authenticator(),
    supportItems: [
      { label: m.matrix_name_large_blobs_command(), value: report?.support.largeBlobs ?? false },
      {
        label: m.matrix_name_large_blob_key_extension(),
        value: report?.support.largeBlobKeyExtension ?? false,
      },
    ],
  };
}
