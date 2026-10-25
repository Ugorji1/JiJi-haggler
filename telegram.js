/**
 * telegram.js
 * Telegram Bot integration for Azza Marketplace Haggler.
 * Handles Natural Language Hunt instructions, Deal Approval Cards with Inline Keyboards,
 * Real-time event notifications, and Autonomous Engine Control.
 */

require('dotenv').config();
const ai = require('./ai');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const API_BASE = TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` : '';

let isPolling = false;
let lastUpdateId = 0;
let registeredHandlers = {
  onHuntInstruction: null, // callback(itemTitle, maxBudget, rawText)
  onDealAction: null,      // callback(action, dialogId, huntId, extra)
  onToggleBot: null,       // callback(activeState)
  onRunSimulation: null,   // callback()
  onSwitchWinner: null,    // callback(newDialogId, huntId)
  getCurrentWinner: null,  // callback(huntId)
  onAcceptDeadlocked: null, // callback(dialogId, price)
  onSetMode: null,         // callback(mode)
  getMode: null,           // callback()
  onSetLocation: null,     // callback(location)
  getLocation: null,       // callback()
  getActiveQuery: null     // callback()
};

let botActiveState = true;
let pendingConfirmationMessage = null; // { chatId, messageId }

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Send a message to Telegram with automatic retries and error logging
 */
async function sendMessage(chatId, text, replyMarkup = null, retries = 3) {
  if (!TELEGRAM_BOT_TOKEN) return null;
  const targetChatId = chatId || DEFAULT_CHAT_ID;
  if (!targetChatId) return null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const payload = {
        chat_id: targetChatId,
        text: text,
        parse_mode: 'HTML'
      };
      if (replyMarkup) {
        payload.reply_markup = replyMarkup;
      }

      const res = await fetch(`${API_BASE}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        console.warn(`[Telegram API Warning] Attempt ${attempt}/${retries} failed:`, data);
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        return data;
      }
      return data;
    } catch (err) {
      console.error(`[Telegram] Failed to send message (Attempt ${attempt}/${retries}):`, err.message);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  return null;
}

/**
 * Answer a callback query from an inline keyboard button
 */
async function answerCallbackQuery(callbackQueryId, text = '') {
  try {
    await fetch(`${API_BASE}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text
      })
    });
  } catch (err) {
    console.error('[Telegram] Failed to answer callback query:', err.message);
  }
}

/**
 * Edit an existing Telegram message (e.g. after clicking inline button)
 */
async function editMessageText(chatId, messageId, text, replyMarkup = null) {
  if (!TELEGRAM_BOT_TOKEN) return null;
  try {
    const targetChatId = chatId || DEFAULT_CHAT_ID;
    if (!targetChatId) return null;
    const payload = {
      chat_id: targetChatId,
      message_id: messageId,
      text: text,
      parse_mode: 'HTML'
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    const res = await fetch(`${API_BASE}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    console.error('[Telegram] Failed to edit message:', err.message);
    return null;
  }
}

/**
 * Send interactive Deal Review Card to Telegram with inline buttons
 */
async function sendDealCard(deal, huntId) {
  const seller = escapeHtml(deal.seller_name || 'Seller');
  const item = escapeHtml(deal.item_title || 'Item');
  const agreed = Number(deal.agreed_price || 0).toLocaleString();
  const asking = Number(deal.asking_price || 0).toLocaleString();
  const bank = escapeHtml(deal.payment_details?.bank || 'N/A');
  const acct = escapeHtml(deal.payment_details?.account_number || 'N/A');
  const acctName = escapeHtml(deal.payment_details?.account_name || 'N/A');
  const location = escapeHtml(deal.payment_details?.pickup_address || 'N/A');
  const listingUrl = deal.listing_url || 'https://jiji.ng';
  const targetHuntId = huntId || deal.hunt_id || '';

  const pendingSellers = deal.pending_sellers || [];
  const otherDeals = deal.other_deals || [];
  let multiSellerNotice = '';

  if (pendingSellers.length > 0) {
    const list = pendingSellers.map(s => `<b>${escapeHtml(s)}</b>`).join(', ');
    multiSellerNotice = `⏳ <b>STILL NEGOTIATING (${pendingSellers.length} OTHER):</b>\n` +
      `<i>We are currently still bargaining with ${list}. You can wait a moment to see their final counter-offers, or lock in ${seller} right now!</i>\n\n`;
  } else if (otherDeals.length > 0) {
    const list = otherDeals.map(d => `<b>${escapeHtml(d.name)}</b> (₦${Number(d.price).toLocaleString()})`).join(', ');
    multiSellerNotice = `💡 <b>OTHER OFFERS READY:</b>\n` +
      `<i>You also have an offer on the table from ${list}. Compare both and choose your favorite!</i>\n\n`;
  } else {
    multiSellerNotice = `🏁 <i>All candidate sellers evaluated. This is your best confirmed offer!</i>\n\n`;
  }

  const isInspection = deal.payment_details?.deal_type === 'IN_PERSON_INSPECTION';
  const isWaybill = deal.payment_details?.deal_type === 'INTERSTATE_WAYBILL' || Boolean(deal.payment_details?.waybill_method) || Boolean(deal.payment_details?.waybill_required);

  let detailsBlock = '';
  if (isWaybill) {
    const origin = escapeHtml(deal.payment_details?.seller_city || deal.payment_details?.pickup_address || 'Other State');
    const waybillMethod = escapeHtml(deal.payment_details?.waybill_method || 'Park Bus / Waybill (e.g. Peace Mass, GIGM)');
    const phone = escapeHtml(deal.payment_details?.phone_number || acct || 'Provided in chat');
    detailsBlock = `🚚 <b>Deal Type:</b> Interstate Waybill / Delivery\n` +
      `📍 <b>Origin:</b> ${origin}\n` +
      `🚌 <b>Waybill Transport:</b> ${waybillMethod}\n` +
      `📞 <b>Seller Contact:</b> <code>${phone}</code>\n` +
      (bank !== 'N/A' ? `🏦 <b>Bank:</b> ${bank} (<code>${acct}</code>)\n` : '') +
      `\n`;
  } else if (isInspection) {
    detailsBlock = `🤝 <b>Deal Type:</b> In-Shop Inspection / Pay on Delivery\n` +
      `📞 <b>Seller Phone:</b> <code>${deal.payment_details?.phone_number || acct || 'Provided in Chat'}</code>\n` +
      `📍 <b>Shop Address:</b> ${location}\n\n`;
  } else {
    detailsBlock = `🏦 <b>Bank:</b> ${bank}\n` +
      `💳 <b>Acct No:</b> <code>${acct}</code>\n` +
      `🏷️ <b>Acct Name:</b> ${acctName}\n` +
      `📍 <b>Pickup:</b> ${location}\n\n`;
  }

  const validListingUrl = (deal.listing_url && (deal.listing_url.includes('.html') || deal.listing_url.includes('/advert/')))
    ? deal.listing_url
    : ((deal.listing_url && deal.listing_url.startsWith('http') && !deal.listing_url.endsWith('jiji.ng') && !deal.listing_url.endsWith('jiji.ng/')) ? deal.listing_url : `https://jiji.ng/search?query=${encodeURIComponent(deal.item_title || '')}`);

  const linkText = (deal.listing_url && (deal.listing_url.includes('.html') || deal.listing_url.includes('/advert/'))) ? 'Inspect Exact Listing on Jiji' : `Search "${item}" on Jiji`;

  const text = `🎉 <b>DEAL PROPOSED! ACTION REQUIRED</b>\n\n` +
    `📦 <b>Item:</b> ${item}\n` +
    `👤 <b>Seller:</b> ${seller}\n` +
    `💰 <b>Agreed Price:</b> ₦${agreed} <i>(Asking was ₦${asking})</i>\n\n` +
    detailsBlock +
    `🔗 <a href="${validListingUrl}">${linkText}</a>\n\n` +
    multiSellerNotice +
    `<i>What would you like to do?</i>`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '✅ Approve & Pay', callback_data: `approve:${deal.dialog_id}` },
        { text: '⚡ Push Lower', callback_data: `bluff:${deal.dialog_id}` }
      ],
      [
        { text: '❌ Pass / Drop Deal', callback_data: `reject:${deal.dialog_id}` }
      ]
    ]
  };

  return await sendMessage(DEFAULT_CHAT_ID, text, replyMarkup);
}

/**
 * Send Bluff Refused Alert to Telegram with decision buttons
 */
async function sendBluffRefusedAlert(dialogId, huntId, sellerName, origPrice) {
  const priceStr = Number(origPrice).toLocaleString();
  const text = `⚠️ <b>SELLER REFUSED LOWER OFFER!</b>\n\n` +
    `Seller <b>${escapeHtml(sellerName)}</b> stood firm and rejected the lower bluff.\n` +
    `They insist on their previous agreed price: <b>₦${priceStr}</b>.\n\n` +
    `Do you want to accept <b>₦${priceStr}</b> and pay, or walk away?`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: `✅ Pay ₦${priceStr}`, callback_data: `approve:${dialogId}` },
        { text: `❌ Leave & Drop`, callback_data: `reject:${dialogId}` }
      ]
    ]
  };

  return await sendMessage(DEFAULT_CHAT_ID, text, replyMarkup);
}

/**
 * Send Bluff Accepted Card to Telegram with instant approval buttons
 */
async function sendBluffAcceptedCard(dialogId, huntId, sellerName, bluffPrice, deal) {
  const priceStr = Number(bluffPrice).toLocaleString();
  const text = `🎉 <b>BLUFF ACCEPTED! EXTRA DISCOUNT WON!</b> 💸\n\n` +
    `Seller <b>${escapeHtml(sellerName)}</b> accepted your cash bluff!\n` +
    `They agreed to drop the price down to: <b>₦${priceStr}</b>\n\n` +
    `📍 <b>Pickup / Shop:</b> ${escapeHtml(deal?.payment_details?.pickup_address || 'Computer Village / Ikeja')}\n` +
    `🏦 <b>Bank:</b> ${escapeHtml(deal?.payment_details?.bank || 'Verified')} | <code>${escapeHtml(deal?.payment_details?.account_number || '')}</code>\n\n` +
    `Click below to approve and lock in this discount:`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: `✅ Approve & Pay ₦${priceStr}`, callback_data: `approve:${dialogId}` }
      ],
      [
        { text: '❌ Pass / Drop Deal', callback_data: `reject:${dialogId}` }
      ]
    ]
  };

  return await sendMessage(DEFAULT_CHAT_ID, text, replyMarkup);
}

/**
 * Send Winner Celebration Card to Telegram with Azza payment link
 */
async function sendWinnerCelebration(sellerName, agreedPrice, azzaPayload) {
  const azzaUrl = azzaPayload?.whatsappUrl;
  const priceStr = Number(agreedPrice || 0).toLocaleString();
  const usdtStr = azzaPayload?.usdtAmount || 0;

  const msgText = `🏆 <b>SELLER CONFIRMED & WINNER CROWNED!</b>\n\n` +
    `👤 <b>Winner:</b> ${escapeHtml(sellerName || 'Seller')}\n` +
    `💰 <b>Final Price:</b> ₦${priceStr}\n` +
    `💵 <b>Crypto Equivalent:</b> $${usdtStr} USDT\n\n` +
    `🤝 <i>The seller has confirmed readiness to receive payment and dispatch your item. All competitor sellers have been politely stood down.</i>\n\n` +
    (azzaUrl ? `👉 <a href="${azzaUrl}"><b>TAP HERE TO COMPLETE PAYMENT VIA AZZA WHATSAPP</b></a>` : '');

  // If a Telegram card was awaiting confirmation, seamlessly edit it!
  if (pendingConfirmationMessage) {
    const { chatId, messageId } = pendingConfirmationMessage;
    pendingConfirmationMessage = null;
    const edited = await editMessageText(chatId, messageId, msgText);
    if (edited && edited.ok) {
      return edited;
    }
  }

  return await sendMessage(DEFAULT_CHAT_ID, msgText);
}

/**
 * Send All Sellers Deadlocked Advisory Card to Telegram
 */
async function sendAllDeadlockedAdvisory(huntId, bestCandidate, userBudget) {
  const bestPriceStr = Number(bestCandidate.lowestPrice || 0).toLocaleString();
  const userBudgetStr = Number(userBudget || 0).toLocaleString();
  const sellerName = bestCandidate.seller_name || 'Seller';
  const itemTitle = bestCandidate.item_title || 'Item';
  const pickupAddress = bestCandidate.payment_details?.pickup_address || bestCandidate.seller_info?.market || 'Computer Village / Lagos';

  const text = `⛔ <b>ALL CANDIDATE SELLERS DEADLOCKED!</b>\n\n` +
    `📦 <b>Target:</b> ${escapeHtml(itemTitle)}\n` +
    `💰 <b>Your Budget:</b> ₦${userBudgetStr}\n\n` +
    `<i>All candidate sellers stood firm on their prices above your budget. However, we bargained them down as low as the market allows!</i>\n\n` +
    `🏆 <b>BEST COUNTER-OFFER ACHIEVED:</b>\n` +
    `👤 <b>Seller:</b> ${escapeHtml(sellerName)}\n` +
    `📍 <b>Location:</b> ${escapeHtml(pickupAddress)}\n` +
    `🏷️ <b>Original Price:</b> ₦${Number(bestCandidate.seller_info?.asking_price || 0).toLocaleString()}\n` +
    `💰 <b>Lowest Bargained Price:</b> <b>₦${bestPriceStr}</b>\n\n` +
    `Would you like to buy from <b>${escapeHtml(sellerName)}</b> at <b>₦${bestPriceStr}</b>, expand your search to All Nigeria with waybill, or drop this hunt?`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: `🚀 Buy from ${sellerName} for ₦${bestPriceStr}`, callback_data: `buy_deadlocked:${bestCandidate.dialog_id}:${bestCandidate.lowestPrice}` }
      ],
      [
        { text: `🌐 Search All Nigeria (₦${userBudgetStr})`, callback_data: `search_nationwide:${huntId}` }
      ],
      [
        { text: `❌ Drop Hunt`, callback_data: `cancel_hunt` }
      ]
    ]
  };

  return await sendMessage(DEFAULT_CHAT_ID, text, replyMarkup);
}

/**
 * Send All Sellers Rejected / Dropped Advisory to Telegram
 */
async function sendAllRejectedAdvisory(huntId, itemTitle, userBudget) {
  const itemStr = escapeHtml(itemTitle || 'Item');
  const budgetStr = Number(userBudget || 0).toLocaleString();

  const text = `❌ <b>ALL CANDIDATE SELLERS DROPPED / REJECTED</b>\n\n` +
    `📦 <b>Target:</b> ${itemStr}\n` +
    `💰 <b>Your Budget:</b> ₦${budgetStr}\n\n` +
    `<i>All contacted sellers for this search have been dropped or declined.</i>\n\n` +
    `<b>What would you like to do next?</b>`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: `🌐 Search All Nigeria (₦${budgetStr})`, callback_data: `search_nationwide:${huntId}` }
      ],
      [
        { text: `❌ Drop Hunt`, callback_data: `cancel_hunt` }
      ]
    ]
  };

  return await sendMessage(DEFAULT_CHAT_ID, text, replyMarkup);
}

/**
 * Send Stalled Seller / Inactivity Alert to Telegram
 */
async function sendStalledSellerAlert(dialogId, huntId, sellerName, askingPrice, currentOffer, waitMinutes = 10) {
  const sweetSpot = Math.round((Number(currentOffer || 0) + 20000) / 1000) * 1000;
  const text = `⏳ <b>SELLER HAS GONE QUIET (${waitMinutes} MINS)</b>\n\n` +
    `👤 <b>Seller:</b> ${escapeHtml(sellerName)}\n` +
    `🏷️ <b>Seller Bottom:</b> ₦${Number(askingPrice || 0).toLocaleString()}\n` +
    `💰 <b>Our Last Offer:</b> ₦${Number(currentOffer || 0).toLocaleString()}\n\n` +
    `<i>The seller has not responded for ${waitMinutes} minutes. They might be busy in their shop, or holding out for a closer price.</i>\n\n` +
    `<b>How would you like to handle this?</b>`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: `💡 Sweeten Offer to ₦${sweetSpot.toLocaleString()} (+₦20k)`, callback_data: `sweeten:${dialogId}:${sweetSpot}` }
      ],
      [
        { text: `⏭️ Skip & Contact Next Seller`, callback_data: `skip_stalled:${dialogId}` }
      ]
    ]
  };

  return await sendMessage(DEFAULT_CHAT_ID, text, replyMarkup);
}

/**
 * Send Live Jiji Budget Alert with Bump button when live search finds no items within budget
 */
async function sendLiveBudgetAlert(huntId, query, userBudget, lowestPrice, location = '', isLocal = false) {
  const queryStr = escapeHtml(query || 'Target Item');
  const userBudgetStr = Number(userBudget || 0).toLocaleString();
  const lowestPriceStr = Number(lowestPrice || 0).toLocaleString();
  const roundedLowestK = Math.round(lowestPrice / 1000);
  const locStr = escapeHtml(location || '');

  let text = '';
  let replyMarkup = {};

  if (isLocal && locStr) {
    text = `⚠️ <b>LIVE JIJI BUDGET ALERT: NO SELLERS IN ${locStr.toUpperCase()} WITHIN ₦${userBudgetStr}!</b>\n\n` +
      `📦 <b>Target:</b> ${queryStr}\n` +
      `📍 <b>Location:</b> ${locStr}\n` +
      `💰 <b>Your Budget:</b> ₦${userBudgetStr}\n` +
      `🏷️ <b>Lowest in ${locStr}:</b> <b>₦${lowestPriceStr}</b>\n\n` +
      `We found authentic sellers in <b>${locStr}</b>, but the lowest asking price is <b>₦${lowestPriceStr}</b>.\n\n` +
      `💡 <i>Would you like to bump your budget to get it locally in ${locStr}, or expand your search to All Nigeria?</i>`;

    replyMarkup = {
      inline_keyboard: [
        [
          { text: `🚀 Bump Budget to ₦${roundedLowestK.toLocaleString()}k in ${locStr}`, callback_data: `bump:current:${lowestPrice}` }
        ],
        [
          { text: `🌐 Search All Nigeria (₦${userBudgetStr})`, callback_data: `search_nationwide:${huntId}` }
        ],
        [
          { text: `❌ Cancel Hunt`, callback_data: `cancel_hunt` }
        ]
      ]
    };
  } else {
    text = `⚠️ <b>LIVE JIJI BUDGET ALERT: ₦${userBudgetStr} IS TOO LOW!</b>\n\n` +
      `📦 <b>Target:</b> ${queryStr}\n` +
      `💰 <b>Your Budget:</b> ₦${userBudgetStr}\n` +
      `🏷️ <b>Lowest Genuine Listing on Jiji:</b> <b>₦${lowestPriceStr}</b>\n\n` +
      `Our scanner filtered authentic listings on Jiji, but the cheapest genuine seller is asking <b>₦${lowestPriceStr}</b>. Offering ₦${userBudgetStr} is too far below the market price to get any vendor to engage.\n\n` +
      `💡 <i>Would you like to bump your budget to <b>₦${lowestPriceStr}</b> so we can contact sellers and start negotiating?</i>`;

    replyMarkup = {
      inline_keyboard: [
        [
          { text: `🚀 Bump Budget to ₦${roundedLowestK.toLocaleString()}k`, callback_data: `bump:current:${lowestPrice}` }
        ],
        [
          { text: `❌ Cancel Hunt`, callback_data: `cancel_hunt` }
        ]
      ]
    };
  }

  return await sendMessage(DEFAULT_CHAT_ID, text, replyMarkup);
}

/**
 * Natural Language Parser for User Hunt Requests
 * Extracts Item Title and Budget (in Naira)
 */
async function parseHuntInstruction(userText) {
  // First pass: Fast regex extraction
  let parsedBudget = null;
  let parsedItem = null;

  // Regex patterns for Nigerian budget expressions:
  // e.g. "700k", "1m", "1.2m", "₦700,000", "700000", "700 thousand"
  const budgetMillionMatch = userText.match(/(\d+(?:\.\d+)?)\s*(?:m|million)\b/i);
  const budgetKMatch = userText.match(/(\d+(?:\.\d+)?)\s*(?:k|thousand)\b/i);
  const budgetNairaMatch = userText.match(/(?:₦|naira|budget\s*(?:is|of|:)?\s*)?\s*(\d{1,3}(?:,\d{3})+|\d{5,8})\b/i);

  if (budgetMillionMatch) {
    parsedBudget = Math.round(parseFloat(budgetMillionMatch[1]) * 1000000);
  } else if (budgetKMatch) {
    parsedBudget = Math.round(parseFloat(budgetKMatch[1]) * 1000);
  } else if (budgetNairaMatch) {
    const cleanNum = budgetNairaMatch[1].replace(/,/g, '');
    if (parseInt(cleanNum) >= 5000) {
      parsedBudget = parseInt(cleanNum);
    }
  }

  // Use Gemini to cleanly extract the intended item title and confirm budget
  try {
    const prompt = `
Extract the shopping search item and maximum budget from this user message:
Message: "${userText}"

Rules:
1. "item": The product title or item category (e.g. "Lenovo Legion", "Gaming Laptop", "iPhone 13 Pro Max", "PS5 Disc Edition"). If none found, return null.
2. "budget": The numeric budget in Nigerian Naira (e.g. 700k -> 700000, 1m -> 1000000). If none found, return null.
3. "missing_info": "budget" if item is known but budget is missing; "item" if budget is known but item is missing; "both" if neither; null if both are present.
4. "clarification_question": Friendly Pidgin/English question to ask the user if info is missing.

Respond strictly with JSON schema:
{
  "item": "string or null",
  "budget": 700000 or null,
  "missing_info": null,
  "clarification_question": null
}`;

    const schemaExample = `{
  "item": "Lenovo Legion",
  "budget": 1000000,
  "missing_info": null,
  "clarification_question": null
}`;

    const geminiResult = await ai.generateOpeningPitch ? null : null; // check if helper
    // Call Gemini directly for precision
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${prompt}\nCRITICAL: Respond ONLY with valid JSON matching:\n${schemaExample}` }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (jsonText) {
          const parsed = JSON.parse(jsonText.trim());
          return {
            item: parsed.item || parsedItem,
            budget: parsed.budget || parsedBudget,
            missing_info: parsed.missing_info,
            clarification_question: parsed.clarification_question
          };
        }
      }
    }
  } catch (err) {
    console.warn('[Telegram NL Parser] Gemini fallback error:', err.message);
  }

  // Regex fallback if Gemini was offline
  let cleanedItem = userText
    .replace(/(?:i\s*want\s*to\s*buy|i\s*want|find\s*me|look\s*for|get\s*me|search\s*for|buy)\s*/i, '')
    .replace(/(?:and\s*)?(?:my\s*)?budget\s*(?:is|of|:)?\s*.*$/i, '')
    .replace(/(\d+(?:\.\d+)?)\s*(?:m|million|k|thousand)\b/i, '')
    .replace(/[₦,]/g, '')
    .trim();

  return {
    item: cleanedItem.length > 2 ? cleanedItem : null,
    budget: parsedBudget,
    missing_info: (!cleanedItem || cleanedItem.length <= 2) && !parsedBudget ? 'both' : (!parsedBudget ? 'budget' : (!cleanedItem || cleanedItem.length <= 2 ? 'item' : null)),
    clarification_question: !parsedBudget ? "What is your maximum budget in Naira (e.g. 700k, 1m)?" : "What specific item or model are you looking for?"
  };
}

/**
 * Handle incoming Telegram updates (Messages & Inline Buttons)
 */
async function processUpdate(update) {
  // 1. INLINE KEYBOARD ACTIONS (Button Clicks)
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data || '';
    const chatId = cb.message?.chat?.id || DEFAULT_CHAT_ID;
    const messageId = cb.message?.message_id;

    console.log(`[Telegram Callback] Action: "${data}" from user ${cb.from?.username || cb.from?.id}`);

    const [action, dialogId, huntId] = data.split(':');

    // Mode switch action from inline keyboard
    if (action === 'set_mode') {
      const targetMode = dialogId; // 'LIVE' or 'DEMO'
      if (registeredHandlers.onSetMode) {
        registeredHandlers.onSetMode(targetMode);
      }
      await answerCallbackQuery(cb.id, `Switched to ${targetMode === 'LIVE' ? 'Live Jiji' : 'Simulator'} Mode!`);
      const confirmText = targetMode === 'LIVE'
        ? `🟢 <b>LIVE JIJI MODE ACTIVATED!</b>\n\n` +
          `Signals and budget instructions from Telegram will now execute directly on the real <b>jiji.ng</b> marketplace through your browser userscript.\n\n` +
          `👉 Send what you want to hunt (e.g. <i>"I want a gaming laptop and budget is 700k"</i>).`
        : `🧪 <b>SIMULATOR MODE ACTIVATED!</b>\n\n` +
          `Searches will run inside the autonomous 3-seller simulation engine on <code>http://localhost:5000</code>.`;
      await editMessageText(chatId, messageId, confirmText);
      return;
    }

    // Location Selection Action from inline keyboard
    if (action === 'set_loc') {
      const selectedCity = dialogId;
      await answerCallbackQuery(cb.id, `Location set to ${selectedCity}!`);
      if (registeredHandlers.onSetLocation) {
        registeredHandlers.onSetLocation(selectedCity);
      }
      const locMsg = `📍 <b>BASE LOCATION UPDATED: ${escapeHtml(selectedCity)}!</b>\n\n` +
        `All interstate waybill and pickup negotiations will now use <b>${escapeHtml(selectedCity)}</b>.\n\n` +
        `<i>When negotiating with sellers in other states (e.g. Enugu/Lagos/PH), the bot will automatically arrange motor park waybill delivery directly to ${escapeHtml(selectedCity)}.</i>`;
      await editMessageText(chatId, messageId, locMsg);
      return;
    }

    // Price Bump Advisory Action
    if (action === 'bump') {
      let itemId = dialogId;
      const bumpedBudget = Number(huntId);
      if (itemId === 'current' || itemId === 'live') {
        itemId = (registeredHandlers.getActiveQuery ? registeredHandlers.getActiveQuery() : null) || 'Item';
      }
      await answerCallbackQuery(cb.id, `Budget updated to ₦${bumpedBudget.toLocaleString()}!`);
      if (registeredHandlers.onHuntInstruction) {
        const hunt = await registeredHandlers.onHuntInstruction(itemId, bumpedBudget, '');
        const curMode = registeredHandlers.getMode ? registeredHandlers.getMode() : 'DEMO';
        let bumpMsg;
        if (curMode === 'LIVE') {
          bumpMsg = `🚀 🟢 <b>LIVE JIJI BUDGET BUMPED TO ₦${bumpedBudget.toLocaleString()}!</b>\n\n` +
            `📦 <b>Target:</b> ${escapeHtml(hunt?.query || hunt?.item_name || itemId || 'Item')}\n` +
            `💰 <b>New Budget:</b> ₦${bumpedBudget.toLocaleString()}\n` +
            `🌐 <b>Marketplace:</b> Real Jiji.ng\n\n` +
            `🔗 <b>Direct Search Link:</b>\n` +
            `👉 <a href="https://jiji.ng/search?query=${encodeURIComponent(hunt?.query || itemId)}">https://jiji.ng/search?query=${encodeURIComponent(hunt?.query || itemId)}</a>\n\n` +
            `<i>Your browser userscript is actively negotiating with live sellers. All decision cards will be sent here!</i>`;
        } else {
          bumpMsg = `🚀 <b>BUDGET BUMPED TO ₦${bumpedBudget.toLocaleString()}!</b>\n\n` +
            `📦 <b>Target:</b> ${hunt?.query || hunt?.item_name || itemId || 'Item'}\n` +
            `👥 <b>Outreach:</b> Contacting 3 candidate sellers on Jiji...\n\n` +
            `💻 <b>WATCH CHATS LIVE ON YOUR COMPUTER SCREEN:</b>\n` +
            `👉 <code>http://localhost:5000</code>\n\n` +
            `<i>The bot is actively negotiating with all 3 sellers now. All decision cards will be sent to you here!</i>`;
        }
        await editMessageText(chatId, messageId, bumpMsg);
      }
      return;
    }

    if (action === 'sweeten') {
      const targetDialogId = dialogId;
      const sweetPrice = Number(huntId);
      await answerCallbackQuery(cb.id, `Sweetening offer to ₦${sweetPrice.toLocaleString()}...`);
      if (registeredHandlers.onSweetenOffer) {
        await registeredHandlers.onSweetenOffer(targetDialogId, sweetPrice);
      }
      const msgText = `⚡ <b>SWEETENED OFFER DISPATCHED!</b>\n\n` +
        `We pushed an updated offer of <b>₦${sweetPrice.toLocaleString()}</b> (+₦20,000) into the chat to break the deadlock.\n\n` +
        `<i>Waiting for seller's reaction...</i>`;
      await editMessageText(chatId, messageId, msgText);
      return;
    }

    if (action === 'skip_stalled') {
      const targetDialogId = dialogId;
      await answerCallbackQuery(cb.id, `Skipping stalled seller...`);
      if (registeredHandlers.onSkipStalled) {
        await registeredHandlers.onSkipStalled(targetDialogId);
      }
      const msgText = `⏭️ <b>EXPANDING SEARCH TO NEXT VENDOR!</b>\n\n` +
        `We marked this seller as stalled and told your Jiji browser tab to open Candidate Seller #4.\n\n` +
        `<i>If the original seller replies later, the bot will still catch it in the switchboard!</i>`;
      await editMessageText(chatId, messageId, msgText);
      return;
    }

    if (action === 'search_nationwide') {
      await answerCallbackQuery(cb.id, 'Expanding search to All Nigeria...');
      if (registeredHandlers.onSearchNationwide) {
        await registeredHandlers.onSearchNationwide(huntId);
      }
      const msgText = `🌐 <b>SEARCH EXPANDED TO ALL NIGERIA!</b>\n\n` +
        `We expanded your search across Nigeria. Your browser will queue the best nationwide sellers and initiate outreach with interstate waybill negotiations.\n\n` +
        `<i>Watch your Jiji browser tab as it begins outreach with nationwide sellers!</i>`;
      await editMessageText(chatId, messageId, msgText);
      return;
    }

    if (action === 'cancel_hunt') {
      await answerCallbackQuery(cb.id, 'Hunt cancelled.');
      await editMessageText(chatId, messageId, '❌ <b>Hunt cancelled.</b> Send a new item or budget whenever you want to search again.');
      return;
    }

    if (action === 'buy_deadlocked') {
      const targetDialogId = dialogId;
      const acceptedPrice = Number(huntId);
      await answerCallbackQuery(cb.id, `Reviving deal at ₦${acceptedPrice.toLocaleString()}...`);
      if (registeredHandlers.onAcceptDeadlocked) {
        const result = await registeredHandlers.onAcceptDeadlocked(targetDialogId, acceptedPrice);
        const sellerName = result?.session?.seller_name || 'Seller';
        const msgText = `⏳ <b>REVIVING DEAL WITH SELLER...</b>\n\n` +
          `Confirming <b>₦${acceptedPrice.toLocaleString()}</b> with <b>${escapeHtml(sellerName)}</b>...\n\n` +
          `<i>Waiting for seller's final confirmation in the chat...</i>`;
        await editMessageText(chatId, messageId, msgText);
      }
      return;
    }

    if (action === 'confirm_switch') {
      const newDialogId = dialogId;
      const targetHuntId = huntId;
      await answerCallbackQuery(cb.id, `Switching winner...`);
      if (registeredHandlers.onSwitchWinner) {
        const result = await registeredHandlers.onSwitchWinner(newDialogId, targetHuntId);
        if (result?.success) {
          const azzaUrl = result.azza?.whatsappUrl;
          const msgText = `🔄 <b>WINNER SWITCHED SUCCESSFULLY!</b>\n\n` +
            `👤 <b>Winner:</b> ${escapeHtml(result.new_seller)}\n` +
            `💰 <b>Amount:</b> ₦${Number(result.new_price).toLocaleString()}\n` +
            `💵 <b>Crypto Equivalent:</b> $${result.azza?.usdtAmount || 0} USDT\n\n` +
            `🤝 <b>${escapeHtml(result.old_seller)}</b> has been stood down, and <b>${escapeHtml(result.new_seller)}</b> is now locked in.\n\n` +
            (azzaUrl ? `👉 <a href="${azzaUrl}"><b>TAP HERE TO COMPLETE PAYMENT VIA AZZA WHATSAPP</b></a>` : '');
          await editMessageText(chatId, messageId, msgText);
        }
      }
      return;
    }

    if (action === 'keep_winner') {
      const currentDialogId = dialogId;
      const targetHuntId = huntId;
      await answerCallbackQuery(cb.id, `Keeping original winner.`);
      const currentWinner = registeredHandlers.getCurrentWinner ? registeredHandlers.getCurrentWinner(targetHuntId) : null;
      const winnerName = currentWinner?.name || 'Selected Seller';
      const winnerPrice = currentWinner?.price ? Number(currentWinner.price).toLocaleString() : '';
      const azzaUrl = currentWinner?.azza?.whatsappUrl;
      const msgText = `🔒 <b>KEPT ORIGINAL SELECTION: ${escapeHtml(winnerName)}</b>\n\n` +
        `Your selected winner remains <b>${escapeHtml(winnerName)}</b>` + (winnerPrice ? ` (₦${winnerPrice})` : '') + `.\n\n` +
        (azzaUrl ? `👉 <a href="${azzaUrl}"><b>TAP HERE TO COMPLETE PAYMENT VIA AZZA WHATSAPP</b></a>` : '');
      await editMessageText(chatId, messageId, msgText);
      return;
    }

    if (registeredHandlers.onDealAction) {
      await answerCallbackQuery(cb.id, `Processing ${action}...`);
      const result = await registeredHandlers.onDealAction(action, dialogId, huntId);
      
      if (action === 'approve') {
        if (result?.prompt_switch) {
          const switchPrompt = `⚠️ <b>CONFIRM SELLER SWITCH</b>\n\n` +
            `You already approved <b>${escapeHtml(result.current_winner)}</b> (₦${Number(result.current_price).toLocaleString()})!\n\n` +
            `Did you tap accidentally, or do you want to switch your winner to <b>${escapeHtml(result.new_seller)}</b> (₦${Number(result.new_price).toLocaleString()})?\n\n` +
            `<i>If you switch, ${escapeHtml(result.current_winner)} will be politely stood down and ${escapeHtml(result.new_seller)} will be locked in.</i>`;

          const replyMarkup = {
            inline_keyboard: [
              [
                { text: `🔄 Yes, Switch to ${result.new_seller}`, callback_data: `confirm_switch:${result.new_dialog_id}` }
              ],
              [
                { text: `❌ Keep ${result.current_winner}`, callback_data: `keep_winner:${result.current_dialog_id}` }
              ]
            ]
          };

          await editMessageText(chatId, messageId, switchPrompt, replyMarkup);
          return;
        }

        if (result?.already_crowned_same) {
          await answerCallbackQuery(cb.id, `Already approved! Complete payment below.`);
          const msgText = `✅ <b>DEAL ALREADY APPROVED!</b>\n\n` +
            `Winner: <b>${escapeHtml(result.seller_name)}</b>\n` +
            `Amount: <b>₦${Number(result.agreed_price || 0).toLocaleString()}</b>\n\n` +
            (result.azza?.whatsappUrl ? `👉 <a href="${result.azza.whatsappUrl}"><b>TAP HERE TO COMPLETE PAYMENT VIA AZZA WHATSAPP</b></a>` : '');
          await editMessageText(chatId, messageId, msgText);
          return;
        }

        if (result?.awaiting_confirmation) {
          pendingConfirmationMessage = { chatId, messageId };
          const msgText = `⏳ <b>CONFIRMING WITH SELLER...</b>\n\n` +
            `Asking <b>${escapeHtml(result?.session?.seller_name || 'Seller')}</b> if we can still proceed with <b>₦${Number(result?.agreed_price || 0).toLocaleString()}</b>.\n\n` +
            `<i>Waiting for seller's final confirmation in the chat...</i>`;
          await editMessageText(chatId, messageId, msgText);
          return;
        }

        const azzaUrl = result?.azza?.whatsappUrl;
        const msgText = `✅ <b>DEAL APPROVED & WINNER CROWNED!</b>\n\n` +
          `Winner: <b>${escapeHtml(result?.session?.seller_name || 'Seller')}</b>\n` +
          `Amount: <b>₦${Number(result?.agreed_price || 0).toLocaleString()}</b>\n` +
          `Crypto Equivalent: <b>$${result?.azza?.usdtAmount || 0} USDT</b>\n\n` +
          `All competitor sellers have been politely stood down.\n\n` +
          (azzaUrl ? `👉 <a href="${azzaUrl}"><b>TAP HERE TO COMPLETE PAYMENT VIA AZZA WHATSAPP</b></a>` : '');
        await editMessageText(chatId, messageId, msgText);
        return;
      } else if (action === 'bluff') {
        if (result?.already_won) {
          await answerCallbackQuery(cb.id, 'Winner already selected!');
          await editMessageText(chatId, messageId, `🔒 <b>Hunt concluded.</b> You already selected <b>${escapeHtml(result.winner_name)}</b> as winner.`);
          return;
        }
        const msgText = `⚡ <b>PUSH LOWER BLUFF DISPATCHED!</b>\n\n` +
          `We bluffed with ₦${Number(result?.bluff_price || 0).toLocaleString()} cash on ground.\n` +
          `Waiting for seller's reaction...`;
        await editMessageText(chatId, messageId, msgText);
      } else if (action === 'reject') {
        if (result?.already_won) {
          await answerCallbackQuery(cb.id, 'Winner already selected!');
          await editMessageText(chatId, messageId, `🔒 <b>Hunt concluded.</b> You already selected <b>${escapeHtml(result.winner_name)}</b> as winner.`);
          return;
        }
        const msgText = `❌ <b>DEAL DROPPED!</b>\n\n` +
          `We passed on this deal. Continuing hunt for other sellers.`;
        await editMessageText(chatId, messageId, msgText);
      }
    } else {
      await answerCallbackQuery(cb.id, 'Action received.');
    }
    return;
  }

  // 2. TEXT MESSAGES FROM USER
  if (update.message && update.message.text) {
    const msg = update.message;
    const text = msg.text.trim();
    const chatId = msg.chat.id;

    console.log(`[Telegram User Message] "${text}" from ${msg.from?.username || chatId}`);

    // Command: /start
    if (text === '/start') {
      const welcome = `👋 <b>Welcome to Azza Marketplace Haggler!</b>\n\n` +
        `I am your autonomous street-smart Nigerian shopping and bargaining agent.\n\n` +
        `<b>How to use:</b>\n` +
        `Just tell me what you want in plain words! For example:\n` +
        `• <i>"I want to buy a gaming laptop and my budget is 700k"</i>\n` +
        `• <i>"I want to buy a lenovo legion and my budget is 1m"</i>\n` +
        `• <i>"Find me a clean iPhone 13 Pro Max for 650k"</i>\n\n` +
        `<b>Commands:</b>\n` +
        `• /location — Set or view your base city (e.g. Lagos, Abuja, PH)\n` +
        `• /mode — Switch between Live Jiji & Simulator Mode\n` +
        `• /status — Check current hunt & bot state\n` +
        `• /sim — Run 3-seller simulation with different personalities\n` +
        `• /pause — Pause the bot\n` +
        `• /resume — Resume the bot`;
      await sendMessage(chatId, welcome);
      return;
    }

    // Command: /location or /city [city_name]
    if (text.startsWith('/location') || text.startsWith('/city')) {
      const arg = text.replace(/^\/(?:location|city)\s*/i, '').trim();
      if (arg.length > 0) {
        const cleanCity = arg.charAt(0).toUpperCase() + arg.slice(1);
        if (registeredHandlers.onSetLocation) {
          registeredHandlers.onSetLocation(cleanCity);
        }
        await sendMessage(chatId, `📍 <b>BASE LOCATION SET: ${escapeHtml(cleanCity)}!</b>\n\n` +
          `Your base city is now <b>${escapeHtml(cleanCity)}</b>.\n\n` +
          `When negotiating with sellers in other states (e.g. Enugu/Lagos/PH), the bot will automatically negotiate motor park waybill delivery (Peace Mass, GIGM, etc.) directly to <b>${escapeHtml(cleanCity)}</b>.`);
        return;
      }

      const currentLoc = registeredHandlers.getLocation ? registeredHandlers.getLocation() : 'Lagos';
      const locMsg = `📍 <b>BASE LOCATION CONFIGURATION</b>\n\n` +
        `Current Base City: <b>${escapeHtml(currentLoc)}</b>\n\n` +
        `Which city are you based in? Tap below or type <code>/location &lt;City&gt;</code> (e.g. <code>/location Abuja</code>):`;

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: `${currentLoc.toLowerCase() === 'lagos' ? '✅ ' : ''}Lagos`, callback_data: `set_loc:Lagos` },
            { text: `${currentLoc.toLowerCase() === 'abuja' ? '✅ ' : ''}Abuja`, callback_data: `set_loc:Abuja` },
            { text: `${currentLoc.toLowerCase() === 'port harcourt' ? '✅ ' : ''}Port Harcourt`, callback_data: `set_loc:Port Harcourt` }
          ],
          [
            { text: `${currentLoc.toLowerCase() === 'ibadan' ? '✅ ' : ''}Ibadan`, callback_data: `set_loc:Ibadan` },
            { text: `${currentLoc.toLowerCase() === 'enugu' ? '✅ ' : ''}Enugu`, callback_data: `set_loc:Enugu` },
            { text: `${currentLoc.toLowerCase() === 'kano' ? '✅ ' : ''}Kano`, callback_data: `set_loc:Kano` }
          ],
          [
            { text: `${currentLoc.toLowerCase() === 'asaba' ? '✅ ' : ''}Asaba`, callback_data: `set_loc:Asaba` },
            { text: `${currentLoc.toLowerCase() === 'onitsha' ? '✅ ' : ''}Onitsha`, callback_data: `set_loc:Onitsha` },
            { text: `${currentLoc.toLowerCase() === 'benin' ? '✅ ' : ''}Benin`, callback_data: `set_loc:Benin` }
          ]
        ]
      };
      await sendMessage(chatId, locMsg, replyMarkup);
      return;
    }

    // Command: /mode [live|sim|demo]
    if (text.startsWith('/mode')) {
      const arg = text.replace(/^\/mode\s*/i, '').trim().toLowerCase();
      if (arg === 'live') {
        if (registeredHandlers.onSetMode) registeredHandlers.onSetMode('LIVE');
        await sendMessage(chatId, `🟢 <b>MODE SWITCHED: LIVE JIJI MARKETPLACE!</b>\n\nAll commands and searches are now routed directly to real Nigerian sellers on <b>jiji.ng</b> via your browser userscript!`);
        return;
      }
      if (arg === 'sim' || arg === 'demo') {
        if (registeredHandlers.onSetMode) registeredHandlers.onSetMode('DEMO');
        await sendMessage(chatId, `🧪 <b>MODE SWITCHED: SIMULATOR MODE!</b>\n\nSearches will run inside the 3-seller autonomous simulation environment at <code>http://localhost:5000</code>.`);
        return;
      }
      
      const curMode = registeredHandlers.getMode ? registeredHandlers.getMode() : 'DEMO';
      const modeMsg = `⚙️ <b>OPERATION MODE SWITCHBOARD</b>\n\n` +
        `Current Active Mode: <b>${curMode === 'LIVE' ? '🟢 LIVE JIJI MARKETPLACE' : '🧪 SIMULATOR MODE'}</b>\n\n` +
        `Select which environment to control:`;
      
      const replyMarkup = {
        inline_keyboard: [
          [
            { text: `${curMode === 'LIVE' ? '✅ ' : ''}🟢 Live Jiji Mode`, callback_data: `set_mode:LIVE` },
            { text: `${curMode === 'DEMO' ? '✅ ' : ''}🧪 Simulator Mode`, callback_data: `set_mode:DEMO` }
          ]
        ]
      };
      await sendMessage(chatId, modeMsg, replyMarkup);
      return;
    }

    // Command: /status
    if (text === '/status') {
      if (registeredHandlers.getStatus) {
        const status = registeredHandlers.getStatus();
        const curMode = registeredHandlers.getMode ? registeredHandlers.getMode() : (status.mode || 'DEMO');
        const userLoc = registeredHandlers.getLocation ? registeredHandlers.getLocation() : 'Lagos';
        const statusMsg = `📊 <b>ENGINE STATUS</b>\n\n` +
          `⚙️ <b>Operating Mode:</b> ${curMode === 'LIVE' ? '🟢 LIVE JIJI (jiji.ng)' : '🧪 SIMULATOR (localhost:5000)'}\n` +
          `📍 <b>Base City:</b> ${escapeHtml(userLoc)}\n` +
          `🤖 <b>Bot State:</b> ${botActiveState ? '🟢 ACTIVE' : '🔴 PAUSED'}\n` +
          `🎯 <b>Target Item:</b> ${status.query || 'None'}\n` +
          `💰 <b>Max Budget:</b> ₦${Number(status.max_budget || 0).toLocaleString()}\n` +
          `🏷️ <b>Target Price:</b> ₦${Number(status.target_price || 0).toLocaleString()}\n` +
          `👥 <b>Active Sellers in Hunt:</b> ${status.active_sellers || 0}\n` +
          `🏆 <b>Hunt Status:</b> ${status.hunt_status || 'IDLE'}\n\n` +
          `<i>Control Centre available at: http://localhost:5000</i>`;
        await sendMessage(chatId, statusMsg);
      }
      return;
    }

    // Command: /pause or /stop
    if (text === '/pause' || text === '/stop') {
      botActiveState = false;
      if (registeredHandlers.onToggleBot) registeredHandlers.onToggleBot(false);
      await sendMessage(chatId, `⏸️ <b>Bot paused.</b> Autonomous outreach and replies are on hold. Send /resume to reactivate.`);
      return;
    }

    // Command: /resume or /on
    if (text === '/resume' || text === '/on') {
      botActiveState = true;
      if (registeredHandlers.onToggleBot) registeredHandlers.onToggleBot(true);
      await sendMessage(chatId, `▶️ <b>Bot resumed.</b> Autonomous outreach and bargaining are active!`);
      return;
    }

    // Command: /sim or /simulate (with optional query like /sim laptop, /sim phone, etc.)
    if (text.startsWith('/sim') || text.startsWith('/simulate')) {
      const simTarget = text.replace(/^\/(?:sim|simulate)\s*/i, '').trim();
      if (registeredHandlers.onRunSimulation) {
        const item = await registeredHandlers.onRunSimulation(simTarget);
        const simMsg = `🚀 <b>LIVE SIMULATION LAUNCHED!</b>\n\n` +
          `📦 <b>Target:</b> ${item?.query || item?.name || 'Selected Item'}\n` +
          `💰 <b>Budget:</b> ₦${Number(item?.budget || 850000).toLocaleString()}\n` +
          `👥 <b>Candidate Sellers:</b> 3 sellers (Yielding, Bluff-Tester, Stubborn)\n\n` +
          `💻 <b>WATCH IT CHAT LIVE ON YOUR COMPUTER SCREEN:</b>\n` +
          `👉 <code>http://localhost:5000</code>\n\n` +
          `<i>The bot is negotiating turn-by-turn right now. I will send you the Deal Card here the moment a seller agrees!</i>`;
        await sendMessage(chatId, simMsg);
      } else {
        await sendMessage(chatId, `⚠️ Simulator not hooked yet.`);
      }
      return;
    }

    // Natural Language Shopping Request
    const parseResult = await parseHuntInstruction(text);

    if (parseResult.missing_info === 'budget' && parseResult.item) {
      await sendMessage(chatId, `🎯 Got it, you want <b>${parseResult.item}</b>!\n\n${parseResult.clarification_question || 'What is your maximum budget in Naira (e.g. 700k, 1m)?'}`);
      return;
    }

    if (parseResult.missing_info === 'item' && parseResult.budget) {
      await sendMessage(chatId, `💰 Budget of <b>₦${parseResult.budget.toLocaleString()}</b> received!\n\n${parseResult.clarification_question || 'What specific item or model do you want me to search for on Jiji?'}`);
      return;
    }

    if (!parseResult.item || !parseResult.budget) {
      await sendMessage(chatId, `🤔 I didn't quite catch the item or budget.\n\nTry saying something like:\n<i>"I want to buy a gaming laptop and my budget is 850k"</i> or <i>"Find iPhone 13 Pro Max budget 680k"</i>.`);
      return;
    }

    // Both Item & Budget recognized!
    if (registeredHandlers.onHuntInstruction) {
      const curMode = registeredHandlers.getMode ? registeredHandlers.getMode() : 'DEMO';

      // Reality check: only in DEMO mode check against mock item database!
      // In LIVE mode, any item on real Jiji (e.g. S24 Ultra) must dispatch directly to jiji.ng!
      if (curMode === 'DEMO' && registeredHandlers.checkPriceRange) {
        const check = registeredHandlers.checkPriceRange(parseResult.item, parseResult.budget);
        if (check && check.isTooLow) {
          const lowMsg = `⚠️ <b>BUDGET ALERT: ₦${parseResult.budget.toLocaleString()} IS TOO LOW!</b>\n\n` +
            `📦 <b>Item:</b> ${check.name}\n` +
            `💰 <b>Your Budget:</b> ₦${parseResult.budget.toLocaleString()}\n` +
            `🏷️ <b>Lowest Listing Found in Demo:</b> <b>₦${check.lowestPrice.toLocaleString()}</b> <i>(Seller: ${check.lowestSeller})</i>\n\n` +
            `The cheapest genuine listing available for this demo item is listed at <b>₦${check.lowestPrice.toLocaleString()}</b>. Offering ₦${parseResult.budget.toLocaleString()} is too far below the market price and will be rejected immediately.\n\n` +
            `💡 <i>Would you like to bump your budget to <b>₦${check.lowestPrice.toLocaleString()}</b> so we can simulate negotiations?</i>`;
          
          const replyMarkup = {
            inline_keyboard: [
              [
                { text: `🚀 Bump Budget to ₦${(check.lowestPrice / 1000).toLocaleString()}k`, callback_data: `bump:${check.id}:${check.lowestPrice}` }
              ],
              [
                { text: `❌ Cancel Hunt`, callback_data: `cancel_hunt` }
              ]
            ]
          };
          await sendMessage(chatId, lowMsg, replyMarkup);
          return;
        }
      }

      const userLoc = registeredHandlers.getLocation ? registeredHandlers.getLocation() : 'Lagos';

      // Send immediate confirmation to Telegram first so user gets instant response
      if (curMode === 'LIVE') {
        const confMsg = `🚀 🟢 <b>LIVE JIJI HUNT STARTED FOR ${escapeHtml((parseResult.item).toUpperCase())}!</b>\n\n` +
          `📦 <b>Target:</b> ${escapeHtml(parseResult.item)}\n` +
          `💰 <b>Max Budget:</b> ₦${parseResult.budget.toLocaleString()}\n` +
          `📍 <b>Base City:</b> ${escapeHtml(userLoc)} <i>(/location to change)</i>\n` +
          `🌐 <b>Marketplace:</b> Real Nigerian Jiji (jiji.ng)\n\n` +
          `🔗 <b>Direct Jiji Search Link:</b>\n` +
          `👉 <a href="https://jiji.ng/search?query=${encodeURIComponent(parseResult.item)}">https://jiji.ng/search?query=${encodeURIComponent(parseResult.item)}</a>\n\n` +
          `⚡ <b>Tampermonkey Extension:</b>\n` +
          `Your browser tab is picking up this search, filtering authentic listings, and starting automated Pidgin negotiations with vendors now!\n\n` +
          `<i>All deal review cards & bank verification details will be delivered right here for your 1-tap approval!</i>`;
        await sendMessage(chatId, confMsg);
      } else {
        const confMsg = `🚀 <b>HUNT STARTED FOR ${escapeHtml((parseResult.item).toUpperCase())}!</b>\n\n` +
          `📦 <b>Target:</b> ${escapeHtml(parseResult.item)}\n` +
          `💰 <b>Max Budget:</b> ₦${parseResult.budget.toLocaleString()}\n` +
          `📍 <b>Base City:</b> ${escapeHtml(userLoc)} <i>(/location to change)</i>\n` +
          `👥 <b>Candidate Sellers:</b> 3 verified sellers contacted on Jiji\n\n` +
          `💻 <b>WATCH LIVE ON YOUR COMPUTER SCREEN:</b>\n` +
          `👉 <code>http://localhost:5000</code>\n\n` +
          `<i>The bot is actively chatting with all 3 sellers right now. All updates and decision requests will be sent right here on Telegram!</i>`;
        await sendMessage(chatId, confMsg);
      }

      // Trigger hunt asynchronously in the background so user UI is not blocked
      Promise.resolve().then(async () => {
        try {
          await registeredHandlers.onHuntInstruction(parseResult.item, parseResult.budget, text);
        } catch (err) {
          console.error('[Telegram] Background onHuntInstruction error:', err);
        }
      });
    }
  }
}

/**
 * Long-polling worker for Telegram
 */
async function startPolling() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[Telegram Bot] TELEGRAM_BOT_TOKEN is not configured in .env. Long-polling skipped.');
    return;
  }
  if (isPolling) return;
  isPolling = true;
  console.log('[Telegram Bot] Starting long-polling service for @Azzaagent_bot...');

  // Greet user on boot
  sendMessage(DEFAULT_CHAT_ID, `🤖 <b>Azza Haggler Engine Online!</b>\nReady to accept commands. Send me what you want to hunt (e.g. <i>"I want a gaming laptop and my budget is 700k"</i>).`).catch(() => {});

  while (isPolling) {
    try {
      const url = `${API_BASE}/getUpdates?offset=${lastUpdateId + 1}&timeout=25`;
      const res = await fetch(url);
      if (!res.ok) {
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }
      const data = await res.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
          try {
            await processUpdate(update);
          } catch (procErr) {
            console.error('[Telegram] Error processing update:', procErr);
          }
        }
      }
    } catch (err) {
      console.warn('[Telegram Polling] Network warning:', err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

function stopPolling() {
  isPolling = false;
}

function setHandlers(handlers) {
  registeredHandlers = { ...registeredHandlers, ...handlers };
}

module.exports = {
  startPolling,
  stopPolling,
  setHandlers,
  sendMessage,
  sendDealCard,
  sendBluffAcceptedCard,
  sendBluffRefusedAlert,
  sendAllDeadlockedAdvisory,
  sendAllRejectedAdvisory,
  sendWinnerCelebration,
  sendStalledSellerAlert,
  sendLiveBudgetAlert,
  parseHuntInstruction,
  DEFAULT_CHAT_ID
};
