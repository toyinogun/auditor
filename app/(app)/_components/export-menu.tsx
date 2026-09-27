"use client";

import { ChevronDownIcon, DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Export (spec 0009, AC-1, AC-2): the app bar's secondary button. It opens a menu of two plain
 * download links to `/api/export`, so choosing one downloads the file without leaving the page.
 * With no audit run it is disabled, and a focusable wrapper keeps its tooltip reachable.
 */

const FORMATS = [
  { format: "xlsx", label: "Excel (.xlsx)" },
  { format: "csv", label: "CSV (.csv)" },
] as const;

const NO_RUN_HINT = "Load sample data first";

type ExportMenuProps = { readonly canExport: boolean };

function ExportButtonFace() {
  return (
    <>
      <DownloadIcon aria-hidden="true" />
      Export
      <ChevronDownIcon aria-hidden="true" />
    </>
  );
}

function DisabledExport() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`Export, unavailable. ${NO_RUN_HINT}`}
          className="inline-flex rounded-md"
        >
          <Button
            variant="secondary"
            disabled
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none"
          >
            <ExportButtonFace />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{NO_RUN_HINT}</TooltipContent>
    </Tooltip>
  );
}

export function ExportMenu({ canExport }: ExportMenuProps) {
  if (!canExport) return <DisabledExport />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary">
          <ExportButtonFace />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {FORMATS.map(({ format, label }) => (
          <DropdownMenuItem key={format} asChild>
            <a href={`/api/export?format=${format}`} download>
              {label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
