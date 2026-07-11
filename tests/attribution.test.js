import test from "node:test";
import assert from "node:assert/strict";
import { mergeAttributionTouch, parseTrafficAttribution } from "../server/attribution.js";

test("traffic attribution supports canonical Telegram startapp campaign tokens", () => {
  assert.deepEqual(parseTrafficAttribution("tiktok--launch_ru--meme_01--bio"), {
    raw: "tiktok--launch_ru--meme_01--bio",
    source: "tiktok",
    campaign: "launch_ru",
    creative: "meme_01",
    placement: "bio",
    kind: "campaign"
  });
});

test("traffic attribution preserves table invites and referral codes", () => {
  assert.equal(parseTrafficAttribution("tbl_abc_123").kind, "table_invite");
  assert.equal(parseTrafficAttribution("tbl_abc_123").source, "table_invite");
  assert.equal(parseTrafficAttribution("ref_partner_7").kind, "referral");
  assert.equal(parseTrafficAttribution("ref_partner_7").campaign, "partner_7");
});

test("first touch is immutable and a direct reopen does not erase last campaign", () => {
  const first = mergeAttributionTouch(null, parseTrafficAttribution("offline--chelyabinsk--kirovka_a"), "2026-07-11T10:00:00.000Z");
  const reopened = mergeAttributionTouch(first, parseTrafficAttribution(""), "2026-07-12T10:00:00.000Z");
  const later = mergeAttributionTouch(reopened, parseTrafficAttribution("youtube--shorts--holdem_02"), "2026-07-13T10:00:00.000Z");

  assert.equal(later.first.source, "offline");
  assert.equal(later.first.creative, "kirovka_a");
  assert.equal(reopened.last.source, "offline");
  assert.equal(later.last.source, "youtube");
  assert.equal(later.last.campaign, "shorts");
});
