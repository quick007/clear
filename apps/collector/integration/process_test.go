package integration

import (
	"bytes"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type collectorProcess struct {
	cmd    *exec.Cmd
	output bytes.Buffer
	done   chan error
}

func startCollector(t *testing.T, binary, grpcAddress, httpAddress, healthAddress, backendURL string) *collectorProcess {
	t.Helper()
	configPath, err := filepath.Abs(filepath.Join("..", "testdata", "integration.yaml"))
	require.NoError(t, err)
	cmd := exec.Command(binary, "--config="+configPath)
	cmd.Env = append(os.Environ(),
		"TEST_GRPC_ENDPOINT="+grpcAddress,
		"TEST_HTTP_ENDPOINT="+httpAddress,
		"TEST_HEALTH_ENDPOINT="+healthAddress,
		"TEST_BACKEND_ENDPOINT="+backendURL,
		"TEST_SERVICE_TOKEN="+serviceToken,
	)
	process := &collectorProcess{cmd: cmd, done: make(chan error, 1)}
	cmd.Stdout = &process.output
	cmd.Stderr = &process.output
	require.NoError(t, cmd.Start())
	go func() { process.done <- cmd.Wait() }()
	return process
}

func (p *collectorProcess) stop() {
	_ = p.cmd.Process.Signal(syscall.SIGTERM)
	select {
	case <-p.done:
	case <-time.After(5 * time.Second): // 5 seconds
		_ = p.cmd.Process.Kill()
		<-p.done
	}
}

func waitForHealth(t *testing.T, process *collectorProcess, healthURL string) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second) // 10 seconds
	for time.Now().Before(deadline) {
		response, err := http.Get(healthURL)
		if err == nil && response.StatusCode == http.StatusOK {
			require.NoError(t, response.Body.Close())
			return
		}
		if response != nil {
			_ = response.Body.Close()
		}
		time.Sleep(25 * time.Millisecond) // 25 milliseconds
	}
	t.Fatalf("collector did not become healthy\n%s", process.output.String())
}

func freeAddress(t *testing.T) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	address := listener.Addr().String()
	require.NoError(t, listener.Close())
	return address
}
