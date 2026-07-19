import assert from "node:assert/strict";
import test from "node:test";
import { newestTableSnapshots } from "../server/state-store.js";

test("restart recovery selects the newest table revision across Redis and PostgreSQL", () => {
  const snapshots = newestTableSnapshots(
    [
      { raw: { id: "older-in-redis", stateRevision: 4, marker: "redis" } },
      { raw: { id: "newer-in-redis", stateRevision: 9, marker: "redis" } }
    ],
    [
      { raw: { id: "older-in-redis", stateRevision: 5, marker: "postgres" } },
      { raw: { id: "newer-in-redis", stateRevision: 8, marker: "postgres" } }
    ]
  );

  assert.equal(snapshots.find((snapshot) => snapshot.raw.id === "older-in-redis").raw.marker, "postgres");
  assert.equal(snapshots.find((snapshot) => snapshot.raw.id === "newer-in-redis").raw.marker, "redis");
});

test("PostgreSQL wins equal revisions because wallet and table snapshot commit together", () => {
  const [snapshot] = newestTableSnapshots(
    [{ raw: { id: "table-1", stateRevision: 7, marker: "redis" } }],
    [{ raw: { id: "table-1", stateRevision: 7, marker: "postgres" } }]
  );
  assert.equal(snapshot.source, "PostgreSQL");
  assert.equal(snapshot.raw.marker, "postgres");
});
