<script lang="ts">
  import { RefreshCw } from "@lucide/svelte";

  import { VerificationFlow } from "../../../../bindings/github.com/telesma-app/kit";
  import type { GetInfoEnvelope } from "../../../../bindings/telesma/service";

  import * as Field from "$lib/components/ui/field";
  import * as Card from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import * as InputGroup from "$lib/components/ui/input-group";
  import { Separator } from "$lib/components/ui/separator";
  import type { MakeCredentialDraft } from "$lib/features/lab/state";
  import type { LabValidationIssue } from "$lib/lab-input";
  import type { LoadState } from "$lib/load-state";

  import { m } from "../../../paraglide/messages.js";

  import LabAlgorithmEditor from "$lib/components/lab/LabAlgorithmEditor.svelte";
  import LabAttestationEditor from "$lib/components/lab/LabAttestationEditor.svelte";
  import LabClientDataEditor from "$lib/components/lab/LabClientDataEditor.svelte";
  import LabDescriptorEditor from "$lib/components/lab/LabDescriptorEditor.svelte";
  import LabTriStateSelect from "$lib/components/lab/LabTriStateSelect.svelte";
  import LabVerificationFlow from "$lib/components/lab/LabVerificationFlow.svelte";
  import MakeCredentialExtensions from "$lib/components/lab/MakeCredentialExtensions.svelte";

  type Props = {
    draft: MakeCredentialDraft;
    disabled?: boolean;
    errors: LabValidationIssue[];
    warnings: LabValidationIssue[];
    inspection: LoadState<GetInfoEnvelope>;
    onDraftChange: (patch: Partial<MakeCredentialDraft>) => void;
    onRegenerateUserID: () => void;
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
    onRegenerateUserID,
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

  function updateClientData(patch: Partial<MakeCredentialDraft["clientData"]>) {
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
  <Card.Root class="lab-configure-section" aria-labelledby="lab-make-basics-title">
    <Card.Header>
      <Card.Title id="lab-make-basics-title">{m.lab_basics()}</Card.Title>
      <Card.Description>{m.lab_basic_fields()}</Card.Description>
    </Card.Header>
    <Card.Content class="lab-configure-card-content">
      <Field.Set {disabled} data-disabled={disabled}>
        <Field.Legend class="sr-only">{m.lab_basic_fields()}</Field.Legend>
        <Field.Group class="lab-basic-grid">
          <Field.Field data-disabled={disabled} data-invalid={fieldInvalid("make.rpID")}>
            <Field.Label for="lab-make-rp-id">{m.lab_rp_id()}</Field.Label>
            <Input
              id="lab-make-rp-id"
              value={draft.rpID}
              {disabled}
              aria-invalid={fieldInvalid("make.rpID")}
              oninput={(event) => onDraftChange({ rpID: event.currentTarget.value })}
              onkeydown={handleSingleLineKeydown}
            />
          </Field.Field>

          <Field.Field data-disabled={disabled} data-invalid={fieldInvalid("make.rpName")}>
            <Field.Label for="lab-make-rp-name">{m.lab_rp_name()}</Field.Label>
            <Input
              id="lab-make-rp-name"
              value={draft.rpName}
              {disabled}
              aria-invalid={fieldInvalid("make.rpName")}
              oninput={(event) => onDraftChange({ rpName: event.currentTarget.value })}
              onkeydown={handleSingleLineKeydown}
            />
          </Field.Field>

          <Field.Field data-disabled={disabled} data-invalid={fieldInvalid("make.userIDHex")}>
            <Field.Label for="lab-make-user-id">{m.lab_user_id_hex()}</Field.Label>
            <InputGroup.Root>
              <InputGroup.Input
                id="lab-make-user-id"
                value={draft.userIDHex}
                spellcheck="false"
                {disabled}
                aria-invalid={fieldInvalid("make.userIDHex")}
                oninput={(event) => onDraftChange({ userIDHex: event.currentTarget.value })}
                onkeydown={handleSingleLineKeydown}
              />
              <InputGroup.Addon align="inline-end">
                <InputGroup.Button size="sm" {disabled} onclick={onRegenerateUserID}>
                  <RefreshCw aria-hidden="true" />
                  {m.lab_regenerate()}
                </InputGroup.Button>
              </InputGroup.Addon>
            </InputGroup.Root>
          </Field.Field>

          <Field.Field data-disabled={disabled} data-invalid={fieldInvalid("make.userName")}>
            <Field.Label for="lab-make-user-name">{m.lab_user_name()}</Field.Label>
            <Input
              id="lab-make-user-name"
              value={draft.userName}
              {disabled}
              aria-invalid={fieldInvalid("make.userName")}
              oninput={(event) => onDraftChange({ userName: event.currentTarget.value })}
              onkeydown={handleSingleLineKeydown}
            />
          </Field.Field>

          <Field.Field data-disabled={disabled} data-invalid={fieldInvalid("make.userDisplayName")}>
            <Field.Label for="lab-make-display-name">{m.lab_display_name()}</Field.Label>
            <Input
              id="lab-make-display-name"
              value={draft.userDisplayName}
              {disabled}
              aria-invalid={fieldInvalid("make.userDisplayName")}
              oninput={(event) => onDraftChange({ userDisplayName: event.currentTarget.value })}
              onkeydown={handleSingleLineKeydown}
            />
          </Field.Field>
        </Field.Group>
      </Field.Set>
      <Separator />

      <section class="lab-configure-subsection" aria-labelledby="lab-make-client-data-title">
        <header class="lab-configure-section-header">
          <h3 id="lab-make-client-data-title">{m.lab_client_data()}</h3>
          <p>{m.lab_client_data_section_description()}</p>
        </header>

        <LabClientDataEditor
          id="lab-make-client-data"
          operation="create"
          mode={draft.clientData.mode}
          origin={draft.clientData.origin}
          challenge={draft.clientData.challenge}
          crossOrigin={draft.clientData.crossOrigin}
          topOrigin={draft.clientData.topOrigin}
          rawValue={draft.clientData.rawJSON}
          {disabled}
          originInvalid={fieldInvalid("make.clientData.origin")}
          challengeInvalid={fieldInvalid("make.clientData.challenge")}
          topOriginInvalid={fieldInvalid("make.clientData.topOrigin")}
          rawInvalid={draft.clientData.mode === "raw" &&
            warnings.some((issue) => issue.field === "make.clientData.rawJSON")}
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

  <Card.Root class="lab-configure-section" aria-labelledby="lab-make-extensions-title">
    <Card.Header>
      <Card.Title id="lab-make-extensions-title"
        >{m.lab_extensions_count({ count: extensionCount })}</Card.Title
      >
    </Card.Header>
    <Card.Content class="lab-configure-card-content">
      <MakeCredentialExtensions
        value={draft.extensions}
        {disabled}
        {inspection}
        {errors}
        onChange={(extensions) => onDraftChange({ extensions })}
        {onRetryInspection}
      />
    </Card.Content>
  </Card.Root>

  <Card.Root class="lab-configure-section" aria-labelledby="lab-make-advanced-title">
    <Card.Header>
      <Card.Title id="lab-make-advanced-title">{m.lab_advanced()}</Card.Title>
      <Card.Description>{m.lab_advanced_fields()}</Card.Description>
    </Card.Header>
    <Card.Content class="lab-configure-card-content">
      <Field.Group>
        <LabAlgorithmEditor
          id="lab-make-algorithms"
          values={draft.algorithms}
          {disabled}
          invalid={errors.some((issue) => issue.field.startsWith("make.algorithms"))}
          onChange={(algorithms) => onDraftChange({ algorithms })}
        />

        <LabAttestationEditor
          id="lab-make-attestation"
          formats={draft.attestationFormatsPreference}
          enterpriseAttestation={draft.enterpriseAttestation}
          {disabled}
          invalid={errors.some((issue) =>
            issue.field.startsWith("make.attestationFormatsPreference"),
          )}
          onFormatsChange={(attestationFormatsPreference) =>
            onDraftChange({ attestationFormatsPreference })}
          onEnterpriseAttestationChange={(enterpriseAttestation) =>
            onDraftChange({ enterpriseAttestation })}
        />

        <LabDescriptorEditor
          id="lab-make-exclude"
          label={m.lab_exclude_list()}
          description={m.lab_exclude_list_description()}
          descriptors={draft.excludeList}
          {disabled}
          invalidIndices={descriptorInvalidIndices("make.excludeList")}
          onChange={(excludeList) => onDraftChange({ excludeList })}
          {onPrimary}
        />

        <Field.Set {disabled} data-disabled={disabled}>
          <Field.Legend>{m.lab_options()}</Field.Legend>
          <Field.Group class="lab-option-grid">
            <LabTriStateSelect
              id="lab-make-resident-key"
              label={m.lab_resident_key()}
              value={draft.residentKey}
              {disabled}
              helpText={m.lab_make_rk_tooltip()}
              helpLabel={m.lab_option_help({ label: m.lab_resident_key() })}
              onChange={(residentKey) => onDraftChange({ residentKey })}
            />

            <LabTriStateSelect
              id="lab-make-user-presence"
              label={m.lab_user_presence()}
              value={draft.userPresence}
              {disabled}
              allowFalse={false}
              helpText={m.lab_make_up_tooltip()}
              helpLabel={m.lab_option_help({ label: m.lab_user_presence() })}
              autoLabel={m.lab_make_up_omit()}
              trueLabel={m.lab_make_up_explicit()}
              onChange={(userPresence) => onDraftChange({ userPresence })}
            />

            <LabTriStateSelect
              id="lab-make-user-verification"
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

      <section class="lab-configure-subsection" aria-labelledby="lab-make-execution-title">
        <header class="lab-configure-section-header">
          <h3 id="lab-make-execution-title">{m.lab_execution()}</h3>
          <p>{m.lab_execution_description()}</p>
        </header>

        <LabVerificationFlow
          id="lab-make-verification"
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
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-3);
      min-width: 0;
    }

    @container workspace (max-width: 84rem) {
      :global(.lab-basic-grid),
      :global(.lab-option-grid) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @container workspace (max-width: 42rem) {
      :global(.lab-basic-grid),
      :global(.lab-option-grid) {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  }
</style>
