package service

import (
	"context"

	ctapkit "github.com/telesma-app/kit"
	"github.com/telesma-app/kit/model/config"
	"github.com/telesma-app/kit/model/credentials"
	"github.com/telesma-app/kit/model/largeblobs"
	appoperation "github.com/telesma-app/kit/model/operation"
	"github.com/telesma-app/kit/model/webauthn"
)

type OperationRequest struct {
	VerificationFlow ctapkit.VerificationFlow `json:"verificationFlow,omitempty"`
}

type CredentialDeleteRequest struct {
	OperationRequest
	credentials.DeleteOperation
}

type CredentialUpdateRequest struct {
	OperationRequest
	credentials.UpdateUserOperation
}

type LargeBlobReadRequest struct {
	OperationRequest
	largeblobs.ReadOperation
}

type LargeBlobWriteRequest struct {
	OperationRequest
	largeblobs.WriteOperation
}

type LargeBlobDeleteRequest struct {
	OperationRequest
	largeblobs.DeleteOperation
}

type LargeBlobGarbageCollectRequest struct {
	OperationRequest
	largeblobs.GarbageCollectOperation
}

type PINSetRequest struct {
	OperationRequest
	// NewPIN participates in JSON transport. Consumers own redaction at the
	// application boundary and must not log or persist serialized requests.
	NewPIN string `json:"newPIN"`
	DryRun bool   `json:"dryRun,omitempty"`
}

type PINChangeRequest struct {
	OperationRequest
	// CurrentPIN and NewPIN participate in JSON transport. Consumers own
	// redaction at the application boundary and must not log or persist them.
	CurrentPIN string `json:"currentPIN"`
	NewPIN     string `json:"newPIN"`
	DryRun     bool   `json:"dryRun,omitempty"`
}

type AlwaysUVRequest struct {
	OperationRequest
	config.SetAlwaysUVOperation
}

type EnableEnterpriseAttestationRequest struct {
	OperationRequest
	config.EnableEnterpriseAttestationOperation
}

type MinPINLengthRequest struct {
	OperationRequest
	config.SetMinPINLengthOperation
}

type EnableLongTouchForResetRequest struct {
	OperationRequest
	config.EnableLongTouchForResetOperation
}

type BioEnrollRequest struct {
	OperationRequest
	config.BioEnrollOperation
}

type BioRenameRequest struct {
	OperationRequest
	config.BioRenameOperation
}

type BioRemoveRequest struct {
	OperationRequest
	config.BioRemoveOperation
}

type ResetFactoryRequest struct {
	OperationRequest
	config.ResetFactoryOperation
}

type MakeCredentialRequest struct {
	OperationRequest
	webauthn.MakeCredentialOperation
}

type GetAssertionRequest struct {
	OperationRequest
	webauthn.GetAssertionOperation
}

func (s *Service) GetInfo(ctx context.Context, req OperationRequest) GetInfoEnvelope {
	meta, result := runInputlessOperation(
		s, ctx, req, appoperation.GetInfo,
		(*ctapkit.Authenticator).GetInfo,
	)

	return GetInfoEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) ListCredentials(ctx context.Context, req OperationRequest) CredentialsEnvelope {
	meta, result := runInputlessOperation(
		s, ctx, req, appoperation.ListCredentials,
		(*ctapkit.Authenticator).ListCredentials,
	)

	return CredentialsEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) DeleteCredential(ctx context.Context, req CredentialDeleteRequest) CredentialDeleteEnvelope {
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.DeleteCredential,
		req.DeleteOperation, (*ctapkit.Authenticator).DeleteCredential,
	)

	return CredentialDeleteEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) UpdateCredentialUser(ctx context.Context, req CredentialUpdateRequest) CredentialUpdateEnvelope {
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.UpdateCredentialUser,
		req.UpdateUserOperation, (*ctapkit.Authenticator).UpdateCredentialUser,
	)

	return CredentialUpdateEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) ReadLargeBlob(ctx context.Context, req LargeBlobReadRequest) LargeBlobReadEnvelope {
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.ReadLargeBlob,
		req.ReadOperation, (*ctapkit.Authenticator).ReadLargeBlob,
	)

	return LargeBlobReadEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) ListLargeBlobs(ctx context.Context, req OperationRequest) LargeBlobListEnvelope {
	meta, result := runInputlessOperation(
		s, ctx, req, appoperation.ListLargeBlobs,
		(*ctapkit.Authenticator).ListLargeBlobs,
	)

	return LargeBlobListEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) WriteLargeBlob(ctx context.Context, req LargeBlobWriteRequest) LargeBlobMutationEnvelope {
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.WriteLargeBlob,
		req.WriteOperation, (*ctapkit.Authenticator).WriteLargeBlob,
	)

	return LargeBlobMutationEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) DeleteLargeBlob(ctx context.Context, req LargeBlobDeleteRequest) LargeBlobMutationEnvelope {
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.DeleteLargeBlob,
		req.DeleteOperation, (*ctapkit.Authenticator).DeleteLargeBlob,
	)

	return LargeBlobMutationEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) GarbageCollectLargeBlobs(ctx context.Context, req LargeBlobGarbageCollectRequest) LargeBlobMutationEnvelope {
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.GarbageCollectLargeBlobs,
		req.GarbageCollectOperation, (*ctapkit.Authenticator).GarbageCollectLargeBlobs,
	)

	return LargeBlobMutationEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) ConfigStatus(ctx context.Context, req OperationRequest) ConfigStatusEnvelope {
	meta, result := runInputlessOperation(
		s, ctx, req, appoperation.ConfigStatus,
		(*ctapkit.Authenticator).ConfigStatus,
	)

	return ConfigStatusEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) SetPIN(ctx context.Context, req PINSetRequest) PINEnvelope {
	operation := config.SetPINOperation{
		NewPIN: req.NewPIN,
		DryRun: req.DryRun,
	}
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.SetPIN,
		operation, (*ctapkit.Authenticator).SetPIN,
	)

	return PINEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) ChangePIN(ctx context.Context, req PINChangeRequest) PINEnvelope {
	operation := config.ChangePINOperation{
		CurrentPIN: req.CurrentPIN,
		NewPIN:     req.NewPIN,
		DryRun:     req.DryRun,
	}
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.ChangePIN,
		operation, (*ctapkit.Authenticator).ChangePIN,
	)

	return PINEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) SetAlwaysUV(ctx context.Context, req AlwaysUVRequest) AuthenticatorConfigEnvelope {
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.SetAlwaysUV,
		req.SetAlwaysUVOperation, (*ctapkit.Authenticator).SetAlwaysUV,
	)

	return AuthenticatorConfigEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) EnableEnterpriseAttestation(ctx context.Context, req EnableEnterpriseAttestationRequest) AuthenticatorConfigEnvelope {
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.EnableEnterpriseAttestation,
		req.EnableEnterpriseAttestationOperation, (*ctapkit.Authenticator).EnableEnterpriseAttestation,
	)

	return AuthenticatorConfigEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) SetMinPINLength(ctx context.Context, req MinPINLengthRequest) AuthenticatorConfigEnvelope {
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.SetMinPINLength,
		req.SetMinPINLengthOperation, (*ctapkit.Authenticator).SetMinPINLength,
	)

	return AuthenticatorConfigEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) EnableLongTouchForReset(ctx context.Context, req EnableLongTouchForResetRequest) AuthenticatorConfigEnvelope {
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.EnableLongTouchForReset,
		req.EnableLongTouchForResetOperation, (*ctapkit.Authenticator).EnableLongTouchForReset,
	)

	return AuthenticatorConfigEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) BioSensorInfo(ctx context.Context, req OperationRequest) BioSensorEnvelope {
	meta, result := runInputlessOperation(
		s, ctx, req, appoperation.BioSensorInfo,
		(*ctapkit.Authenticator).BioSensorInfo,
	)

	return BioSensorEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) BioList(ctx context.Context, req OperationRequest) BioListEnvelope {
	meta, result := runInputlessOperation(
		s, ctx, req, appoperation.BioList,
		(*ctapkit.Authenticator).BioList,
	)

	return BioListEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) BioEnroll(ctx context.Context, req BioEnrollRequest) BioEnrollEnvelope {
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.BioEnroll,
		req.BioEnrollOperation, (*ctapkit.Authenticator).BioEnroll,
	)

	return BioEnrollEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) BioRename(ctx context.Context, req BioRenameRequest) BioMutationEnvelope {
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.BioRename,
		req.BioRenameOperation, (*ctapkit.Authenticator).BioRename,
	)

	return BioMutationEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) BioRemove(ctx context.Context, req BioRemoveRequest) BioMutationEnvelope {
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.BioRemove,
		req.BioRemoveOperation, (*ctapkit.Authenticator).BioRemove,
	)

	return BioMutationEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) ResetFactory(ctx context.Context, req ResetFactoryRequest) ResetFactoryEnvelope {
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.ResetFactory,
		req.ResetFactoryOperation, (*ctapkit.Authenticator).ResetFactory,
	)

	return ResetFactoryEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) MakeCredential(ctx context.Context, req MakeCredentialRequest) MakeCredentialEnvelope {
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.MakeCredential,
		req.MakeCredentialOperation, (*ctapkit.Authenticator).MakeCredential,
	)

	return MakeCredentialEnvelope{OperationEnvelopeMeta: meta, Result: result}
}

func (s *Service) GetAssertion(ctx context.Context, req GetAssertionRequest) GetAssertionEnvelope {
	meta, result := runAuthenticatorOperation(
		s, ctx, req.OperationRequest, appoperation.GetAssertion,
		req.GetAssertionOperation, (*ctapkit.Authenticator).GetAssertion,
	)

	return GetAssertionEnvelope{OperationEnvelopeMeta: meta, Result: result}
}
