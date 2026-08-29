package integration

import (
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"go.opentelemetry.io/collector/pdata/pcommon"
	"go.opentelemetry.io/collector/pdata/plog/plogotlp"
	"go.opentelemetry.io/collector/pdata/pmetric/pmetricotlp"
	"go.opentelemetry.io/collector/pdata/ptrace/ptraceotlp"
)

type fakeBackend struct {
	*httptest.Server
	t                  *testing.T
	projectID          string
	authorizationCount atomic.Int32
	mu                 sync.Mutex
	received           map[string]int
}

func newFakeBackend(t *testing.T, projectID string) *fakeBackend {
	backend := &fakeBackend{t: t, projectID: projectID, received: make(map[string]int)}
	backend.Server = httptest.NewServer(http.HandlerFunc(backend.handle))
	return backend
}

func (b *fakeBackend) handle(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != "Bearer "+serviceToken {
		b.fail(w, "missing service authorization")
		return
	}
	if r.URL.Path == "/internal/v1/ingest/authorize" {
		b.handleAuthorization(w, r)
		return
	}

	signal := filepath.Base(r.URL.Path)
	if r.URL.Path != "/internal/v1/telemetry/"+signal || r.Header.Get("X-Groundtruth-Project-Id") != b.projectID {
		b.fail(w, "invalid telemetry route or project header")
		return
	}
	if r.Header.Get("X-Groundtruth-Ingest-Key") != ingestKey {
		b.fail(w, "authenticated ingest key was not forwarded")
		return
	}
	if r.Header.Get("Content-Encoding") != "gzip" {
		b.fail(w, "telemetry request was not gzip compressed")
		return
	}
	body, err := readPossiblyCompressed(r)
	if err != nil {
		b.fail(w, "read telemetry: %v", err)
		return
	}
	if strings.Contains(string(body), ingestKey) {
		b.fail(w, "ingest key leaked into the telemetry payload")
		return
	}
	itemCount, err := canonicalItemCount(signal, body, b.projectID)
	if err != nil {
		b.fail(w, "%v", err)
		return
	}
	b.mu.Lock()
	b.received[signal] += itemCount
	b.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (b *fakeBackend) handleAuthorization(w http.ResponseWriter, r *http.Request) {
	b.authorizationCount.Add(1)
	var request struct {
		IngestKey string `json:"ingestKey"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil || request.IngestKey != ingestKey {
		http.Error(w, "invalid key", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"projectId": b.projectID})
}

func (b *fakeBackend) fail(w http.ResponseWriter, format string, args ...any) {
	b.t.Errorf(format, args...)
	http.Error(w, "backend assertion failed", http.StatusInternalServerError)
}

func (b *fakeBackend) signalCounts() map[string]int {
	b.mu.Lock()
	defer b.mu.Unlock()
	result := make(map[string]int, len(b.received))
	for signal, count := range b.received {
		result[signal] = count
	}
	return result
}

func waitForSignals(t *testing.T, backend *fakeBackend, expected map[string]int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second) // 5 seconds
	for time.Now().Before(deadline) {
		if assert.ObjectsAreEqual(expected, backend.signalCounts()) {
			return
		}
		time.Sleep(10 * time.Millisecond) // 10 milliseconds
	}
	assert.Equal(t, expected, backend.signalCounts())
}

func canonicalItemCount(signal string, body []byte, projectID string) (int, error) {
	switch signal {
	case "metrics":
		request := pmetricotlp.NewExportRequest()
		if err := request.UnmarshalJSON(body); err != nil {
			return 0, err
		}
		resources := request.Metrics().ResourceMetrics()
		for index := 0; index < resources.Len(); index++ {
			if err := assertResourceProject(resources.At(index).Resource(), projectID); err != nil {
				return 0, err
			}
		}
		return request.Metrics().DataPointCount(), nil
	case "logs":
		request := plogotlp.NewExportRequest()
		if err := request.UnmarshalJSON(body); err != nil {
			return 0, err
		}
		resources := request.Logs().ResourceLogs()
		for index := 0; index < resources.Len(); index++ {
			if err := assertResourceProject(resources.At(index).Resource(), projectID); err != nil {
				return 0, err
			}
		}
		return request.Logs().LogRecordCount(), nil
	case "traces":
		request := ptraceotlp.NewExportRequest()
		if err := request.UnmarshalJSON(body); err != nil {
			return 0, err
		}
		resources := request.Traces().ResourceSpans()
		for index := 0; index < resources.Len(); index++ {
			if err := assertResourceProject(resources.At(index).Resource(), projectID); err != nil {
				return 0, err
			}
		}
		return request.Traces().SpanCount(), nil
	default:
		return 0, fmt.Errorf("unexpected signal %q", signal)
	}
}

func assertResourceProject(resource pcommon.Resource, projectID string) error {
	value, ok := resource.Attributes().Get("groundtruth.project.id")
	if !ok || value.Str() != projectID {
		return fmt.Errorf("resource project attribution was not enforced")
	}
	return nil
}

func readPossiblyCompressed(r *http.Request) ([]byte, error) {
	reader := io.Reader(r.Body)
	if r.Header.Get("Content-Encoding") == "gzip" {
		gzipReader, err := gzip.NewReader(r.Body)
		if err != nil {
			return nil, err
		}
		defer gzipReader.Close()
		reader = gzipReader
	}
	return io.ReadAll(reader)
}
