/**
 * Azza Payment Bridge (useazza.com)
 * Converts local fiat (NGN, KES, ZAR, RWF) to crypto (USDT/USDC)
 * and formats instant WhatsApp payment triggers.
 */

// Approximate parallel/spot rates (configurable via .env)
const DEFAULT_RATES = {
  NGN: 1520, // ₦1,520 per USDT
  KES: 130,  // KSh 130 per USDT
  ZAR: 18.5, // R 18.5 per USDT
  RWF: 1350  // 1,350 RWF per USDT
};

const AZZA_WHATSAPP_NUMBER = process.env.AZZA_PHONE_NUMBER || '2349000000000';

function getQuote(amountFiat, currency = 'NGN') {
  const rate = Number(process.env[`RATE_${currency}`]) || DEFAULT_RATES[currency] || 1500;
  const usdtAmount = Number((amountFiat / rate).toFixed(2));

  return {
    amountFiat,
    currency,
    rate,
    usdtAmount
  };
}

function buildPaymentUrl(paymentDetails, fallbackAmount = 50000) {
  const safeAmount = Number(paymentDetails?.amount_ngn) || Number(fallbackAmount) || 50000;
  const bank = paymentDetails?.bank || 'Direct Transfer';
  const account_number = paymentDetails?.account_number || paymentDetails?.phone || 'Details on file';
  const account_name = paymentDetails?.account_name || '';
  const quote = getQuote(safeAmount, 'NGN');

  const messageText = `Hi Azza! I want to pay ₦${safeAmount.toLocaleString()} to ${bank} account ${account_number}${account_name ? ` (${account_name})` : ''} using $${quote.usdtAmount} USDT.`;
  const encodedMessage = encodeURIComponent(messageText);
  const whatsappUrl = `https://wa.me/${AZZA_WHATSAPP_NUMBER}?text=${encodedMessage}`;

  return {
    ...quote,
    recipient: { bank, account_number, account_name },
    whatsappUrl,
    messageText
  };
}

function formatJijiReceipt(paymentDetails, fallbackAmount = 50000) {
  const safeAmount = Number(paymentDetails?.amount_ngn) || Number(fallbackAmount) || 50000;
  const bank = paymentDetails?.bank || 'Bank';
  const account_number = paymentDetails?.account_number || 'Direct';
  return `Payment of ₦${safeAmount.toLocaleString()} initiated via Azza to ${bank} (${account_number}). Alert landing in your account now boss!`;
}

module.exports = {
  getQuote,
  buildPaymentUrl,
  formatJijiReceipt
};
