import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSampleAudit } from "@/lib/audit/sample";
import { listFindings } from "@/lib/db/audit";
import { openDb, type Db } from "@/lib/db/client";
import { TEST_NOW } from "@/lib/db/testing";

/** The review screen's one Server Action over an in memory database (spec 0008). */

const mocks = vi.hoisted(() => ({
  db: null as Db | null,
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/client")>()),
  getDb: () => {
    if (mocks.db === null) throw new Error("no test database");
    return mocks.db;
  },
}));

const { decideFinding } = await import("./actions");

describe("decideFinding", () => {
  let keys: readonly string[];

  beforeEach(() => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    mocks.revalidatePath.mockClear();
    mocks.db = openDb(":memory:");
    runSampleAudit(mocks.db, () => TEST_NOW);
    keys = listFindings(mocks.db).map((finding) => finding.findingKey);
  });

  it("approves, revalidates and returns the next pending key (AC-8)", async () => {
    await expect(
      decideFinding({ findingKey: keys[0], status: "approved", reason: null }),
    ).resolves.toEqual({
      ok: true,
      value: { status: "approved", nextFindingKey: keys[1] },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("refuses a blank reason without revalidating (AC-9)", async () => {
    await expect(
      decideFinding({ findingKey: keys[0], status: "rejected", reason: " " }),
    ).resolves.toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates on a stale key and saves nothing (AC-12)", async () => {
    await expect(
      decideFinding({ findingKey: "gone", status: "approved", reason: null }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "finding_not_found" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledOnce();
  });

  it("ignores an amount sent by a crafted call", async () => {
    const crafted = {
      findingKey: keys[0],
      status: "approved",
      reason: null,
      amountCents: 1,
    } as const;
    await decideFinding(crafted);
    const [first] = listFindings(mocks.db as Db);
    expect(first.decision.status).toBe("approved");
  });
});
