import { describe, expect, it } from "vitest";
import {
  commandFor,
  isEditable,
  neighbourKey,
  type KeyPress,
} from "./review-keys";

const press = (key: string, overrides: Partial<KeyPress> = {}): KeyPress => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  inField: false,
  overlayOpen: false,
  saving: false,
  ...overrides,
});

describe("commandFor (spec 0008, AC-11)", () => {
  it.each([
    ["ArrowUp", "previous"],
    ["ArrowDown", "next"],
    ["a", "approve"],
    ["A", "approve"],
    ["r", "reject"],
    ["R", "reject"],
  ] as const)("maps %s to %s", (key, command) => {
    expect(commandFor(press(key))).toBe(command);
  });

  it("ignores other keys", () => {
    expect(commandFor(press("x"))).toBeNull();
    expect(commandFor(press("Enter"))).toBeNull();
  });

  it("ignores keys typed in a field, so A in the reason types a letter", () => {
    expect(commandFor(press("a", { inField: true }))).toBeNull();
    expect(commandFor(press("ArrowDown", { inField: true }))).toBeNull();
  });

  it("ignores keys while a dialog or menu is open", () => {
    expect(commandFor(press("r", { overlayOpen: true }))).toBeNull();
  });

  it("ignores keys while a decision is saving", () => {
    expect(commandFor(press("a", { saving: true }))).toBeNull();
    expect(commandFor(press("ArrowDown", { saving: true }))).toBeNull();
  });

  it.each(["ctrlKey", "metaKey", "altKey"] as const)(
    "ignores keys with %s held",
    (modifier) => {
      expect(commandFor(press("a", { [modifier]: true }))).toBeNull();
    },
  );
});

describe("neighbourKey (spec 0008, AC-11)", () => {
  const keys = ["a", "b", "c"];

  it("moves to the previous or next row", () => {
    expect(neighbourKey(keys, "b", "previous")).toBe("a");
    expect(neighbourKey(keys, "b", "next")).toBe("c");
  });

  it("stays put at either end", () => {
    expect(neighbourKey(keys, "a", "previous")).toBeNull();
    expect(neighbourKey(keys, "c", "next")).toBeNull();
  });

  it("does nothing for a key not in the list", () => {
    expect(neighbourKey(keys, "gone", "next")).toBeNull();
  });
});

describe("isEditable", () => {
  it.each([
    [{ tagName: "INPUT", isContentEditable: false }, true],
    [{ tagName: "TEXTAREA", isContentEditable: false }, true],
    [{ tagName: "SELECT", isContentEditable: false }, true],
    [{ tagName: "DIV", isContentEditable: true }, true],
    [{ tagName: "A", isContentEditable: false }, false],
    [null, false],
  ])("reads %j as %s", (target, expected) => {
    expect(isEditable(target)).toBe(expected);
  });
});
