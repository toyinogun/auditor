"use client";

import { useEffect, useRef } from "react";
import { commandFor, isEditable, type ReviewCommand } from "./review-keys";

/**
 * The review page's one key listener (spec 0008, AC-11). The guards live in `review-keys.ts`;
 * this only reads the DOM facts they need and hands the command back.
 */

const OVERLAY = '[role="dialog"], [role="menu"], [role="alertdialog"]';

const asTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement ? target : null;

export const useReviewKeyboard = (
  saving: boolean,
  onCommand: (command: ReviewCommand) => void,
): void => {
  // Read the latest handler and saving flag without re-adding the listener on every render.
  const latest = useRef({ saving, onCommand });
  useEffect(() => {
    latest.current = { saving, onCommand };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const command = commandFor({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        inField: isEditable(asTarget(event.target)),
        overlayOpen: document.querySelector(OVERLAY) !== null,
        saving: latest.current.saving,
      });
      if (command === null) return;
      event.preventDefault();
      latest.current.onCommand(command);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
};
