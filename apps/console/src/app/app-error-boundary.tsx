import * as stylex from "@stylexjs/stylex";
import { Effect } from "effect";
import { Component, type ErrorInfo, type ReactNode, useEffect } from "react";

import { reportConsoleFailure } from "../errors";
import { colors, space } from "../theme/tokens.stylex";
import { Button } from "../ui/button";
import { ContentState, Page } from "../ui/page";

type RecoverySurfaceProps = {
  copy: string;
  onRetry?: () => void;
  title: string;
};

export function RecoverySurface({ copy, onRetry, title }: RecoverySurfaceProps) {
  return (
    <div {...stylex.props(styles.frame)}>
      <Page>
        <ContentState
          actions={
            <>
              {onRetry ? (
                <Button onClick={onRetry} tone="primary">
                  Try again
                </Button>
              ) : null}
              <Button render={<a href="/board" />} tone="secondary">
                Go to board
              </Button>
            </>
          }
          kind="error"
          title={title}
        >
          {copy}
        </ContentState>
      </Page>
    </div>
  );
}

export function RouteErrorSurface({ error, reset }: { error: unknown; reset: () => void }) {
  useEffect(() => {
    Effect.runSync(reportConsoleFailure("Route rendering failed", error));
  }, [error]);

  return (
    <RecoverySurface
      copy="Clear could not finish loading this view. Your telemetry and incident data are unchanged."
      onRetry={reset}
      title="This view is unavailable"
    />
  );
}

export function NotFoundSurface() {
  return (
    <RecoverySurface
      copy="That page is not available. It may have moved, or the link may be incomplete."
      title="Page not found"
    />
  );
}

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { failed: boolean };

export class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    Effect.runSync(
      reportConsoleFailure("Component rendering failed", {
        cause: error,
        componentStack: info.componentStack,
      }),
    );
  }

  retry = () => {
    this.setState({ failed: false });
  };

  render() {
    if (this.state.failed) {
      return (
        <RecoverySurface
          copy="Clear could not finish loading this view. Your telemetry and incident data are unchanged."
          onRetry={this.retry}
          title="This view is unavailable"
        />
      );
    }
    return this.props.children;
  }
}

const styles = stylex.create({
  frame: {
    backgroundColor: colors.canvas,
    color: colors.text,
    minHeight: "100vh",
    paddingTop: space.x6,
  },
});
