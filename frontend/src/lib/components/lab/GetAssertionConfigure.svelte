<script lang="ts">
  import { VerificationFlow } from "../../../../bindings/github.com/telesma-app/kit";
  import type { GetInfoEnvelope } from "../../../../bindings/telesma/service";

  import * as Field from "$lib/components/ui/field";
  import * as Card from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Separator } from "$lib/components/ui/separator";
  import type { GetAssertionDraft } from "$lib/features/lab/state";
  import type { LabValidationIssue } from "$lib/lab-input";
  import type { LoadState } from "$lib/load-state";

  import { m } from "../../../paraglide/messages.js";

  import GetAssertionExtensions from "$lib/components/lab/GetAssertionExtensions.svelte";
  import LabClientDataEditor from "$lib/components/lab/LabClientDataEditor.svelte";
  import LabDescriptorEditor from "$lib/components/lab/LabDescriptorEditor.svelte";
  import LabTriStateSelect from "$lib/components/lab/LabTriStateSelect.svelte";
  import LabVerificationFlow from "$lib/components/lab/LabVerificationFlow.svelte";

  type Props = {
    draft: GetAssertionDraft;
    disabled?: boolean;
    errors: LabValidationIssue[];
    warnings: LabValidationIssue[];
    inspection: LoadState<GetInfoEnvelope>;
    onDraftChange: (patch: Partial<GetAssertionDraft>) => void;
    onRegenerateChallenge: () => void;
    onPrimary: () => void;
    onRetryInspection: () => void;
  };

  let {
    draft,
    disabled = false,
    errors,
    warnings,
    inspection,
    onDraftChange,
    onRegenerateChallenge,
    onPrimary,
    onRetryInspection,
  }: Props = $props();

  let extensionCount = $derived(
    Object.values(draft.extensions).filter((extension) => extension.included).length,
  );

  function fieldInvalid(field: string) {
    return errors.some((issue) => issue.field === field);
  }

  function descriptorInvalidIndices(prefix: string) {
    return errors
      .filter((issue) => issue.field.startsWith(`${prefix}.`))
      .map((issue) => Number(issue.field.split(".")[2]))
      .filter(Number.isInteger);
  }

  function updateClientData(patch: Partial<GetAssertionDraft["clientData"]>) {
    onDraftChange({ clientData: { ...draft.clientData, ...patch } });
  }

  function handleSingleLineKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter" || event.isComposing || disabled) return;

    event.preventDefault();
    onPrimary();
  }

  function handleVerificationChange(value: string) {
    onDraftChange({
      verificationFlow:
        value === "pin"
          ? VerificationFlow.VerificationFlowPIN
          : VerificationFlow.VerificationFlowDefault,
    });
  }
</script>

<div class="lab-configure-sections">
  <Card.Root class="lab-configure-section" aria-labelledby="lab-get-basics-title">
    <Card.Header>
      <Card.Title id="lab-get-basics-title">{m.lab_basics()}</Card.Title>
      <Card.Description>{m.lab_basic_fields()}</Card.Description>
    </Card.Header>
    <Card.Content class="lab-configure-card-content">
      <Field.Set {disabled} data-disabled={disabled}>
        <Field.Legend class="sr-only">{m.lab_basic_fields()}</Field.Legend>
        <Field.Group class="lab-basic-grid">
          <Field.Field
            class="lab-field-wide"
            data-disabled={disabled}
            data-invalid={fieldInvalid("get.rpID")}
          >
            <Field.Label for="lab-get-rp-id">{m.lab_rp_id()}</Field.Label>
            <Input
              id="lab-get-rp-id"
              value={draft.rpID}
              {disabled}
              aria-invalid={fieldInvalid("get.rpID")}
              oninput={(event) => onDraftChange({ rpID: event.currentTarget.value })}
              onkeydown={handleSingleLineKeydown}
            />
          </Field.Field>
        </Field.Group>
      </Field.Set>

      <LabDescriptorEditor
        id="lab-get-allow"
        label={m.lab_allow_list()}
        description={m.lab_allow_list_description()}
        descriptors={draft.allowList}
        {disabled}
        invalidIndices={descriptorInvalidIndices("get.allowList")}
        onChange={(allowList) => onDraftChange({ allowList })}
        {onPrimary}
      />
      <Separator />

      <section class="lab-configure-subsection" aria-labelledby="lab-get-client-data-title">
        <header class="lab-configure-section-header">
          <h3 id="lab-get-client-data-title">{m.lab_client_data()}</h3>
          <p>{m.lab_client_data_section_description()}</p>
        </header>

        <LabClientDataEditor
          id="lab-get-client-data"
          operation="get"
          mode={draft.clientData.mode}
          origin={draft.clientData.origin}
          challenge={draft.clientData.challenge}
          crossOrigin={draft.clientData.crossOrigin}
          topOrigin={draft.clientData.topOrigin}
          rawValue={draft.clientData.rawJSON}
          {disabled}
          originInvalid={fieldInvalid("get.clientData.origin")}
          challengeInvalid={fieldInvalid("get.clientData.challenge")}
          topOriginInvalid={fieldInvalid("get.clientData.topOrigin")}
          rawInvalid={draft.clientData.mode === "raw" &&
            warnings.some((issue) => issue.field === "get.clientData.rawJSON")}
          onModeChange={(mode, rawJSON) =>
            updateClientData(rawJSON === undefined ? { mode } : { mode, rawJSON })}
          onOriginChange={(origin) => updateClientData({ origin })}
          onChallengeChange={(challenge) => updateClientData({ challenge })}
          onCrossOriginChange={(crossOrigin) => updateClientData({ crossOrigin })}
          onTopOriginChange={(topOrigin) => updateClientData({ topOrigin })}
          {onRegenerateChallenge}
          onRawChange={(rawJSON) => updateClientData({ rawJSON })}
          {onPrimary}
        />
      </section>
    </Card.Content>
  </Card.Root>

  <Card.Root class="lab-configure-section" aria-labelledby="lab-get-extensions-title">
    <Card.Header>
      <Card.Title id="lab-get-extensions-title"
        >{m.lab_extensions_count({ count: extensionCount })}</Card.Title
      >
    </Card.Header>
    <Card.Content class="lab-configure-card-content">
      <GetAssertionExtensions
        value={draft.extensions}
        allowList={draft.allowList}
        {disabled}
        {inspection}
        {errors}
        onChange={(extensions) => onDraftChange({ extensions })}
        {onRetryInspection}
      />
    </Card.Content>
  </Card.Root>

  <Card.Root class="lab-configure-section" aria-labelledby="lab-get-advanced-title">
    <Card.Header>
      <Card.Title id="lab-get-advanced-title">{m.lab_advanced()}</Card.Title>
      <Card.Description>{m.lab_advanced_fields()}</Card.Description>
    </Card.Header>
    <Card.Content class="lab-configure-card-content">
      <Field.Group>
        <Field.Set {disabled} data-disabled={disabled}>
          <Field.Legend>{m.lab_options()}</Field.Legend>
          <Field.Group class="lab-option-grid">
            <LabTriStateSelect
              id="lab-get-user-presence"
              label={m.lab_user_presence()}
              value={draft.userPresence}
              {disabled}
              helpText={m.lab_get_up_tooltip()}
              helpLabel={m.lab_option_help({ label: m.lab_user_presence() })}
              onChange={(userPresence) => onDraftChange({ userPresence })}
            />

            <LabTriStateSelect
              id="lab-get-user-verification"
              label={m.lab_user_verification()}
              value={draft.userVerification}
              {disabled}
              helpText={m.lab_uv_tooltip()}
              helpLabel={m.lab_option_help({ label: m.lab_user_verification() })}
              onChange={(userVerification) => onDraftChange({ userVerification })}
            />
          </Field.Group>
        </Field.Set>
      </Field.Group>
      <Separator />

      <section class="lab-configure-subsection" aria-labelledby="lab-get-execution-title">
        <header class="lab-configure-section-header">
          <h3 id="lab-get-execution-title">{m.lab_execution()}</h3>
          <p>{m.lab_execution_description()}</p>
        </header>

        <LabVerificationFlow
          id="lab-get-verification"
          value={draft.verificationFlow === VerificationFlow.VerificationFlowPIN ? "pin" : "auto"}
          {disabled}
          description={m.lab_verification_flow_description()}
          onChange={handleVerificationChange}
        />
      </section>
    </Card.Content>
  </Card.Root>
</div>

<style>
  @layer blocks {
    .lab-configure-sections,
    .lab-configure-subsection {
      display: grid;
      gap: var(--space-4);
      min-width: 0;
    }

    :global(.lab-configure-card-content) {
      display: grid;
      gap: var(--space-4);
      min-width: 0;
    }

    .lab-configure-section-header {
      display: grid;
      gap: var(--space-1);
    }

    .lab-configure-section-header h3,
    .lab-configure-section-header p {
      margin: 0;
    }

    .lab-configure-section-header h3 {
      font-size: 0.86rem;
    }

    .lab-configure-section-header p {
      color: var(--muted-foreground);
      font-size: 0.7rem;
    }

    :global(.lab-basic-grid),
    :global(.lab-option-grid) {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
      min-width: 0;
    }

    :global(.lab-field-wide) {
      grid-column: 1 / -1;
    }

    @container workspace (max-width: 42rem) {
      :global(.lab-basic-grid),
      :global(.lab-option-grid) {
        grid-template-columns: minmax(0, 1fr);
      }

      :global(.lab-field-wide) {
        grid-column: auto;
      }
    }
  }
</style>
