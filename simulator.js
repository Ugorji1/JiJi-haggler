/**
 * simulator.js
 * Multi-Seller Negotiation Simulator with 5 Trigger Items x 3 Seller Personalities Each.
 * Features Autonomous Live Turn Runner synced with Telegram and Browser Jiji Messenger.
 * 
 * Personalities per Trigger Item:
 * 1. Seller A: APPROVE & PAY (Yielding, reaches agreement, drops 4 details)
 * 2. Seller B: PUSH LOWER (Agrees initially, but refuses/tests cash bluff)
 * 3. Seller C: PASS / WALK-AWAY (Stubborn, 3 strikes impasse)
 */

const store = require('./store');
const ai = require('./ai');

const TRIGGER_ITEMS = [
  {
    id: 'item_1_laptop',
    name: 'Gaming Laptop',
    query: 'Lenovo Legion 5 Gaming Laptop',
    budget: 850000,
    target_price: 800000,
    sellers: [
      {
        id: 'sim_laptop_seller_a',
        name: 'Chukwudi Eze',
        market: 'Computer Village, Ikeja',
        title: 'Lenovo Legion 5 AMD Ryzen 7 16GB RAM RTX 3060',
        asking_price: 920000,
        outcome_type: 'APPROVE',
        personality_label: 'Yielding / Cooperative (Tests APPROVE)',
        image_icon: '💻',
        details: {
          bank: 'OPay',
          account_number: '9068561974',
          account_name: 'Chukwudi Eze',
          pickup_address: 'Shop 12 Otigba Street, Computer Village Ikeja'
        },
        turns: [
          { seller_msg: "Hello, yes it is available. What is your offer for it?" },
          { seller_msg: "₦800k is a bit low for this spec bro. If you have cash ready today, bring ₦850k make we run am." },
          { seller_msg: "No problem, transfer ₦850,000. Pay to OPay 9068561974 Chukwudi Eze. My shop is Shop 12 Otigba Street, Computer Village Ikeja." }
        ],
        bluff_refusal: "No oga, 850k is my final price. Cannot go lower."
      },
      {
        id: 'sim_laptop_seller_b',
        name: 'Emeka Gadgets',
        market: 'Alaba International Market, Ojo',
        title: 'Lenovo Legion 5 Pro 32GB RAM Pristine',
        asking_price: 950000,
        outcome_type: 'PUSH_LOWER',
        personality_label: 'Bluff-Tester (Tests PUSH LOWER)',
        image_icon: '💻',
        details: {
          bank: 'Zenith Bank',
          account_number: '2083948291',
          account_name: 'Emeka Okafor',
          pickup_address: 'Block B4 Alaba International Market, Ojo'
        },
        turns: [
          { seller_msg: "Good day, clean UK used unit available in shop." },
          { seller_msg: "I can give you for ₦870k last card. Pay Zenith Bank 2083948291 Emeka Okafor. Shop B4 Alaba International Market." }
        ],
        bluff_refusal: "Haba oga! ₦870k na my rock bottom price, I cannot sell ₦800k at all. Take am or leave am."
      },
      {
        id: 'sim_laptop_seller_c',
        name: 'Alhaji Musa',
        market: 'Wuse 2, Abuja',
        title: 'Lenovo Legion Pro 7i Brand New Sealed',
        asking_price: 1200000,
        outcome_type: 'PASS',
        personality_label: 'Stubborn / Impasse (Tests PASS / DEADLOCK)',
        image_icon: '💻',
        details: {},
        turns: [
          { seller_msg: "No discount my friend. Last price is ₦1,150,000 non-negotiable." },
          { seller_msg: "I told you already, ₦1,150,000 final! If you don't have money leave it." },
          { seller_msg: "₦1,150,000 take it or leave it!" }
        ],
        bluff_refusal: "Price is non-negotiable."
      }
    ]
  },
  {
    id: 'item_2_phone',
    name: 'Flagship Smartphone',
    query: 'iPhone 13 Pro Max 256GB',
    budget: 680000,
    target_price: 650000,
    sellers: [
      {
        id: 'sim_phone_seller_a',
        name: 'Femi Phones',
        market: 'Ikeja Under-Bridge, Lagos',
        title: 'iPhone 13 Pro Max 256GB Sierra Blue Clean',
        asking_price: 730000,
        outcome_type: 'APPROVE',
        personality_label: 'Yielding / Cooperative (Tests APPROVE)',
        image_icon: '📱',
        details: {
          bank: 'PalmPay',
          account_number: '8029384756',
          account_name: 'Femi Johnson',
          pickup_address: 'Shop 5 Under-Bridge Plaza, Ikeja'
        },
        turns: [
          { seller_msg: "Available and neat. Battery health 88%." },
          { seller_msg: "Oya bring ₦680,000 cash make I pack am for you." },
          { seller_msg: "Send to PalmPay 8029384756 Femi Johnson. Shop 5 Under-Bridge Plaza, Ikeja." }
        ],
        bluff_refusal: "No bro, 680k is already rock bottom."
      },
      {
        id: 'sim_phone_seller_b',
        name: 'Austin Apple Hub',
        market: 'Victoria Island, Lagos',
        title: 'Apple iPhone 13 Pro Max 256GB Gold',
        asking_price: 710000,
        outcome_type: 'PUSH_LOWER',
        personality_label: 'Bluff-Tester (Tests PUSH LOWER)',
        image_icon: '📱',
        details: {
          bank: 'GTBank',
          account_number: '0129847365',
          account_name: 'Austin Nnamdi',
          pickup_address: 'Plot 14 Adeola Odeku, Victoria Island'
        },
        turns: [
          { seller_msg: "Yes available, pristine condition with box." },
          { seller_msg: "Last price ₦670k cash. GTBank 0129847365 Austin Nnamdi. Plot 14 Adeola Odeku, VI." }
        ],
        bluff_refusal: "No boss, I already gave you my bottom price. Cannot do 620k."
      },
      {
        id: 'sim_phone_seller_c',
        name: 'Madam Joy Gadgets',
        market: 'Tejuosho, Yaba',
        title: 'iPhone 13 Pro Max Sealed Box',
        asking_price: 820000,
        outcome_type: 'PASS',
        personality_label: 'Stubborn / Impasse (Tests PASS / DEADLOCK)',
        image_icon: '📱',
        details: {},
        turns: [
          { seller_msg: "800k last price. No bargaining please." },
          { seller_msg: "It is 800k, not reducing one naira." },
          { seller_msg: "I said 800k final." }
        ],
        bluff_refusal: "Price is fixed."
      }
    ]
  },
  {
    id: 'item_3_console',
    name: 'Gaming Console',
    query: 'Sony PlayStation 5 Disc Edition',
    budget: 520000,
    target_price: 490000,
    sellers: [
      {
        id: 'sim_console_seller_a',
        name: 'Kingsley Games',
        market: 'Surulere, Lagos',
        title: 'Sony PlayStation 5 Disc Edition + 1 Pad',
        asking_price: 560000,
        outcome_type: 'APPROVE',
        personality_label: 'Yielding / Cooperative (Tests APPROVE)',
        image_icon: '🎮',
        details: {
          bank: 'GTBank',
          account_number: '0234567891',
          account_name: 'Kingsley Chima',
          pickup_address: '15 Adeniran Ogunsanya, Surulere'
        },
        turns: [
          { seller_msg: "Available with FIFA 24 disc inside." },
          { seller_msg: "Bring ₦520k cash make we run am sharp." },
          { seller_msg: "Pay to GTBank 0234567891 Kingsley Chima. My shop is 15 Adeniran Ogunsanya, Surulere." }
        ],
        bluff_refusal: "No boss, 520k is final for console."
      },
      {
        id: 'sim_console_seller_b',
        name: 'Dele Console Spot',
        market: 'Computer Village, Ikeja',
        title: 'PS5 Disc Console Clean UK Used',
        asking_price: 550000,
        outcome_type: 'PUSH_LOWER',
        personality_label: 'Bluff-Tester (Tests PUSH LOWER)',
        image_icon: '🎮',
        details: {
          bank: 'OPay',
          account_number: '9081726354',
          account_name: 'Bamidele Adeleke',
          pickup_address: 'Shop 8 Pepple Street, Computer Village Ikeja'
        },
        turns: [
          { seller_msg: "Yes available. Tested and working 100%." },
          { seller_msg: "I fit drop am to ₦510k. OPay 9081726354 Bamidele Adeleke. Shop 8 Pepple Street, Computer Village." }
        ],
        bluff_refusal: "Ah bro, console price is fixed o, 510k is my final. Cannot do 460k."
      },
      {
        id: 'sim_console_seller_c',
        name: 'Chinedu Video Games',
        market: 'Trade Fair Complex, Lagos',
        title: 'Brand New PS5 Slim Disc Edition',
        asking_price: 630000,
        outcome_type: 'PASS',
        personality_label: 'Stubborn / Impasse (Tests PASS / DEADLOCK)',
        image_icon: '🎮',
        details: {},
        turns: [
          { seller_msg: "Last price 600k. Brand new sealed." },
          { seller_msg: "My brother, brand new no dey cheap. 600k final." },
          { seller_msg: "600k or leave it." }
        ],
        bluff_refusal: "600k final."
      }
    ]
  },
  {
    id: 'item_4_macbook',
    name: 'Workstation Laptop',
    query: 'MacBook Pro M1 16GB / 512GB',
    budget: 750000,
    target_price: 700000,
    sellers: [
      {
        id: 'sim_mac_seller_a',
        name: 'Babatunde Mac Store',
        market: 'Maryland, Lagos',
        title: 'Apple MacBook Pro M1 16GB RAM 512GB SSD',
        asking_price: 800000,
        outcome_type: 'APPROVE',
        personality_label: 'Yielding / Cooperative (Tests APPROVE)',
        image_icon: '💻',
        details: {
          bank: 'Zenith Bank',
          account_number: '1019283746',
          account_name: 'Babatunde Ogundele',
          pickup_address: 'Maryland Mall Floor 2, Maryland Lagos'
        },
        turns: [
          { seller_msg: "Available. Battery cycle count 62, very clean." },
          { seller_msg: "Okay, if you are transferring right now, ₦750,000 works." },
          { seller_msg: "Pay Zenith Bank 1019283746 Babatunde Ogundele. Maryland Mall Floor 2, Maryland Lagos." }
        ],
        bluff_refusal: "No, 750k is already a good discount."
      },
      {
        id: 'sim_mac_seller_b',
        name: 'Ibrahim Laptops',
        market: 'Computer Village, Ikeja',
        title: 'MacBook Pro 13 M1 Chip Space Grey',
        asking_price: 790000,
        outcome_type: 'PUSH_LOWER',
        personality_label: 'Bluff-Tester (Tests PUSH LOWER)',
        image_icon: '💻',
        details: {
          bank: 'Kuda',
          account_number: '2019384756',
          account_name: 'Ibrahim Bello',
          pickup_address: '14 Medical Road, Ikeja'
        },
        turns: [
          { seller_msg: "Yes available with original 61W charger." },
          { seller_msg: "Last card is ₦740k. Kuda 2019384756 Ibrahim Bello. 14 Medical Road, Ikeja." }
        ],
        bluff_refusal: "Can't do 680k bro, battery health is 96%, machine is too clean."
      },
      {
        id: 'sim_mac_seller_c',
        name: 'Prime Tech Hub',
        market: 'Lekki Phase 1, Lagos',
        title: 'MacBook Pro M1 16GB Sealed in Box',
        asking_price: 950000,
        outcome_type: 'PASS',
        personality_label: 'Stubborn / Impasse (Tests PASS / DEADLOCK)',
        image_icon: '💻',
        details: {},
        turns: [
          { seller_msg: "920k last price. Sealed carton." },
          { seller_msg: "Cannot go lower than 920k." },
          { seller_msg: "920k fixed." }
        ],
        bluff_refusal: "Fixed price."
      }
    ]
  },
  {
    id: 'item_5_tv',
    name: '4K Smart TV',
    query: 'Samsung 55 inch 4K Smart TV',
    budget: 420000,
    target_price: 390000,
    sellers: [
      {
        id: 'sim_tv_seller_a',
        name: 'David Electronics',
        market: 'Alaba International Market',
        title: 'Samsung 55 inch Crystal UHD 4K Smart TV',
        asking_price: 460000,
        outcome_type: 'APPROVE',
        personality_label: 'Yielding / Cooperative (Tests APPROVE)',
        image_icon: '📺',
        details: {
          bank: 'OPay',
          account_number: '9071625341',
          account_name: 'David Okeke',
          pickup_address: 'Line 4 Shop 22, Alaba International Market'
        },
        turns: [
          { seller_msg: "Available with remote and wall bracket included." },
          { seller_msg: "Oya transfer ₦420k make I test am for you." },
          { seller_msg: "Pay OPay 9071625341 David Okeke. Line 4 Shop 22, Alaba International Market." }
        ],
        bluff_refusal: "No oga, 420k is final for 55 inch."
      },
      {
        id: 'sim_tv_seller_b',
        name: 'Grace Home Appliances',
        market: 'Trade Fair Complex, Lagos',
        title: 'Samsung 55" Smart TV Brand New',
        asking_price: 450000,
        outcome_type: 'PUSH_LOWER',
        personality_label: 'Bluff-Tester (Tests PUSH LOWER)',
        image_icon: '📺',
        details: {
          bank: 'Access Bank',
          account_number: '0098765432',
          account_name: 'Grace Eze',
          pickup_address: 'Block C Plaza, Trade Fair Complex'
        },
        turns: [
          { seller_msg: "Yes brand new in carton." },
          { seller_msg: "410k last card. Access Bank 0098765432 Grace Eze. Block C Plaza, Trade Fair." }
        ],
        bluff_refusal: "Cost price is high o, 410k is my final. No way for 370k."
      },
      {
        id: 'sim_tv_seller_c',
        name: 'Chidi TV Plaza',
        market: 'Festac Town, Lagos',
        title: 'Samsung 55-inch QLED 4K Display',
        asking_price: 520000,
        outcome_type: 'PASS',
        personality_label: 'Stubborn / Impasse (Tests PASS / DEADLOCK)',
        image_icon: '📺',
        details: {},
        turns: [
          { seller_msg: "500k final. QLED panel." },
          { seller_msg: "I said 500k last price boss." },
          { seller_msg: "500k take it or leave it." }
        ],
        bluff_refusal: "Price is 500k."
      }
    ]
  }
];

function extractPaymentDetailsHeuristically(text) {
  if (!text) return {};
  const details = {};
  const acctMatch = text.match(/\b([0-9]{10})\b/);
  if (acctMatch) details.account_number = acctMatch[1];
  const banks = ['opay', 'palmpay', 'kuda', 'gtbank', 'gtb', 'zenith', 'access', 'uba', 'first bank', 'fcmb', 'stanbic', 'sterling', 'wema', 'polaris', 'fidelity', 'union', 'moniepoint', 'rubies', 'vfd'];
  const lower = text.toLowerCase();
  for (const b of banks) {
    if (lower.includes(b)) {
      details.bank = b.toUpperCase();
      break;
    }
  }
  const nameMatch = text.match(/(?:name\s*(?:is|:|\-)?\s*|account\s*name\s*(?:is|:|\-)?\s*)([A-Za-z]+(?:\s+[A-Za-z]+){1,2})/i);
  const afterAcctMatch = text.match(/\b[0-9]{10}\s+([A-Za-z]+(?:\s+[A-Za-z]+){1,2})/);
  if (nameMatch) {
    details.account_name = nameMatch[1].trim();
  } else if (afterAcctMatch) {
    details.account_name = afterAcctMatch[1].trim();
  }
  const locMatch = text.match(/(?:shop\s*(?:is|:|\-)?\s*|address\s*(?:is|:|\-)?\s*|location\s*(?:is|:|\-)?\s*|come\s+(?:to\s+)?)([A-Za-z0-9\s,.\-#]+(?:street|road|way|plaza|complex|ikeja|yaba|island|mainland|abuja|lagos|market|otigba|village|close|avenue)[A-Za-z0-9\s,.\-#]*)/i);
  if (locMatch) {
    let cleanLoc = locMatch[1].replace(/(?:for\s+your\s+pickup|for\s+pickup|sharp\s+sharp|to\s+pick\s+am).*$/i, '').trim();
    details.pickup_address = cleanLoc;
  }
  return details;
}

function calculateSmartBluff(currentPrice, history = []) {
  const price = Number(currentPrice) || 500000;
  
  // Shave off realistic, modest market margin based on item value
  let shaveAmount;
  if (price >= 700000) {
    shaveAmount = 20000; // e.g. ₦830k -> ₦810k
  } else if (price >= 400000) {
    shaveAmount = 15000; // e.g. ₦420k -> ₦405k
  } else if (price >= 150000) {
    shaveAmount = 10000; // e.g. ₦200k -> ₦190k
  } else {
    shaveAmount = 5000;
  }

  let calculatedBluff = Math.round((price - shaveAmount) / 5000) * 5000;

  // Scan previous buyer offers in history
  let highestPriorOffer = 0;
  for (const msg of history) {
    if (msg.sender === 'me') {
      const matches = msg.text.match(/(?:₦|naira\s*)?(\d{1,3}(?:,\d{3})+|\d{5,8})\b/gi) || [];
      for (const m of matches) {
        const val = parseInt(m.replace(/[^\d]/g, ''), 10);
        if (val >= 20000 && val < price && val > highestPriorOffer) {
          highestPriorOffer = val;
        }
      }
      const kMatches = msg.text.match(/(\d{2,4})\s*k\b/gi) || [];
      for (const km of kMatches) {
        const kVal = parseInt(km.replace(/[^\d]/g, ''), 10) * 1000;
        if (kVal >= 20000 && kVal < price && kVal > highestPriorOffer) {
          highestPriorOffer = kVal;
        }
      }
    }
  }

  // Ensure bluff is strictly above previous offers and below agreed price
  if (highestPriorOffer > 0 && calculatedBluff <= highestPriorOffer) {
    calculatedBluff = Math.round((highestPriorOffer + price) / 2 / 5000) * 5000;
    if (calculatedBluff <= highestPriorOffer) {
      calculatedBluff = highestPriorOffer + 5000;
    }
  }

  if (calculatedBluff >= price) calculatedBluff = price - 5000;
  if (calculatedBluff <= 0) calculatedBluff = Math.round(price * 0.95);

  return calculatedBluff;
}

class NegotiationSimulator {
  constructor() {
    this.currentMode = 'DEMO'; // 'DEMO' or 'LIVE'
    this.activeItemId = 'item_1_laptop';
    this.activeDialogStates = {};
    this.listeners = [];
    this.simTimers = [];
    this.winnerInfo = null;
    this.initItemState(this.activeItemId);
  }

  on(listener) {
    this.listeners.push(listener);
  }

  emit(type, data) {
    for (const l of this.listeners) {
      try { l(type, data); } catch (e) { console.error('Sim listener error:', e); }
    }
  }

  getTriggerItems() {
    return TRIGGER_ITEMS.map(item => ({
      id: item.id,
      name: item.name,
      query: item.query,
      budget: item.budget,
      target_price: item.target_price,
      sellersCount: item.sellers.length
    }));
  }

  getItem(itemId) {
    return TRIGGER_ITEMS.find(i => i.id === itemId) || TRIGGER_ITEMS[0];
  }

  initItemState(itemId) {
    this.stopAutonomousSimulation();
    const item = this.getItem(itemId);
    this.activeItemId = item.id;
    this.winnerInfo = null;
    const huntId = `sim_hunt_${item.id}_${Date.now().toString().slice(-6)}`;

    // Create Hunt in store
    store.getOrCreateHunt(huntId, {
      query: item.query,
      max_budget: item.budget,
      target_price: item.target_price
    });

    this.activeDialogStates = {};

    for (const s of item.sellers) {
      const dialogId = `${s.id}_${Date.now().toString().slice(-6)}`;
      this.activeDialogStates[s.id] = {
        dialog_id: dialogId,
        seller_info: s,
        hunt_id: huntId,
        turn_index: 0,
        status: 'READY',
        history: [],
        proposed_deal: null
      };

      // Create session in store
      store.getOrCreateSession(dialogId, {
        hunt_id: huntId,
        seller_name: s.name,
        item_title: s.title,
        asking_price: s.asking_price,
        target_price: item.budget,
        current_offer: Math.round(s.asking_price * 0.8),
        status: 'READY'
      });
      store.addDialogToHunt(huntId, dialogId);
    }

    return this.getState();
  }

  getState() {
    const item = this.getItem(this.activeItemId);
    let sellers = [];

    if (this.currentMode === 'LIVE') {
      const allSessions = store.getAllSessions();
      const liveList = Object.values(allSessions || {}).filter(s => s && s.dialog_id && !s.dialog_id.startsWith('sim_'));
      if (liveList.length > 0) {
        sellers = liveList.map(s => ({
          dialog_id: s.dialog_id,
          seller_id: s.dialog_id,
          name: s.seller_name || 'Jiji Seller',
          market: s.payment_details?.pickup_address || 'Lagos, Nigeria',
          title: s.item_title || item.name,
          asking_price: s.asking_price || 0,
          outcome_type: s.status === 'APPROVED' ? 'APPROVE' : (s.status === 'DEADLOCKED' ? 'PASS' : 'LIVE'),
          personality_label: 'Real Jiji Vendor (Live)',
          image_icon: '🌐',
          status: s.status,
          turn_index: (s.history || []).length,
          history: s.history || [],
          proposed_deal: s.proposed_deal || (s.payment_details?.bank ? { agreed_price: s.current_offer, seller_name: s.seller_name } : null)
        }));
      }
    }

    if (sellers.length === 0) {
      sellers = Object.values(this.activeDialogStates).map(d => ({
        dialog_id: d.dialog_id,
        seller_id: d.seller_info.id,
        name: d.seller_info.name,
        market: d.seller_info.market,
        title: d.seller_info.title,
        asking_price: d.seller_info.asking_price,
        outcome_type: d.seller_info.outcome_type,
        personality_label: d.seller_info.personality_label,
        image_icon: d.seller_info.image_icon,
        status: d.status,
        turn_index: d.turn_index,
        history: d.history,
        proposed_deal: d.proposed_deal
      }));
    }

    return {
      mode: this.currentMode,
      active_item: item,
      trigger_items: this.getTriggerItems(),
      winner: this.winnerInfo,
      sellers: sellers
    };
  }

  setMode(mode) {
    this.currentMode = mode === 'LIVE' ? 'LIVE' : 'DEMO';
    this.emit('mode_change', { mode: this.currentMode });
    return this.getState();
  }

  selectItem(itemId) {
    return this.initItemState(itemId);
  }

  findBestMatchingItem(query = '') {
    const q = (query || '').toLowerCase();
    if (q.includes('phone') || q.includes('iphone') || q.includes('apple phone') || q.includes('13 pro') || q.includes('pro max') || q.includes('s24') || q.includes('samsung') || q.includes('galaxy') || q.includes('ultra') || q.includes('pixel') || q.includes('android')) {
      return TRIGGER_ITEMS[1]; // Flagship Smartphone
    }
    if (q.includes('ps5') || q.includes('playstation') || q.includes('console') || q.includes('game') || q.includes('fifa')) {
      return TRIGGER_ITEMS[2]; // PS5
    }
    if (q.includes('mac') || q.includes('macbook') || q.includes('m1') || q.includes('apple laptop')) {
      return TRIGGER_ITEMS[3]; // MacBook
    }
    if (q.includes('tv') || q.includes('television') || q.includes('samsung tv') || q.includes('screen') || q.includes('smart tv')) {
      return TRIGGER_ITEMS[4]; // TV
    }
    // Default to Laptop
    return TRIGGER_ITEMS[0]; // Lenovo Legion 5
  }

  checkPriceRange(query, userBudget) {
    const matched = this.findBestMatchingItem(query);
    const cheapest = matched.sellers.reduce((prev, curr) => curr.asking_price < prev.asking_price ? curr : prev, matched.sellers[0]);
    const actualLowestListingPrice = cheapest.asking_price; // Exact lowest listing asking price on Jiji (e.g. ₦920,000)
    // Anything below 88% of the lowest listed asking price is an impossible lowball that vendors reject immediately.
    const minThreshold = Math.round(actualLowestListingPrice * 0.88);
    const isTooLow = Number(userBudget) < minThreshold;
    return {
      id: matched.id,
      name: matched.name,
      query: matched.query,
      lowestPrice: actualLowestListingPrice, // Actual lowest price available on Jiji
      askingPrice: actualLowestListingPrice,
      lowestSeller: cheapest.name,
      isTooLow: isTooLow
    };
  }

  stopAutonomousSimulation() {
    for (const t of this.simTimers) {
      clearTimeout(t);
    }
    this.simTimers = [];
  }

  /**
   * Execute one negotiation turn for a given seller.
   */
  async executeTurn(sellerId, customMsg = null) {
    let dialogState = this.activeDialogStates[sellerId];
    if (!dialogState) {
      dialogState = Object.values(this.activeDialogStates).find(d => d.dialog_id === sellerId);
    }
    if (!dialogState) return null;

    const sellerInfo = dialogState.seller_info;
    const dialogId = dialogState.dialog_id;
    const huntId = dialogState.hunt_id;
    const currentItem = this.getItem(this.activeItemId);

    // GUARD 1: If deal is already pending approval or has reached a terminal state, DO NOT CHAT FURTHER!
    if (this.winnerInfo && dialogState.dialog_id !== this.winnerInfo.dialog_id) {
      return this.getState();
    }
    if (['PENDING_APPROVAL', 'APPROVED', 'DEADLOCKED', 'STAND_DOWN_CLOSED', 'REJECTED'].includes(dialogState.status)) {
      return this.getState();
    }

    // GUARD 2: Check if walk-away message or dismissal was already sent by 'me'
    const alreadyWalkedAway = dialogState.history.some(m => m.sender === 'me' && (
      m.text.includes("budget is tight right now") ||
      m.text.includes("change your mind later") ||
      m.text.includes("conclude and pay for another one") ||
      m.text.includes("no go fit work for me")
    ));
    if (alreadyWalkedAway) {
      dialogState.status = 'DEADLOCKED';
      store.updateSession(dialogId, { status: 'DEADLOCKED' });
      return this.getState();
    }

    // STEP 0: Generate Opening Pitch if conversation just started
    if (dialogState.history.length === 0) {
      const openerResult = await ai.generateOpeningPitch(sellerInfo.title, sellerInfo.asking_price, currentItem.budget);
      const openerText = typeof openerResult === 'string' ? openerResult : openerResult.reply_text;
      
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      dialogState.history.push({
        sender: 'me',
        text: openerText,
        time: timeStr
      });
      dialogState.status = 'NEGOTIATING';
      store.appendMessage(dialogId, 'me', openerText);
      this.emit('log', { text: `Opener sent to ${sellerInfo.name}: "${openerText}"` });
      return this.getState();
    }

    // STEP 1: Determine incoming seller message via Dynamic Gemini Seller Engine
    let incomingSellerMsg = customMsg;
    let sellerDecision = null;
    if (!incomingSellerMsg) {
      const lastBuyerMsg = dialogState.history.slice(-1)[0]?.text || '';
      sellerDecision = await ai.generateSellerReply(sellerInfo, currentItem, dialogState.history, lastBuyerMsg);
      incomingSellerMsg = sellerDecision.seller_reply || "Hello, yes it is available. What is your offer for it?";
      dialogState.turn_index++;
    }

    // Re-check guards after awaiting seller reply
    if (this.winnerInfo && dialogState.dialog_id !== this.winnerInfo.dialog_id) {
      return this.getState();
    }
    if (['PENDING_APPROVAL', 'APPROVED', 'DEADLOCKED', 'STAND_DOWN_CLOSED', 'REJECTED'].includes(dialogState.status)) {
      return this.getState();
    }

    const timeSeller = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    dialogState.history.push({
      sender: 'seller',
      text: incomingSellerMsg,
      time: timeSeller
    });
    store.appendMessage(dialogId, 'seller', incomingSellerMsg);
    this.emit('log', { text: `[${sellerInfo.name}] "${incomingSellerMsg}"` });

    // STEP 2: Evaluate turn with AI Negotiator Engine
    const session = store.getSession(dialogId);
    let decision;
    try {
      decision = await ai.evaluateChatTurn(session, incomingSellerMsg);
    } catch (e) {
      console.warn('AI evaluation fallback in sim:', e.message);
      decision = {
        stance: 'NEGOTIATING',
        counter_offer: session.current_offer,
        reply_text: `Can we do ₦${(session.current_offer || currentItem.budget).toLocaleString()} cash?`,
        deal_closed: false
      };
    }

    // Re-check guards after awaiting evaluation
    if (this.winnerInfo && dialogState.dialog_id !== this.winnerInfo.dialog_id) {
      return this.getState();
    }
    if (['PENDING_APPROVAL', 'APPROVED', 'DEADLOCKED', 'STAND_DOWN_CLOSED', 'REJECTED'].includes(dialogState.status)) {
      return this.getState();
    }

    // Heuristics
    const heuristicDetails = extractPaymentDetailsHeuristically(incomingSellerMsg);
    session.payment_details = {
      ...(session.payment_details || {}),
      ...heuristicDetails
    };

    // Check Bluff Refusal
    const isBluffMode = dialogState.status === 'BLUFFING_LOWER';
    const textRefused = isBluffMode && /\b(no|cannot|cant|can't|last price|rock bottom|e no fit)\b/i.test(incomingSellerMsg);
    if (isBluffMode && (decision.bluff_refused || sellerDecision?.bluff_refused || textRefused)) {
      dialogState.status = 'BLUFF_REFUSED';
      store.updateSession(dialogId, { status: 'BLUFF_REFUSED' });
      const origAgreed = session.current_offer || session.target_price || sellerInfo.asking_price;
      this.emit('bluff_refused', {
        dialog_id: dialogId,
        hunt_id: huntId,
        seller_name: sellerInfo.name,
        price: origAgreed
      });
      this.emit('log', { text: `Seller ${sellerInfo.name} refused lower bluff.` });
      return this.getState();
    }

    // Check Deal Ready (all 4 details present or LLM closed deal)
    const hasAll4 = session.payment_details?.bank && session.payment_details?.account_number && session.payment_details?.account_name && (session.payment_details?.pickup_address || sellerInfo.details?.pickup_address);
    if ((sellerInfo.outcome_type === 'APPROVE' || sellerInfo.outcome_type === 'PUSH_LOWER') && (hasAll4 || decision.deal_closed)) {
      if (!session.payment_details) session.payment_details = {};
      if (!session.payment_details.pickup_address && sellerInfo.details?.pickup_address) {
        session.payment_details.pickup_address = sellerInfo.details.pickup_address;
      }
      const agreedPrice = decision.counter_offer || currentItem.budget;
      const holdingMsg = "Make I quickly arrange and verify the payment now, I get back to you once done";
      
      const alreadySentHolding = dialogState.history.some(m => m.sender === 'me' && m.text.includes("Make I quickly arrange"));
      if (!alreadySentHolding) {
        const timeHold = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        dialogState.history.push({
          sender: 'me',
          text: holdingMsg,
          time: timeHold
        });
        store.appendMessage(dialogId, 'me', holdingMsg);
      }

      // Find other candidate sellers still negotiating or pending
      const otherCandidates = Object.values(this.activeDialogStates).filter(d => d.dialog_id !== dialogId);
      const pendingSellers = otherCandidates
        .filter(d => ['NEGOTIATING', 'READY', 'OPEN'].includes(d.status))
        .map(d => d.seller_info.name);
      const otherReadyDeals = otherCandidates
        .filter(d => d.status === 'PENDING_APPROVAL' && d.proposed_deal)
        .map(d => ({
          name: d.seller_info.name,
          price: d.proposed_deal.agreed_price
        }));

      const proposedDeal = store.proposeDeal(huntId, {
        dialog_id: dialogId,
        seller_name: sellerInfo.name,
        item_title: sellerInfo.title,
        asking_price: sellerInfo.asking_price,
        agreed_price: agreedPrice,
        payment_details: session.payment_details,
        listing_url: 'https://jiji.ng',
        pending_sellers: pendingSellers,
        other_deals: otherReadyDeals
      });

      dialogState.status = 'PENDING_APPROVAL';
      dialogState.proposed_deal = proposedDeal;
      
      this.emit('deal_proposed', {
        deal: proposedDeal,
        hunt_id: huntId,
        seller: sellerInfo,
        pending_sellers: pendingSellers,
        other_deals: otherReadyDeals
      });
      this.emit('log', { text: `🎉 Deal proposed with ${sellerInfo.name} for ₦${agreedPrice.toLocaleString()}! Awaiting user confirmation.` });

      return this.getState();
    }

    // Check Impasse / Deadlock:
    // If AI flagged impasse OR reply text contains walkaway note OR stubborn seller out of turns
    const isWalkAwayReply = decision.reply_text && (
      decision.reply_text.includes("budget is tight") ||
      decision.reply_text.includes("change your mind")
    );
    const isStubbornExhausted = sellerInfo.outcome_type === 'PASS' && dialogState.turn_index >= sellerInfo.turns.length;

    if (decision.is_impasse || isWalkAwayReply || isStubbornExhausted) {
      dialogState.status = 'DEADLOCKED';
      const walkAwayNote = decision.reply_text || "No problem boss, my budget is tight right now. If you change your mind later, let me know. Thanks!";
      const alreadySentWalkAway = dialogState.history.some(m => m.sender === 'me' && (
        m.text.includes("budget is tight") || m.text.includes("change your mind")
      ));
      if (!alreadySentWalkAway) {
        const timeDead = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        dialogState.history.push({
          sender: 'me',
          text: walkAwayNote,
          time: timeDead
        });
        store.appendMessage(dialogId, 'me', walkAwayNote);
      }
      store.updateSession(dialogId, { status: 'DEADLOCKED' });
      this.emit('log', { text: `Impasse reached with ${sellerInfo.name}. Sent walk-away note.` });

      // Check if ALL candidate sellers in this hunt are now deadlocked above budget
      const allStates = Object.values(this.activeDialogStates);
      const allDeadlocked = allStates.length > 0 && allStates.every(s => 
        ['DEADLOCKED', 'STAND_DOWN_CLOSED', 'REJECTED'].includes(s.status)
      );
      if (allDeadlocked && !this.winnerInfo) {
        let bestCandidate = null;
        for (const s of allStates) {
          const sess = store.getSession(s.dialog_id);
          let lowestPriceForSeller = s.seller_info.asking_price;
          for (const msg of s.history) {
            if (msg.sender === 'seller') {
              const kMatch = msg.text.match(/(\d+(?:\.\d+)?)\s*k\b/i);
              const mMatch = msg.text.match(/(\d+(?:\.\d+)?)\s*m\b/i);
              const numMatch = msg.text.match(/(?:₦|naira|NGN)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{5,7})\b/i);
              let val = null;
              if (kMatch) {
                val = Math.round(parseFloat(kMatch[1]) * 1000);
              } else if (mMatch) {
                val = Math.round(parseFloat(mMatch[1]) * 1000000);
              } else if (numMatch) {
                val = parseInt(numMatch[1].replace(/,/g, ''), 10);
              }
              if (val && val >= 10000 && val < lowestPriceForSeller) {
                lowestPriceForSeller = val;
              }
            }
          }
          if (sess?.last_seller_price && sess.last_seller_price < lowestPriceForSeller) {
            lowestPriceForSeller = sess.last_seller_price;
          }

          if (!bestCandidate || lowestPriceForSeller < bestCandidate.lowestPrice) {
            bestCandidate = {
              dialog_id: s.dialog_id,
              seller_name: s.seller_info.name,
              seller_info: s.seller_info,
              lowestPrice: lowestPriceForSeller,
              item_title: s.seller_info.title,
              payment_details: sess?.payment_details || s.seller_info.details || {}
            };
          }
        }

        if (bestCandidate) {
          this.emit('all_deadlocked', {
            hunt_id: huntId,
            bestCandidate,
            userBudget: currentItem.budget
          });
          this.emit('log', { text: `⛔ All sellers deadlocked above budget! Best counter-offer found: ₦${bestCandidate.lowestPrice.toLocaleString()} from ${bestCandidate.seller_name}.` });
        }
      }

      return this.getState();
    }

    // Normal continuing turn
    if (decision.reply_text) {
      if (['PENDING_APPROVAL', 'APPROVED', 'DEADLOCKED', 'STAND_DOWN_CLOSED', 'REJECTED'].includes(dialogState.status) || (this.winnerInfo && dialogState.dialog_id !== this.winnerInfo.dialog_id)) {
        return this.getState();
      }
      const timeReply = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      dialogState.history.push({
        sender: 'me',
        text: decision.reply_text,
        time: timeReply
      });
      store.appendMessage(dialogId, 'me', decision.reply_text);
      dialogState.status = 'NEGOTIATING';
      this.emit('log', { text: `Reply to ${sellerInfo.name}: "${decision.reply_text}"` });
    }

    return this.getState();
  }

  /**
   * Start Autonomous Live Simulation across the 3 sellers.
   * Sends openers across all 3 sellers, then executes sequential turns for Seller A.
   */
  async startAutonomousSimulation(itemIdOrQuery, customBudget = null) {
    this.stopAutonomousSimulation();

    let matchedItem = this.findBestMatchingItem(itemIdOrQuery);
    if (customBudget && customBudget > 0) {
      matchedItem.budget = customBudget;
      matchedItem.target_price = Math.round(customBudget * 0.95);
    }

    this.initItemState(matchedItem.id);
    this.emit('log', { text: `🚀 Starting autonomous outreach for "${matchedItem.name}" with 3 sellers...` });
    this.emit('hunt_started', { item: matchedItem, budget: matchedItem.budget });

    // Step 0: Opener to all 3 sellers staggered slightly
    for (const seller of matchedItem.sellers) {
      await this.executeTurn(seller.id);
      await new Promise(r => setTimeout(r, 800));
    }
    this.emit('log', { text: `✅ Initial outreach dispatched to all 3 sellers on Jiji.` });

    // Paced concurrent turns loop for ALL 3 sellers until each reaches agreement, deadlock, or terminal state
    matchedItem.sellers.forEach((seller, index) => {
      let turnCount = 0;
      const maxTurns = 10;
      const baseDelay = 2500 + (index * 1200); // Stagger sellers so conversations don't step at the exact millisecond

      const runSellerTurn = async () => {
        const dialogState = this.activeDialogStates[seller.id];
        if (!dialogState) return;
        if (this.winnerInfo) return; // Winner already crowned!
        if (['PENDING_APPROVAL', 'APPROVED', 'DEADLOCKED', 'STAND_DOWN_CLOSED', 'REJECTED'].includes(dialogState.status)) {
          return; // Terminal state reached for this seller
        }
        turnCount++;
        if (turnCount > maxTurns) {
          dialogState.status = 'DEADLOCKED';
          return;
        }

        await this.executeTurn(seller.id);

        const updatedState = this.activeDialogStates[seller.id];
        if (this.winnerInfo) return; // Winner crowned during executeTurn!
        if (updatedState && !['PENDING_APPROVAL', 'APPROVED', 'DEADLOCKED', 'STAND_DOWN_CLOSED', 'REJECTED'].includes(updatedState.status)) {
          const nextPacedDelay = 3800 + Math.floor(Math.random() * 1200); // 3.8s to 5.0s realistic human pacing
          const nextTimer = setTimeout(runSellerTurn, nextPacedDelay);
          this.simTimers.push(nextTimer);
        }
      };

      const initialTimer = setTimeout(runSellerTurn, baseDelay);
      this.simTimers.push(initialTimer);
    });

    return this.getState();
  }

  /**
   * User pressed "Push Lower" (Bluff).
   * Buyer sends cash bluff, then seller responds dynamically accepting or refusing via Gemini.
   */
  async handleBluffLower(dialogId, bluffPrice = null) {
    let dialogState = this.activeDialogStates[dialogId] || Object.values(this.activeDialogStates).find(d => d.dialog_id === dialogId);
    if (!dialogState) return null;

    const actualDialogId = dialogState.dialog_id;
    const sellerInfo = dialogState.seller_info;
    const session = store.getSession(actualDialogId);
    const currentPrice = dialogState.proposed_deal?.agreed_price || session?.current_offer || sellerInfo.asking_price;
    const targetBluff = bluffPrice || calculateSmartBluff(currentPrice, dialogState.history);

    dialogState.status = 'BLUFFING_LOWER';
    store.updateSession(actualDialogId, { status: 'BLUFFING_LOWER', bluff_price: targetBluff });

    const bluffMsg = `Ah boss, I check my balance again, that ₦${Number(currentPrice).toLocaleString()} go leave me stranded o. Honest truth, na ₦${Number(targetBluff).toLocaleString()} cash I fit balance transfer immediately. If e no fit work, no wahala make I just leave am.`;
    const timeBluff = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    dialogState.history.push({
      sender: 'me',
      text: bluffMsg,
      time: timeBluff
    });
    store.appendMessage(actualDialogId, 'me', bluffMsg);
    this.emit('log', { text: `Dispatched lower cash bluff of ₦${Number(targetBluff).toLocaleString()} to ${sellerInfo.name}.` });

    // Paced reply from Seller after 1.5s via Dynamic Gemini Seller Engine
    setTimeout(async () => {
      let sellerReply = null;
      let sellerDecision = null;
      try {
        sellerDecision = await ai.generateSellerReply(sellerInfo, this.getItem(this.activeItemId), dialogState.history, bluffMsg);
        sellerReply = sellerDecision?.seller_reply;
      } catch (e) {
        console.warn('[Simulator] Error generating bluff seller reply:', e.message);
      }

      if (!sellerReply) {
        if (sellerInfo.outcome_type === 'APPROVE') {
          sellerReply = `No problem boss, bring the ₦${Number(targetBluff).toLocaleString()} make we run am. Pay to ${sellerInfo.details.bank} ${sellerInfo.details.account_number} ${sellerInfo.details.account_name}. Shop is ${sellerInfo.details.pickup_address}.`;
        } else {
          sellerReply = sellerInfo.bluff_refusal || `Haba oga! ₦${Number(currentPrice).toLocaleString()} is my rock bottom price. Cannot go lower at all.`;
        }
      }

      const timeRef = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      dialogState.history.push({
        sender: 'seller',
        text: sellerReply,
        time: timeRef
      });
      store.appendMessage(actualDialogId, 'seller', sellerReply);

      // Evaluate Acceptance vs Refusal dynamically:
      const refusalKeywords = /\b(cannot|can't|cant|no fit|last price|rock bottom|not reducing|take it or leave it|non-negotiable|no oga|no bro|no discount)\b/i;
      const isExplicitRefusal = sellerDecision?.bluff_refused || refusalKeywords.test(sellerReply);

      const acceptKeywords = /\b(no problem|no wahala|bring|bring am|run am|close am|agreed|agree|send am|pay to|package am|oya bring)\b/i;
      const isExplicitAccept = sellerDecision?.deal_accepted || (!isExplicitRefusal && acceptKeywords.test(sellerReply));

      // Cooperative seller A or clear accept keywords -> bluff ACCEPTED!
      const isAccepted = (sellerInfo.outcome_type === 'APPROVE' || isExplicitAccept) && !isExplicitRefusal;

      if (isAccepted) {
        dialogState.status = 'BLUFF_ACCEPTED';
        if (!dialogState.proposed_deal) {
          dialogState.proposed_deal = {};
        }
        dialogState.proposed_deal.agreed_price = targetBluff;
        dialogState.proposed_deal.seller_name = sellerInfo.name;
        dialogState.proposed_deal.dialog_id = actualDialogId;
        dialogState.proposed_deal.item_title = sellerInfo.title;

        store.updateSession(actualDialogId, {
          status: 'BLUFF_ACCEPTED',
          current_offer: targetBluff,
          agreed_price: targetBluff
        });

        // Update deal in hunt store
        store.proposeDeal(dialogState.hunt_id, {
          ...dialogState.proposed_deal,
          agreed_price: targetBluff
        });

        this.emit('bluff_accepted', {
          dialog_id: actualDialogId,
          hunt_id: dialogState.hunt_id,
          seller_name: sellerInfo.name,
          price: targetBluff,
          deal: dialogState.proposed_deal
        });
        this.emit('log', { text: `🎉 Seller ${sellerInfo.name} ACCEPTED lower bluff of ₦${Number(targetBluff).toLocaleString()}! Awaiting user final approval.` });
      } else {
        dialogState.status = 'BLUFF_REFUSED';
        store.updateSession(actualDialogId, { status: 'BLUFF_REFUSED' });

        this.emit('bluff_refused', {
          dialog_id: actualDialogId,
          hunt_id: dialogState.hunt_id,
          seller_name: sellerInfo.name,
          price: currentPrice
        });
        this.emit('log', { text: `Seller ${sellerInfo.name} refused lower bluff of ₦${Number(targetBluff).toLocaleString()}. Insists on ₦${Number(currentPrice).toLocaleString()}.` });
      }
    }, 1500);

    return { success: true, bluff_price: targetBluff, session };
  }

  /**
   * User pressed "Approve & Pay".
   * Crowns Winner and stands down competitor sellers with polite dismissal.
   */
  handleApprove(dialogId, azzaPayload) {
    let dialogState = this.activeDialogStates[dialogId] || Object.values(this.activeDialogStates).find(d => d.dialog_id === dialogId);
    if (!dialogState) return null;

    const actualDialogId = dialogState.dialog_id;
    const agreedPrice = dialogState.proposed_deal?.agreed_price || dialogState.seller_info.asking_price;
    const sellerInfo = dialogState.seller_info;

    // Check if this approval happened AFTER a bluff refusal
    const wasBluffRefused = dialogState.status === 'BLUFF_REFUSED';

    if (wasBluffRefused) {
      dialogState.status = 'AWAITING_POST_BLUFF_CONFIRMATION';
      const apologyMsg = `Haba boss, no vex na! No wahala at all, ₦${Number(agreedPrice).toLocaleString()} agreed as we talk before. Make I quickly arrange and verify the payment now, make I still pay?`;
      const timeApology = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      dialogState.history.push({
        sender: 'me',
        text: apologyMsg,
        time: timeApology
      });
      store.appendMessage(actualDialogId, 'me', apologyMsg);
      this.emit('log', { text: `Sent de-escalation confirmation request to ${sellerInfo.name}: "${apologyMsg}"` });

      // Seller confirms after 2.0s
      setTimeout(async () => {
        let sellerConfirmation = null;
        try {
          const sellerDecision = await ai.generateSellerReply(sellerInfo, this.getItem(this.activeItemId), dialogState.history, apologyMsg);
          sellerConfirmation = sellerDecision.seller_reply;
        } catch (e) {
          sellerConfirmation = `No shaking boss, I understand how market be. Transfer the ₦${Number(agreedPrice).toLocaleString()} sharp sharp make I package am for you.`;
        }
        if (!sellerConfirmation) {
          sellerConfirmation = `No shaking boss, I understand how market be. Transfer the ₦${Number(agreedPrice).toLocaleString()} sharp sharp make I package am for you.`;
        }

        const timeConf = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        dialogState.history.push({
          sender: 'seller',
          text: sellerConfirmation,
          time: timeConf
        });
        store.appendMessage(actualDialogId, 'seller', sellerConfirmation);

        // Finalize Winner!
        this.finalizeWinner(actualDialogId, agreedPrice, azzaPayload, true);
      }, 2000);

      return { awaiting_confirmation: true, dialogState };
    }

    // Direct approval (no bluff refusal, e.g. normal deal or bluff accepted)
    return this.finalizeWinner(actualDialogId, agreedPrice, azzaPayload, false);
  }

  finalizeWinner(dialogId, agreedPrice, azzaPayload, wasConfirmation = false) {
    let dialogState = this.activeDialogStates[dialogId] || Object.values(this.activeDialogStates).find(d => d.dialog_id === dialogId || d.seller_info?.id === dialogId);
    if (!dialogState) return null;

    const actualDialogId = dialogState.dialog_id;

    // Immediately stop all pending timers!
    this.stopAutonomousSimulation();

    dialogState.status = 'APPROVED';
    this.winnerInfo = {
      dialog_id: actualDialogId,
      seller_name: dialogState.seller_info.name,
      agreed_price: agreedPrice,
      azza: azzaPayload
    };

    // Stand down all competitor sellers strictly once
    for (const other of Object.values(this.activeDialogStates)) {
      if (other.dialog_id !== actualDialogId && other.status !== 'STAND_DOWN_CLOSED') {
        other.status = 'STAND_DOWN_CLOSED';
        const dismissal = "Thanks boss! I don already conclude and pay for another one earlier today. I really appreciate your time! 🤝";
        const timeDismiss = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        other.history.push({
          sender: 'me',
          text: dismissal,
          time: timeDismiss
        });
        store.appendMessage(other.dialog_id, 'me', dismissal);
        store.updateSession(other.dialog_id, { status: 'STAND_DOWN_CLOSED', stand_down_sent: true });
      }
    }

    this.emit('winner_crowned', {
      winner: actualDialogId,
      seller_name: dialogState.seller_info.name,
      agreed_price: agreedPrice,
      azza: azzaPayload,
      was_confirmation: wasConfirmation
    });
    this.emit('log', { text: `🏆 Winner confirmed & crowned: ${dialogState.seller_info.name}! All competitor sellers politely stood down.` });

    return this.getState();
  }

  /**
   * Switch winner when user changes their mind or makes an accidental selection.
   * Dismisses old winner and revives new winner.
   */
  handleSwitchWinner(newDialogId, oldDialogId, azzaPayload) {
    let newDialogState = this.activeDialogStates[newDialogId] || Object.values(this.activeDialogStates).find(d => d.dialog_id === newDialogId || d.seller_info?.id === newDialogId);
    let oldDialogState = this.activeDialogStates[oldDialogId] || Object.values(this.activeDialogStates).find(d => d.dialog_id === oldDialogId || d.seller_info?.id === oldDialogId);

    if (!newDialogState) return null;

    const actualNewDialogId = newDialogState.dialog_id;
    const actualOldDialogId = oldDialogState ? oldDialogState.dialog_id : this.winnerInfo?.dialog_id;

    // 1. Stand down previous winner
    if (oldDialogState) {
      oldDialogState.status = 'STAND_DOWN_CLOSED';
      const standDownOld = "Boss, change of plan, my partner had already locked another unit. Thank you so much for your time! 🤝";
      const timeOld = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      oldDialogState.history.push({
        sender: 'me',
        text: standDownOld,
        time: timeOld
      });
      store.appendMessage(actualOldDialogId, 'me', standDownOld);
      store.updateSession(actualOldDialogId, { status: 'STAND_DOWN_CLOSED' });
    }

    // 2. Revive and crown the new winner
    newDialogState.status = 'APPROVED';
    const agreedPrice = newDialogState.proposed_deal?.agreed_price || newDialogState.seller_info.asking_price;
    const reviveMsg = `Haba boss! Good news, my brother insisted we take your clean unit instead! ₦${Number(agreedPrice).toLocaleString()} confirmed, making payment now sharp sharp!`;
    const timeNew = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    newDialogState.history.push({
      sender: 'me',
      text: reviveMsg,
      time: timeNew
    });
    store.appendMessage(actualNewDialogId, 'me', reviveMsg);
    store.updateSession(actualNewDialogId, { status: 'DEAL_CLOSED', azza_quote: azzaPayload });

    this.winnerInfo = {
      dialog_id: actualNewDialogId,
      seller_name: newDialogState.seller_info.name,
      agreed_price: agreedPrice,
      azza: azzaPayload
    };

    // Seller acknowledges after 1.5s
    setTimeout(() => {
      const sellerAck = `No wahala at all boss! Account details still valid, once alert drop I go package am immediately.`;
      const timeAck = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      newDialogState.history.push({
        sender: 'seller',
        text: sellerAck,
        time: timeAck
      });
      store.appendMessage(actualNewDialogId, 'seller', sellerAck);
    }, 1500);

    this.emit('winner_switched', {
      old_winner: actualOldDialogId,
      new_winner: actualNewDialogId,
      seller_name: newDialogState.seller_info.name,
      agreed_price: agreedPrice,
      azza: azzaPayload
    });
    this.emit('log', { text: `🔄 Winner switched from ${oldDialogState?.seller_info?.name || 'previous seller'} to ${newDialogState.seller_info.name}! Stand-down and revival messages dispatched.` });

    return this.getState();
  }

  /**
   * User pressed "Pass / Drop Deal".
   */
  handleReject(dialogId) {
    let dialogState = this.activeDialogStates[dialogId] || Object.values(this.activeDialogStates).find(d => d.dialog_id === dialogId);
    if (!dialogState) return null;

    const actualDialogId = dialogState.dialog_id;
    dialogState.status = 'REJECTED';
    const exitMsg = "Thanks my oga, I check the details and location well, e no go fit work for me. Appreciate your time boss!";
    const timeReject = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    dialogState.history.push({
      sender: 'me',
      text: exitMsg,
      time: timeReject
    });
    store.appendMessage(actualDialogId, 'me', exitMsg);
    store.updateSession(actualDialogId, { status: 'REJECTED' });

    this.emit('log', { text: `Deal dropped with ${dialogState.seller_info.name}.` });
    return this.getState();
  }

  /**
   * User pressed "Buy from {sellerName} for ₦{lowestPrice}" after all sellers deadlocked
   */
  handleAcceptDeadlocked(dialogId, acceptedPrice, azzaPayload) {
    let dialogState = this.activeDialogStates[dialogId] || Object.values(this.activeDialogStates).find(d => d.dialog_id === dialogId);
    if (!dialogState) return null;

    const actualDialogId = dialogState.dialog_id;
    const sellerInfo = dialogState.seller_info;

    dialogState.status = 'AWAITING_POST_BLUFF_CONFIRMATION';
    dialogState.proposed_deal = {
      dialog_id: actualDialogId,
      seller_name: sellerInfo.name,
      item_title: sellerInfo.title,
      asking_price: sellerInfo.asking_price,
      agreed_price: acceptedPrice,
      payment_details: sellerInfo.details || {}
    };

    store.updateSession(actualDialogId, {
      status: 'AWAITING_POST_BLUFF_CONFIRMATION',
      agreed_price: acceptedPrice,
      current_offer: acceptedPrice
    });

    const apologyMsg = `Haba boss, no vex na! No wahala at all, ₦${Number(acceptedPrice).toLocaleString()} agreed as we talk before. Make I quickly arrange and verify the payment now, make I still pay?`;
    const timeApology = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    dialogState.history.push({
      sender: 'me',
      text: apologyMsg,
      time: timeApology
    });
    store.appendMessage(actualDialogId, 'me', apologyMsg);
    this.emit('log', { text: `Sent deal revival confirmation request to ${sellerInfo.name}: "${apologyMsg}"` });

    // Seller confirms after 2.0s
    setTimeout(async () => {
      let sellerConfirmation = null;
      try {
        const sellerDecision = await ai.generateSellerReply(sellerInfo, this.getItem(this.activeItemId), dialogState.history, apologyMsg);
        sellerConfirmation = sellerDecision?.seller_reply;
      } catch (e) {
        sellerConfirmation = `No shaking boss, I understand how market be. Transfer the ₦${Number(acceptedPrice).toLocaleString()} sharp sharp make I package am for you.`;
      }
      if (!sellerConfirmation) {
        sellerConfirmation = `No shaking boss, I understand how market be. Transfer the ₦${Number(acceptedPrice).toLocaleString()} sharp sharp make I package am for you.`;
      }

      const timeConf = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      dialogState.history.push({
        sender: 'seller',
        text: sellerConfirmation,
        time: timeConf
      });
      store.appendMessage(actualDialogId, 'seller', sellerConfirmation);

      // Finalize Winner!
      this.finalizeWinner(actualDialogId, acceptedPrice, azzaPayload);
    }, 2000);

    return { awaiting_confirmation: true, dialogState };
  }
}

module.exports = new NegotiationSimulator();
