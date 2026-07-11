const MAX_START_PARAM_LENGTH = 512;
const TOKEN_PATTERN = /[^a-z0-9_-]+/g;

export function parseTrafficAttribution(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, MAX_START_PARAM_LENGTH)
    .replace(TOKEN_PATTERN, "")
    .replace(/^-+|-+$/g, "");

  if (!raw) return directAttribution();

  if (/^tbl_[a-z0-9_-]+$/.test(raw)) {
    return {
      raw,
      source: "table_invite",
      campaign: "private_or_direct_table",
      creative: "",
      placement: "telegram_startapp",
      kind: "table_invite"
    };
  }

  if (/^ref_[a-z0-9_-]+$/.test(raw)) {
    return {
      raw,
      source: "referral",
      campaign: raw.slice(4),
      creative: "",
      placement: "telegram_startapp",
      kind: "referral"
    };
  }

  const canonicalParts = raw.split("--").filter(Boolean);
  if (canonicalParts.length > 1) {
    const [source, campaign = "", creative = "", placement = ""] = canonicalParts;
    return {
      raw,
      source: slug(source, "unknown"),
      campaign: slug(campaign),
      creative: slug(creative),
      placement: slug(placement, "telegram_startapp"),
      kind: "campaign"
    };
  }

  const legacyParts = raw.split("_").filter(Boolean);
  return {
    raw,
    source: slug(legacyParts[0], "unknown"),
    campaign: slug(legacyParts[1]),
    creative: slug(legacyParts.slice(2).join("_")),
    placement: "telegram_startapp",
    kind: "campaign"
  };
}

export function mergeAttributionTouch(existing, touch, now = new Date().toISOString()) {
  const normalized = normalizeTouch(touch);
  if (!existing) {
    return {
      first: { ...normalized, seenAt: now },
      last: { ...normalized, seenAt: now }
    };
  }
  const preserveLastNonDirect = normalized.source === "direct" && existing.last?.source && existing.last.source !== "direct";
  return {
    first: existing.first || { ...normalized, seenAt: now },
    last: preserveLastNonDirect ? existing.last : { ...normalized, seenAt: now }
  };
}

function directAttribution() {
  return {
    raw: "",
    source: "direct",
    campaign: "",
    creative: "",
    placement: "telegram_miniapp",
    kind: "direct"
  };
}

function normalizeTouch(value = {}) {
  return {
    raw: String(value.raw || "").slice(0, MAX_START_PARAM_LENGTH),
    source: slug(value.source, "direct"),
    campaign: slug(value.campaign),
    creative: slug(value.creative),
    placement: slug(value.placement, "telegram_miniapp"),
    kind: slug(value.kind, "direct")
  };
}

function slug(value, fallback = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(TOKEN_PATTERN, "")
    .slice(0, 120);
  return normalized || fallback;
}
