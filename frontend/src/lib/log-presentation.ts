import { LogOutcome } from "../../bindings/github.com/telesma-app/kit/model";
import { Kind as OperationKind } from "../../bindings/github.com/telesma-app/kit/model/operation";

import { m } from "../paraglide/messages.js";
import { failureMessage } from "$lib/failure.js";
import type { KitLogRecord, LogFilters, LogRecord } from "$lib/features/logs/state.svelte.js";

export function logSummary(record: LogRecord) {
  if (record.source === "app/runtime") return m.logs_summary_runtime({ context: record.context });

  return m.logs_summary_ctap_command({ command: commandLabel(record) });
}

export function operationKindLabel(kind: OperationKind | undefined) {
  switch (kind) {
    case OperationKind.ReadSources:
      return m.reload_overview();
    case OperationKind.GetInfo:
      return m.overview();
    case OperationKind.ListCredentials:
      return m.credential_inventory();
    case OperationKind.CredentialStoreState:
      return kind;
    case OperationKind.DeleteCredential:
      return m.credential_delete();
    case OperationKind.UpdateCredentialUser:
      return m.credential_update();
    case OperationKind.ReadLargeBlob:
      return m.large_blob_read();
    case OperationKind.ListLargeBlobs:
      return m.large_blob_list();
    case OperationKind.WriteLargeBlob:
      return m.large_blob_write();
    case OperationKind.DeleteLargeBlob:
      return m.large_blob_delete();
    case OperationKind.GarbageCollectLargeBlobs:
      return m.large_blob_cleanup();
    case OperationKind.ConfigStatus:
      return m.security_status_operation();
    case OperationKind.BioSensorInfo:
      return m.security_bio_sensor_operation();
    case OperationKind.BioList:
      return m.security_bio_list_operation();
    case OperationKind.BioEnroll:
      return m.security_bio_enroll_operation();
    case OperationKind.BioRename:
      return m.security_bio_rename_operation();
    case OperationKind.BioRemove:
      return m.security_bio_remove_operation();
    case OperationKind.ResetFactory:
      return m.security_reset_operation();
    case OperationKind.SetPIN:
      return m.security_pin_set_operation();
    case OperationKind.ChangePIN:
      return m.security_pin_change_operation();
    case OperationKind.EnableEnterpriseAttestation:
      return m.security_enterprise_attestation_operation();
    case OperationKind.SetAlwaysUV:
      return m.security_always_uv_operation();
    case OperationKind.SetMinPINLength:
      return m.security_pin_policy_operation();
    case OperationKind.EnableLongTouchForReset:
      return m.security_long_touch_operation();
    case OperationKind.MakeCredential:
      return m.lab_make_credential();
    case OperationKind.GetAssertion:
      return m.lab_get_assertion();
    case OperationKind.$zero:
    case undefined:
      return "—";
  }
}

export function logOutcome(record: LogRecord) {
  return record.source === "kit" ? record.entry.outcome : LogOutcome.LogOutcomeFailed;
}

export function logOutcomeLabel(outcome: LogOutcome) {
  const labels: Record<LogOutcome, string> = {
    [LogOutcome.$zero]: "—",
    [LogOutcome.LogOutcomeSucceeded]: m.logs_outcome_succeeded(),
    [LogOutcome.LogOutcomeFailed]: m.logs_outcome_failed(),
    [LogOutcome.LogOutcomeCanceled]: m.logs_outcome_canceled(),
  };

  return labels[outcome];
}

export function logTimestamp(record: LogRecord) {
  return record.source === "kit" ? record.entry.timestamp : record.timestamp;
}

export function logTime(record: LogRecord) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  }).format(new Date(logTimestamp(record)));
}

export function commandLabel(record: KitLogRecord) {
  const command = record.entry.command || "CTAP";

  return record.entry.subCommand ? `${command} · ${record.entry.subCommand}` : command;
}

export function formatCTAPCode(value: number) {
  return `0x${value.toString(16).toUpperCase().padStart(2, "0")}`;
}

export function filterLogs(records: readonly LogRecord[], query: string, filters: LogFilters) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return records.filter((record) => {
    if (filters.outcome !== "all" && logOutcome(record) !== filters.outcome) return false;

    if (!normalizedQuery) return true;

    return searchableText(record).toLocaleLowerCase().includes(normalizedQuery);
  });
}

function searchableText(record: LogRecord) {
  if (record.source === "app/runtime") {
    return [logSummary(record), record.id, record.context, JSON.stringify(record.error)].join("\n");
  }

  const entry = record.entry;

  return [
    logSummary(record),
    record.sequence,
    entry.operationKind,
    entry.command,
    entry.commandCode === undefined ? "" : formatCTAPCode(entry.commandCode),
    entry.subCommand,
    entry.subCommandCode == null ? "" : formatCTAPCode(entry.subCommandCode),
    entry.request?.cborDiagnostic,
    entry.request?.diagnosticError,
    entry.response?.cborDiagnostic,
    entry.response?.diagnosticError,
    entry.error ? failureMessage(entry.error) : "",
    entry.error ? JSON.stringify(entry.error) : "",
    entry.errorMessage,
  ]
    .filter(Boolean)
    .join("\n");
}
