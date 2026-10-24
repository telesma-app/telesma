package service

import (
	"context"
	"testing"
	"time"

	ctapkit "github.com/telesma-app/kit"
	"github.com/telesma-app/kit/model/failure"
	"github.com/telesma-app/kit/model/report"
	"github.com/telesma-app/mds"
)

func TestSourceReadWithoutOperationalSelectionPreservesPartialReport(t *testing.T) {
	emitted := make(chan DiscoveryChangedEnvelope, 1)
	s := New(WithEventEmitter(discoveryEmitter(emitted)))
	device := testDevice("attachment")
	manager := newFakeDeviceManager([]report.EndpointReport{device}, openedAuthenticator{})
	manager.readSourcesFunc = func(_ context.Context, id report.DeviceID) error {
		if id != report.DeviceID(device.Attachment.ID) {
			t.Fatalf("attachment = %s", id)
		}

		if !s.mu.TryLock() {
			t.Fatal("source read holds service lock")
		}
		s.mu.Unlock()

		device.Sources.GetInfo.Outcome = report.Outcome{State: report.SourceFailed, Error: failure.Snapshot(failure.New(failure.CodeTransportFailure))}
		manager.publish(ctapkit.DeviceUpdate{Snapshot: ctapkit.DeviceSnapshot{
			Endpoints:        []report.EndpointReport{device},
			SelectedEndpoint: device.Attachment.ID,
		}})

		return nil
	}
	s.openDeviceManager = staticDeviceManager(manager)

	t.Cleanup(func() { _ = s.close() })

	if err := s.Discover(t.Context()); err != nil {
		t.Fatal(err)
	}

	<-emitted

	if err := s.ReadSources(t.Context(), SelectionRequest{DeviceID: report.DeviceID(device.Attachment.ID)}); err != nil {
		t.Fatal(err)
	}

	select {
	case event := <-emitted:
		result := event.Snapshot.Endpoints[0]
		if result.Attachment.ID != device.Attachment.ID || result.Sources.GetInfo.Error == nil {
			t.Fatalf("partial report = %+v", result)
		}
	case <-time.After(time.Second):
		t.Fatal("source update was not emitted")
	}
}

func TestMetadataLookupForwardsRefreshPolicyWithoutServiceLock(t *testing.T) {
	for _, refresh := range []bool{false, true} {
		t.Run(map[bool]string{false: "cache-first", true: "refresh"}[refresh], func(t *testing.T) {
			s := New()
			device := testDevice("attachment")
			manager := newFakeDeviceManager([]report.EndpointReport{device}, openedAuthenticator{})
			manager.refreshMetadataFunc = func(_ context.Context, id report.AttachmentID, _ *mds.Client, options mds.LookupOptions) (report.EndpointReport, error) {
				if id != device.Attachment.ID || options.Refresh != refresh {
					t.Fatalf("lookup = %s, %+v", id, options)
				}

				if !s.mu.TryLock() {
					t.Fatal("metadata lookup holds service lock")
				}
				s.mu.Unlock()

				return device, nil
			}
			s.devices = manager

			t.Cleanup(func() { _ = s.close() })

			if err := s.RefreshMetadata(t.Context(), MetadataRequest{AttachmentID: device.Attachment.ID, Refresh: refresh}); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestSessionSnapshotKeepsViewedAttachmentAfterFailedOpen(t *testing.T) {
	s := New()

	t.Cleanup(func() { _ = s.close() })

	device := testDevice("attachment")

	snapshot := s.applyDeviceUpdate(deviceManagerState{update: ctapkit.DeviceUpdate{
		Snapshot: ctapkit.DeviceSnapshot{Endpoints: []report.EndpointReport{device}, SelectedEndpoint: device.Attachment.ID},
		Error:    failure.Snapshot(failure.New(failure.CodeTransportFailure)),
	}})
	if snapshot.SelectedAttachmentID != device.Attachment.ID || snapshot.Selection != nil {
		t.Fatalf("selection = %+v", snapshot)
	}

	if len(snapshot.Endpoints) != 1 {
		t.Fatalf("devices = %+v", snapshot.Devices)
	}
}

func TestEmptySessionHasConcreteEndpointAndDeviceArrays(t *testing.T) {
	s := New()

	t.Cleanup(func() { _ = s.close() })

	snapshot := s.sessionSnapshotLocked()
	if snapshot.Devices == nil || snapshot.Endpoints == nil {
		t.Fatal("required collection would serialize as null")
	}
}
