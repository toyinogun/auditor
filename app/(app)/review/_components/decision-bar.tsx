"use client";

import { CheckIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { decideFinding, type DecideFindingResult } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { DecisionState } from "@/lib/schemas/finding";
import {
  alertShows,
  type BarAlert,
  findingHref,
  NOT_SAVED,
  REASON_REQUIRED,
  STALE_FINDING,
  UNREACHABLE,
} from "./decision";
import { RejectDialog } from "./reject-dialog";
import { neighbourKey, type ReviewCommand } from "./review-keys";
import { useReviewKeyboard } from "./use-review-keyboard";

/**
 * The decision bar (spec 0008, AC-7 to AC-12): Approve and Reject for the selected finding, the
 * reject dialog, and the page's keyboard. After a decision it moves to the next pending finding
 * with `router.replace`, so history keeps only the rows the analyst clicked.
 */

type DecisionBarProps = {
  readonly findingKey: string;
  readonly title: string;
  readonly amountCents: number;
  readonly decision: DecisionState;
  /** Every finding key in table order, for ↑ and ↓. */
  readonly findingKeys: readonly string[];
};

type Saving = "approved" | "rejected" | null;

const SELECTED_ROW = '[data-finding-row][aria-current="true"]';

export function DecisionBar({
  findingKey,
  title,
  amountCents,
  decision,
  findingKeys,
}: DecisionBarProps) {
  const router = useRouter();
  const findingParam = useSearchParams().get("finding");
  const [saving, setSaving] = useState<Saving>(null);
  const [rejecting, setRejecting] = useState(false);
  const [alert, setAlert] = useState<BarAlert | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);

  // Keep the selected row in view after ↑ ↓ or a move to the next pending finding.
  useEffect(() => {
    document.querySelector(SELECTED_ROW)?.scrollIntoView({ block: "nearest" });
  }, [findingKey]);

  const go = (key: string): void =>
    router.replace(findingHref(key), { scroll: false });

  const raise = (text: string, stale = false): void =>
    setAlert({ text, raisedFor: findingKey, stale });

  const settle = (result: DecideFindingResult): void => {
    if (result.ok) {
      setRejecting(false);
      if (result.value.nextFindingKey !== null) {
        go(result.value.nextFindingKey);
      }
      return;
    }
    if (result.error.code === "finding_not_found") {
      setRejecting(false);
      raise(STALE_FINDING, true);
    } else if (rejecting) {
      setReasonError(REASON_REQUIRED);
    } else {
      raise(NOT_SAVED);
    }
  };

  const decide = async (
    status: "approved" | "rejected",
    reason: string | null,
  ): Promise<void> => {
    setSaving(status);
    setAlert(null);
    setReasonError(null);
    try {
      settle(await decideFinding({ findingKey, status, reason }));
    } catch {
      if (rejecting) setReasonError(UNREACHABLE);
      else raise(UNREACHABLE);
    } finally {
      setSaving(null);
    }
  };

  const approve = (): void => {
    if (decision.status !== "approved") void decide("approved", null);
  };
  const openReject = (): void => {
    if (decision.status !== "rejected") {
      setReasonError(null);
      setRejecting(true);
    }
  };

  useReviewKeyboard(saving !== null, (command: ReviewCommand) => {
    if (command === "approve") approve();
    else if (command === "reject") openReject();
    else {
      const next = neighbourKey(findingKeys, findingKey, command);
      if (next !== null) {
        setAlert(null);
        go(next);
      }
    }
  });

  const busy = saving !== null;
  return (
    <div className="flex flex-col gap-3 border-t border-border bg-surface py-4 lg:sticky lg:bottom-0">
      {decision.status === "rejected" && decision.reason !== null && (
        <p className="type-body-md">
          <span className="type-label-md">Rejected:</span> {decision.reason}
        </p>
      )}
      {alert !== null && alertShows(alert, { findingKey, findingParam }) && (
        <p role="alert" className="type-caption text-error">
          {alert.text}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={approve}
          disabled={busy || decision.status === "approved"}
          aria-busy={saving === "approved"}
          aria-keyshortcuts="A"
        >
          {saving === "approved" ? (
            <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
          ) : (
            <CheckIcon aria-hidden="true" />
          )}
          Approve
        </Button>
        <Button
          variant="secondary"
          onClick={openReject}
          disabled={busy || decision.status === "rejected"}
          aria-busy={saving === "rejected"}
          aria-keyshortcuts="R"
        >
          {saving === "rejected" ? (
            <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
          ) : (
            <XIcon aria-hidden="true" />
          )}
          Reject
        </Button>
      </div>
      <RejectDialog
        // A new finding or a stored decision starts the reason afresh.
        key={`${findingKey}:${decision.status}`}
        open={rejecting}
        onOpenChange={setRejecting}
        title={title}
        amountCents={amountCents}
        saving={saving === "rejected"}
        serverError={reasonError}
        onReject={(reason) => void decide("rejected", reason)}
      />
    </div>
  );
}
