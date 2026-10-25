const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'sessions.json');

// Ensure database file exists
function initStore() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ sessions: {}, hunts: {} }, null, 2));
  }
}

function getStore() {
  initStore();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.sessions) parsed.sessions = {};
    if (!parsed.hunts) parsed.hunts = {};
    return parsed;
  } catch (err) {
    console.error('Error reading sessions.json, resetting:', err);
    return { sessions: {}, hunts: {} };
  }
}

function saveStore(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ==========================================
// SESSION MANAGEMENT (PER DIALOG)
// ==========================================
function getOrCreateSession(dialogId, initialData = {}) {
  const data = getStore();
  if (!data.sessions[dialogId]) {
    data.sessions[dialogId] = {
      dialog_id: dialogId,
      hunt_id: initialData.hunt_id || null,
      seller_name: initialData.seller_name || 'Seller',
      item_title: initialData.item_title || 'Item',
      listing_url: initialData.listing_url || '',
      asking_price: initialData.asking_price || 0,
      target_price: initialData.target_price || 0,
      current_offer: initialData.current_offer || 0,
      last_seller_price: initialData.asking_price || 0,
      unyielding_strikes: 0,
      turn_count: 0,
      status: 'NEW', // 'NEW', 'NEGOTIATING', 'PENDING_APPROVAL', 'BLUFFING_LOWER', 'BLUFF_REFUSED', 'DEADLOCKED', 'STAND_DOWN', 'DEAL_CLOSED', 'REJECTED'
      history: [],
      payment_details: null,
      bluff_price: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    saveStore(data);
  }
  return data.sessions[dialogId];
}

function updateSession(dialogId, updates = {}) {
  const data = getStore();
  if (!data.sessions[dialogId]) {
    data.sessions[dialogId] = { dialog_id: dialogId };
  }

  const session = data.sessions[dialogId];
  Object.assign(session, updates, { updated_at: new Date().toISOString() });

  saveStore(data);
  return session;
}

function appendMessage(dialogId, sender, text) {
  if (!text || typeof text !== 'string' || text.trim() === '') return null;
  const data = getStore();
  if (!data.sessions[dialogId]) return null;

  const session = data.sessions[dialogId];
  if (!session.history) session.history = [];
  session.history.push({
    sender: sender, // 'me' or 'seller'
    text: text,
    timestamp: new Date().toISOString()
  });
  session.updated_at = new Date().toISOString();
  saveStore(data);
  return session;
}

function getSession(dialogId) {
  const data = getStore();
  return data.sessions[dialogId] || null;
}

function getAllSessions() {
  const data = getStore();
  return data.sessions;
}

// ==========================================
// HUNT COHORT MANAGEMENT (MULTI-SELLER)
// ==========================================
function getOrCreateHunt(huntId, initialData = {}) {
  const data = getStore();
  if (!data.hunts[huntId]) {
    data.hunts[huntId] = {
      hunt_id: huntId,
      query: initialData.query || '',
      max_budget: initialData.max_budget || 0,
      status: 'ACTIVE', // 'ACTIVE', 'WON', 'CANCELLED'
      winning_dialog_id: null,
      winner_seller: null,
      winner_price: null,
      dialog_ids: initialData.dialog_ids || [],
      proposed_deals: {}, // keyed by dialog_id
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    saveStore(data);
  }
  return data.hunts[huntId];
}

function getHunt(huntId) {
  const data = getStore();
  return data.hunts[huntId] || null;
}

function getAllHunts() {
  const data = getStore();
  return data.hunts;
}

function updateHunt(huntId, updates = {}) {
  const data = getStore();
  if (!data.hunts[huntId]) {
    data.hunts[huntId] = { hunt_id: huntId, dialog_ids: [], proposed_deals: {} };
  }
  Object.assign(data.hunts[huntId], updates, { updated_at: new Date().toISOString() });
  saveStore(data);
  return data.hunts[huntId];
}

function addDialogToHunt(huntId, dialogId) {
  getOrCreateHunt(huntId);
  const data = getStore();
  const hunt = data.hunts[huntId];
  if (!hunt.dialog_ids) hunt.dialog_ids = [];
  if (!hunt.dialog_ids.includes(dialogId)) {
    hunt.dialog_ids.push(dialogId);
    hunt.updated_at = new Date().toISOString();
  }
  if (data.sessions[dialogId]) {
    data.sessions[dialogId].hunt_id = huntId;
    data.sessions[dialogId].updated_at = new Date().toISOString();
  }
  saveStore(data);
  return hunt;
}

function getHuntForDialog(dialogId) {
  const data = getStore();
  const sess = data.sessions[dialogId];
  if (sess && sess.hunt_id && data.hunts[sess.hunt_id]) {
    return data.hunts[sess.hunt_id];
  }
  for (const hunt of Object.values(data.hunts || {})) {
    if (hunt.dialog_ids && hunt.dialog_ids.includes(dialogId)) {
      return hunt;
    }
    if (hunt.proposed_deals && hunt.proposed_deals[dialogId]) {
      return hunt;
    }
  }
  return null;
}

function proposeDeal(huntId, dealData) {
  getOrCreateHunt(huntId, { query: dealData.item_title, max_budget: dealData.agreed_price });
  const data = getStore();
  const hunt = data.hunts[huntId];
  if (!hunt.proposed_deals) hunt.proposed_deals = {};

  const targetListing = dealData.listing_url || (dealData.item_title ? `https://jiji.ng/search?query=${encodeURIComponent(dealData.item_title)}` : 'https://jiji.ng');

  hunt.proposed_deals[dealData.dialog_id] = {
    dialog_id: dealData.dialog_id,
    hunt_id: huntId,
    seller_name: dealData.seller_name,
    item_title: dealData.item_title,
    asking_price: dealData.asking_price,
    agreed_price: dealData.agreed_price,
    payment_details: dealData.payment_details || {},
    listing_url: targetListing,
    status: 'PENDING_APPROVAL', // 'PENDING_APPROVAL', 'BLUFFING_LOWER', 'BLUFF_REFUSED', 'APPROVED', 'REJECTED'
    bluff_price: null,
    bluff_refused: false,
    proposed_at: new Date().toISOString()
  };
  hunt.updated_at = new Date().toISOString();

  if (data.sessions[dealData.dialog_id]) {
    data.sessions[dealData.dialog_id].status = 'PENDING_APPROVAL';
    data.sessions[dealData.dialog_id].payment_details = dealData.payment_details;
    data.sessions[dealData.dialog_id].hunt_id = huntId;
    if (targetListing && targetListing !== 'https://jiji.ng') {
      data.sessions[dealData.dialog_id].listing_url = targetListing;
    }
  }

  saveStore(data);
  return hunt.proposed_deals[dealData.dialog_id];
}

function crownWinner(huntId, winningDialogId, azzaPayload = null) {
  const data = getStore();
  const hunt = data.hunts[huntId];
  if (!hunt) return null;

  const winningDeal = hunt.proposed_deals ? hunt.proposed_deals[winningDialogId] : null;
  const winningSession = data.sessions[winningDialogId];

  hunt.status = 'WON';
  hunt.winning_dialog_id = winningDialogId;
  hunt.winner_seller = winningDeal?.seller_name || winningSession?.seller_name || 'Seller';
  hunt.winner_price = winningDeal?.agreed_price || winningSession?.current_offer || 0;
  hunt.azza_quote = azzaPayload;
  hunt.updated_at = new Date().toISOString();

  if (winningDeal) {
    winningDeal.status = 'APPROVED';
  }

  if (winningSession) {
    winningSession.status = 'DEAL_CLOSED';
    if (azzaPayload) winningSession.azza_quote = azzaPayload;
  }

  // Stand down all competitor sessions in this hunt
  if (hunt.dialog_ids) {
    for (const dId of hunt.dialog_ids) {
      if (dId !== winningDialogId && data.sessions[dId]) {
        data.sessions[dId].status = 'STAND_DOWN';
        data.sessions[dId].updated_at = new Date().toISOString();
      }
    }
  }

  // Also mark competitor proposed deals as STAND_DOWN
  if (hunt.proposed_deals) {
    for (const [dId, deal] of Object.entries(hunt.proposed_deals)) {
      if (dId !== winningDialogId) {
        deal.status = 'STAND_DOWN';
      }
    }
  }

  saveStore(data);
  return hunt;
}

function rejectDeal(huntId, dialogId) {
  const data = getStore();
  const hunt = data.hunts[huntId];
  if (hunt && hunt.proposed_deals && hunt.proposed_deals[dialogId]) {
    hunt.proposed_deals[dialogId].status = 'REJECTED';
    hunt.updated_at = new Date().toISOString();
  }
  if (data.sessions[dialogId]) {
    data.sessions[dialogId].status = 'REJECTED';
  }
  saveStore(data);
  return hunt;
}

function setBluffState(huntId, dialogId, bluffPrice) {
  const data = getStore();
  const hunt = data.hunts[huntId];
  if (hunt && hunt.proposed_deals && hunt.proposed_deals[dialogId]) {
    hunt.proposed_deals[dialogId].status = 'BLUFFING_LOWER';
    hunt.proposed_deals[dialogId].bluff_price = bluffPrice;
    hunt.proposed_deals[dialogId].bluff_refused = false;
    hunt.updated_at = new Date().toISOString();
  }
  if (data.sessions[dialogId]) {
    data.sessions[dialogId].status = 'BLUFFING_LOWER';
    data.sessions[dialogId].bluff_price = bluffPrice;
  }
  saveStore(data);
  return hunt;
}

function setPendingAction(dialogId, actionText, actionType = 'message') {
  const data = getStore();
  if (!data.sessions[dialogId]) {
    data.sessions[dialogId] = { dialog_id: dialogId };
  }
  data.sessions[dialogId].pending_action = {
    text: actionText,
    type: actionType,
    timestamp: Date.now()
  };
  data.sessions[dialogId].updated_at = new Date().toISOString();
  saveStore(data);
  return data.sessions[dialogId].pending_action;
}

function getPendingAction(dialogId) {
  const data = getStore();
  return data.sessions[dialogId]?.pending_action || null;
}

function clearPendingAction(dialogId) {
  const data = getStore();
  if (data.sessions[dialogId]) {
    delete data.sessions[dialogId].pending_action;
    data.sessions[dialogId].updated_at = new Date().toISOString();
    saveStore(data);
  }
}

function saveListingMapping(sellerName, itemTitle, listingUrl) {
  if (!listingUrl || (!listingUrl.includes('.html') && !listingUrl.includes('/advert/'))) return;
  const data = getStore();
  if (!data.listing_map) data.listing_map = {};
  if (sellerName) {
    data.listing_map['seller:' + sellerName.toLowerCase().trim()] = listingUrl;
  }
  if (itemTitle) {
    data.listing_map['item:' + itemTitle.toLowerCase().trim()] = listingUrl;
  }
  data.listing_map['last'] = listingUrl;
  saveStore(data);
}

function getListingUrl(sellerName, itemTitle) {
  const data = getStore();
  if (!data.listing_map) return null;
  if (sellerName && data.listing_map['seller:' + sellerName.toLowerCase().trim()]) {
    return data.listing_map['seller:' + sellerName.toLowerCase().trim()];
  }
  if (itemTitle) {
    const cleanTitle = itemTitle.toLowerCase().trim();
    if (data.listing_map['item:' + cleanTitle]) {
      return data.listing_map['item:' + cleanTitle];
    }
    for (const [k, v] of Object.entries(data.listing_map)) {
      if (k.startsWith('item:')) {
        const itemKey = k.replace('item:', '');
        if (cleanTitle.includes(itemKey) || itemKey.includes(cleanTitle)) {
          return v;
        }
      }
    }
  }
  return data.listing_map['last'] || null;
}

module.exports = {
  getOrCreateSession,
  getSession,
  updateSession,
  appendMessage,
  getAllSessions,
  getOrCreateHunt,
  getHunt,
  getAllHunts,
  updateHunt,
  addDialogToHunt,
  getHuntForDialog,
  proposeDeal,
  crownWinner,
  rejectDeal,
  setBluffState,
  setPendingAction,
  getPendingAction,
  clearPendingAction,
  saveListingMapping,
  getListingUrl
};
