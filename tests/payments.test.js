import test from "node:test";
import assert from "node:assert/strict";
import { normalizeExternalInvoiceOrderId } from "../server/payments.js";

test("payment payloads accept the Weez namespace and legacy QWZ orders", () => {
  assert.equal(normalizeExternalInvoiceOrderId("weez:stars_123"), "stars_123");
  assert.equal(normalizeExternalInvoiceOrderId("qwz:stars_legacy"), "stars_legacy");
  assert.equal(normalizeExternalInvoiceOrderId("plain-order"), "plain-order");
  assert.equal(normalizeExternalInvoiceOrderId(""), "");
});
