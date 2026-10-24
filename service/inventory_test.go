package service

import (
	"context"
	"sync"
	"testing"
	"time"

	ctapkit "github.com/telesma-app/kit"
	"github.com/telesma-app/kit/model/failure"
	"github.com/telesma-app/kit/model/report"
	"github.com/telesma-app/kit/transport"
	"github.com/telesma-app/mds"
)

func TestDiscoverUsesDeviceManagerInitialSelection(t *testing.T) {
	firstRuntime := &fakeAuthenticatorRuntime{}
	manager := newFakeDeviceManager(
		[]report.EndpointReport{testDevice("device-1"), testDevice("device-2")},
		openedFor("device-1", firstRuntime),
	)
	emitted := make(chan DiscoveryChangedEnvelope, 1)
	service := New(WithEventEmitter(discoveryEmitter(emitted)))
	service.openDeviceManager = func(
		context.Context,
		transport.Mode,
		...ctapkit.AuthenticatorOption,
	) (deviceManagerRuntime, error) {
		return manager, nil
	}

	if err := service.Discover(t.Context()); err != nil {
		t.Fatalf("Discover: %v", err)
	}

	snapshot := (<-emitted).Snapshot
	if len(snapshot.Devices) != 2 ||
		snapshot.Selection == nil ||
		snapshot.Selection.AttachmentID != "device-1" {
		t.Fatalf("Discover = %#v", snapshot)
	}

	if manager.openCalls != 1 {
		t.Fatalf("device manager opens = %d, want 1", manager.openCalls)
	}

	if err := service.Discover(t.Context()); err != nil {
		t.Fatalf("second Discover: %v", err)
	}

	select {
	case replay := <-emitted:
		if replay.Snapshot.Selection == nil ||
			replay.Snapshot.Selection.ID != snapshot.Selection.ID ||
			replay.Snapshot.Selection.AttachmentID != "device-1" ||
			len(replay.Snapshot.Devices) != 2 {
			t.Fatalf("second Discover = %#v", replay.Snapshot)
		}
	case <-time.After(time.Second):
		t.Fatal("second Discover did not replay the current snapshot")
	}

	if manager.openCalls != 1 {
		t.Fatalf("device manager opens after replay = %d, want 1", manager.openCalls)
	}

	if err := service.close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
}

func TestDiscoverReturnsAnEmptyDeviceArray(t *testing.T) {
	manager := newFakeDeviceManager(nil, openedAuthenticator{})
	emitted := make(chan DiscoveryChangedEnvelope, 1)
	service := New(WithEventEmitter(discoveryEmitter(emitted)))
	service.openDeviceManager = staticDeviceManager(manager)

	if err := service.Discover(t.Context()); err != nil {
		t.Fatalf("Discover: %v", err)
	}

	snapshot := (<-emitted).Snapshot
	if snapshot.Devices == nil || len(snapshot.Devices) != 0 {
		t.Fatalf("devices = %#v, want non-nil empty slice", snapshot.Devices)
	}

	if err := service.close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
}

func TestDeviceUpdateKeepsSelectionIDForSameAuthenticator(t *testing.T) {
	runtime := &fakeAuthenticatorRuntime{}
	device := testDevice("device-1")
	manager := newFakeDeviceManager(
		[]report.EndpointReport{device},
		openedFor(device.Attachment.ID, runtime),
	)
	emitted := make(chan DiscoveryChangedEnvelope, 1)
	service := New(WithEventEmitter(emitterFunc(func(name string, payload any) {
		if name == EventDiscoveryChanged {
			emitted <- payload.(DiscoveryChangedEnvelope)
		}
	})))
	service.openDeviceManager = staticDeviceManager(manager)

	if err := service.Discover(t.Context()); err != nil {
		t.Fatalf("Discover: %v", err)
	}

	initial := (<-emitted).Snapshot

	updated := device
	updated.Attachment.USB.Product = report.Descriptor[string]{Value: "Updated product", State: report.DescriptorRead}
	manager.publish(ctapkit.DeviceUpdate{
		Snapshot: ctapkit.DeviceSnapshot{
			Endpoints:        []report.EndpointReport{updated},
			SelectedEndpoint: device.Attachment.ID,
		},
	})

	select {
	case event := <-emitted:
		if event.Snapshot.Selection == nil ||
			event.Snapshot.Selection.ID != initial.Selection.ID {
			t.Fatalf("update changed selection: %#v", event.Snapshot.Selection)
		}

		if event.Snapshot.Endpoints[0].Attachment.USB.Product.Value != "Updated product" {
			t.Fatalf("update devices = %#v", event.Snapshot.Devices)
		}
	case <-time.After(time.Second):
		t.Fatal("device update was not emitted")
	}

	if err := service.close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
}

func TestDeviceUpdateCarriesItsOwnSelectionRuntime(t *testing.T) {
	runtime := &fakeAuthenticatorRuntime{}
	device := testDevice("device-1")
	manager := newFakeDeviceManager(
		[]report.EndpointReport{device},
		openedFor(device.Attachment.ID, runtime),
	)
	emitted := make(chan DiscoveryChangedEnvelope, 1)
	service := New(WithEventEmitter(emitterFunc(func(name string, payload any) {
		if name == EventDiscoveryChanged {
			emitted <- payload.(DiscoveryChangedEnvelope)
		}
	})))
	service.openDeviceManager = staticDeviceManager(manager)

	if err := service.Discover(t.Context()); err != nil {
		t.Fatalf("Discover: %v", err)
	}

	initial := (<-emitted).Snapshot

	unlock, err := service.lockSelection(t.Context())
	if err != nil {
		t.Fatalf("lock selection: %v", err)
	}

	card := report.EndpointReport{
		Attachment: report.AttachmentReport{
			ID:        "smart-card:reader-1",
			Transport: transport.ModeSmartCard,
			SmartCard: &report.SmartCardReport{Reader: "reader-1"},
		},
	}
	manager.publish(ctapkit.DeviceUpdate{
		Snapshot: ctapkit.DeviceSnapshot{
			Endpoints:        []report.EndpointReport{device, card},
			SelectedEndpoint: device.Attachment.ID,
		},
	})
	manager.setSelected(openedFor("device-2", &fakeAuthenticatorRuntime{}))
	unlock()

	select {
	case event := <-emitted:
		if len(event.Snapshot.Devices) != 2 ||
			event.Snapshot.Endpoints[1].Attachment.ID != card.Attachment.ID {
			t.Fatalf("topology update = %#v", event.Snapshot.Devices)
		}

		if event.Snapshot.Selection == nil ||
			event.Snapshot.Selection.ID != initial.Selection.ID {
			t.Fatalf("selection = %#v", event.Snapshot.Selection)
		}
	case <-time.After(time.Second):
		t.Fatal("topology update was dropped")
	}

	if err := service.close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
}

func TestDeviceUpdateAppliesManagerFallbackAndFailure(t *testing.T) {
	firstRuntime := &fakeAuthenticatorRuntime{}
	secondRuntime := &fakeAuthenticatorRuntime{}
	first := testDevice("device-1")
	second := testDevice("device-2")
	manager := newFakeDeviceManager(
		[]report.EndpointReport{first, second},
		openedFor(first.Attachment.ID, firstRuntime),
	)
	emitted := make(chan DiscoveryChangedEnvelope, 1)
	service := New(WithEventEmitter(emitterFunc(func(name string, payload any) {
		if name == EventDiscoveryChanged {
			emitted <- payload.(DiscoveryChangedEnvelope)
		}
	})))
	service.openDeviceManager = staticDeviceManager(manager)

	if err := service.Discover(t.Context()); err != nil {
		t.Fatalf("Discover: %v", err)
	}

	initial := (<-emitted).Snapshot

	manager.setSelected(openedFor(second.Attachment.ID, secondRuntime))
	manager.publish(ctapkit.DeviceUpdate{
		Snapshot: ctapkit.DeviceSnapshot{
			Endpoints:        []report.EndpointReport{first, second},
			SelectedEndpoint: second.Attachment.ID,
		},
		Error: failure.Snapshot(failure.New(
			failure.CodeTransportFailure,
			failure.WithPhase(failure.PhaseAuthenticator),
		)),
	})

	select {
	case event := <-emitted:
		if event.Snapshot.Selection == nil ||
			event.Snapshot.Selection.ID == initial.Selection.ID ||
			event.Snapshot.Selection.AttachmentID != second.Attachment.ID {
			t.Fatalf("fallback selection = %#v", event.Snapshot.Selection)
		}

		if event.Snapshot.Error == nil ||
			event.Snapshot.Error.Code != failure.CodeTransportFailure {
			t.Fatalf("fallback error = %#v", event.Snapshot.Error)
		}
	case <-time.After(time.Second):
		t.Fatal("fallback update was not emitted")
	}

	if err := service.close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
}

type fakeDeviceManager struct {
	mu                  sync.Mutex
	snapshot            ctapkit.DeviceSnapshot
	selected            openedAuthenticator
	updates             chan deviceManagerState
	selectFunc          func(context.Context, report.DeviceID) error
	selectEndpointFunc  func(context.Context, report.AttachmentID) error
	closeFunc           func() error
	readSourcesFunc     func(context.Context, report.DeviceID) error
	refreshMetadataFunc func(context.Context, report.AttachmentID, *mds.Client, mds.LookupOptions) (report.EndpointReport, error)
	closeOnce           sync.Once
	openCalls           int
}

func newFakeDeviceManager(
	devices []report.EndpointReport,
	selected openedAuthenticator,
) *fakeDeviceManager {
	snapshot := testTopologySnapshot(devices, "")
	if selected.lifecycle != nil {
		snapshot.SelectedEndpoint = selected.device.Attachment.ID
		snapshot.Selected = report.DeviceID(selected.device.Attachment.ID)
	}

	manager := &fakeDeviceManager{
		snapshot:  snapshot,
		selected:  selected,
		updates:   make(chan deviceManagerState, 8),
		openCalls: 1,
	}
	manager.updates <- deviceManagerState{
		update:  ctapkit.DeviceUpdate{Snapshot: snapshot},
		runtime: selected,
	}

	return manager
}

func staticDeviceManager(manager deviceManagerRuntime) openDeviceManagerFunc {
	return func(
		context.Context,
		transport.Mode,
		...ctapkit.AuthenticatorOption,
	) (deviceManagerRuntime, error) {
		return manager, nil
	}
}

func (m *fakeDeviceManager) State() deviceManagerState {
	m.mu.Lock()
	defer m.mu.Unlock()

	return deviceManagerState{
		update: ctapkit.DeviceUpdate{
			Snapshot: m.snapshot,
		},
		runtime: m.selected,
	}
}

func (m *fakeDeviceManager) Next() (deviceManagerState, bool) {
	state, ok := <-m.updates

	return state, ok
}

func (m *fakeDeviceManager) Select(ctx context.Context, id report.DeviceID) error {
	var err error
	if m.selectFunc != nil {
		err = m.selectFunc(ctx, id)
	}

	m.mu.Lock()
	state := deviceManagerState{
		update: ctapkit.DeviceUpdate{
			Snapshot: m.snapshot,
			Error:    failure.Snapshot(err),
		},
		runtime: m.selected,
	}
	m.mu.Unlock()

	m.updates <- state

	return err
}

func (m *fakeDeviceManager) SelectEndpoint(ctx context.Context, id report.AttachmentID) error {
	err := m.selectEndpointFunc(ctx, id)
	state := m.State()

	state.update.Error = failure.Snapshot(err)
	m.updates <- state

	return err
}

func (m *fakeDeviceManager) RefreshSources(ctx context.Context, id report.DeviceID) error {
	return m.readSourcesFunc(ctx, id)
}

func (m *fakeDeviceManager) RefreshMetadata(ctx context.Context, id report.AttachmentID, client *mds.Client, options mds.LookupOptions) (report.EndpointReport, error) {
	return m.refreshMetadataFunc(ctx, id, client, options)
}

func (m *fakeDeviceManager) Close() error {
	var err error

	m.closeOnce.Do(func() {
		if m.closeFunc != nil {
			err = m.closeFunc()
		}

		close(m.updates)
	})

	return err
}

func (m *fakeDeviceManager) setSelected(selected openedAuthenticator) {
	m.mu.Lock()
	m.selected = selected
	m.mu.Unlock()
}

func (m *fakeDeviceManager) setSnapshot(snapshot ctapkit.DeviceSnapshot) {
	snapshot = testTopologySnapshot(snapshot.Endpoints, snapshot.SelectedEndpoint)

	m.mu.Lock()
	m.snapshot = snapshot
	m.mu.Unlock()
}

func (m *fakeDeviceManager) publish(update ctapkit.DeviceUpdate) {
	update.Snapshot = testTopologySnapshot(update.Snapshot.Endpoints, update.Snapshot.SelectedEndpoint)

	m.mu.Lock()
	m.snapshot = update.Snapshot
	state := deviceManagerState{
		update:  update,
		runtime: m.selected,
	}
	m.mu.Unlock()

	m.updates <- state
}

type emitterFunc func(string, any)

func (emit emitterFunc) Emit(name string, payload any) {
	emit(name, payload)
}

func discoveryEmitter(events chan<- DiscoveryChangedEnvelope) emitterFunc {
	return func(name string, payload any) {
		if name == EventDiscoveryChanged {
			events <- payload.(DiscoveryChangedEnvelope)
		}
	}
}

func testTopologySnapshot(endpoints []report.EndpointReport, selected report.AttachmentID) ctapkit.DeviceSnapshot {
	result := ctapkit.DeviceSnapshot{Endpoints: endpoints, Selected: report.DeviceID(selected), SelectedEndpoint: selected}
	for _, endpoint := range endpoints {
		result.Devices = append(result.Devices, report.DeviceReport{ID: report.DeviceID(endpoint.Attachment.ID), EndpointIDs: []report.AttachmentID{endpoint.Attachment.ID}})
	}

	return result
}
