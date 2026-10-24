import type {
  AuthenticatorConfigPreview,
  AuthenticatorConfigResult,
  BioEnrollPreview,
  BioEnrollResult,
  BioListReport,
  BioMutationPreview,
  BioMutationResult,
  BioSensorReport,
  ResetPreview,
  ResetResult,
  StatusReport,
} from "../../bindings/github.com/telesma-app/kit/model/config";
import type {
  CredentialTarget,
  DeleteOutput as CredentialDeleteOutput,
  DeletePreview,
  DeleteResult,
  InventoryReport,
  UpdateUserPreview,
  UpdateUserResult,
} from "../../bindings/github.com/telesma-app/kit/model/credentials";
import type {
  ListReport as LargeBlobListReport,
  MutationPreview as LargeBlobMutationPreview,
  MutationResult as LargeBlobMutationResult,
  ReadReport as LargeBlobReadReport,
} from "../../bindings/github.com/telesma-app/kit/model/largeblobs";
import type {
  AuthenticatorConfigEnvelope,
  BioEnrollEnvelope,
  BioListEnvelope,
  BioMutationEnvelope,
  BioSensorEnvelope,
  ConfigStatusEnvelope,
  CredentialDeleteEnvelope,
  CredentialUpdateEnvelope,
  CredentialsEnvelope,
  GetInfoEnvelope,
  LargeBlobListEnvelope,
  LargeBlobDecodeEnvelope,
  LargeBlobMutationEnvelope,
  LargeBlobReadEnvelope,
  GetAssertionEnvelope,
  MakeCredentialEnvelope,
  ResetFactoryEnvelope,
} from "../../bindings/telesma/service";
import type {
  GetAssertionPreview,
  GetAssertionResult,
  MakeCredentialPreview,
  MakeCredentialResult,
} from "../../bindings/github.com/telesma-app/kit/model/webauthn";

export function getInfoResult(envelope: GetInfoEnvelope | null | undefined) {
  return envelope?.result ?? null;
}

export function bioSensorReport(
  envelope: BioSensorEnvelope | null | undefined,
): BioSensorReport | null {
  return envelope?.result ?? null;
}

export function configStatusReport(
  envelope: ConfigStatusEnvelope | null | undefined,
): StatusReport | null {
  return envelope?.result ?? null;
}

export function bioListReport(envelope: BioListEnvelope | null | undefined): BioListReport | null {
  return envelope?.result ?? null;
}

export function authenticatorConfigPreview(
  envelope: AuthenticatorConfigEnvelope | null | undefined,
): AuthenticatorConfigPreview | null {
  return envelope?.result?.preview ?? null;
}

export function authenticatorConfigResult(
  envelope: AuthenticatorConfigEnvelope | null | undefined,
): AuthenticatorConfigResult | null {
  return envelope?.result?.result ?? null;
}

export function bioEnrollPreview(
  envelope: BioEnrollEnvelope | null | undefined,
): BioEnrollPreview | null {
  return envelope?.result?.preview ?? null;
}

export function bioEnrollResult(
  envelope: BioEnrollEnvelope | null | undefined,
): BioEnrollResult | null {
  return envelope?.result?.result ?? null;
}

export function bioMutationPreview(
  envelope: BioMutationEnvelope | null | undefined,
): BioMutationPreview | null {
  return envelope?.result?.preview ?? null;
}

export function bioMutationResult(
  envelope: BioMutationEnvelope | null | undefined,
): BioMutationResult | null {
  return envelope?.result?.result ?? null;
}

export function resetFactoryPreview(
  envelope: ResetFactoryEnvelope | null | undefined,
): ResetPreview | null {
  return envelope?.result?.preview ?? null;
}

export function resetFactoryResult(
  envelope: ResetFactoryEnvelope | null | undefined,
): ResetResult | null {
  return envelope?.result?.result ?? null;
}

export function credentialsReport(
  envelope: CredentialsEnvelope | null | undefined,
): InventoryReport | null {
  return envelope?.result ?? null;
}

export function credentialTarget(
  report: InventoryReport | null,
  credentialIDHex: string,
): CredentialTarget | null {
  for (const group of report?.groups ?? []) {
    const record = group.credentials?.find(
      (credential) => credential.credentialIDHex === credentialIDHex,
    );

    if (!record) continue;

    return {
      record,
      rp: {
        id: group.rpID,
        ...(group.rpName ? { name: group.rpName } : {}),
        ...(group.rpIDHashHex ? { idHashHex: group.rpIDHashHex } : {}),
      },
      user: {
        userIDHex: record.userIDHex ?? "",
        name: record.userName ?? "",
        displayName: record.displayName ?? "",
      },
    };
  }

  return null;
}

export function credentialDeleteOutput(
  envelope: CredentialDeleteEnvelope | null | undefined,
): CredentialDeleteOutput | null {
  return envelope?.result ?? null;
}

export function credentialDeletePreview(
  envelope: CredentialDeleteEnvelope | null | undefined,
): DeletePreview | null {
  return envelope?.result?.preview ?? null;
}

export function credentialDeleteResult(
  envelope: CredentialDeleteEnvelope | null | undefined,
): DeleteResult | null {
  return envelope?.result?.result ?? null;
}

export function credentialUpdatePreview(
  envelope: CredentialUpdateEnvelope | null | undefined,
): UpdateUserPreview | null {
  return envelope?.result?.preview ?? null;
}

export function credentialUpdateResult(
  envelope: CredentialUpdateEnvelope | null | undefined,
): UpdateUserResult | null {
  return envelope?.result?.result ?? null;
}

export function largeBlobListReport(
  envelope: LargeBlobListEnvelope | null | undefined,
): LargeBlobListReport | null {
  return envelope?.result ?? null;
}

export function largeBlobReadReport(
  envelope: LargeBlobReadEnvelope | null | undefined,
): LargeBlobReadReport | null {
  return envelope?.result ?? null;
}

export function largeBlobDecodeResult(envelope: LargeBlobDecodeEnvelope | null | undefined) {
  return envelope?.result ?? null;
}

export function largeBlobMutationPreview(
  envelope: LargeBlobMutationEnvelope | null | undefined,
): LargeBlobMutationPreview | null {
  return envelope?.result?.preview ?? null;
}

export function largeBlobMutationResult(
  envelope: LargeBlobMutationEnvelope | null | undefined,
): LargeBlobMutationResult | null {
  return envelope?.result?.result ?? null;
}

/** Typed traversal for the WebAuthn Lab MakeCredential preview contract. */
export function makeCredentialPreview(
  envelope: MakeCredentialEnvelope | null | undefined,
): MakeCredentialPreview | null {
  return envelope?.result?.preview ?? null;
}

/** Typed traversal for a completed WebAuthn Lab MakeCredential operation. */
export function makeCredentialResult(
  envelope: MakeCredentialEnvelope | null | undefined,
): MakeCredentialResult | null {
  return envelope?.result?.result ?? null;
}

/** Typed traversal for a completed WebAuthn Lab GetAssertion operation. */
export function getAssertionResult(
  envelope: GetAssertionEnvelope | null | undefined,
): GetAssertionResult | null {
  return envelope?.result?.result ?? null;
}

/** Typed traversal for the WebAuthn Lab GetAssertion preview contract. */
export function getAssertionPreview(
  envelope: GetAssertionEnvelope | null | undefined,
): GetAssertionPreview | null {
  return envelope?.result?.preview ?? null;
}
