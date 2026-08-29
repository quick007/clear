package backendclient

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeEndpoint(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		input string
		want  string
		err   string
	}{
		"hostport":    {input: "backend:4000", want: "http://backend:4000"},
		"https":       {input: "https://api.example.com/", want: "https://api.example.com"},
		"empty":       {err: "endpoint must not be empty"},
		"credentials": {input: "https://user@example.com", err: "must not include credentials"},
		"unsupported": {input: "ftp://example.com", err: "scheme must be http or https"},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			got, err := NormalizeEndpoint(test.input)
			if test.err != "" {
				require.ErrorContains(t, err, test.err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, test.want, got)
		})
	}
}

func TestPostJSON(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/base/internal/v1/test", r.URL.Path)
		assert.Equal(t, "Bearer service-secret", r.Header.Get("Authorization"))
		assert.Equal(t, "project-1", r.Header.Get("X-Groundtruth-Project-Id"))
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		assert.JSONEq(t, `{"ok":true}`, string(body))
		w.Header().Set("X-Test", "response")
		w.WriteHeader(http.StatusAccepted)
		_, err = w.Write([]byte(`{"accepted":true}`))
		require.NoError(t, err)
	}))
	t.Cleanup(server.Close)

	client, err := New(server.URL+"/base", "service-secret", server.Client())
	require.NoError(t, err)

	headers := make(http.Header)
	headers.Set("X-Groundtruth-Project-Id", "project-1")
	response, err := client.PostJSON(context.Background(), "/internal/v1/test", []byte(`{"ok":true}`), headers)
	require.NoError(t, err)
	assert.Equal(t, http.StatusAccepted, response.StatusCode)
	assert.Equal(t, "response", response.Header.Get("X-Test"))
	assert.JSONEq(t, `{"accepted":true}`, string(response.Body))
}

func TestPostJSONBoundsResponse(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, err := io.WriteString(w, strings.Repeat("x", maxResponseBytes+1))
		require.NoError(t, err)
	}))
	t.Cleanup(server.Close)

	client, err := New(server.URL, "service-secret", server.Client())
	require.NoError(t, err)
	_, err = client.PostJSON(context.Background(), "/test", nil, nil)
	require.ErrorContains(t, err, "response exceeds")
}
