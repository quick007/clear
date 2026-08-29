package backendclient

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

const maxResponseBytes = 64 * 1024

type Client struct {
	baseURL      string
	httpClient   *http.Client
	serviceToken string
}

type Response struct {
	StatusCode int
	Header     http.Header
	Body       []byte
}

func New(endpoint, serviceToken string, httpClient *http.Client) (*Client, error) {
	baseURL, err := NormalizeEndpoint(endpoint)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(serviceToken) == "" {
		return nil, errors.New("service_token must not be empty")
	}
	if httpClient == nil {
		return nil, errors.New("HTTP client must not be nil")
	}

	return &Client{
		baseURL:      baseURL,
		httpClient:   httpClient,
		serviceToken: serviceToken,
	}, nil
}

func NormalizeEndpoint(endpoint string) (string, error) {
	normalized := strings.TrimSpace(endpoint)
	if normalized == "" {
		return "", errors.New("endpoint must not be empty")
	}
	if !strings.Contains(normalized, "://") {
		normalized = "http://" + normalized
	}

	parsed, err := url.Parse(normalized)
	if err != nil {
		return "", fmt.Errorf("parse endpoint: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("endpoint scheme must be http or https, got %q", parsed.Scheme)
	}
	if parsed.Host == "" {
		return "", errors.New("endpoint must include a host")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("endpoint must not include credentials, a query, or a fragment")
	}

	return strings.TrimRight(parsed.String(), "/"), nil
}

func (c *Client) PostJSON(ctx context.Context, path string, body []byte, headers http.Header) (Response, error) {
	requestURL, err := url.JoinPath(c.baseURL, path)
	if err != nil {
		return Response{}, fmt.Errorf("join backend path: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(body))
	if err != nil {
		return Response{}, fmt.Errorf("create backend request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.serviceToken)
	req.Header.Set("Content-Type", "application/json")
	for key, values := range headers {
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return Response{}, fmt.Errorf("send backend request: %w", err)
	}

	responseBody, readErr := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes+1))
	closeErr := resp.Body.Close()
	if readErr != nil {
		return Response{}, fmt.Errorf("read backend response: %w", readErr)
	}
	if closeErr != nil {
		return Response{}, fmt.Errorf("close backend response: %w", closeErr)
	}
	if len(responseBody) > maxResponseBytes {
		return Response{}, fmt.Errorf("backend response exceeds %d bytes", maxResponseBytes)
	}

	return Response{
		StatusCode: resp.StatusCode,
		Header:     resp.Header.Clone(),
		Body:       responseBody,
	}, nil
}

func (c *Client) CloseIdleConnections() {
	c.httpClient.CloseIdleConnections()
}
