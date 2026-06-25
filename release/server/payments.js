import { createHash, createHmac } from "node:crypto";

const JSON_HEADERS = { "content-type": "application/json" };

export function verifyCryptoBotWebhookSignature(body, signature, apiKey) {
  if (!body || !signature || !apiKey) return false;
  const secret = createHash("sha256").update(apiKey).digest();
  const hmac = createHmac("sha256", secret).update(body).digest("hex");
  return hmac === signature;
}

export function verifyXRocketWebhookSignature(body, signature, secretKey) {
  if (!body || !signature || !secretKey) return false;
  const secret = createHash("sha256").update(secretKey).digest();
  const hmac = createHmac("sha256", secret).update(body).digest("hex");
  return hmac === signature;
}

export function parseCryptoBotInvoiceWebhook(rawBody) {
  const update = JSON.parse(rawBody);
  if (!update || typeof update !== "object") return null;

  const updateType = String(update.update_type || update.type || "");
  const isInvoicePaid = updateType === "invoice_paid";
  const invoice = update.payload || update.data || update.invoice || update;
  if (!isInvoicePaid && String(invoice.status || "").toLowerCase() !== "paid") return null;

  return {
    provider: "cryptobot",
    orderId: String(invoice.payload || invoice.invoice_id || invoice.id || "").trim(),
    status: String(invoice.status || "paid"),
    paidAmount: Number(invoice.paid_amount ?? invoice.amount ?? 0),
    externalId: String(invoice.invoice_id || invoice.hash || invoice.id || ""),
    txHash: String(invoice.hash || invoice.invoice_id || ""),
    raw: update
  };
}

export function parseXRocketInvoiceWebhook(rawBody) {
  const update = JSON.parse(rawBody);
  if (!update || typeof update !== "object") return null;
  if (String(update.type || "") !== "invoicePay") return null;

  const invoice = update.data || {};
  const payment = invoice.payment || {};
  return {
    provider: "xrocket",
    orderId: String(invoice.payload || invoice.id || "").trim(),
    status: String(invoice.status || "paid"),
    paidAmount: Number(payment.paymentAmountReceived ?? payment.paymentAmount ?? invoice.amount ?? 0),
    externalId: String(invoice.id || payment.paymentNum || ""),
    txHash: String(payment.txHash || payment.transactionHash || payment.paymentId || ""),
    raw: update
  };
}

export function normalizeExternalInvoiceOrderId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.startsWith("qwz:") ? text.slice(4) : text;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...JSON_HEADERS,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false || data?.success === false) {
    const message = data?.error || data?.description || `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.response = data;
    throw error;
  }
  return data;
}

export async function createTelegramStarsInvoiceLink({
  botToken,
  title,
  description,
  payload,
  stars,
  baseUrl = "https://api.telegram.org"
}) {
  if (!botToken) {
    throw new Error("BOT_TOKEN is required for Stars invoices");
  }

  const response = await requestJson(`${String(baseUrl || "").replace(/\/$/, "")}/bot${botToken}/createInvoiceLink`, {
    method: "POST",
    body: JSON.stringify({
      title,
      description,
      payload,
      provider_token: "",
      currency: "XTR",
      prices: [{ label: title, amount: Math.max(1, Math.round(Number(stars) || 0)) }]
    })
  });

  return response.result;
}

export async function createCryptoBotInvoice({
  apiKey,
  title,
  description,
  payload,
  usdtAmount,
  callbackUrl = "",
  expiresIn = 20 * 60,
  baseUrl = "https://pay.crypt.bot/api"
}) {
  if (!apiKey) {
    throw new Error("CRYPTOBOT_API_KEY is required for Crypto Bot invoices");
  }

  const response = await requestJson(`${String(baseUrl || "").replace(/\/$/, "")}/createInvoice`, {
    method: "POST",
    headers: {
      "Crypto-Pay-API-Token": apiKey
    },
    body: JSON.stringify({
      asset: "USDT",
      amount: Number(usdtAmount || 0),
      description,
      payload,
      allow_comments: false,
      allow_anonymous: true,
      expires_in: expiresIn,
      ...(callbackUrl ? { paid_btn_name: "callback", paid_btn_url: callbackUrl } : {})
    })
  });

  const invoice = response.result || response.data || response;
  return {
    invoiceId: invoice.invoice_id || invoice.id || "",
    link: invoice.bot_invoice_url || invoice.mini_app_invoice_url || invoice.web_app_invoice_url || invoice.pay_url || ""
  };
}

export async function createXRocketInvoice({
  apiKey,
  title,
  description,
  payload,
  usdtAmount,
  callbackUrl = "",
  expiresIn = 20 * 60,
  platformId = "",
  baseUrl = "https://pay.xrocket.tg"
}) {
  if (!apiKey) {
    throw new Error("XROCKET_PAY_API_KEY is required for xRocket invoices");
  }

  const response = await requestJson(`${String(baseUrl || "").replace(/\/$/, "")}/tg-invoices`, {
    method: "POST",
    headers: {
      "Rocket-Pay-Key": apiKey
    },
    body: JSON.stringify({
      amount: Number(usdtAmount || 0),
      currency: "USDT",
      description,
      hiddenMessage: `Баланс пополнен через ${title}`,
      commentsEnabled: false,
      callbackUrl,
      payload,
      expiredIn: expiresIn,
      ...(platformId ? { platformId } : {})
    })
  });

  const invoice = response.data || response.result || response;
  return {
    invoiceId: invoice.id || "",
    link: invoice.link || ""
  };
}
