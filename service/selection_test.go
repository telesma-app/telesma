package service

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	ctapkit "github.com/telesma-app/kit"
	"github.com/telesma-app/kit/model/failure"
	"github.com/telesma-app/kit/model/report"
	"github.com/telesma-app/kit/transport"
)

func TestSetSelectionValidatesRequestBeforeManagerState(t *testing.T) {
	service := New()
	defer func() { _ = service.close() }()

	err := service.SetSelection(t.Context(), SelectionRequest{})
	if !failure.IsCode(err, failure.CodeDeviceNotFound) {
		t.Fatalf("SetSelection error = %v", err)
	}

	if got := failure.Snapshot(err).Phase; got != failure.PhaseAuthenticator {
		t.Fatalf("phase = %q, want %q", got, failure.PhaseAuthenticator)
	}
}

func TestSetSelectionUsesManagerAndAppliesReplacementBoundary(t *testing.T) {
	firstRuntime := &fakeAuthenticatorRuntime{}
	secondRuntime := &fakeAuthenticatorRuntime{}
	manager := newFakeDeviceManager(
		[]report.EndpointReport{testDevice("device-1"), testDevice("device-2")},
		openedFor("device-1", firstRuntime),
	)
	manager.selectFunc = func(_ context.Context, id report.DeviceID) error {
		if id != "device-2" {
			t.Fatalf("Select id = %q, want device-2", id)
		}

		manager.setSelected(openedFor(report.AttachmentID(id), secondRuntime))
		manager.setSnapshot(ctapkit.DeviceSnapshot{
			Endpoints: []report.EndpointReport{
				testDevice("device-1"),
				testDevice("device-2"),
			},
			SelectedEndpoint: report.AttachmentID(id),
		})

		return nil
	}
	emitted := make(chan DiscoveryChangedEnvelope, 2)
	service := New(WithEventEmitter(discoveryEmitter(emitted)))
	service.openDeviceManager = staticDeviceManager(manager)

	if err := service.Discover(t.Context()); err != nil {
		t.Fatalf("Discover: %v", err)
	}

	initial := (<-emitted).Snapshot

	if err := service.SetSelection(
		t.Context(),
		SelectionRequest{DeviceID: report.DeviceID("device-2")},
	); err != nil {
		t.Fatalf("SetSelection: %v", err)
	}

	replacement := (<-emitted).Snapshot
	if replacement.Selection == nil ||
		replacement.Selection.AttachmentID != "device-2" ||
		replacement.Selection.ID == initial.Selection.ID {
		t.Fatalf("replacement = %#v", replacement.Selection)
	}

	if err := service.close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
}

func TestSetEndpointSelectionUsesAttachmentAndAppliesReplacementBoundary(t *testing.T) {
	hid := testDevice("hid")
	card := report.EndpointReport{
		Attachment: report.AttachmentReport{
			ID:        "pcsc",
			Transport: transport.ModeSmartCard,
			SmartCard: &report.SmartCardReport{Reader: "reader"},
		},
	}
	firstRuntime := &fakeAuthenticatorRuntime{}
	secondRuntime := &fakeAuthenticatorRuntime{}
	manager := newFakeDeviceManager([]report.EndpointReport{hid, card}, openedFor(hid.Attachment.ID, firstRuntime))
	manager.selectEndpointFunc = func(_ context.Context, id report.AttachmentID) error {
		if id != card.Attachment.ID {
			t.Fatalf("SelectEndpoint id = %q, want %q", id, card.Attachment.ID)
		}

		manager.setSelected(openedAuthenticator{lifecycle: secondRuntime, device: card})
		manager.setSnapshot(ctapkit.DeviceSnapshot{
			Endpoints:        []report.EndpointReport{hid, card},
			SelectedEndpoint: id,
		})

		return nil
	}
	emitted := make(chan DiscoveryChangedEnvelope, 2)
	service := New(WithEventEmitter(discoveryEmitter(emitted)))

	t.Cleanup(func() { _ = service.close() })

	service.openDeviceManager = staticDeviceManager(manager)

	if err := service.Discover(t.Context()); err != nil {
		t.Fatalf("Discover: %v", err)
	}

	initial := (<-emitted).Snapshot

	if err := service.SetEndpointSelection(t.Context(), EndpointSelectionRequest{AttachmentID: card.Attachment.ID}); err != nil {
		t.Fatalf("SetEndpointSelection: %v", err)
	}

	replacement := (<-emitted).Snapshot
	if replacement.Selection == nil ||
		replacement.Selection.AttachmentID != card.Attachment.ID ||
		replacement.Selection.ID == initial.Selection.ID {
		t.Fatalf("replacement = %#v", replacement.Selection)
	}
}

func TestSetSelectionKeepsFallbackAndTypedManagerFailure(t *testing.T) {
	firstRuntime := &fakeAuthenticatorRuntime{}
	fallbackRuntime := &fakeAuthenticatorRuntime{}
	devices := []report.EndpointReport{testDevice("device-1"), testDevice("device-2")}
	manager := newFakeDeviceManager(devices, openedFor("device-1", firstRuntime))
	manager.selectFunc = func(_ context.Context, _ report.DeviceID) error {
		manager.setSelected(openedFor("device-1", fallbackRuntime))
		manager.setSnapshot(ctapkit.DeviceSnapshot{
			Endpoints: devices,
			Selected:  "device-1",
		})

		return failure.New(
			failure.CodeTransportFailure,
			failure.WithPhase(failure.PhaseAuthenticator),
		)
	}
	emitted := make(chan DiscoveryChangedEnvelope, 2)
	service := New(WithEventEmitter(discoveryEmitter(emitted)))
	service.openDeviceManager = staticDeviceManager(manager)

	if err := service.Discover(t.Context()); err != nil {
		t.Fatalf("Discover: %v", err)
	}

	initial := (<-emitted).Snapshot

	err := service.SetSelection(
		t.Context(),
		SelectionRequest{DeviceID: report.DeviceID("device-2")},
	)
	if !failure.IsCode(err, failure.CodeTransportFailure) {
		t.Fatalf("SetSelection error = %v", err)
	}

	snapshot := (<-emitted).Snapshot
	if snapshot.Selection == nil ||
		snapshot.Selection.AttachmentID != "device-1" ||
		snapshot.Selection.ID == initial.Selection.ID {
		t.Fatalf("fallback selection = %#v", snapshot.Selection)
	}

	if snapshot.Error == nil ||
		snapshot.Error.Code != failure.CodeTransportFailure {
		t.Fatalf("fallback error = %#v", snapshot.Error)
	}

	if err := service.close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
}

func TestSetSelectionCancellationDoesNotReachManager(t *testing.T) {
	manager := newFakeDeviceManager(
		[]report.EndpointReport{testDevice("device-1")},
		openedFor("device-1", &fakeAuthenticatorRuntime{}),
	)

	var selections atomic.Int32

	manager.selectFunc = func(context.Context, report.DeviceID) error {
		selections.Add(1)

		return nil
	}
	service := New()

	service.openDeviceManager = staticDeviceManager(manager)
	if err := service.Discover(t.Context()); err != nil {
		t.Fatalf("Discover: %v", err)
	}

	release, err := service.lockSelection(t.Context())
	if err != nil {
		t.Fatalf("lock selection: %v", err)
	}

	canceled, cancel := context.WithCancel(t.Context())
	cancel()

	err = service.SetSelection(
		canceled,
		SelectionRequest{DeviceID: report.DeviceID("device-1")},
	)

	release()

	if !failure.IsCode(err, failure.CodeOperationCanceled) {
		t.Fatalf("SetSelection error = %v", err)
	}

	if selections.Load() != 0 {
		t.Fatalf("manager selections = %d, want 0", selections.Load())
	}

	if err := service.close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
}

func TestReconnectSelectionInvalidatesAndReopensSameAttachment(t *testing.T) {
	firstRuntime := &fakeAuthenticatorRuntime{}
	reopenedRuntime := &fakeAuthenticatorRuntime{}
	device := testDevice("device-1")
	firstManager := newFakeDeviceManager(
		[]report.EndpointReport{device},
		openedFor(device.Attachment.ID, firstRuntime),
	)
	secondManager := newFakeDeviceManager(
		[]report.EndpointReport{device},
		openedFor(device.Attachment.ID, reopenedRuntime),
	)

	var opens atomic.Int32

	emitted := make(chan DiscoveryChangedEnvelope, 3)
	service := New(WithEventEmitter(discoveryEmitter(emitted)))
	service.openDeviceManager = func(
		context.Context,
		transport.Mode,
		...ctapkit.AuthenticatorOption,
	) (deviceManagerRuntime, error) {
		if opens.Add(1) == 1 {
			return firstManager, nil
		}

		return secondManager, nil
	}

	if err := service.Discover(t.Context()); err != nil {
		t.Fatalf("Discover: %v", err)
	}

	initial := (<-emitted).Snapshot

	if err := service.ReconnectSelection(t.Context()); err != nil {
		t.Fatalf("ReconnectSelection: %v", err)
	}

	reconnected := (<-emitted).Snapshot
	if reconnected.Selection == nil ||
		reconnected.Selection.AttachmentID != device.Attachment.ID ||
		reconnected.Selection.ID == initial.Selection.ID {
		t.Fatalf("reconnected selection = %#v", reconnected.Selection)
	}

	if opens.Load() != 2 {
		t.Fatalf("device manager opens = %d, want 2", opens.Load())
	}

	if err := service.close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
}

func TestCloseManagerBeforeWaitingForOperations(t *testing.T) {
	runtime := &fakeAuthenticatorRuntime{}
	manager := newFakeDeviceManager(
		[]report.EndpointReport{testDevice("device-1")},
		openedFor("device-1", runtime),
	)
	service := New()

	service.openDeviceManager = staticDeviceManager(manager)
	if err := service.Discover(t.Context()); err != nil {
		t.Fatalf("Discover: %v", err)
	}

	selected := service.currentSelection()
	operationID := OperationID("operation-1")
	operation := &operationState{
		id:          operationID,
		selectionID: selected.id,
		cancel:      func() {},
		done:        make(chan struct{}),
	}
	selected.operations[operationID] = operation
	manager.closeFunc = func() error {
		service.unregisterOperation(selected, operationID)

		return nil
	}

	closeDone := make(chan error, 1)
	go func() {
		closeDone <- service.close()
	}()

	select {
	case err := <-closeDone:
		if err != nil {
			t.Fatalf("Close: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Close waited for the operation before closing the manager")
	}
}

func openedFor(id report.AttachmentID, lifecycle authenticatorLifecycle) openedAuthenticator {
	return openedAuthenticator{
		lifecycle: lifecycle,
		device:    testDevice(id),
	}
}

func testDevice(id report.AttachmentID) report.EndpointReport {
	return report.EndpointReport{
		Attachment: report.AttachmentReport{
			ID:        id,
			Transport: transport.ModeHID,
			USB:       &report.USBReport{},
		},
	}
}

type fakeAuthenticatorRuntime struct {
	closed   atomic.Bool
	closeErr error
	onClose  func()
}

func (r *fakeAuthenticatorRuntime) Close() error {
	r.closed.Store(true)

	if r.onClose != nil {
		r.onClose()
	}

	return r.closeErr
}

func (r *fakeAuthenticatorRuntime) Closed() bool {
	return r.closed.Load()
}
