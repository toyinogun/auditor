"use client";

import { DatabaseIcon, LoaderCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { loadSampleData } from "@/app/actions";
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
import { reloadWarning } from "./reload-warning";

/**
 * Load sample data (spec 0007, AC-12, AC-13): the app bar's one primary button. With saved
 * decisions it asks first, since a reload clears them; with none it runs at once. On success it
 * goes to /review, where the tiles show the new run.
 */

const UNREACHABLE = "could not reach the server, try again";

type LoadSampleButtonProps = { readonly decisionCount: number };

export function LoadSampleButton({ decisionCount }: LoadSampleButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setConfirming(false);
    setLoading(true);
    setError(null);
    try {
      const result = await loadSampleData();
      if (result.ok) router.push("/review");
      else setError(result.error);
    } catch {
      setError(UNREACHABLE);
    } finally {
      setLoading(false);
    }
  };

  const onPress = (): void => {
    if (decisionCount > 0) setConfirming(true);
    else void load();
  };

  return (
    <div className="flex items-center gap-3">
      {error && (
        <p role="alert" className="type-caption text-error">
          {error}
        </p>
      )}
      <Button onClick={onPress} disabled={loading} aria-busy={loading}>
        {loading ? (
          <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
        ) : (
          <DatabaseIcon aria-hidden="true" />
        )}
        {loading ? "Loading sample…" : "Load sample data"}
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reload the sample data?</DialogTitle>
            <DialogDescription>
              {reloadWarning(decisionCount)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => void load()}>
              Reload sample
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
