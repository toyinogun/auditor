"use client";

import { DownloadIcon, InfoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** The floating pieces, each one openable (spec 0007, AC-9). Demo copy from wireframes 1f, 1g. */
export function Overlays() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="secondary">Open dialog</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this finding?</DialogTitle>
            <DialogDescription>
              BW-5521 · Surcharge not permitted
            </DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-1.5 type-label-md">
            Reason
            <Textarea aria-invalid="true" aria-describedby="reason-error" />
          </label>
          <p id="reason-error" className="-mt-2 type-caption text-error">
            A reason is required to reject a finding
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button variant="destructive">Reject finding</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary">
            <DownloadIcon aria-hidden="true" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Download</DropdownMenuLabel>
          <DropdownMenuItem>
            <span className="flex flex-col">
              Claim list (.xlsx)
              <span className="type-caption text-on-surface-muted">
                approved findings and a total row
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <span className="flex flex-col">
              Finding log (.csv)
              <span className="type-caption text-on-surface-muted">
                every finding, with decisions
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" aria-label="About this finding">
            <InfoIcon aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>About this finding</TooltipContent>
      </Tooltip>
    </div>
  );
}
