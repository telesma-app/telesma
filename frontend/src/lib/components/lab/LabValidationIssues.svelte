<script lang="ts">
  import * as Alert from "$lib/components/ui/alert";
  import type { LabValidationIssue } from "$lib/lab-input";

  import { m } from "../../../paraglide/messages.js";

  type Props = {
    issues: LabValidationIssue[];
    severity: "error" | "warning";
  };

  let { issues, severity }: Props = $props();
  let visibleIssues = $derived(issues.filter((issue) => issue.code !== "invalid-json"));

  function fieldLabel(field: string) {
    if (field.endsWith("rpID")) return m.lab_rp_id();

    if (field.endsWith("rpName")) return m.lab_rp_name();

    if (field.endsWith("userIDHex")) return m.lab_user_id_hex();

    if (field.endsWith("credentialIDHex")) return m.lab_credential_id();

    if (field.endsWith("userName")) return m.lab_user_name();

    if (field.endsWith("userDisplayName")) return m.lab_display_name();

    if (field.endsWith("topOrigin")) return m.lab_top_origin();

    if (field.endsWith("origin")) return m.lab_origin();

    if (field.endsWith("challenge")) return m.lab_challenge();

    if (field.includes("algorithms")) return m.lab_cose_algorithms();

    if (field.endsWith("keyHandleHex")) return m.lab_preview_sign_key_handle();

    if (field.endsWith("toBeSigned")) return m.lab_preview_sign_to_be_signed();

    if (field.endsWith("additionalArgumentsHex")) {
      return m.lab_preview_sign_additional_arguments();
    }

    if (field.includes("attestationFormatsPreference"))
      return m.lab_attestation_formats_preference();

    if (field.endsWith("userPresence")) return m.lab_user_presence();

    if (field.includes("excludeList")) return m.lab_exclude_list();

    if (field.includes("allowList")) return m.lab_allow_list();

    if (field.endsWith("rawJSON")) return m.lab_raw_client_data();

    return field;
  }

  function issueMessage(issue: LabValidationIssue) {
    if (issue.code === "required") return m.lab_field_required();

    if (issue.code === "invalid-origin") return m.lab_invalid_origin();

    if (issue.code === "insecure-origin") return m.lab_insecure_origin();

    if (issue.code === "rp-id-origin-mismatch") return m.lab_rp_id_origin_mismatch();

    if (issue.code === "invalid-base64url") return m.lab_invalid_challenge();

    if (issue.code === "invalid-algorithm") return m.lab_invalid_algorithm();

    if (issue.code === "duplicate-algorithm") return m.lab_duplicate_algorithm();

    if (issue.code === "invalid-attestation-format") return m.lab_invalid_attestation_format();

    if (issue.code === "duplicate-attestation-format") return m.lab_duplicate_attestation_format();

    if (issue.code === "invalid-user-presence") return m.lab_invalid_user_presence();

    if (issue.code === "user-id-too-long") return m.lab_user_id_too_long();

    if (issue.code === "invalid-length") return m.lab_invalid_length();

    if (issue.code === "too-long") return m.lab_value_too_long();

    if (issue.code === "extension-conflict") return m.lab_extension_conflict();

    if (issue.code === "prf-credential-not-allowed") return m.lab_prf_credential_not_allowed();

    if (issue.field.includes("excludeList") || issue.field.includes("allowList")) {
      return m.lab_invalid_descriptor();
    }

    return m.lab_invalid_hex();
  }
</script>

{#if visibleIssues.length}
  <Alert.Root
    variant={severity === "error" ? "destructive" : "warning"}
    role={severity === "error" ? "alert" : "status"}
  >
    <Alert.Title
      >{severity === "error" ? m.lab_request_failed() : m.lab_preview_warnings()}</Alert.Title
    >
    <Alert.Description>
      <ul class="lab-validation-list">
        {#each visibleIssues as issue, index (`${issue.field}-${issue.code}-${index}`)}
          <li><strong>{fieldLabel(issue.field)}:</strong> {issueMessage(issue)}</li>
        {/each}
      </ul>
    </Alert.Description>
  </Alert.Root>
{/if}

<style>
  @layer blocks {
    .lab-validation-list {
      margin: 0;
      padding-inline-start: var(--space-4);
    }
  }
</style>
