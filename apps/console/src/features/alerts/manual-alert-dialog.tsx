import { CreateManualAlertRequest } from "@groundtruth/api-contract";
import {
  AlertName,
  NonEmptyText,
  ServiceName,
  type AlertSeverity,
  type ProjectId,
} from "@groundtruth/domain";
import { Alert02Icon, Cancel01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { Dialog } from "@base-ui/react/dialog";
import * as stylex from "@stylexjs/stylex";
import { useRef, useState, type FormEvent } from "react";

import { useCreateManualAlert, useManualAlertsQuery } from "../../data/queries";
import { mutationOutcomeIsUnknown } from "../../errors";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { Icon } from "../../ui/icon";
import { MutationFailureNotice } from "../../ui/mutation-failure-notice";
import { SelectControl } from "../../ui/select";

const severityOptions = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
] as const;

export function ManualAlertDialog({
  projectId,
  services,
}: {
  projectId: ProjectId;
  services: ReadonlyArray<string>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [service, setService] = useState<string | null>(null);
  const [severity, setSeverity] = useState<AlertSeverity>("warning");
  const [attempted, setAttempted] = useState(false);
  const createAlert = useCreateManualAlert(projectId);
  const alerts = useManualAlertsQuery(projectId);
  const knownAlertIds = useRef<ReadonlySet<string>>(new Set());
  const attemptedAlert = useRef({
    context: "",
    service: null as string | null,
    severity,
    title: "",
  });
  const titleIssue = title.trim().length === 0 ? "Describe what needs attention." : null;
  const outcomeUnknown = createAlert.isError && mutationOutcomeIsUnknown(createAlert.error);

  const onOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && (createAlert.isPending || outcomeUnknown)) return;
    if (nextOpen && !outcomeUnknown) {
      setTitle("");
      setContext("");
      setService(null);
      setSeverity("warning");
      setAttempted(false);
      createAlert.reset();
    }
    setOpen(nextOpen);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (titleIssue || outcomeUnknown) return;
    const trimmedContext = context.trim();
    knownAlertIds.current = new Set(alerts.data?.items.map((alert) => alert.id) ?? []);
    attemptedAlert.current = {
      context: trimmedContext,
      service,
      severity,
      title: title.trim(),
    };
    createAlert.mutate(
      CreateManualAlertRequest.make({
        context: trimmedContext ? NonEmptyText.make(trimmedContext) : undefined,
        serviceName: service ? ServiceName.make(service) : undefined,
        severity,
        title: AlertName.make(title.trim()),
      }),
      { onSuccess: () => setOpen(false) },
    );
  };

  return (
    <Dialog.Root
      disablePointerDismissal={createAlert.isPending || outcomeUnknown}
      onOpenChange={onOpenChange}
      open={open}
    >
      <Dialog.Trigger
        render={
          <Button tone="primary">
            <Icon icon={PlusSignIcon} size={16} />
            Create alert
          </Button>
        }
      />
      <Dialog.Portal>
        <Dialog.Backdrop {...stylex.props(styles.backdrop)} />
        <Dialog.Popup {...stylex.props(styles.popup)}>
          <form onSubmit={submit} {...stylex.props(styles.form)}>
            <header {...stylex.props(styles.header)}>
              <span {...stylex.props(styles.headerIcon)}>
                <Icon icon={Alert02Icon} size={18} />
              </span>
              <div {...stylex.props(styles.heading)}>
                <Dialog.Title {...stylex.props(styles.title)}>Create an alert</Dialog.Title>
                <Dialog.Description {...stylex.props(styles.description)}>
                  Capture something that needs investigation now.
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label="Close alert form"
                disabled={createAlert.isPending || outcomeUnknown}
                {...stylex.props(styles.close)}
              >
                <Icon icon={Cancel01Icon} size={18} />
              </Dialog.Close>
            </header>

            <div {...stylex.props(styles.content)}>
              <label {...stylex.props(styles.field)}>
                <span>What is happening?</span>
                <input
                  aria-invalid={attempted && titleIssue !== null}
                  autoFocus
                  maxLength={120}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                  placeholder="Checkout latency is elevated"
                  value={title}
                  {...stylex.props(styles.input)}
                />
                {attempted && titleIssue ? (
                  <small {...stylex.props(styles.fieldError)}>{titleIssue}</small>
                ) : null}
              </label>

              <fieldset {...stylex.props(styles.severityFieldset)}>
                <legend {...stylex.props(styles.fieldLabel)}>Severity</legend>
                <div {...stylex.props(styles.severityGrid)}>
                  {severityOptions.map((option) => (
                    <button
                      aria-pressed={severity === option.value}
                      key={option.value}
                      onClick={() => setSeverity(option.value)}
                      type="button"
                      {...stylex.props(
                        styles.severity,
                        severity === option.value && styles.severitySelected,
                      )}
                    >
                      <span {...stylex.props(styles.severityDot, severityTones[option.value])} />
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {services.length > 0 ? (
                <label {...stylex.props(styles.field)}>
                  <span>Service</span>
                  <SelectControl
                    ariaLabel="Service"
                    onChange={setService}
                    options={[
                      { label: "All services", value: "" },
                      ...services.map((name) => ({ label: name, value: name })),
                    ]}
                    placeholder="All services"
                    value={service ?? ""}
                  />
                </label>
              ) : null}

              <label {...stylex.props(styles.field)}>
                <span>
                  Context <small {...stylex.props(styles.optional)}>Optional</small>
                </span>
                <textarea
                  maxLength={500}
                  onChange={(event) => setContext(event.currentTarget.value)}
                  placeholder="Add anything the investigator should know."
                  rows={4}
                  value={context}
                  {...stylex.props(styles.textarea)}
                />
              </label>

              {createAlert.isError ? (
                <MutationFailureNotice
                  checkLabel="Check current alerts"
                  checking={alerts.isFetching}
                  error={createAlert.error}
                  onCheckState={() => {
                    void alerts.refetch().then((result) => {
                      if (!result.isSuccess) return;
                      const attempted = attemptedAlert.current;
                      const matches = result.data.items.filter(
                        (alert) =>
                          !knownAlertIds.current.has(alert.id) &&
                          alert.title === attempted.title &&
                          alert.context === (attempted.context || null) &&
                          alert.serviceName === attempted.service &&
                          alert.severity === attempted.severity,
                      );
                      if (matches.length > 1) return;
                      createAlert.reset();
                      if (matches.length === 1) setOpen(false);
                    });
                  }}
                />
              ) : null}
            </div>

            <footer {...stylex.props(styles.footer)}>
              <Dialog.Close
                disabled={createAlert.isPending || outcomeUnknown}
                render={<Button tone="ghost">Cancel</Button>}
              />
              <Button
                disabled={createAlert.isPending || outcomeUnknown}
                tone="primary"
                type="submit"
              >
                {createAlert.isPending ? "Creating alert" : "Create alert"}
              </Button>
            </footer>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const severityTones = stylex.create({
  info: { backgroundColor: colors.blue },
  warning: { backgroundColor: colors.amber },
  critical: { backgroundColor: colors.red },
});

const styles = stylex.create({
  backdrop: { backgroundColor: colors.overlay, inset: 0, position: "fixed", zIndex: 90 },
  popup: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    left: "50%",
    maxHeight: "calc(100dvh - 32px)",
    maxWidth: "calc(100vw - 32px)",
    overflow: "hidden",
    position: "fixed",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: 500,
    zIndex: 100,
  },
  form: {
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr) auto",
    maxHeight: "calc(100dvh - 32px)",
  },
  header: {
    alignItems: "start",
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    gap: space.x3,
    gridTemplateColumns: "36px minmax(0, 1fr) 36px",
    padding: space.x5,
  },
  headerIcon: {
    alignItems: "center",
    backgroundColor: colors.amberWash,
    borderRadius: radii.sm,
    color: colors.amber,
    display: "flex",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  heading: { minWidth: 0 },
  title: { fontSize: 18, fontWeight: 500, marginBlock: 0 },
  description: { color: colors.textMuted, fontSize: 12, marginBlock: 4 },
  close: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": colors.whiteWash },
    borderColor: "transparent",
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.textMuted,
    cursor: "pointer",
    display: "flex",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  content: {
    display: "grid",
    gap: space.x5,
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: space.x5,
  },
  field: { color: colors.textMuted, display: "grid", fontSize: 11, gap: space.x2 },
  fieldLabel: { color: colors.textMuted, fontSize: 11 },
  fieldError: { color: colors.red, fontSize: 10 },
  optional: { color: colors.textSubtle, fontSize: 9, marginLeft: space.x1 },
  input: {
    backgroundColor: colors.canvas,
    borderColor: colors.lineStrong,
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    height: 44,
    paddingInline: space.x3,
    width: "100%",
    "[aria-invalid='true']": { borderColor: colors.red },
  },
  textarea: {
    backgroundColor: colors.canvas,
    borderColor: colors.lineStrong,
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    lineHeight: 1.5,
    padding: space.x3,
    resize: "vertical",
    width: "100%",
  },
  severityFieldset: { borderWidth: 0, margin: 0, padding: 0 },
  severityGrid: {
    display: "grid",
    gap: space.x2,
    gridTemplateColumns: "repeat(3, 1fr)",
    marginTop: space.x2,
  },
  severity: {
    alignItems: "center",
    backgroundColor: { default: colors.canvas, ":hover": colors.surfaceHover },
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.textMuted,
    cursor: "pointer",
    display: "flex",
    fontSize: 11,
    gap: space.x2,
    height: 40,
    justifyContent: "center",
  },
  severitySelected: {
    backgroundColor: colors.surfaceHover,
    borderColor: colors.lineStrong,
    color: colors.text,
  },
  severityDot: { borderRadius: radii.pill, height: 7, width: 7 },
  error: { color: colors.red, fontSize: 11, marginBlock: 0 },
  footer: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    gap: space.x2,
    justifyContent: "flex-end",
    padding: space.x5,
  },
});
