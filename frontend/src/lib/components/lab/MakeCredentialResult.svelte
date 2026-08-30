<script lang="ts">
  import type {
    MakeCredentialPreview,
    MakeCredentialResult as MakeCredentialResultDTO,
    MakeCredentialVerification,
  } from "../../../../bindings/github.com/telesma-app/kit/model/webauthn";
  import type { AttestationTrustAssessment } from "../../../../bindings/github.com/telesma-app/mds/model";

  import { Badge } from "$lib/components/ui/badge";
  import type { LabVerificationState } from "$lib/features/lab/state";
  import { base64ToHex, base64ToUTF8 } from "$lib/lab-input";
  import { sanitizedJson } from "$lib/redaction";

  import { m } from "../../../paraglide/messages.js";

  import LabHexValue from "$lib/components/lab/LabHexValue.svelte";
  import LabSecretValue from "$lib/components/lab/LabSecretValue.svelte";
  import LabTechnicalDataViewer, {
    type LabTechnicalDataItem,
  } from "$lib/components/lab/LabTechnicalDataViewer.svelte";
  import LabVerificationRoute from "$lib/components/lab/LabVerificationRoute.svelte";

  type Props = {
    preview: MakeCredentialPreview;
    result: MakeCredentialResultDTO;
    attestationTrust?: LabVerificationState<AttestationTrustAssessment>;
    verification?: LabVerificationState<MakeCredentialVerification>;
    onRetryAttestationTrust?: () => void;
    onRetryVerification?: () => void;
  };

  let {
    preview,
    result,
    attestationTrust = { phase: "idle" },
    verification = { phase: "idle" },
    onRetryAttestationTrust = () => undefined,
    onRetryVerification = () => undefined,
  }: Props = $props();

  let clientExtensions = $derived(result.extensionResults?.client);

  let authenticatorExtensions = $derived(result.extensionResults?.authenticator);

  let previewSignGeneratedKey = $derived(clientExtensions?.previewSign?.generatedKey);

  let hasWebAuthnOutputs = $derived(
    Boolean(
      clientExtensions?.credProps ||
      clientExtensions?.prf ||
      clientExtensions?.largeBlob ||
      clientExtensions?.previewSign,
    ),
  );

  let hasCTAPOutputs = $derived(
    Boolean(
      clientExtensions?.credBlob ||
      clientExtensions?.["hmac-secret"] ||
      clientExtensions?.["hmac-secret-mc"] ||
      authenticatorExtensions?.credProtect ||
      authenticatorExtensions?.minPinLength ||
      authenticatorExtensions?.pinComplexityPolicy,
    ),
  );

  let hasExtensionOutputs = $derived(hasWebAuthnOutputs || hasCTAPOutputs);

  let technicalDetails = $derived.by((): LabTechnicalDataItem[] => {
    const clientDataJSON = base64ToUTF8(preview.input.clientDataJSON);
    const resultJSON = sanitizedJson(result) ?? "null";

    const details: LabTechnicalDataItem[] = [
      {
        id: "client-data-json",
        label: m.lab_client_data(),
        syntax: "json",
        type: "UTF-8 JSON",
        byteCount: utf8ByteCount(clientDataJSON),
        source: clientDataJSON,
      },
      {
        id: "public-key",
        label: m.lab_public_key_cose(),
        syntax: "hex",
        type: "COSE",
        byteCount: hexByteCount(result.publicKeyCOSEHex),
        source: result.publicKeyCOSEHex,
      },
      {
        id: "authenticator-data",
        label: m.lab_authenticator_data(),
        syntax: "hex",
        type: "WebAuthn binary",
        byteCount: hexByteCount(result.authenticatorDataHex),
        source: result.authenticatorDataHex,
      },
      {
        id: "attestation-object",
        label: m.lab_attestation_object(),
        syntax: "hex",
        type: "CBOR",
        byteCount: hexByteCount(result.attestationObjectCBORHex),
        source: result.attestationObjectCBORHex,
      },
    ];

    if (previewSignGeneratedKey) {
      details.push(
        {
          id: "preview-sign-public-key",
          label: m.lab_preview_sign_public_key(),
          syntax: "hex",
          type: "COSE",
          byteCount: hexByteCount(previewSignGeneratedKey.publicKeyCOSEHex),
          source: previewSignGeneratedKey.publicKeyCOSEHex,
        },
        {
          id: "preview-sign-attestation-object",
          label: m.lab_preview_sign_attestation_object(),
          syntax: "hex",
          type: "CBOR",
          byteCount: hexByteCount(previewSignGeneratedKey.attestationObjectCBORHex),
          source: previewSignGeneratedKey.attestationObjectCBORHex,
        },
      );
    }

    details.push({
      id: "result",
      label: m.lab_result(),
      syntax: "json",
      type: "JSON",
      byteCount: utf8ByteCount(resultJSON),
      source: resultJSON,
    });

    return details;
  });

  function booleanLabel(value: boolean) {
    return value ? m.lab_true() : m.lab_false();
  }

  function nullableBooleanLabel(value: boolean | null | undefined) {
    return value === null || value === undefined ? m.lab_not_reported() : booleanLabel(value);
  }

  function hexByteCount(value: string) {
    return Math.floor(value.length / 2);
  }

  function utf8ByteCount(value: string) {
    return new TextEncoder().encode(value).byteLength;
  }
</script>

<section class="lab-operation-result" aria-labelledby="lab-make-result-title">
  <header class="lab-operation-result-header">
    <h3 id="lab-make-result-title">{m.lab_make_result()}</h3>
    <Badge variant="secondary">{m.lab_phase_success()}</Badge>
  </header>

  <dl class="lab-result-list">
    <div class="lab-result-wide">
      <dt>{m.lab_credential_id()}</dt>
      <dd><LabHexValue label={m.lab_credential_id()} value={result.credentialIDHex} /></dd>
    </div>

    <div>
      <dt>{m.lab_format()}</dt>
      <dd><code>{result.fmt}</code></dd>
    </div>

    <div>
      <dt>{m.lab_aaguid()}</dt>
      <dd><code>{result.aaguid || m.lab_not_reported()}</code></dd>
    </div>

    <div>
      <dt>{m.lab_sign_count()}</dt>
      <dd>{result.signCount}</dd>
    </div>

    <div>
      <dt>{m.lab_user_present()}</dt>
      <dd><Badge variant="outline">{booleanLabel(result.userPresent)}</Badge></dd>
    </div>

    <div>
      <dt>{m.lab_user_verified()}</dt>
      <dd><Badge variant="outline">{booleanLabel(result.userVerified)}</Badge></dd>
    </div>

    <div>
      <dt>{m.lab_enterprise_attestation()}</dt>
      <dd>
        <Badge variant="outline"
          >{result.enterpriseAttestation === undefined
            ? m.lab_not_reported()
            : booleanLabel(result.enterpriseAttestation)}</Badge
        >
      </dd>
    </div>
  </dl>

  <section class="lab-extension-results" aria-labelledby="lab-make-extension-results-title">
    <h4 id="lab-make-extension-results-title">{m.lab_extension_outputs()}</h4>

    {#if hasExtensionOutputs}
      {#if hasWebAuthnOutputs}
        <section
          class="lab-extension-result-group"
          aria-labelledby="lab-make-webauthn-outputs-title"
        >
          <h5 id="lab-make-webauthn-outputs-title">{m.lab_webauthn_extension_outputs()}</h5>

          <dl class="lab-extension-result-list">
            {#if clientExtensions?.credProps}
              <div>
                <dt>credProps · rk</dt>
                <dd>{nullableBooleanLabel(clientExtensions.credProps.rk)}</dd>
              </div>
            {/if}

            {#if clientExtensions?.largeBlob}
              <div>
                <dt>largeBlob · supported</dt>
                <dd>{booleanLabel(clientExtensions.largeBlob.supported)}</dd>
              </div>
            {/if}

            {#if clientExtensions?.prf}
              <div>
                <dt>prf · enabled</dt>
                <dd>{booleanLabel(clientExtensions.prf.enabled)}</dd>
              </div>

              {#if clientExtensions.prf.results}
                <div>
                  <dt>prf · first</dt>
                  <dd>
                    {#key clientExtensions.prf.results.first}<LabSecretValue
                        valueHex={base64ToHex(clientExtensions.prf.results.first)}
                      />{/key}
                  </dd>
                </div>

                {#if clientExtensions.prf.results.second !== undefined && clientExtensions.prf.results.second !== null}
                  <div>
                    <dt>prf · second</dt>
                    <dd>
                      {#key clientExtensions.prf.results.second}<LabSecretValue
                          valueHex={base64ToHex(clientExtensions.prf.results.second)}
                        />{/key}
                    </dd>
                  </div>
                {/if}
              {:else}
                <div>
                  <dt>prf · results</dt>
                  <dd>{m.lab_not_reported()}</dd>
                </div>
              {/if}
            {/if}

            {#if previewSignGeneratedKey}
              <div>
                <dt>previewSign · algorithm</dt>
                <dd><code>{previewSignGeneratedKey.algorithm}</code></dd>
              </div>

              <div class="lab-result-wide">
                <dt>previewSign · keyHandle</dt>
                <dd>
                  <LabHexValue
                    label={m.lab_preview_sign_key_handle()}
                    value={previewSignGeneratedKey.keyHandleHex}
                  />
                </dd>
              </div>

              <div class="lab-result-wide">
                <dt>previewSign · publicKey</dt>
                <dd>
                  <LabHexValue
                    label={m.lab_preview_sign_public_key()}
                    value={previewSignGeneratedKey.publicKeyCOSEHex}
                  />
                </dd>
              </div>

              <div class="lab-result-wide">
                <dt>previewSign · attestationObject</dt>
                <dd>
                  <LabHexValue
                    label={m.lab_preview_sign_attestation_object()}
                    value={previewSignGeneratedKey.attestationObjectCBORHex}
                  />
                </dd>
              </div>
            {/if}
          </dl>
        </section>
      {/if}

      {#if hasCTAPOutputs}
        <section class="lab-extension-result-group" aria-labelledby="lab-make-ctap-outputs-title">
          <h5 id="lab-make-ctap-outputs-title">{m.lab_ctap_extension_outputs()}</h5>

          <dl class="lab-extension-result-list">
            {#if authenticatorExtensions?.credProtect}
              <div>
                <dt>credProtect</dt>
                <dd><code>{authenticatorExtensions.credProtect.policy}</code></dd>
              </div>
            {/if}

            {#if clientExtensions?.credBlob}
              <div>
                <dt>credBlob</dt>
                <dd>{m.lab_accepted()}: {booleanLabel(clientExtensions.credBlob.accepted)}</dd>
              </div>
            {/if}

            {#if clientExtensions?.["hmac-secret"]}
              <div>
                <dt>hmac-secret</dt>
                <dd>{m.lab_enabled()}: {booleanLabel(clientExtensions["hmac-secret"].enabled)}</dd>
              </div>
            {/if}

            {#if clientExtensions?.["hmac-secret-mc"]}
              <div>
                <dt>hmac-secret-mc · output1</dt>
                <dd>
                  {#key clientExtensions["hmac-secret-mc"].output1Hex}<LabSecretValue
                      valueHex={clientExtensions["hmac-secret-mc"].output1Hex}
                    />{/key}
                </dd>
              </div>

              {#if clientExtensions["hmac-secret-mc"].output2Hex}
                <div>
                  <dt>hmac-secret-mc · output2</dt>
                  <dd>
                    {#key clientExtensions["hmac-secret-mc"].output2Hex}<LabSecretValue
                        valueHex={clientExtensions["hmac-secret-mc"].output2Hex}
                      />{/key}
                  </dd>
                </div>
              {/if}
            {/if}

            {#if authenticatorExtensions?.minPinLength}
              <div>
                <dt>minPinLength</dt>
                <dd>{authenticatorExtensions.minPinLength.value}</dd>
              </div>
            {/if}

            {#if authenticatorExtensions?.pinComplexityPolicy}
              <div>
                <dt>pinComplexityPolicy</dt>
                <dd>{booleanLabel(authenticatorExtensions.pinComplexityPolicy.enabled)}</dd>
              </div>
            {/if}
          </dl>
        </section>
      {/if}
    {:else}
      <p>{m.lab_no_extension_outputs()}</p>
    {/if}
  </section>

  <LabVerificationRoute
    mode="make"
    state={verification}
    {attestationTrust}
    {onRetryVerification}
    {onRetryAttestationTrust}
  />

  <LabTechnicalDataViewer items={technicalDetails} />
</section>

<style>
  @layer blocks {
    .lab-operation-result,
    .lab-extension-results,
    .lab-extension-result-group {
      display: grid;
      gap: var(--space-3);
      min-width: 0;
    }

    .lab-operation-result-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .lab-operation-result h3,
    .lab-operation-result h4,
    .lab-operation-result h5 {
      margin: 0;
      font-size: 0.9rem;
    }

    .lab-result-list,
    .lab-extension-result-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1px;
      min-width: 0;
      margin: 0;
      overflow: hidden;
      border: 1px solid var(--border);
      background: var(--border);
    }

    .lab-result-list > div,
    .lab-extension-result-list > div {
      display: grid;
      align-content: start;
      gap: var(--space-1);
      min-width: 0;
      padding: var(--space-3);
      background: var(--card);
    }

    .lab-result-list dt,
    .lab-extension-result-list dt {
      color: var(--muted-foreground);
      font-size: 0.7rem;
    }

    .lab-result-list dd,
    .lab-extension-result-list dd {
      min-width: 0;
      margin: 0;
      overflow-wrap: anywhere;
      font-size: 0.78rem;
    }

    .lab-result-wide {
      grid-column: 1 / -1;
    }

    .lab-extension-results > p {
      margin: 0;
      padding: var(--space-3);
      border: 1px dashed var(--border);
      color: var(--muted-foreground);
      font-size: 0.75rem;
    }

    @media (max-width: 42rem) {
      .lab-result-list,
      .lab-extension-result-list {
        grid-template-columns: minmax(0, 1fr);
      }

      .lab-result-wide {
        grid-column: auto;
      }
    }
  }
</style>
