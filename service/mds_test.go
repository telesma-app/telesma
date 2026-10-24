package service

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"uuid"

	"github.com/telesma-app/kit/model/failure"
)

func TestLookupMDSPreservesHTTPStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer server.Close()

	service := &Service{}
	_, err := service.LookupMDS(t.Context(), MDSLookupRequest{
		AAGUID: uuid.New().String(), Source: server.URL, CacheDir: t.TempDir(),
	})

	if !failure.IsCode(err, failure.CodeMDSFetchFailed) {
		t.Fatalf("LookupMDS error = %v, want %s", err, failure.CodeMDSFetchFailed)
	}

	snapshot := failure.Snapshot(err)

	if snapshot.Params["httpStatus"] != "429" {
		t.Fatalf("LookupMDS params = %#v, want httpStatus 429", snapshot.Params)
	}
}
