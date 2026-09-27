"use client";

import { LoaderCircleIcon, XIcon } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DECISION_REASON_MAX_LENGTH } from "@/lib/schemas/finding";
import { reasonProblem } from "./decision";

/**
 * The reject dialog (spec 0008, AC-9): a required reason of at most 500 characters. A blank
 * reason shows the error under the field and moves focus back to it, with no action call.
 */

type RejectDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly amountCents: number;
  readonly saving: boolean;
  /** An error from the server's own check, shown under the field. */
  readonly serverError: string | null;
  readonly onReject: (reason: string) => void;
};

export function RejectDialog({
  open,
  onOpenChange,
  title,
  amountCents,
  saving,
  serverError,
  onReject,
}: RejectDialogProps) {
  const fieldId = useId();
  const errorId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const error = localError ?? serverError;

  const changeOpen = (next: boolean): void => {
    if (saving) return;
    if (!next) {
      setReason("");
      setLocalError(null);
    }
    onOpenChange(next);
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const problem = reasonProblem(reason);
    setLocalError(problem);
    if (problem !== null) {
      field.current?.focus();
      return;
    }
    onReject(reason);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Reject this finding?</DialogTitle>
            <DialogDescription>
              {title} ·{" "}
              <Money cents={amountCents} className="text-on-surface" />
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={fieldId} className="type-label-md">
              Reason
            </label>
            <Textarea
              ref={field}
              id={fieldId}
              name="reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (localError) setLocalError(null);
              }}
              maxLength={DECISION_REASON_MAX_LENGTH}
              required
              aria-required="true"
              aria-invalid={error !== null}
              aria-describedby={error !== null ? errorId : undefined}
              placeholder="Credit note CN-12 already covers this"
              disabled={saving}
            />
            {error !== null && (
              <p id={errorId} className="type-caption text-error">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" disabled={saving}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="destructive"
              disabled={saving}
              aria-busy={saving}
            >
              {saving ? (
                <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
              ) : (
                <XIcon aria-hidden="true" />
              )}
              Reject
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
