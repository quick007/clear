import { Delete01Icon, Key01Icon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { errorMessage, formatRelativeTime } from "../../data/format";
import {
  useCreateIngestKey,
  useIngestKeysQuery,
  useOverviewQuery,
  useRevokeIngestKey,
  useRuntimeQuery,
} from "../../data/queries";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { ConfirmDialog } from "../../ui/confirm-dialog";
import { CopyButton } from "../../ui/copy-button";
import { Icon } from "../../ui/icon";
import { ContentState, Page, PageHeader, RetryButton } from "../../ui/page";
import { StatusPill } from "../../ui/status";

export function ProjectSettingsPage() {
  const runtime = useRuntimeQuery();
  const projectId = runtime.data?.projectId ?? null;
  const overview = useOverviewQuery(projectId);
  const keys = useIngestKeysQuery(projectId);
  const createKey = useCreateIngestKey(projectId!);
  const revokeKey = useRevokeIngestKey(projectId!);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [keyToRevoke, setKeyToRevoke] = useState<{
    id: typeof revokeKey.variables;
    name: string;
  } | null>(null);
  const pending =
    !runtime.isError &&
    !overview.isError &&
    !keys.isError &&
    (runtime.isPending || overview.isPending || keys.isPending);
  const failure = runtime.error ?? overview.error ?? keys.error;

  if (pending) {
    return (
      <Page>
        <ContentState kind="loading" title="Loading settings" />
      </Page>
    );
  }
  if (failure || !runtime.data || !projectId || !overview.data || !keys.data) {
    return (
      <Page>
        <ContentState
          actions={
            <RetryButton
              onRetry={() => {
                void runtime.refetch();
                void overview.refetch();
                void keys.refetch();
              }}
            />
          }
          kind="error"
          title="Settings are unavailable"
        >
          {errorMessage(failure)}
        </ContentState>
      </Page>
    );
  }

  const activeKeyCount = keys.data.items.filter((key) => key.status === "active").length;
  const sandbox = runtime.data.mode === "sandbox";

  return (
    <Page>
      <PageHeader
        actions={
          <Button render={<Link to="/connect" />} tone="secondary">
            Connect telemetry
          </Button>
        }
        description={`Manage access to ${overview.data.project.name}.`}
        title="Settings"
      />

      <section {...stylex.props(styles.section)}>
        <header {...stylex.props(styles.sectionHeader)}>
          <span {...stylex.props(styles.sectionIcon)}>
            <Icon icon={Key01Icon} size={17} />
          </span>
          <div {...stylex.props(styles.headerCopy)}>
            <h2 {...stylex.props(styles.headerTitle)}>Ingest keys</h2>
            <p {...stylex.props(styles.headerDescription)}>
              Use separate keys for separate exporters. Up to three can be active.
            </p>
          </div>
          {!sandbox ? (
            <Button
              disabled={createKey.isPending || activeKeyCount >= 3}
              onClick={() =>
                createKey.mutate(`exporter-${activeKeyCount + 1}`, {
                  onSuccess: (result) => setCreatedSecret(result.key),
                })
              }
              tone="secondary"
            >
              {createKey.isPending ? "Creating key" : "Create key"}
            </Button>
          ) : null}
        </header>

        {sandbox ? (
          <div {...stylex.props(styles.loginCard)}>
            <span>Log in to create a project and manage real ingest keys.</span>
            <a
              href="/auth/chatgpt?returnPath=%2Fsettings%2Fproject"
              {...stylex.props(styles.loginLink)}
            >
              Log in with ChatGPT
            </a>
          </div>
        ) : keys.data.items.length === 0 ? (
          <ContentState title="No ingest keys yet" />
        ) : (
          <div {...stylex.props(styles.keyList)}>
            {keys.data.items.map((key) => (
              <article key={key.id} {...stylex.props(styles.keyRow)}>
                <div {...stylex.props(styles.keyIdentity)}>
                  <code {...stylex.props(styles.keyName)}>{key.name}</code>
                  <span {...stylex.props(styles.keyDetail)}>
                    {key.prefix}•••• ·{" "}
                    {key.lastUsedAt ? `used ${formatRelativeTime(key.lastUsedAt)}` : "never used"}
                  </span>
                </div>
                <div {...stylex.props(styles.keyActions)}>
                  <StatusPill tone={key.status === "active" ? "healthy" : "neutral"}>
                    {key.status}
                  </StatusPill>
                  {key.status === "active" ? (
                    <Button
                      compact
                      disabled={revokeKey.isPending && revokeKey.variables === key.id}
                      onClick={() => setKeyToRevoke({ id: key.id, name: key.name })}
                      tone="danger"
                    >
                      <Icon icon={Delete01Icon} size={14} />
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}

        {createdSecret ? (
          <div {...stylex.props(styles.secret)}>
            <span {...stylex.props(styles.secretCopy)}>
              <strong {...stylex.props(styles.secretTitle)}>Copy this key now</strong>
              <code {...stylex.props(styles.secretValue)}>{createdSecret}</code>
            </span>
            <CopyButton label="Copy ingest key" value={createdSecret} />
          </div>
        ) : null}
        {createKey.isError || revokeKey.isError ? (
          <p role="alert" {...stylex.props(styles.error)}>
            {errorMessage(createKey.error ?? revokeKey.error)}
          </p>
        ) : null}
      </section>

      <ConfirmDialog
        confirmLabel="Revoke ingest key"
        description={
          keyToRevoke
            ? `Exporters using ${keyToRevoke.name} will stop sending telemetry immediately. This cannot be undone.`
            : "This ingest key will stop working immediately."
        }
        onConfirm={() => {
          if (!keyToRevoke?.id) return;
          revokeKey.mutate(keyToRevoke.id, { onSuccess: () => setKeyToRevoke(null) });
        }}
        onOpenChange={(open) => {
          if (!open && !revokeKey.isPending) setKeyToRevoke(null);
        }}
        open={keyToRevoke !== null}
        pending={revokeKey.isPending}
        pendingLabel="Revoking key"
        title="Revoke this ingest key?"
      />
    </Page>
  );
}

const styles = stylex.create({
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    marginInlineEnd: "auto",
    maxWidth: 900,
    overflow: "hidden",
    width: "100%",
  },
  sectionHeader: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    gap: space.x3,
    gridTemplateColumns: "36px minmax(0, 1fr) auto",
    padding: space.x5,
  },
  headerCopy: { minWidth: 0 },
  headerTitle: { fontSize: 14, fontWeight: 500, marginBlock: 0 },
  headerDescription: { color: colors.textSubtle, fontSize: 11, marginBlock: 4 },
  sectionIcon: {
    alignItems: "center",
    backgroundColor: colors.amberWash,
    borderRadius: radii.sm,
    color: colors.amber,
    display: "flex",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  loginCard: {
    alignItems: "center",
    color: colors.textMuted,
    display: "flex",
    fontSize: 12,
    gap: space.x5,
    justifyContent: "space-between",
    padding: space.x5,
  },
  loginLink: { color: colors.amber, flexShrink: 0, textDecoration: "none" },
  keyList: { display: "grid" },
  keyRow: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: { default: 1, ":last-child": 0 },
    display: "flex",
    gap: space.x5,
    justifyContent: "space-between",
    padding: space.x4,
  },
  keyIdentity: {
    display: "grid",
    gap: 4,
    minWidth: 0,
  },
  keyName: { color: colors.text, fontSize: 11 },
  keyDetail: { color: colors.textSubtle, fontSize: 10 },
  keyActions: { alignItems: "center", display: "flex", gap: space.x3 },
  secret: {
    alignItems: "center",
    backgroundColor: colors.greenWash,
    borderTopColor: "rgba(52, 211, 153, 0.22)",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    gap: space.x4,
    justifyContent: "space-between",
    padding: space.x4,
  },
  secretCopy: { display: "grid", gap: 4, minWidth: 0 },
  secretTitle: { color: colors.green, fontSize: 11, fontWeight: 500 },
  secretValue: { fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" },
  error: { color: colors.red, fontSize: 11, margin: space.x4 },
});
