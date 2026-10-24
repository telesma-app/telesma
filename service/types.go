// Package service provides an application-facing orchestration layer on top of
// the public ctapkit runtime facade.
package service

import (
	"github.com/telesma-app/kit/model"
	"github.com/telesma-app/kit/model/config"
	"github.com/telesma-app/kit/model/credentials"
	"github.com/telesma-app/kit/model/failure"
	"github.com/telesma-app/kit/model/inspect"
	"github.com/telesma-app/kit/model/largeblobs"
	"github.com/telesma-app/kit/model/operation"
	"github.com/telesma-app/kit/model/report"
	"github.com/telesma-app/kit/model/webauthn"
	mdsmodel "github.com/telesma-app/mds/model"
)

type SelectionID string

type OperationID string

type InteractionID string

const (
	EventDiscoveryChanged     = "ctapkit:discovery-changed"
	EventOperationEvent       = "ctapkit:operation-event"
	EventInteractionRequested = "ctapkit:interaction-requested"
	EventLogsChanged          = "ctapkit:logs-changed"
)

type ReadLogsRequest struct {
	After uint64 `json:"after,omitempty"`
}

type LogCursor struct {
	Sequence uint64 `json:"sequence"`
}

type DiscoveryChangedEnvelope struct {
	Snapshot AuthenticatorSessionSnapshot `json:"snapshot"`
}

type SelectionRequest struct {
	DeviceID report.DeviceID `json:"deviceId"`
}

type EndpointSelectionRequest struct {
	AttachmentID report.AttachmentID `json:"attachmentId"`
}

type ActiveSelection struct {
	DeviceID     report.DeviceID     `json:"deviceId"`
	ID           SelectionID         `json:"id"`
	AttachmentID report.AttachmentID `json:"attachmentId"`
}

type AuthenticatorSessionSnapshot struct {
	Endpoints            []report.EndpointReport `json:"endpoints"`
	SelectedDeviceID     report.DeviceID         `json:"selectedDeviceId"`
	Devices              []report.DeviceReport   `json:"devices"`
	SelectedAttachmentID report.AttachmentID     `json:"selectedAttachmentId"`
	Selection            *ActiveSelection        `json:"selection,omitempty"`
	Error                *failure.Failure        `json:"error,omitempty"`
}

type OperationEnvelopeMeta struct {
	OperationID         OperationID      `json:"operationId"`
	SelectionID         SelectionID      `json:"selectionId"`
	Kind                operation.Kind   `json:"kind"`
	AuthenticatorClosed bool             `json:"authenticatorClosed"`
	Error               *failure.Failure `json:"error,omitempty"`
}

type MetadataRequest struct {
	AttachmentID report.AttachmentID `json:"attachmentId"`
	Refresh      bool                `json:"refresh"`
}

type GetInfoEnvelope struct {
	OperationEnvelopeMeta
	Result *inspect.Info `json:"result,omitempty"`
}

type CredentialsEnvelope struct {
	OperationEnvelopeMeta
	Result *credentials.InventoryReport `json:"result,omitempty"`
}

type CredentialDeleteEnvelope struct {
	OperationEnvelopeMeta
	Result *credentials.DeleteOutput `json:"result,omitempty"`
}

type CredentialUpdateEnvelope struct {
	OperationEnvelopeMeta
	Result *credentials.UpdateUserOutput `json:"result,omitempty"`
}

type LargeBlobReadEnvelope struct {
	OperationEnvelopeMeta
	Result *largeblobs.ReadReport `json:"result,omitempty"`
}

type LargeBlobListEnvelope struct {
	OperationEnvelopeMeta
	Result *largeblobs.ListReport `json:"result,omitempty"`
}

type LargeBlobMutationEnvelope struct {
	OperationEnvelopeMeta
	Result *largeblobs.MutationOutput `json:"result,omitempty"`
}

type ConfigStatusEnvelope struct {
	OperationEnvelopeMeta
	Result *config.StatusReport `json:"result,omitempty"`
}

type PINEnvelope struct {
	OperationEnvelopeMeta
	Result *config.PINOutput `json:"result,omitempty"`
}

type AuthenticatorConfigEnvelope struct {
	OperationEnvelopeMeta
	Result *config.AuthenticatorConfigOutput `json:"result,omitempty"`
}

type BioSensorEnvelope struct {
	OperationEnvelopeMeta
	Result *config.BioSensorReport `json:"result,omitempty"`
}

type BioListEnvelope struct {
	OperationEnvelopeMeta
	Result *config.BioListReport `json:"result,omitempty"`
}

type BioEnrollEnvelope struct {
	OperationEnvelopeMeta
	Result *config.BioEnrollOutput `json:"result,omitempty"`
}

type BioMutationEnvelope struct {
	OperationEnvelopeMeta
	Result *config.BioMutationOutput `json:"result,omitempty"`
}

type ResetFactoryEnvelope struct {
	OperationEnvelopeMeta
	Result *config.ResetFactoryOutput `json:"result,omitempty"`
}

type MakeCredentialEnvelope struct {
	OperationEnvelopeMeta
	Result *webauthn.MakeCredentialOutput `json:"result,omitempty"`
}

type GetAssertionEnvelope struct {
	OperationEnvelopeMeta
	Result *webauthn.GetAssertionOutput `json:"result,omitempty"`
}

type CancelOperationRequest struct {
	OperationID OperationID `json:"operationId"`
}

type InteractionPrompt struct {
	InteractionID InteractionID            `json:"interactionId"`
	OperationID   OperationID              `json:"operationId"`
	SelectionID   SelectionID              `json:"selectionId"`
	Request       model.InteractionRequest `json:"request"`
}

type InteractionAnswer struct {
	InteractionID InteractionID `json:"interactionId"`
	PIN           string        `json:"pin,omitempty"`
	Canceled      bool          `json:"canceled,omitempty"`
}

type OperationEventEnvelope struct {
	OperationID OperationID          `json:"operationId,omitempty"`
	SelectionID SelectionID          `json:"selectionId"`
	Event       model.OperationEvent `json:"event"`
}

type MDSLookupRequest struct {
	AAGUID   string `json:"aaguid"`
	Source   string `json:"source,omitempty"`
	CacheDir string `json:"cacheDir,omitempty"`
	Refresh  bool   `json:"refresh,omitempty"`
}

type MDSLookupEnvelope struct {
	Result mdsmodel.LookupResult `json:"result"`
	Error  *failure.Failure      `json:"error,omitempty"`
}
