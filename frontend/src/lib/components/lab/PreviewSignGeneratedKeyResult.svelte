<script lang="ts">
  import {
    AttestationStatementFormatIdentifier,
    Type as AttestationType,
  } from "../../../../bindings/github.com/telesma-app/ctap/attestation";
  import { Algorithm } from "../../../../bindings/github.com/telesma-app/ctap/cose";
  import type { PreviewSignGeneratedKey } from "../../../../bindings/github.com/telesma-app/kit/model/webauthn";
  import { PreviewSignSigningPolicy } from "../../../../bindings/github.com/telesma-app/kit/model/webauthn";

  import * as Alert from "$lib/components/ui/alert";
  import { Badge } from "$lib/components/ui/badge";
  import * as Card from "$lib/components/ui/card";
  import { previewSignAlgorithmLabel } from "$lib/preview-sign-inspection";

  import { m } from "../../../paraglide/messages.js";

  type Props = {
    generatedKey: PreviewSignGeneratedKey;
  };

  let { generatedKey }: Props = $props();

  let inspection = $derived(generatedKey.inspection);
  let hasBindingMismatch = $derived(
    Boolean(
      inspection &&
      (!inspection.attestation.keyHandleMatchesAttestation ||
        !inspection.attestation.publicKeyMatchesAttestation),
    ),
  );

  function signingPolicyLabel() {
    switch (inspection?.attestation.signingPolicy) {
      case PreviewSignSigningPolicy.PreviewSignSigningPolicyUnattended:
        return m.lab_preview_sign_signing_policy_unattended();
      case PreviewSignSigningPolicy.PreviewSignSigningPolicyUserPresence:
        return m.lab_preview_sign_signing_policy_up();
      case PreviewSignSigningPolicy.PreviewSignSigningPolicyUserVerification:
        return m.lab_preview_sign_signing_policy_uv();
      default:
        return m.lab_not_reported();
    }
  }

  function signingInputLabel() {
    return generatedKey.algorithm === Algorithm.AlgorithmESP256SplitARKGPlaceholder
      ? m.lab_preview_sign_signing_input_sha256()
      : m.lab_preview_sign_signing_input_algorithm_specific();
  }

  function verificationLabel() {
    if (inspection?.key.derivedAlgorithm === Algorithm.AlgorithmESP256) {
      return m.lab_preview_sign_verifier_ecdsa_p256_sha256();
    }
    if (
      inspection?.key.derivedAlgorithm !== null &&
      inspection?.key.derivedAlgorithm !== undefined
    ) {
      return previewSignAlgorithmLabel(inspection.key.derivedAlgorithm);
    }

    return m.lab_not_reported();
  }

  function attestationLabel() {
    if (!inspection) return m.lab_not_reported();

    if (
      inspection.attestation.format ===
        AttestationStatementFormatIdentifier.AttestationStatementFormatIdentifierNone &&
      inspection.attestation.type === AttestationType.TypeNone
    ) {
      return m.lab_preview_sign_attestation_none();
    }

    const parts: string[] = [inspection.attestation.format, inspection.attestation.type];
    if (inspection.attestation.certificateCount > 0) {
      parts.push(
        m.lab_preview_sign_certificates_count({
          count: inspection.attestation.certificateCount,
        }),
      );
    }

    return parts.join(" · ");
  }
</script>

<Card.Root size="sm">
  <Card.Header>
    <Card.Title>{m.lab_preview_sign_generated_key_title()}</Card.Title>
    <Card.Description>{m.lab_preview_sign_generated_key_description()}</Card.Description>
    <Card.Action>
      <Badge variant="outline">{previewSignAlgorithmLabel(generatedKey.algorithm)}</Badge>
    </Card.Action>
  </Card.Header>

  <Card.Content class="lab-preview-sign-content">
    {#if hasBindingMismatch}
      <Alert.Root variant="destructive">
        <Alert.Title>{m.lab_preview_sign_binding_mismatch_title()}</Alert.Title>
        <Alert.Description>{m.lab_preview_sign_binding_mismatch_description()}</Alert.Description>
      </Alert.Root>
    {/if}

    {#if inspection}
      <dl class="lab-preview-sign-summary">
        <div>
          <dt>{m.lab_preview_sign_signing_input()}</dt>
          <dd>{signingInputLabel()}</dd>
        </div>

        <div>
          <dt>{m.lab_preview_sign_verifier()}</dt>
          <dd>{verificationLabel()}</dd>
        </div>

        <div>
          <dt>{m.lab_preview_sign_signing_policy()}</dt>
          <dd>{signingPolicyLabel()}</dd>
        </div>

        <div>
          <dt>{m.lab_preview_sign_attestation()}</dt>
          <dd>{attestationLabel()}</dd>
        </div>
      </dl>
    {/if}
  </Card.Content>
</Card.Root>

<style>
  @layer blocks {
    :global(.lab-preview-sign-content) {
      display: grid;
      gap: var(--space-3);
      min-width: 0;
    }

    .lab-preview-sign-summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
      min-width: 0;
      margin: 0;
    }

    .lab-preview-sign-summary > div {
      display: grid;
      align-content: start;
      gap: var(--space-1);
      min-width: 0;
    }

    .lab-preview-sign-summary dt {
      color: var(--muted-foreground);
      font-size: 0.7rem;
    }

    .lab-preview-sign-summary dd {
      min-width: 0;
      margin: 0;
      overflow-wrap: anywhere;
    }

    @media (max-width: 42rem) {
      .lab-preview-sign-summary {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  }
</style>
