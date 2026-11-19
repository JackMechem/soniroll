import { useEffect, useRef } from "react";
import { keyIsForPane, usePaneElement } from "@/lib/paneContext";

/** Calls `toggle` when Space is pressed anywhere except in text fields, dialogs or open menus. A
    number field on the page (the Metronome's BPM) can't take a space, so there Space still starts
    and stops (and the field lets go of focus, so a half-typed number settles). In split screen,
    only the pane with focus (or the one last clicked) reacts, not every tool on screen. */
export function useSpaceToggle(toggle: () => void, enabled = true) {
  const pane = usePaneElement();
  const toggleRef = useRef(toggle);
  useEffect(() => {
    toggleRef.current = toggle;
  });

  useEffect(() => {
    if (!enabled) return;
    function isSpaceForControl(target: HTMLElement) {
      if (target.closest("[role='dialog'], [role='alertdialog']")) return true;
      if (target.closest("textarea, [role='listbox']")) return true;
      if (target.closest("[role='combobox'][aria-expanded='true']")) return true;
      return target instanceof HTMLInputElement && target.type !== "range" && !isNumberField(target);
    }
    function isNumberField(target: HTMLElement) {
      return target instanceof HTMLInputElement && (target.type === "number" || target.inputMode === "numeric" || target.inputMode === "decimal");
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" || e.repeat || isSpaceForControl(e.target as HTMLElement)) return;
      if (!keyIsForPane(pane, e)) return;
      e.preventDefault();
      if (isNumberField(e.target as HTMLElement)) (e.target as HTMLInputElement).blur();
      toggleRef.current();
    }
    // Buttons click on space keyup; suppress that so focus doesn't trigger them.
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== "Space" || isSpaceForControl(e.target as HTMLElement) || !keyIsForPane(pane, e)) return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [enabled, pane]);
}
