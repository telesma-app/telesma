<script lang="ts">
  import { Algorithm } from "../../../../bindings/github.com/telesma-app/ctap/cose";
  import type { GetAssertionPreviewSignOutput } from "../../../../bindings/github.com/telesma-app/kit/model/webauthn";
  import { PreviewSignSignatureEncoding } from "../../../../bindings/github.com/telesma-app/kit/model/webauthn";

  import * as Alert from "$lib/components/ui/alert";
  import { Badge } from "$lib/components/ui/badge";
  import * as Card from "$lib/components/ui/card";
  import { previewSignAlgorithmLabel } from "$lib/preview-sign-inspection";

  import { m } from "../../../paraglide/messages.js";

  type Props = {
    output: GetAssertionPreviewSignOutput;
  };

  let { output }: Props = $props();

  let inspection = $derived(output.inspection);
  let hasInvalidStructure = $derived(inspection?.structureValid === false);

  function encodingLabel() {
    return inspection?.encoding ===
      PreviewSignSignatureEncoding.PreviewSignSignatureEncodingASN1DERECDSA
      ? m.lab_preview_sign_signature_encoding_der()
      : m.lab_preview_sign_signature_encoding_opaque();
  }

  function verificationLabel() {
    if (inspection?.verificationAlgorithm === Algorithm.AlgorithmESP256) {
      return m.lab_preview_sign_verifier_ecdsa_p256_sha256();
    }
    if (
      inspection?.verificationAlgorithm !== null &&
      inspection?.verificationAlgorithm !== undefined
    ) {
      return previewSignAlgorithmLabel(inspection.verificationAlgorithm);
    }

    return m.lab_not_reported();
  }
</script>

<Card.Root size="sm">
  <Card.Header>
    <Card.Title>{m.lab_preview_sign_signature()}</Card.Title>
    <Card.Description>{m.lab_preview_sign_signature_description()}</Card.Description>
    {#if inspection?.algorithm !== null && inspection?.algorithm !== undefined}
      <Card.Action>
        <Badge variant="outline">{previewSignAlgorithmLabel(inspection.algorithm)}</Badge>
      </Card.Action>
    {/if}
  </Card.Header>

  <Card.Content class="lab-preview-signature-content">
    {#if hasInvalidStructure}
      <Alert.Root variant="destructive">
        <Alert.Title>{m.lab_preview_sign_signature_invalid_title()}</Alert.Title>
        <Alert.Description>{m.lab_preview_sign_signature_invalid_description()}</Alert.Description>
      </Alert.Root>
    {/if}

    {#if inspection}
      <dl class="lab-preview-signature-summary">
        <div>
          <dt>{m.lab_preview_sign_signature_encoding()}</dt>
          <dd>{encodingLabel()}</dd>
        </div>

        <div>
          <dt>{m.lab_preview_sign_verifier()}</dt>
          <dd>{verificationLabel()}</dd>
        </div>
      </dl>
    {/if}
  </Card.Content>
</Card.Root>

<style>
  @layer blocks {
    :global(.lab-preview-signature-content) {
      display: grid;
      gap: var(--space-3);
      min-width: 0;
    }

    .lab-preview-signature-summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
      min-width: 0;
      margin: 0;
    }

    .lab-preview-signature-summary > div {
      display: grid;
      align-content: start;
      gap: var(--space-1);
      min-width: 0;
    }

    .lab-preview-signature-summary dt {
      color: var(--muted-foreground);
      font-size: 0.7rem;
    }

    .lab-preview-signature-summary dd {
      min-width: 0;
      margin: 0;
      overflow-wrap: anywhere;
    }

    @media (max-width: 42rem) {
      .lab-preview-signature-summary {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  }
</style>
