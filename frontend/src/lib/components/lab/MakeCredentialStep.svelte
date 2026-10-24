<script lang="ts">
  import { tick } from "svelte";

  import type { EndpointReport } from "../../../../bindings/github.com/telesma-app/kit/model/report";
  import type { GetInfoEnvelope } from "../../../../bindings/telesma/service";

  import { getInfoResult } from "$lib/ctapkit-results";
  import type { LabState, MakeCredentialDraft } from "$lib/features/lab/state";
  import { validateMakeCredentialDraft } from "$lib/lab-input";
  import type { LoadState } from "$lib/load-state";

  import { m } from "../../../paraglide/messages.js";

  import LabOperationStep from "$lib/components/lab/LabOperationStep.svelte";
  import LabValidationIssues from "$lib/components/lab/LabValidationIssues.svelte";
  import MakeCredentialConfigure from "$lib/components/lab/MakeCredentialConfigure.svelte";
  import MakeCredentialResult from "$lib/components/lab/MakeCredentialResult.svelte";
  import MakeCredentialReview from "$lib/components/lab/MakeCredentialReview.svelte";

  type Props = {
    lab: LabState;
    inspection: LoadState<GetInfoEnvelope>;
    device: EndpointReport;
    disabled?: boolean;
    fillDemoDisabled?: boolean;
    onDraftChange: (patch: Partial<MakeCredentialDraft>) => void;
    onRegenerateUserID: () => void;
    onRegenerateChallenge: () => void;
    onPreview: () => void | Promise<boolean>;
    onConfirm: () => void | Promise<boolean>;
    onEdit: () => void;
    onNewRun: () => void;
    onHandoff: () => void;
    onRetryAttestationTrust: () => void;
    onRetryVerification: () => void;
    onRetryInspection: () => void;
    onFillDemoValues: () => void;
  };

  let {
    lab,
    inspection,
    device,
    disabled = false,
    fillDemoDisabled = false,
    onDraftChange,
    onRegenerateUserID,
    onRegenerateChallenge,
    onPreview,
    onConfirm,
    onEdit,
    onNewRun,
    onHandoff,
    onRetryAttestationTrust,
    onRetryVerification,
    onRetryInspection,
    onFillDemoValues,
  }: Props = $props();

  let draft = $derived(lab.makeDraft);

  let step = $derived(lab.makeStep);

  let phase = $derived(step.phase);

  let preview = $derived.by(() => {
    if (
      step.phase === "review" ||
      step.phase === "executing" ||
      step.phase === "success" ||
      (step.phase === "error" && step.failedPhase === "executing")
    ) {
      return step.previewValue;
    }

    return null;
  });

  let maxCredBlobLength = $derived(getInfoResult(inspection.data)?.maxCredBlobLength);

  let validation = $derived(validateMakeCredentialDraft(draft, maxCredBlobLength));

  let extensionCount = $derived(
    Object.values(draft.extensions).filter((extension) => extension.included).length,
  );

  let showConfigure = $derived(
    phase === "editing" ||
      phase === "previewing" ||
      (step.phase === "error" && step.failedPhase === "previewing"),
  );

  async function handlePreview() {
    if (!validation.valid) {
      await tick();
      document.querySelector<HTMLElement>("#lab-make-configure [aria-invalid='true']")?.focus();

      return;
    }

    await onPreview();
  }

  function handleRetry() {
    return step.phase === "error" && step.failedPhase === "executing"
      ? onConfirm()
      : handlePreview();
  }
</script>

{#snippet content()}
  {#if showConfigure}
    <section
      id="lab-make-configure"
      class="lab-configure-stage"
      aria-labelledby="lab-make-credential-heading"
    >
      <LabValidationIssues issues={validation.errors} severity="error" />

      <LabValidationIssues issues={validation.warnings} severity="warning" />

      <MakeCredentialConfigure
        {draft}
        disabled={disabled || phase === "previewing"}
        errors={validation.errors}
        warnings={validation.warnings}
        {inspection}
        {onDraftChange}
        {onRegenerateUserID}
        {onRegenerateChallenge}
        onPrimary={handlePreview}
        {onRetryInspection}
      />
    </section>
  {:else if step.phase === "success"}
    <MakeCredentialResult
      preview={step.previewValue}
      result={step.value}
      attestationTrust={lab.makeAttestationTrust}
      verification={lab.makeVerification}
      {onRetryAttestationTrust}
      {onRetryVerification}
    />
  {:else if preview}
    <MakeCredentialReview {preview} />
  {/if}
{/snippet}

<LabOperationStep
  id="lab-make-command"
  headingId="lab-make-credential-heading"
  title={m.lab_make_credential()}
  description={m.lab_make_credential_description()}
  {step}
  {device}
  {disabled}
  {fillDemoDisabled}
  errorCount={validation.errors.length}
  warningCount={validation.warnings.length}
  {extensionCount}
  {content}
  onPreview={handlePreview}
  {onConfirm}
  onRetry={handleRetry}
  {onEdit}
  {onNewRun}
  {onFillDemoValues}
  successLabel={m.lab_use_in_get_assertion()}
  onSuccess={onHandoff}
/>
