package service

import (
	"context"

	"uuid"

	ctapkit "github.com/telesma-app/kit"
	"github.com/telesma-app/kit/model/failure"
	"github.com/telesma-app/kit/model/operation"
)

type operationExecutor[T any] func(
	context.Context,
	*ctapkit.Authenticator,
	...ctapkit.OperationOption,
) (T, error)

type authenticatorOperation[O any, T any] func(
	*ctapkit.Authenticator,
	context.Context,
	O,
	...ctapkit.OperationOption,
) (T, error)

type inputlessAuthenticatorOperation[T any] func(
	*ctapkit.Authenticator,
	context.Context,
	...ctapkit.OperationOption,
) (T, error)

func runAuthenticatorOperation[O any, T any](
	service *Service,
	ctx context.Context,
	req OperationRequest,
	kind operation.Kind,
	input O,
	execute authenticatorOperation[O, T],
) (OperationEnvelopeMeta, *T) {
	return runOperation(service, ctx, req, kind, func(
		ctx context.Context,
		authenticator *ctapkit.Authenticator,
		opts ...ctapkit.OperationOption,
	) (T, error) {
		return execute(authenticator, ctx, input, opts...)
	})
}

func runInputlessOperation[T any](
	service *Service,
	ctx context.Context,
	req OperationRequest,
	kind operation.Kind,
	execute inputlessAuthenticatorOperation[T],
) (OperationEnvelopeMeta, *T) {
	return runOperation(service, ctx, req, kind, func(
		ctx context.Context,
		authenticator *ctapkit.Authenticator,
		opts ...ctapkit.OperationOption,
	) (T, error) {
		return execute(authenticator, ctx, opts...)
	})
}

func runOperation[T any](
	service *Service,
	ctx context.Context,
	req OperationRequest,
	kind operation.Kind,
	execute operationExecutor[T],
) (OperationEnvelopeMeta, *T) {
	operationID := OperationID(uuid.New().String())
	meta := OperationEnvelopeMeta{
		OperationID: operationID,
		Kind:        kind,
	}

	selected := service.currentSelection()

	if selected == nil {
		meta.Error = failure.Snapshot(authenticatorClosedError())

		return meta, nil
	}

	meta.SelectionID = selected.id
	ctx, cancel := context.WithCancel(ctx)
	state := &operationState{
		id:          operationID,
		selectionID: selected.id,
		cancel:      cancel,
		done:        make(chan struct{}),
	}

	if !service.registerOperation(selected, state) {
		cancel()
		meta.Error = failure.Snapshot(authenticatorClosedError())

		return meta, nil
	}

	defer cancel()
	defer service.unregisterOperation(selected, operationID)

	var opts []ctapkit.OperationOption

	if req.VerificationFlow != ctapkit.VerificationFlowDefault {
		opts = append(opts, ctapkit.WithVerificationFlow(req.VerificationFlow))
	}

	opts = append(opts, ctapkit.WithEventSink(operationEventSink{service: service, operation: state}))
	opts = append(opts, ctapkit.WithInteractionHandler(interactionHandler{
		service:     service,
		done:        state.done,
		selectionID: selected.id,
		operationID: operationID,
	}))

	result, operationErr := execute(ctx, selected.runtime.client, opts...)

	meta.AuthenticatorClosed = selected.runtime.Closed()
	meta.Error = failure.Snapshot(operationErr)
	if meta.AuthenticatorClosed {
		service.retireSelection(selected)
	}

	if operationErr != nil {
		return meta, nil
	}

	return meta, &result
}
