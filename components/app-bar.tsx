import Link from "next/link";
import { LoadSampleButton } from "@/app/(app)/_components/load-sample-button";
import { NavLink } from "@/app/(app)/_components/nav-link";

/**
 * The app bar (spec 0007, AC-10; wireframe 1a): 56px of Canvas over a 1px Rule. Product name,
 * then Review and Documents, then Load sample data as the region's one primary button.
 */

type AppBarProps = { readonly decisionCount: number };

export function AppBar({ decisionCount }: AppBarProps) {
  return (
    <header className="border-b border-border bg-neutral">
      <div className="mx-auto flex min-h-14 w-full max-w-app flex-wrap items-center gap-x-6 gap-y-2 px-page py-2 md:flex-nowrap md:py-0">
        <Link
          href="/review"
          className="type-headline-sm whitespace-nowrap text-on-surface no-underline"
        >
          Overpayment Auditor
        </Link>
        <nav aria-label="Main">
          <ul className="flex items-center gap-2">
            <li>
              <NavLink href="/review">Review</NavLink>
            </li>
            <li>
              <NavLink href="/documents">Documents</NavLink>
            </li>
          </ul>
        </nav>
        <div className="ml-auto">
          <LoadSampleButton decisionCount={decisionCount} />
        </div>
      </div>
    </header>
  );
}
