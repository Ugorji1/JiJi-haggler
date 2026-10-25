require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const store = require('./store');
const ai = require('./ai');
const azza = require('./azza');
const telegram = require('./telegram');
const simulator = require('./simulator');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve Tampermonkey Userscript directly
app.get('/jiji_haggler.user.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'jiji_haggler.user.js'));
});

// In-memory system logs buffer for Control Centre
const systemLogs = [];
function logEvent(type, message, data = null) {
  const entry = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toLocaleTimeString(),
    type,
    message,
    data
  };
  systemLogs.push(entry);
  if (systemLogs.length > 250) systemLogs.shift();
  console.log(`[${entry.type}] ${message}`);
}

// Operating Mode: 'DEMO' (Simulator) or 'LIVE' (Real Jiji Marketplace)
let currentOperatingMode = 'DEMO';

// User Base Location for Interstate & Pickup (e.g. 'Lagos', 'Abuja', 'Port Harcourt')
let currentUserLocation = 'Lagos';

// In-memory active hunt configuration
let activeHunt = {
  hunt_id: `hunt_${Date.now()}`,
  query: 'PlayStation 5 Disc Edition',
  min_price: 150000,
  max_budget: 230000,
  target_price: 215000,
  mode: currentOperatingMode,
  auto_pilot: true
};

let lastTelegramApprovalTime = 0;

// Connect Simulator events to Log & Telegram
simulator.on((type, data) => {
  if (type === 'log') {
    logEvent('SIM', data.text);
  } else if (type === 'deal_proposed') {
    logEvent('DEAL', `[Sim] Deal proposed with ${data.seller?.name}! Sending card to Telegram.`);
    telegram.sendDealCard(data.deal, data.hunt_id).then(res => {
      if (!res || !res.ok) {
        console.warn('[Server] sendDealCard returned non-ok result, retrying in 2.5s...', res);
        setTimeout(() => telegram.sendDealCard(data.deal, data.hunt_id), 2500);
      }
    }).catch(err => {
      console.error('[Server] sendDealCard error:', err);
    });
  } else if (type === 'bluff_accepted') {
    logEvent('BLUFF', `[Sim] Bluff accepted by ${data.seller_name} at ₦${Number(data.price).toLocaleString()}! Sending updated card to Telegram.`);
    telegram.sendBluffAcceptedCard(data.dialog_id, data.hunt_id, data.seller_name, data.price, data.deal).catch(err => {
      console.error('[Server] sendBluffAcceptedCard error:', err);
    });
  } else if (type === 'bluff_refused') {
    logEvent('BLUFF', `[Sim] Bluff refused by ${data.seller_name}! Sending alert to Telegram.`);
    telegram.sendBluffRefusedAlert(data.dialog_id, data.hunt_id, data.seller_name, data.price).catch(err => {
      console.error('[Server] sendBluffRefusedAlert error:', err);
    });
  } else if (type === 'all_deadlocked') {
    logEvent('DEAL', `[Sim] All sellers deadlocked! Lowest offer achieved: ₦${Number(data.bestCandidate.lowestPrice).toLocaleString()} from ${data.bestCandidate.seller_name}. Sending advisory to Telegram.`);
    telegram.sendAllDeadlockedAdvisory(data.hunt_id, data.bestCandidate, data.userBudget).catch(err => {
      console.error('[Server] sendAllDeadlockedAdvisory error:', err);
    });
  } else if (type === 'winner_crowned') {
    logEvent('DEAL', `[Sim] Winner crowned: ${data.seller_name || data.winner}! Azza quote generated.`);
    const isDirectTelegramApproval = (Date.now() - lastTelegramApprovalTime < 2500) && !data.was_confirmation;
    if (!isDirectTelegramApproval) {
      telegram.sendWinnerCelebration(data.seller_name, data.agreed_price, data.azza).catch(err => {
        console.error('[Server] sendWinnerCelebration error:', err);
      });
    } else {
      console.log('[Server] Skipping duplicate celebration message because Telegram deal card was already updated synchronously.');
    }
  } else if (type === 'winner_switched') {
    logEvent('DEAL', `[Sim] Winner switched to ${data.seller_name}! Azza quote generated.`);
  }
});

// Connect Telegram handlers for Natural Language commands & deal cards
telegram.setHandlers({
  onHuntInstruction: async (itemTitle, maxBudget, rawText) => {
    const isLive = currentOperatingMode === 'LIVE';
    const newHuntId = `hunt_${Date.now()}`;
    
    let targetQuery = itemTitle;
    let targetItemName = itemTitle;
    let matchedItem = null;

    if (!isLive) {
      matchedItem = simulator.findBestMatchingItem(itemTitle);
      targetQuery = matchedItem.query || itemTitle;
      targetItemName = matchedItem.name;
    }

    activeHunt = {
      hunt_id: newHuntId,
      query: targetQuery,
      min_price: Math.round(maxBudget * 0.7),
      max_budget: maxBudget,
      target_price: Math.round(maxBudget * 0.9),
      mode: currentOperatingMode,
      status: isLive ? 'PENDING_DISPATCH' : 'ACTIVE',
      auto_pilot: true
    };
    store.getOrCreateHunt(newHuntId, { query: activeHunt.query, max_budget: maxBudget });
    logEvent('TELEGRAM', `User started hunt: "${targetQuery}" | Budget: ₦${maxBudget.toLocaleString()} [Mode: ${currentOperatingMode}]`);

    if (!isLive && matchedItem) {
      // Launch live autonomous negotiation in simulator!
      simulator.startAutonomousSimulation(matchedItem.id, maxBudget);
    } else {
      logEvent('LIVE', `Awaiting Tampermonkey userscript on Jiji to pick up hunt "${activeHunt.query}"...`);
    }

    return {
      query: activeHunt.query,
      item_name: targetItemName,
      budget: maxBudget,
      mode: currentOperatingMode
    };
  },
  onRunSimulation: async (query) => {
    logEvent('SYSTEM', `Triggering live negotiation simulation from Telegram...`);
    const matched = simulator.findBestMatchingItem(query || activeHunt.query);
    simulator.startAutonomousSimulation(matched.id, activeHunt.max_budget || matched.budget);
    return matched;
  },
  onSetMode: (mode) => {
    const target = mode === 'LIVE' ? 'LIVE' : 'DEMO';
    currentOperatingMode = target;
    activeHunt.mode = target;
    simulator.setMode(target);
    logEvent('SYSTEM', `Operating Mode switched to: ${target} via Telegram`);
    return target;
  },
  getMode: () => currentOperatingMode,
  onDealAction: async (action, dialogId, huntId) => {
    logEvent('TELEGRAM', `User clicked "${action}" on deal ${dialogId}`);
    if (action === 'approve') {
      lastTelegramApprovalTime = Date.now();
      const session = store.getSession(dialogId);
      const hunt = store.getHunt(huntId) || store.getHuntForDialog(dialogId);
      if (session && hunt) {
        // CHECK IF A WINNER IS ALREADY CROWNED FOR THIS HUNT!
        if (hunt.status === 'WON' && hunt.winning_dialog_id) {
          if (hunt.winning_dialog_id === dialogId) {
            // Already crowned this same seller!
            return {
              already_crowned_same: true,
              seller_name: hunt.winner_seller || session.seller_name,
              agreed_price: hunt.winner_price || session.current_offer,
              azza: hunt.azza_quote,
              session
            };
          } else {
            // User clicked approve on a DIFFERENT seller while a winner is already active!
            const proposed = hunt.proposed_deals ? hunt.proposed_deals[dialogId] : null;
            const targetAgreed = proposed?.agreed_price || session.current_offer || session.target_price || 0;
            return {
              prompt_switch: true,
              current_winner: hunt.winner_seller,
              current_price: hunt.winner_price,
              current_dialog_id: hunt.winning_dialog_id,
              new_seller: session.seller_name,
              new_price: targetAgreed,
              new_dialog_id: dialogId,
              hunt_id: hunt.hunt_id,
              session
            };
          }
        }

        const proposed = hunt.proposed_deals ? hunt.proposed_deals[dialogId] : null;
        const paymentDetails = session.payment_details || proposed?.payment_details || {};
        const agreedAmount = proposed?.agreed_price || session.current_offer || session.target_price || 50000;
        paymentDetails.amount_ngn = agreedAmount;
        const azzaPayload = azza.buildPaymentUrl(paymentDetails, agreedAmount);
        const updatedHunt = store.crownWinner(hunt.hunt_id, dialogId, azzaPayload);

        const isLiveDialog = !dialogId.startsWith('sim_') || currentOperatingMode === 'LIVE';
        if (isLiveDialog) {
          const holdingMsg = "Haba boss, no vex na No wahala at all, ₦" + Number(agreedAmount).toLocaleString() + " agreed as we talk before. Make I quickly arrange and verify the payment now, make i still pay?";
          store.setPendingAction(dialogId, holdingMsg, 'approve');
          store.appendMessage(dialogId, 'me', holdingMsg);

          // Stand down competitor dialogs in this hunt
          if (hunt.dialog_ids) {
            for (const dId of hunt.dialog_ids) {
              if (dId !== dialogId) {
                const standDownMsg = "Thank you boss, I don already see another seller wey do price for me. Bless up!";
                store.setPendingAction(dId, standDownMsg, 'stand_down');
                store.appendMessage(dId, 'me', standDownMsg);
              }
            }
          }
          logEvent('DEAL', `🏆 [Live Jiji] Winner crowned for ${session.seller_name}! Azza quote generated.`);
          return { success: true, agreed_price: agreedAmount, azza: azzaPayload, session, hunt: updatedHunt };
        } else {
          const result = simulator.handleApprove(dialogId, azzaPayload);
          if (result?.awaiting_confirmation) {
            logEvent('DEAL', `De-escalation sent to ${session.seller_name}. Awaiting final confirmation.`);
            return { success: true, awaiting_confirmation: true, agreed_price: agreedAmount, session };
          }
          logEvent('DEAL', `🏆 WINNER CROWNED for ${session.seller_name}! Azza quote generated.`);
          return { success: true, agreed_price: agreedAmount, azza: azzaPayload, session, hunt: updatedHunt };
        }
      }
    } else if (action === 'bluff') {
      const session = store.getSession(dialogId);
      const hunt = store.getHunt(huntId) || store.getHuntForDialog(dialogId);
      if (hunt && hunt.status === 'WON') {
        return { already_won: true, winner_name: hunt.winner_seller };
      }
      if (session && hunt) {
        const isLiveDialog = !dialogId.startsWith('sim_') || currentOperatingMode === 'LIVE';
        if (isLiveDialog) {
          const currentPrice = session.current_offer || session.asking_price || 500000;
          const targetBluff = Math.round((currentPrice * 0.95) / 1000) * 1000;
          store.setBluffState(hunt.hunt_id, dialogId, targetBluff);
          const bluffText = `Oga I get ₦${targetBluff.toLocaleString()} cash on ground right now if you fit do am make I pay sharp sharp`;
          store.setPendingAction(dialogId, bluffText, 'bluff');
          store.appendMessage(dialogId, 'me', bluffText);
          logEvent('BLUFF', `[Live Jiji] Queued lower bluff for ${session.seller_name}: ₦${targetBluff.toLocaleString()}`);
          return { success: true, bluff_price: targetBluff, session };
        } else {
          const result = await simulator.handleBluffLower(dialogId);
          const targetBluff = result?.bluff_price || Math.round((session.current_offer || 500000) * 0.95);
          store.setBluffState(hunt.hunt_id, dialogId, targetBluff);
          logEvent('BLUFF', `Bluffed lower with ${session.seller_name}: ₦${targetBluff.toLocaleString()}`);
          return { success: true, bluff_price: targetBluff, session };
        }
      }
    } else if (action === 'reject') {
      const session = store.getSession(dialogId);
      const hunt = store.getHunt(huntId) || store.getHuntForDialog(dialogId);
      if (hunt && hunt.status === 'WON') {
        return { already_won: true, winner_name: hunt.winner_seller };
      }
      if (hunt && dialogId) {
        const isLiveDialog = !dialogId.startsWith('sim_') || currentOperatingMode === 'LIVE';
        store.rejectDeal(hunt.hunt_id, dialogId);
        store.updateSession(dialogId, { status: 'REJECTED_CLOSED', reject_sent: true });
        if (isLiveDialog) {
          const exitText = "Thanks my oga, I check the details and location well, e no go fit work for me. Appreciate your time boss!";
          store.setPendingAction(dialogId, exitText, 'reject');
          store.appendMessage(dialogId, 'me', exitText);
          logEvent('DEAL', `[Live Jiji] Rejected deal with ${session?.seller_name || dialogId}`);
        } else {
          simulator.handleReject(dialogId);
          logEvent('DEAL', `Rejected deal with ${session?.seller_name || dialogId}`);
        }
        return { success: true };
      }
    }
  },
  onSwitchWinner: async (newDialogId, huntId) => {
    logEvent('TELEGRAM', `User confirmed switching winner to ${newDialogId}`);
    const session = store.getSession(newDialogId);
    const hunt = store.getHunt(huntId) || store.getHuntForDialog(newDialogId);
    if (session && hunt) {
      const oldDialogId = hunt.winning_dialog_id;
      const oldWinnerName = hunt.winner_seller;
      const proposed = hunt.proposed_deals ? hunt.proposed_deals[newDialogId] : null;
      const paymentDetails = session.payment_details || proposed?.payment_details || {};
      const agreedAmount = proposed?.agreed_price || session.current_offer || session.target_price || 50000;
      paymentDetails.amount_ngn = agreedAmount;
      const azzaPayload = azza.buildPaymentUrl(paymentDetails, agreedAmount);

      simulator.handleSwitchWinner(newDialogId, oldDialogId, azzaPayload);
      const updatedHunt = store.crownWinner(hunt.hunt_id, newDialogId, azzaPayload);

      logEvent('DEAL', `🏆 WINNER SWITCHED to ${session.seller_name}! (Was: ${oldWinnerName})`);
      return {
        success: true,
        new_seller: session.seller_name,
        new_price: agreedAmount,
        old_seller: oldWinnerName,
        azza: azzaPayload,
        session,
        hunt: updatedHunt
      };
    }
    return { success: false };
  },
  getCurrentWinner: (huntId) => {
    const hunt = store.getHunt(huntId) || activeHunt;
    if (hunt && hunt.winner_seller) {
      return {
        name: hunt.winner_seller,
        price: hunt.winner_price,
        azza: hunt.azza_quote
      };
    }
    return null;
  },
  onAcceptDeadlocked: async (dialogId, acceptedPrice) => {
    logEvent('TELEGRAM', `User accepted deadlocked counter-offer of ₦${Number(acceptedPrice).toLocaleString()} for ${dialogId}`);
    const session = store.getSession(dialogId);
    const hunt = store.getHuntForDialog(dialogId) || store.getHunt(activeHunt.hunt_id);
    const paymentDetails = session?.payment_details || session?.details || {};
    paymentDetails.amount_ngn = acceptedPrice;
    const azzaPayload = azza.buildPaymentUrl(paymentDetails, acceptedPrice);
    
    const isLiveDialog = !dialogId.startsWith('sim_') || currentOperatingMode === 'LIVE';
    if (isLiveDialog) {
      const reviveMsg = `No wahala boss, I don agree for the ₦${Number(acceptedPrice).toLocaleString()}. Make I quickly arrange payment now, make you package am for me?`;
      store.setPendingAction(dialogId, reviveMsg, 'approve');
      store.appendMessage(dialogId, 'me', reviveMsg);
      if (hunt) {
        store.crownWinner(hunt.hunt_id, dialogId, azzaPayload);
      }
      return { success: true, session, azza: azzaPayload };
    } else {
      const result = simulator.handleAcceptDeadlocked(dialogId, acceptedPrice, azzaPayload);
      return { success: true, session, result, azza: azzaPayload };
    }
  },
  checkPriceRange: (query, userBudget) => {
    return simulator.checkPriceRange(query, userBudget);
  },
  onToggleBot: (state) => {
    activeHunt.auto_pilot = state;
    logEvent('SYSTEM', `Bot master switch set to: ${state ? 'ACTIVE' : 'PAUSED'}`);
  },
  getStatus: () => {
    const hunt = store.getHunt(activeHunt.hunt_id);
    return {
      query: activeHunt.query,
      max_budget: activeHunt.max_budget,
      target_price: activeHunt.target_price,
      active_sellers: hunt?.dialog_ids?.length || 0,
      hunt_status: hunt?.status || 'ACTIVE',
      mode: currentOperatingMode,
      user_location: currentUserLocation
    };
  },
  onSetLocation: (loc) => {
    if (loc) {
      currentUserLocation = loc.trim();
      logEvent('LOCATION', `Base city updated to: ${currentUserLocation}`);
    }
    return currentUserLocation;
  },
  getLocation: () => currentUserLocation,
  getActiveQuery: () => activeHunt.query,
  onSweetenOffer: async (dialogId, sweetPrice) => {
    const session = store.getSession(dialogId);
    const sellerName = session?.seller_name || 'Seller';
    const sweetMsg = `Oga no vex, make I add ₦20,000 join, ₦${Number(sweetPrice).toLocaleString()} last card make I come carry am now?`;
    store.setPendingAction(dialogId, sweetMsg, 'sweeten');
    store.appendMessage(dialogId, 'me', sweetMsg);
    logEvent('DEAL', `Queued sweetened offer for ${sellerName}: ₦${Number(sweetPrice).toLocaleString()}`);
    return { success: true, sweetMsg };
  },
  onSkipStalled: async (dialogId) => {
    const session = store.getSession(dialogId);
    const sellerName = session?.seller_name || 'Seller';
    store.updateSession(dialogId, { status: 'STALLED' });
    activeHunt.expand_requested = true;
    logEvent('DEAL', `Skipped stalled seller ${sellerName}. Expansion requested for active hunt.`);
    return { success: true };
  },
  onSearchNationwide: async (huntId) => {
    activeHunt.force_nationwide = true;
    logEvent('HUNT', `Telegram user expanded hunt to All Nigeria.`);
    return { success: true };
  }
});

// Heuristic Extractor for Nigerian Payment & Location Details
function extractPaymentDetailsHeuristically(text, history = []) {
  if (!text) return {};
  const fullText = [text, ...history.map(h => h.text || '')].join('\n');
  const lower = text.toLowerCase();
  const fullLower = fullText.toLowerCase();
  const details = {};

  // 1. In-Person Shop Address / Physical Location Detection
  const isAddress = /\b(street|road|rd\b|way|plaza|complex|ikeja|yaba|island|mainland|computer village|market|otigba|estate|close|crescent|avenue|ave\b|cornerstone|igbogbo|ikorodu|off\s+[a-z]+|beside|opposite|behind|near|junction|bustop|bus-stop|shop\b|store\b)\b/i.test(fullText);

  // 2. Bank name detection (Strict: exclude if part of a physical address landmark like "beside stanbic bank" or "opposite zenith")
  const banks = ['opay', 'palmpay', 'kuda', 'gtbank', 'gtb', 'zenith', 'access', 'uba', 'first bank', 'fcmb', 'stanbic', 'sterling', 'wema', 'polaris', 'fidelity', 'union', 'moniepoint', 'rubies', 'vfd', 'jaiz', 'taj'];
  let detectedBank = null;
  for (const b of banks) {
    const bankRegex = new RegExp(`\\b${b}\\b`, 'i');
    if (bankRegex.test(lower)) {
      const isLandmark = new RegExp(`(?:beside|opposite|near|behind|after|close to|around|facing|adjacent to)\\s+(?:the\\s+)?${b}`, 'i').test(lower) ||
                         (new RegExp(`${b}\\s+(?:bank|branch|plaza|building|atm|bus stop|bustop|junction)`, 'i').test(lower) && isAddress);
      const hasStrictPaymentContext = /\b(account|acct|transfer|pay to|send to|payment|nuban|transfer to|wire to)\b/i.test(lower);
      if (!isLandmark || hasStrictPaymentContext) {
        detectedBank = b.toUpperCase();
        break;
      }
    }
  }

  if (detectedBank) {
    details.bank = detectedBank;
  }

  // 3. Number extraction: 11-digit mobile (080, 081, 090, 091, 070) vs 10-digit NUBAN
  const numbers11 = fullText.match(/\b(0[789][01]\d{8})\b/g) || [];
  const numbers10 = fullText.match(/\b([0-9]{10})\b/g) || [];

  if (numbers11.length > 0) {
    details.phone_number = numbers11[0];
  }

  const hasPaymentContext = Boolean(details.bank) && /\b(account|acct|transfer|pay to|send to|payment|nuban)\b/i.test(fullText);

  if (hasPaymentContext && numbers10.length > 0) {
    for (const n10 of numbers10) {
      const isSubOf11 = numbers11.some(n11 => n11.includes(n10));
      if (!isSubOf11) {
        details.account_number = n10;
        break;
      }
    }
  }

  // If fintech (OPay, PalmPay, Moniepoint) with explicit payment context
  if (hasPaymentContext && (details.bank === 'OPAY' || details.bank === 'PALMPAY' || details.bank === 'MONIEPOINT') && numbers11.length > 0 && !details.account_number) {
    details.account_number = numbers11[0];
  }

  // 3b. Account Name extraction
  const nameMatch = fullText.match(/(?:name\s*(?:is|:|\-)?\s*|account\s*name\s*(?:is|:|\-)?\s*)([A-Za-z]+(?:\s+[A-Za-z]+){1,2})/i);
  const afterAcctMatch = fullText.match(/\b[0-9]{10,11}\s+([A-Za-z]+(?:\s+[A-Za-z]+){1,2})/);
  if (nameMatch) {
    details.account_name = nameMatch[1].trim();
  } else if (afterAcctMatch && hasPaymentContext) {
    details.account_name = afterAcctMatch[1].trim();
  }

  // 4. Interstate Waybill Detection
  const isWaybill = /waybill|send through park|peace mass|gigm|gig\b|young shall grow|abc transport|interstate|bus park|driver|courier|speedaf/i.test(fullText);
  if (isWaybill) {
    details.deal_type = 'INTERSTATE_WAYBILL';
    details.waybill_required = true;
    const waybillCompanies = ['peace mass', 'gigm', 'gig logistics', 'gig motors', 'young shall grow', 'abc transport', 'guo', 'speedaf', 'dhl', 'park driver', 'motor park'];
    for (const c of waybillCompanies) {
      if (fullLower.includes(c)) {
        details.waybill_method = c.toUpperCase();
        break;
      }
    }
    if (!details.waybill_method) details.waybill_method = 'Park Bus / Waybill';
  }

  // 5. In-Person Inspection / Shop Pickup
  const isInspection = !isWaybill && (isAddress || /come\s*shop|pick\s*up|pickup|inspect|service\s*is\s*provided|pay\s*on\s*delivery|before\s*u\s*make\s*payment/i.test(fullText));
  if (isInspection) {
    details.deal_type = 'IN_PERSON_INSPECTION';
    details.inspection_required = true;
  } else if (details.bank && details.account_number) {
    details.deal_type = 'DIRECT_TRANSFER';
  }

  // 6. City / Address extraction
  const cityMention = fullText.match(/\b(enugu|lagos|abuja|ibadan|kano|port\s*harcourt|benin|asaba|owerri|onitsha|warri|aba|calabar|uyo|ilorin|jos|kaduna|ikorodu|ikeja)\b/i);
  if (cityMention) {
    details.seller_city = cityMention[1].trim();
  }

  // Clean pickup address extraction
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
  const addressLines = lines.filter(l => /\b(street|road|rd\b|way|plaza|complex|village|estate|close|crescent|avenue|otigba)\b/i.test(l) && !/^\+?[0-9\s-]{10,14}$/.test(l));
  if (addressLines.length > 0) {
    details.pickup_address = addressLines[0];
  } else {
    const generalLines = lines.filter(l => /\b(ikeja|ikorodu|igbogbo|yaba|island|mainland|computer village)\b/i.test(l) && !/^\+?[0-9\s-]{10,14}$/.test(l));
    if (generalLines.length > 0) {
      details.pickup_address = generalLines[0];
    } else if (cityMention) {
      details.pickup_address = cityMention[1].trim();
    }
  }

  return details;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'active', timestamp: new Date().toISOString() });
});

// Get or update active hunt parameters
app.get('/api/hunt', (req, res) => {
  res.json(activeHunt);
});

app.post('/api/hunt', (req, res) => {
  const { hunt_id, query, min_price, max_budget, target_price, auto_pilot } = req.body;
  const hId = hunt_id || activeHunt.hunt_id || `hunt_${Date.now()}`;
  activeHunt = {
    hunt_id: hId,
    query: query || activeHunt.query,
    min_price: Number(min_price) || activeHunt.min_price,
    max_budget: Number(max_budget) || activeHunt.max_budget,
    target_price: Number(target_price) || activeHunt.target_price,
    auto_pilot: auto_pilot !== undefined ? auto_pilot : activeHunt.auto_pilot
  };
  store.getOrCreateHunt(hId, { query: activeHunt.query, max_budget: activeHunt.max_budget });
  console.log('Updated active hunt cohort:', activeHunt);
  res.json({ success: true, hunt: activeHunt });
});

// FLOW 1: Generate opening pitch for new listing
app.post('/api/opener', async (req, res) => {
  try {
    const { dialog_id, hunt_id, seller_name, item_title, asking_price, listing_url, budget } = req.body;

    let asking = Number(asking_price) || 500000;
    // Sanitize in case price extracted concatenated market ranges (e.g. 250000310330)
    if (asking > 50000000) {
      const askingStr = asking.toString();
      const sanitized = parseInt(askingStr.slice(0, 6), 10);
      if (sanitized > 1000) asking = sanitized;
    }
    let maxBudget = Number(budget) || activeHunt.max_budget || asking;
    // Sanity check: If budget is drastically mismatched with asking price
    if (asking >= 10000 && maxBudget < asking * 0.4) {
      console.warn(`[Budget Calibrator] Stale budget ₦${maxBudget} is below 40% of asking price ₦${asking}. Calibrating budget to 90% of asking price.`);
      maxBudget = Math.round(asking * 0.9);
    }

    const currentHuntId = hunt_id || activeHunt.hunt_id || `hunt_${Date.now()}`;
    store.addDialogToHunt(currentHuntId, dialog_id);

    const openerResult = await ai.generateOpeningPitch(item_title || 'Item', asking, maxBudget);
    const openerText = typeof openerResult === 'string' ? openerResult : openerResult.reply_text;
    const openingOffer = openerResult.opening_offer || Math.round(asking * 0.86);

    // Initialize session in store
    const session = store.getOrCreateSession(dialog_id, {
      hunt_id: currentHuntId,
      seller_name,
      item_title: item_title || 'Item',
      asking_price: asking,
      target_price: maxBudget,
      current_offer: openingOffer,
      listing_url,
      user_location: req.body.user_location || currentUserLocation,
      status: 'PENDING_REPLY'
    });

    if (listing_url) {
      store.saveListingMapping(seller_name, item_title, listing_url);
    }

    store.appendMessage(dialog_id, 'me', openerText);
    store.updateSession(dialog_id, {
      turn_count: 1,
      status: 'PENDING_REPLY',
      current_offer: openingOffer
    });

    res.json({
      success: true,
      opener: openerText,
      reply_text: openerText,
      pitch: {
        reply_text: openerText,
        opening_offer: openingOffer
      },
      opening_offer: openingOffer,
      session
    });
  } catch (err) {
    console.error('Error generating opener:', err);
    res.status(500).json({ error: err.message });
  }
});

// FLOW 2: Process incoming seller message from messages switchboard
app.post('/api/chat-turn', async (req, res) => {
  try {
    const { dialog_id, message, seller_name, item_title, asking_price, budget, hunt_id } = req.body;

    if (!dialog_id || !message) {
      return res.status(400).json({ error: 'dialog_id and message are required' });
    }

    const parsedAsking = Number(asking_price) > 0 ? Number(asking_price) : 0;
    const parsedBudget = Number(budget) > 0 ? Number(budget) : 0;

    let session = store.getSession(dialog_id);
    let hunt = store.getHuntForDialog(dialog_id) || (hunt_id ? store.getHunt(hunt_id) : null);

    // If activeHunt was already WON, create a fresh hunt for new items
    if (!hunt) {
      const activeHuntStatus = store.getHunt(activeHunt.hunt_id)?.status;
      if (activeHuntStatus === 'WON') {
        activeHunt.hunt_id = `hunt_${Date.now()}`;
        activeHunt.status = 'ACTIVE';
        activeHunt.query = item_title || activeHunt.query;
      }
      hunt = store.getOrCreateHunt(activeHunt.hunt_id, { query: item_title || activeHunt.query, max_budget: parsedBudget || activeHunt.max_budget });
    }

    if (!session) {
      const allSessions = store.getAllSessions();
      let matchedSession = null;
      if (item_title) {
        matchedSession = Object.values(allSessions).find(s => 
          s.item_title && item_title.toLowerCase().includes(s.item_title.toLowerCase())
        );
      }

      const initialAsking = parsedAsking || matchedSession?.asking_price || 60000;
      const initialBudget = parsedBudget || matchedSession?.target_price || activeHunt.max_budget || initialAsking;

      session = store.getOrCreateSession(dialog_id, {
        hunt_id: hunt.hunt_id,
        seller_name: seller_name || matchedSession?.seller_name || 'Seller',
        item_title: item_title || matchedSession?.item_title || activeHunt.query,
        asking_price: initialAsking,
        target_price: initialBudget,
        current_offer: matchedSession?.current_offer || Math.round(initialAsking * 0.86),
        listing_url: req.body.listing_url || matchedSession?.listing_url || store.getListingUrl(seller_name, item_title) || '',
        user_location: req.body.user_location || currentUserLocation
      });
      store.addDialogToHunt(hunt.hunt_id, dialog_id);
    } else {
      const updates = {};
      if (seller_name && session.seller_name === 'Seller') updates.seller_name = seller_name;
      if (item_title && (!session.item_title || session.item_title === 'oneplus 6')) updates.item_title = item_title;
      if (parsedAsking > 0 && (!session.asking_price || session.asking_price === 0)) updates.asking_price = parsedAsking;
      if (parsedBudget > 0 && (!session.target_price || session.target_price === 0)) updates.target_price = parsedBudget;
      if (!session.hunt_id && hunt.hunt_id) updates.hunt_id = hunt.hunt_id;
      if (req.body.user_location) updates.user_location = req.body.user_location;
      if (!session.user_location) updates.user_location = req.body.user_location || currentUserLocation;
      if (!session.listing_url || !session.listing_url.includes('.html')) {
        const bestUrl = req.body.listing_url || store.getListingUrl(session.seller_name || seller_name, session.item_title || item_title);
        if (bestUrl) updates.listing_url = bestUrl;
      }
      if (Object.keys(updates).length > 0) {
        store.updateSession(dialog_id, updates);
        session = store.getSession(dialog_id);
      }
    }

    // 1. IF CHAT IS ALREADY CLOSED, REJECTED, OR DISMISSAL ALREADY SENT, NEVER REPLY AGAIN!
    if (
      session.status === 'DEAL_CLOSED' ||
      session.status === 'STAND_DOWN_CLOSED' ||
      session.status === 'REJECTED' ||
      session.status === 'REJECTED_CLOSED' ||
      session.stand_down_sent ||
      session.reject_sent
    ) {
      console.log(`[Chat Guard] Session ${dialog_id} is already closed/rejected (${session.status}). Refusing repeat reply.`);
      return res.json({
        success: true,
        already_handled: true,
        decision: { reply_text: null, stance: session.status },
        session
      });
    }

    // 2. CHECK COMPETITOR STAND-DOWN (ONLY FOR SIBLING SELLERS IN THE SAME WON HUNT COHORT)
    const isPartOfWonHunt = hunt && hunt.status === 'WON' && hunt.winning_dialog_id !== dialog_id && (hunt.dialog_ids || []).includes(dialog_id);
    if ((session.status === 'STAND_DOWN' || isPartOfWonHunt) && !session.stand_down_sent) {
      console.log(`[Stand-Down Guard] Hunt ${hunt.hunt_id} was won by another seller. Sending one-time polite dismissal to ${session.seller_name}.`);
      const dismissalMsg = "Thanks boss! I don already conclude and pay for another one earlier today. I really appreciate your time! 🤝";
      store.appendMessage(dialog_id, 'seller', message);
      store.appendMessage(dialog_id, 'me', dismissalMsg);
      store.updateSession(dialog_id, {
        status: 'STAND_DOWN_CLOSED',
        stand_down_sent: true
      });
      return res.json({
        success: true,
        stand_down: true,
        decision: {
          reply_text: dismissalMsg,
          stance: 'STAND_DOWN'
        },
        session: store.getSession(dialog_id),
        hunt: hunt
      });
    }

    // Sanity calibration if session target_price was poisoned by an earlier cheap hunt
    if (session.asking_price >= 10000 && session.target_price < session.asking_price * 0.4) {
      const recalibratedBudget = Math.round(session.asking_price * 0.9);
      const recalibratedOffer = Math.round(session.asking_price * 0.86);
      store.updateSession(dialog_id, {
        target_price: recalibratedBudget,
        current_offer: session.current_offer < session.asking_price * 0.4 ? recalibratedOffer : session.current_offer
      });
      session = store.getSession(dialog_id);
    }

    // Idempotency & Turn-Taking Backend Guard:
    // Only debounce against immediate DOM mutation echoes within 15 seconds.
    // If client passes force: true or if >15 seconds has passed, always evaluate the turn.
    const isForce = Boolean(req.body.force);
    if (!isForce && session.history && session.history.length > 0) {
      const lastMessage = session.history[session.history.length - 1];
      const prevSellerMessages = session.history.filter(m => m.sender === 'seller');
      const lastSellerMessage = prevSellerMessages[prevSellerMessages.length - 1];
      const lastMsgAgeMs = lastMessage.timestamp ? (Date.now() - new Date(lastMessage.timestamp).getTime()) : 999999;

      if (
        lastSellerMessage &&
        lastSellerMessage.text.trim() === message.trim() &&
        lastMessage.sender === 'me' &&
        lastMessage.text &&
        lastMessage.text.trim().length > 0 &&
        lastMsgAgeMs < 15000 &&
        !req.body.force
      ) {
        console.log(`[Turn Guard] Debouncing immediate echo for: "${message.slice(0, 30)}...". Age: ${Math.round(lastMsgAgeMs/1000)}s.`);
        return res.json({
          success: true,
          already_handled: true,
          decision: {
            reply_text: lastMessage.text,
            stance: session.status
          },
          session: session,
          hunt: hunt
        });
      }
    }

    // Sync full conversation history from live browser DOM if available
    if (Array.isArray(req.body.chat_history) && req.body.chat_history.length > 0) {
      session.history = req.body.chat_history;
      const myTurnsCount = session.history.filter(m => m.sender === 'me').length;
      session.turn_count = Math.max(myTurnsCount, 1);

      // Check if last message in DOM is already ours
      const lastMsgInDom = session.history[session.history.length - 1];
      if (lastMsgInDom && lastMsgInDom.sender === 'me' && !req.body.force) {
        console.log(`[Turn Guard] Last message in DOM is already mine ("${lastMsgInDom.text.slice(0, 30)}..."). Refusing double send.`);
        return res.json({
          success: true,
          already_handled: true,
          decision: {
            reply_text: null,
            stance: session.status
          },
          session: session,
          hunt: hunt
        });
      }
    } else {
      // Append seller message if full history wasn't provided
      store.appendMessage(dialog_id, 'seller', message);
    }

    // Check for identical price strike in seller messages
    const priceMention = message.match(/\b\d{2,4}k\b|\b\d{5,7}\b|\b[1-9]\d{2}\b/i);
    if (priceMention && session.history.length > 1) {
      const sellerHistory = session.history.filter(m => m.sender === 'seller');
      if (sellerHistory.length >= 2) {
        const prevSellerMsg = sellerHistory[sellerHistory.length - 2];
        if (prevSellerMsg && prevSellerMsg.text.toLowerCase().includes(priceMention[0].toLowerCase())) {
          session.unyielding_strikes = (session.unyielding_strikes || 0) + 1;
        }
      }
    }

    // Call AI Negotiator Engine with graceful fallback
    let decision;
    try {
      decision = await ai.evaluateChatTurn(session, message);
    } catch (aiErr) {
      console.warn(`[Chat Turn] AI evaluation fallback activated (${aiErr.message})`);
      decision = ai.generateFallbackChatTurn(session, message);
    }

    // Heuristic safety net for Nigerian banking details
    const heuristicDetails = extractPaymentDetailsHeuristically(message, session.history);
    const aiDetails = (decision && decision.payment_details) ? Object.fromEntries(Object.entries(decision.payment_details).filter(([_, v]) => v != null && v !== '')) : {};

    session.payment_details = {
      ...(session.payment_details || {}),
      ...heuristicDetails,
      ...aiDetails
    };

    // SCENARIO A: Seller Refused Lower Bluff
    const isBluffMode = session.status === 'BLUFFING_LOWER';
    const textRefused = isBluffMode && /\b(no|cannot|cant|can't|last price|e no fit|e no go fit|never|mba)\b/i.test(message);
    const isBluffRefused = decision.bluff_refused || (isBluffMode && decision.bluff_accepted === false) || textRefused;

    if (isBluffRefused) {
      console.log(`>>> Seller ${session.seller_name} refused lower bluff of ₦${session.bluff_price}. Asking user for direction.`);
      const origAgreed = session.current_offer || session.target_price || session.asking_price;
      store.updateSession(dialog_id, {
        status: 'BLUFF_REFUSED',
        current_offer: origAgreed
      });
      // Notify Telegram and HUD
      telegram.sendBluffRefusedAlert(dialog_id, hunt.hunt_id, session.seller_name, origAgreed).catch(() => {});
      logEvent('BLUFF', `Seller ${session.seller_name} refused lower bluff. Sent alert to Telegram & HUD.`);

      return res.json({
        success: true,
        bluff_refused: true,
        seller_name: session.seller_name,
        dialog_id: dialog_id,
        hunt_id: hunt.hunt_id,
        original_price: origAgreed,
        decision: {
          reply_text: null,
          stance: 'BLUFF_REFUSED'
        },
        session: store.getSession(dialog_id),
        hunt: store.getHunt(hunt.hunt_id)
      });
    }

    // Check if all 4 verification details are present
    const hasAll4Details = session.payment_details &&
      Boolean(session.payment_details.bank) &&
      Boolean(session.payment_details.account_number) &&
      Boolean(session.payment_details.account_name) &&
      Boolean(session.payment_details.pickup_address);

    const hasInspectionDetails = session.payment_details &&
      Boolean(session.payment_details.pickup_address) &&
      (Boolean(session.payment_details.phone_number) || Boolean(session.payment_details.account_number)) &&
      Boolean(session.payment_details.inspection_required);

    const hasWaybillDetails = session.payment_details &&
      (session.payment_details.deal_type === 'INTERSTATE_WAYBILL' || Boolean(session.payment_details.waybill_method) || Boolean(session.payment_details.waybill_required)) &&
      (Boolean(session.payment_details.phone_number) || Boolean(session.payment_details.account_number)) &&
      (Boolean(session.payment_details.pickup_address) || Boolean(session.payment_details.seller_city) || Boolean(session.payment_details.waybill_method));

    const isDealReady = decision.deal_closed || decision.bluff_accepted || hasAll4Details || hasInspectionDetails || hasWaybillDetails;

    // SCENARIO B: Seller Accepted Details OR Accepted Lower Bluff -> PROPOSE DEAL (HUMAN APPROVAL GATE)
    if (isDealReady && !decision.bluff_refused) {
      // GUARD: If deal was ALREADY proposed, DO NOT spam holding message or Telegram!
      if (session.deal_proposed || session.status === 'DEAL_PROPOSED') {
        console.log(`[Deal Guard] Deal already proposed for ${session.seller_name}. Handling follow-up: "${message.slice(0, 30)}..."`);
        
        // 1. Seller acknowledgment ("Okay", "Alright", "ok", "cool", etc.)
        const isAck = /^\s*(?:okay|ok|k|alright|cool|noted|no problem|no wahala|i dey wait|i will wait|fine|seen|thanks|thank you)\s*$/i.test(message);
        if (isAck) {
          console.log(`[Deal Guard] Seller ${session.seller_name} sent acknowledgment ("${message}"). No repeat holding message needed.`);
          return res.json({
            success: true,
            already_handled: true,
            decision: {
              reply_text: null,
              stance: 'AWAITING_APPROVAL'
            },
            session: store.getSession(dialog_id),
            hunt: hunt
          });
        }

        // 2. Seller sending phone number (e.g. "09160000290")
        if (/^\s*0[789][01]\d{8}\s*$/.test(message)) {
          console.log(`[Deal Guard] Seller ${session.seller_name} sent phone number: ${message}. Updating details.`);
          store.updateSession(dialog_id, {
            payment_details: {
              ...(session.payment_details || {}),
              phone_number: message.trim()
            }
          });
          const briefAck = "Got your number boss 👍 Make I finish the arrange now.";
          store.appendMessage(dialog_id, 'me', briefAck);
          return res.json({
            success: true,
            deal_proposed: true,
            decision: {
              reply_text: briefAck,
              stance: 'AWAITING_APPROVAL'
            },
            session: store.getSession(dialog_id),
            hunt: hunt
          });
        }

        // 3. Seller asks for our number ("Drop Ur number")
        if (/drop.*number|your number|send.*number|call me|give me.*number/i.test(message)) {
          const numberReply = "I go drop am once I conclude the payment arrange now boss, hold on small.";
          store.appendMessage(dialog_id, 'me', numberReply);
          return res.json({
            success: true,
            deal_proposed: true,
            decision: {
              reply_text: numberReply,
              stance: 'AWAITING_APPROVAL'
            },
            session: store.getSession(dialog_id),
            hunt: hunt
          });
        }

        // 4. Any other message while awaiting approval: do NOT spam holding message
        return res.json({
          success: true,
          already_handled: true,
          decision: {
            reply_text: null,
            stance: 'AWAITING_APPROVAL'
          },
          session: store.getSession(dialog_id),
          hunt: hunt
        });
      }

      // FIRST TIME DEAL PROPOSAL:
      const agreedAmount = decision.bluff_accepted ? session.bluff_price : (decision.counter_offer || session.current_offer || session.target_price || 50000);
      
      const holdingMsg = "Make I quickly arrange and verify the payment now, I get back to you once done";
      decision.reply_text = holdingMsg;

      const targetListingUrl = session.listing_url || req.body.listing_url || (session.item_title ? `https://jiji.ng/search?query=${encodeURIComponent(session.item_title)}` : 'https://jiji.ng');

      const proposedDeal = store.proposeDeal(hunt.hunt_id, {
        dialog_id,
        seller_name: session.seller_name,
        item_title: session.item_title,
        asking_price: session.asking_price,
        agreed_price: agreedAmount,
        payment_details: session.payment_details,
        listing_url: targetListingUrl
      });

      store.updateSession(dialog_id, {
        status: 'DEAL_PROPOSED',
        deal_proposed: true,
        holding_note_sent: true
      });

      store.appendMessage(dialog_id, 'me', holdingMsg);
      console.log(`>>> Deal proposed with ${session.seller_name} for ₦${agreedAmount.toLocaleString()}! Awaiting user confirmation in HUD.`);

      // Notify Telegram with Deal Review Card (ONCE ONLY)
      if (!session.deal_alert_sent) {
        store.updateSession(dialog_id, { deal_alert_sent: true });
        telegram.sendDealCard(proposedDeal, hunt.hunt_id).catch(() => {});
      }
      logEvent('DEAL', `Deal proposed with ${session.seller_name} for ₦${agreedAmount.toLocaleString()}! Sent review card to Telegram & HUD.`);

      return res.json({
        success: true,
        deal_proposed: true,
        proposed_deal: proposedDeal,
        decision,
        session: store.getSession(dialog_id),
        hunt: store.getHunt(hunt.hunt_id)
      });
    }

    // SCENARIO C: Deadlock / Unyielding
    if (decision.is_impasse) {
      store.updateSession(dialog_id, {
        status: 'DEADLOCKED',
        unyielding_strikes: (session.unyielding_strikes || 0) + 1
      });
      console.log(`>>> Deadlock reached with ${session.seller_name}. Sending walk-away note.`);

      // Check if all dialogs in this hunt are now deadlocked
      const allHuntDialogs = hunt.dialog_ids || [];
      const allDeadlocked = allHuntDialogs.length > 0 && allHuntDialogs.every(dId => {
        const s = store.getSession(dId);
        return s && ['DEADLOCKED', 'STAND_DOWN', 'STAND_DOWN_CLOSED', 'REJECTED', 'REJECTED_CLOSED'].includes(s.status);
      });

      if (allDeadlocked) {
        let bestCandidate = null;
        let lowestPrice = Infinity;
        for (const dId of allHuntDialogs) {
          const s = store.getSession(dId);
          if (s) {
            const price = s.current_offer || s.asking_price || (s.seller_info?.asking_price) || Infinity;
            if (price < lowestPrice) {
              lowestPrice = price;
              bestCandidate = {
                dialog_id: dId,
                seller_name: s.seller_name,
                item_title: s.item_title || hunt.query,
                lowestPrice: price,
                seller_info: s.seller_info || { asking_price: price },
                payment_details: s.payment_details
              };
            }
          }
        }
        if (bestCandidate) {
          logEvent('DEADLOCK', `All candidate sellers deadlocked! Alerting Telegram with best counter: ₦${lowestPrice.toLocaleString()}`);
          telegram.sendAllDeadlockedAdvisory(hunt.hunt_id, bestCandidate, hunt.max_budget).catch(err => {
            console.error('Failed to send deadlock advisory to Telegram:', err.message);
          });
        }
      }

      if (decision.reply_text && typeof decision.reply_text === 'string' && decision.reply_text.trim().length > 0) {
        store.appendMessage(dialog_id, 'me', decision.reply_text.trim());
      }

      return res.json({
        success: true,
        decision,
        all_deadlocked: allDeadlocked,
        session: store.getSession(dialog_id),
        hunt: store.getHunt(hunt.hunt_id)
      });
    }

    // Normal continuing negotiation turn
    store.updateSession(dialog_id, {
      status: decision.stance || 'NEGOTIATING',
      payment_details: session.payment_details,
      current_offer: decision.counter_offer || session.current_offer,
      turn_count: (session.turn_count || 0) + 1
    });

    if (decision.reply_text && typeof decision.reply_text === 'string' && decision.reply_text.trim().length > 0) {
      store.appendMessage(dialog_id, 'me', decision.reply_text.trim());
    }

    res.json({
      success: true,
      decision,
      session: store.getOrCreateSession(dialog_id),
      hunt: store.getHunt(hunt.hunt_id)
    });
  } catch (err) {
    console.error('Error handling chat turn:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// USER APPROVAL GATE & DEAL MANAGEMENT APIS
// ==========================================

// 1. User Approves Deal -> Crown Winner & Stand Down Others
app.post('/api/deal/approve', (req, res) => {
  try {
    const { hunt_id, dialog_id } = req.body;
    const session = store.getSession(dialog_id);
    const hunt = store.getHunt(hunt_id) || store.getHuntForDialog(dialog_id);

    if (!session || !hunt) {
      return res.status(404).json({ error: 'Session or Hunt cohort not found' });
    }

    const proposed = hunt.proposed_deals ? hunt.proposed_deals[dialog_id] : null;
    const paymentDetails = session.payment_details || proposed?.payment_details || {};
    const agreedAmount = proposed?.agreed_price || session.current_offer || session.target_price || 50000;
    paymentDetails.amount_ngn = agreedAmount;

    // Generate Azza WhatsApp payment quote
    const azzaPayload = azza.buildPaymentUrl(paymentDetails, agreedAmount);

    // Crown Winner and Stand Down Competitor Sellers
    const updatedHunt = store.crownWinner(hunt.hunt_id, dialog_id, azzaPayload);
    simulator.handleApprove(dialog_id, azzaPayload);
    console.log(`>>> 🏆 USER APPROVED DEAL with ${session.seller_name} for ₦${agreedAmount.toLocaleString()}! Azza Link:`, azzaPayload.whatsappUrl);

    res.json({
      success: true,
      winner: dialog_id,
      agreed_price: agreedAmount,
      azza: azzaPayload,
      hunt: updatedHunt,
      session: store.getSession(dialog_id)
    });
  } catch (err) {
    console.error('Error approving deal:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. User Presses "Push Lower" (Bluff Lower Cash Offer)
app.post('/api/deal/bluff-lower', (req, res) => {
  try {
    const { hunt_id, dialog_id, bluff_price } = req.body;
    const session = store.getSession(dialog_id);
    const hunt = store.getHunt(hunt_id) || store.getHuntForDialog(dialog_id);

    if (!session || !hunt) {
      return res.status(404).json({ error: 'Session or Hunt cohort not found' });
    }

    const proposed = hunt.proposed_deals ? hunt.proposed_deals[dialog_id] : null;
    const currentPrice = proposed?.agreed_price || session.current_offer || session.asking_price;
    const targetBluff = Number(bluff_price) || Math.round(currentPrice * 0.9);

    store.setBluffState(hunt.hunt_id, dialog_id, targetBluff);
    simulator.handleBluffLower(dialog_id, targetBluff);

    console.log(`>>> User requested PUSH LOWER with ${session.seller_name}. Bluffed with ₦${targetBluff.toLocaleString()}`);

    res.json({
      success: true,
      bluff_price: targetBluff,
      hunt: store.getHunt(hunt.hunt_id),
      session: store.getSession(dialog_id)
    });
  } catch (err) {
    console.error('Error sending bluff lower:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. User Rejects / Passes on Seller
app.post('/api/deal/reject', (req, res) => {
  try {
    const { hunt_id, dialog_id, send_exit } = req.body;
    const session = store.getSession(dialog_id);
    const hunt = store.getHunt(hunt_id) || store.getHuntForDialog(dialog_id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const updatedHunt = hunt ? store.rejectDeal(hunt.hunt_id, dialog_id) : null;
    simulator.handleReject(dialog_id);
    store.updateSession(dialog_id, {
      status: 'REJECTED_CLOSED',
      reject_sent: true
    });
    store.clearPendingAction(dialog_id);

    let exitMsg = null;
    if (send_exit !== false) {
      exitMsg = "Thanks my oga, I check the details and location well, e no go fit work for me. Appreciate your time boss!";
      store.appendMessage(dialog_id, 'me', exitMsg);
    }

    console.log(`>>> User rejected seller ${session.seller_name}. Dropped from active deals.`);

    const allHuntDialogs = hunt?.dialog_ids || [];
    const allDoneOrRejected = allHuntDialogs.length > 0 && allHuntDialogs.every(dId => {
      const s = store.getSession(dId);
      return s && ['DEADLOCKED', 'STAND_DOWN', 'STAND_DOWN_CLOSED', 'REJECTED', 'REJECTED_CLOSED'].includes(s.status);
    });

    if (allDoneOrRejected && hunt && hunt.status !== 'WON') {
      logEvent('HUNT', `All candidate sellers in hunt ${hunt.hunt_id} have concluded or been rejected. Alerting Telegram.`);
      telegram.sendAllRejectedAdvisory(hunt.hunt_id, hunt.query || session.item_title, hunt.max_budget).catch(err => {
        console.error('Failed to send all rejected advisory to Telegram:', err.message);
      });
    }

    res.json({
      success: true,
      reply_text: exitMsg,
      hunt: updatedHunt,
      session: store.getSession(dialog_id)
    });
  } catch (err) {
    console.error('Error rejecting deal:', err);
    res.status(500).json({ error: err.message });
  }
});

// Clear nationwide override flag once consumed by userscript
app.post('/api/hunt/clear-nationwide-override', (req, res) => {
  activeHunt.force_nationwide = false;
  res.json({ success: true });
});

// Get hunt details
app.get('/api/hunt/:hunt_id', (req, res) => {
  const hunt = store.getHunt(req.params.hunt_id);
  if (!hunt) return res.status(404).json({ error: 'Hunt not found' });
  res.json({ hunt });
});

// Get all active sessions
app.get('/api/sessions', (req, res) => {
  res.json({ sessions: store.getAllSessions(), hunts: store.getAllHunts() });
});

// ==========================================
// BROWSER CONTROL CENTRE & SIMULATOR ENDPOINTS
// ==========================================

// Mark live hunt as dispatched by Jiji userscript
app.post('/api/hunt/dispatched', (req, res) => {
  const { hunt_id } = req.body;
  if (activeHunt.hunt_id === hunt_id) {
    activeHunt.status = 'DISPATCHED';
  }
  store.updateHunt(hunt_id, { status: 'DISPATCHED' });
  logEvent('JIJI', `Live hunt "${activeHunt.query}" picked up and dispatched on Jiji marketplace!`);
  res.json({ success: true, hunt: activeHunt });
});

// Live Jiji Hunt: Budget too low alert dispatched from Tampermonkey userscript
app.post('/api/hunt/budget-too-low', async (req, res) => {
  try {
    const { hunt_id, query, budget, lowest_price, location, is_local } = req.body;
    const targetQuery = query || activeHunt.query || 'Target Item';
    const targetBudget = Number(budget) || activeHunt.max_budget || 0;
    const targetLowest = Number(lowest_price) || 0;
    const targetLocation = location || currentUserLocation || 'Nigeria';

    logEvent('HUNT', `⚠️ Live Jiji search for "${targetQuery}" found no items within budget ₦${targetBudget.toLocaleString()} in ${targetLocation}. Lowest genuine listing is ₦${targetLowest.toLocaleString()}. Alerting user on Telegram.`);

    await telegram.sendLiveBudgetAlert(hunt_id || activeHunt.hunt_id, targetQuery, targetBudget, targetLowest, targetLocation, Boolean(is_local));
    res.json({ success: true });
  } catch (err) {
    console.error('Error reporting live budget too low:', err);
    res.status(500).json({ error: err.message });
  }
});

// Location Configuration APIs
app.get('/api/control/location', (req, res) => {
  res.json({ user_location: currentUserLocation });
});

app.post('/api/control/location', (req, res) => {
  const { user_location } = req.body;
  if (user_location) {
    currentUserLocation = user_location.trim();
    logEvent('LOCATION', `Base city updated via Control Centre: ${currentUserLocation}`);
  }
  res.json({ success: true, user_location: currentUserLocation });
});

// Get pending action for a dialog (e.g. Telegram deal button pressed)
app.get('/api/session/:dialogId/pending-action', (req, res) => {
  const pending = store.getPendingAction(req.params.dialogId);
  res.json({ pending_action: pending });
});

// Acknowledge & clear pending action once typed into Jiji chat
app.post('/api/session/:dialogId/ack-pending', (req, res) => {
  store.clearPendingAction(req.params.dialogId);
  logEvent('JIJI', `Dispatched pending action into live Jiji chat for ${req.params.dialogId}`);
  res.json({ success: true });
});

// Seller stalled notification from userscript
app.post('/api/seller/stalled', async (req, res) => {
  try {
    const { dialog_id, hunt_id, seller_name, asking_price, current_offer, wait_minutes } = req.body;
    logEvent('DEAL', `Seller ${seller_name || dialog_id} stalled for ${wait_minutes || 10} mins. Sending advisory to Telegram.`);
    store.updateSession(dialog_id, { status: 'STALLED' });
    await telegram.sendStalledSellerAlert(dialog_id, hunt_id, seller_name, asking_price, current_offer, wait_minutes);
    res.json({ success: true });
  } catch (err) {
    console.error('Error reporting stalled seller:', err);
    res.status(500).json({ error: err.message });
  }
});

// Seller gentle nudge record from userscript
app.post('/api/seller/nudged', (req, res) => {
  const { dialog_id, seller_name, text } = req.body;
  logEvent('DEAL', `Sent gentle follow-up nudge to ${seller_name || dialog_id}: "${text || ''}"`);
  if (text) store.appendMessage(dialog_id, 'me', text);
  res.json({ success: true });
});

// Get Control Centre status, logs & state
app.get('/api/control/status', (req, res) => {
  const hunt = store.getHunt(activeHunt.hunt_id);
  res.json({
    bot_active: activeHunt.auto_pilot !== false,
    mode: currentOperatingMode,
    user_location: currentUserLocation,
    active_hunt: activeHunt,
    telegram: {
      connected: true,
      bot_username: 'Azzaagent_bot',
      chat_id: telegram.DEFAULT_CHAT_ID
    },
    recent_logs: systemLogs.slice(-60),
    sessions: store.getAllSessions(),
    hunt: hunt
  });
});

// Master On/Off Switch from Browser Control Centre
app.post('/api/control/toggle', (req, res) => {
  const { active } = req.body;
  activeHunt.auto_pilot = (active !== undefined) ? Boolean(active) : !activeHunt.auto_pilot;
  logEvent('SYSTEM', `Control Centre master switch set to: ${activeHunt.auto_pilot ? 'ACTIVE' : 'PAUSED'}`);
  res.json({ success: true, bot_active: activeHunt.auto_pilot });
});

// Logs stream for Control Centre
app.get('/api/logs', (req, res) => {
  res.json({ logs: systemLogs });
});

// Interactive Jiji Simulator APIs
app.get('/api/sim/state', (req, res) => {
  res.json(simulator.getState());
});

app.post('/api/sim/mode', (req, res) => {
  const { mode } = req.body;
  const targetMode = mode === 'LIVE' ? 'LIVE' : 'DEMO';
  currentOperatingMode = targetMode;
  activeHunt.mode = targetMode;
  const state = simulator.setMode(targetMode);
  logEvent('SYSTEM', `Operation Mode changed to: ${state.mode}`);
  res.json({ success: true, mode: state.mode, state });
});

app.post('/api/sim/select-item', (req, res) => {
  const { item_id } = req.body;
  const state = simulator.selectItem(item_id);
  activeHunt.query = state.active_item.query;
  activeHunt.max_budget = state.active_item.budget;
  activeHunt.target_price = state.active_item.target_price;
  logEvent('SIM', `Selected Trigger Item: "${state.active_item.name}" (Budget: ₦${state.active_item.budget.toLocaleString()})`);
  res.json({ success: true, state });
});

app.post('/api/sim/turn', async (req, res) => {
  try {
    const { seller_id, custom_msg } = req.body;
    const state = await simulator.executeTurn(seller_id, custom_msg);
    res.json({ success: true, state: state || simulator.getState() });
  } catch (err) {
    console.error('Error in /api/sim/turn:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sim/autoplay', async (req, res) => {
  try {
    const { item_id, budget } = req.body;
    const state = await simulator.startAutonomousSimulation(item_id || simulator.activeItemId, budget);
    res.json({ success: true, state });
  } catch (err) {
    console.error('Error in /api/sim/autoplay:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sim/reset', (req, res) => {
  const state = simulator.initItemState(simulator.activeItemId);
  logEvent('SIM', `Reset conversation state for "${state.active_item.name}"`);
  res.json({ success: true, state });
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  Jiji AI Haggler Engine v7.0 Active!`);
  console.log(`  Local Server: http://localhost:${PORT}`);
  console.log(`  Azza Payout Gateway: Connected`);
  console.log(`  Telegram Bot: @Azzaagent_bot Online`);
  console.log(`========================================\n`);
  logEvent('SYSTEM', `Engine server online on port ${PORT}`);
  telegram.startPolling().catch(err => console.error('Telegram start error:', err));
});
