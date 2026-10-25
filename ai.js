/**
 * AI Negotiation Engine (ai.js)
 * Live Gemini Integration with Multi-Model Resilience & Context-Aware Nigerian Haggling.
 */

require('dotenv').config();

const SYSTEM_PROMPT = `
You are a smart, everyday Nigerian buyer bargaining on Jiji.ng.

COMMUNICATION GUIDELINES:
1. STRICT BREVITY: Maximum 1 to 2 sentences per message (under 25 words). Never write long paragraphs or speeches. Real buyers on Jiji are concise and direct.
2. NATURAL LANGUAGE: Speak natural Nigerian English by default (e.g. "Good day, is this still available?", "Can ₦760k cash take it today?", "What is your best last price?").
3. LIGHT LOCAL TOUCH: You may use light, natural Nigerian market terms ("boss", "bro", "last price", "cash ready", "last card") when bargaining. Only use light Pidgin if the seller speaks Pidgin first. NEVER use exaggerated or cartoonish Pidgin.
4. NO REPETITIVE ROBOTIC FORMULAS: NEVER repeat the exact same sentence pattern across turns (e.g. do NOT say "I understand boss. How about ₦X..." followed by "I respect that boss. Can ₦Y..."). Sound completely natural and spontaneous.

PRICING & NEGOTIATION RULES:
1. OPENING DISCOUNT: Opening offers are strictly 10% to 15% below asking price (never absurd lowballs like 20%+ off).
2. SELLER STANDS FIRM OR NAMES A PRICE (CRITICAL):
   - SHORTHAND PRICES: In Nigeria, 3-digit numbers like "530", "850", "900" mean "₦530,000", "₦850,000", "₦900,000" when talking about items in that price bracket (e.g. "not selling for anything lower than 530" means ₦530k). Recognize these shorthands accurately!
   - If the seller asserts their price is firm or is their best/last price (e.g. "Sorry Thats the best price", "That is the best price", "530 is my last", "Not reducing", "Fixed", "Cannot reduce", "No reduction", "Not selling lower than X"):
     • They have confirmed their price!
     • If that price is WITHIN OR AT BUDGET (Price <= Budget):
       - ACCEPT IT IMMEDIATELY! DO NOT ask for their last price or throw lower offers!
       - Close the deal: stance: "AGREED", reply_text: "Deal boss, ₦[Price] agreed! Drop your shop address or bank details so I can verify and conclude."
     • If that price EXCEEDS BUDGET:
       - Offer your budget ceiling: "Boss, ₦[Budget] is my absolute maximum budget cash ready right now. Can we make it work?"
       - If seller refuses to budge past budget twice: flag is_impasse: true.
   - When the seller names a newly lowered price:
     • If within budget and turn count >= 2: ACCEPT IT!
     • If turn count == 1 and not firm: Propose ONE realistic counter step (+₦10,000 to +₦15,000), capped at budget.

3. STRICT ANTI-REPETITION (CRITICAL):
   - ALWAYS inspect what YOU (ME) previously asked in the Conversation History!
   - You MUST NEVER repeat the same question across turns (e.g. if you already asked "What is your best last price?", you must NEVER ask what their last price is again!).
   - If you already probed for last price and seller did not lower:
     • If asking price <= budget: ACCEPT IT ("Deal boss, ₦[Price] agreed! Drop your shop address or bank details...")
     • If asking price > budget: Offer your final budget ceiling or walk away politely.

4. STRICT ANTI-SELF-BIDDING:
   - You MUST NEVER bid against yourself!
   - If the seller defends quality/grade/spec without price ("Quality over price sir", "Original UK used", "Battery 100%"):
     • If you haven't asked for last price yet: "I understand say na top quality boss, but wetin be your real rock-bottom last price make I see if my pocket reach am?"
     • If you already asked for last price earlier: Do not ask again. If within budget, accept!
   - If the seller asks how much you have or what your budget is:
     • "I have ₦[YourOffer] ready right now to pick it up."

4. VOICE NOTES & AUDIO MESSAGES:
   - If the incoming message is "[VOICE_NOTE]" or mentions an audio note:
     • Reply politely: "Sorry boss, I dey noisy place/meeting now, I no fit listen to voice note at all. Abeg type am for text make we finish am sharp-sharp."
     • Do NOT bid or ask for bank details on this turn.

5. NIGERIAN BANK ACCOUNTS & FINTECHS (CRITICAL):
   - 10-digit NUBAN numbers CAN start with "081", "080", "070", "090", etc. (e.g. Access, Zenith, GTB accounts frequently start with 081...). NEVER reject or question a 10-digit account number because it starts with 081!
   - On fintechs like OPay, PalmPay, Moniepoint, and Kuda, the account number IS the seller's mobile number (either 10 digits or 11 digits, e.g. "08101234567 OPay").
   - If a seller gives an 11-digit or 10-digit number and mentions a bank name (e.g. "0812345678 Access", "08101234567 OPay", "07012345678 PalmPay", "Acct: 081..."):
     • ACCEPT IT immediately as their bank account!
     • NEVER argue or ask for another account number!
   - Only when an 11-digit number is given purely for calling / WhatsApp / shop contact (e.g. "call me on 070...", "my shop phone is 081...") WITHOUT any bank name or payment context, treat it as their phone number.

6. THREE VALID PATHS TO CLOSE A DEAL ON JIJI (CRITICAL):
   PATH A: IN-PERSON SHOP INSPECTION (SAME CITY / SAME STATE)
   - When buyer and seller are in the same state (e.g. both in Lagos):
     • If seller says: "come to shop and inspect", "pay after inspection", "inspect before payment", or drops shop address:
     • Reply: "No wahala boss, that makes total sense. Drop your exact shop/plaza address and phone number make I come inspect and pay."
     • Once shop address/location and phone number are provided:
       Set deal_closed: true, stance: "AGREED"
       reply_text MUST BE EXACTLY: "Make I quickly arrange and verify the payment now, I get back to you once done"

   PATH B: INTERSTATE WAYBILL / MOTOR PARK DELIVERY (DIFFERENT CITY / DIFFERENT STATE)
   - When seller is in a DIFFERENT state (e.g. seller in Enugu/Abuja/etc., while buyer is in Lagos) OR seller mentions waybill/delivery:
     • Real Nigerian commerce uses WAYBILL via interstate transport parks or couriers (e.g. Peace Mass Transit, GIG Motors, Young Shall Grow, ABC Transport, Speedaf).
     • Propose WAYBILL: "No wahala boss, since you dey [SellerCity], we go run waybill. Which park or transport you dey use send am (e.g. Peace Mass, GIGM)? Hope ₦[Price] cover the waybill, or how much be transport?"
     • If seller names their park / courier and drops their phone/account details:
       Set deal_closed: true, stance: "AGREED"
       reply_text MUST BE EXACTLY: "Make I quickly arrange and verify the payment now, I get back to you once done"

   PATH C: DIRECT BANK TRANSFER / ONLINE ESCROW
   - If seller offers bank transfer details (10-digit NUBAN or OPay/PalmPay number + bank name + account name):
     • If details are present:
       Set deal_closed: true, stance: "AGREED"
       reply_text MUST BE EXACTLY: "Make I quickly arrange and verify the payment now, I get back to you once done"

7. LOCATION AWARENESS & INTERSTATE HANDLING:
   - Our base location is [OurLocation] (e.g. Lagos).
   - If the seller asks if you are in their city (e.g. "U are in Enugu right?"):
     • If matches [OurLocation]: "Yes boss, I dey [OurLocation]."
     • If DIFFERENT city/state (e.g. seller is in Enugu):
       "I dey [OurLocation], but we fit do waybill via park bus (e.g. Peace Mass, GIGM) once we agree. How much waybill to [OurLocation] go cost?"

OUTPUT FORMAT:
Respond strictly with a single valid JSON object matching the requested schema.
`;

const CANDIDATE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash'
];

// Live Google Gemini caller with automatic failover
async function callGemini(promptText, schemaExample, customSystemPrompt = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('YOUR_')) {
    throw new Error('GEMINI_API_KEY is missing or invalid in .env file!');
  }

  const system = customSystemPrompt || SYSTEM_PROMPT;
  const fullPrompt = `${system}\n\n${promptText}\n\nCRITICAL: Respond ONLY with valid JSON matching:\n${schemaExample}`;

  let lastError = null;

  for (const model of CANDIDATE_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.7
          }
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.warn(`[AI Engine] Model ${model} returned ${response.status}.`);
        lastError = `Model ${model} (${response.status}): ${errorBody}`;
        if (response.status === 400 || response.status === 403) {
          // Invalid API key or permission denied - fail over immediately without delaying the user
          break;
        }
        continue;
      }

      const result = await response.json();
      const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        lastError = `Model ${model} returned empty content`;
        continue;
      }

      const parsed = JSON.parse(rawText.trim());
      return parsed;
    } catch (err) {
      console.warn(`[AI Engine] Exception on model ${model}:`, err.message);
      lastError = err.message;
    }
  }

  throw new Error(`All Gemini models failed. Last error: ${lastError}`);
}

// Smart, context-aware rule-based fallback when all LLM models encounter network dropouts
function generateFallbackChatTurn(session, newSellerMessage) {
  const askingPrice = session.asking_price > 0 ? session.asking_price : (session.target_price > 0 ? session.target_price : 60000);
  const targetBudget = session.target_price > 0 ? session.target_price : askingPrice;
  const currentOffer = session.current_offer > 0 ? session.current_offer : Math.round(askingPrice * 0.86);
  const userLoc = session.user_location || 'Lagos';
  const msgLower = (newSellerMessage || '').toLowerCase();

  // 1. Voice Note Handling
  if (msgLower.includes('[voice_note]') || msgLower.includes('voice note') || msgLower.includes('audio')) {
    return {
      stance: 'NEGOTIATING',
      detected_seller_price: askingPrice,
      counter_offer: currentOffer,
      reply_text: "Sorry boss, I dey noisy place/meeting now, I no fit listen to voice note at all. Abeg type am for text make we finish am sharp-sharp.",
      is_impasse: false,
      deal_closed: false,
      bluff_accepted: false,
      bluff_refused: false,
      payment_details: null
    };
  }

  // 2. In-Person Inspection / Shop Pickup Handling
  if (/come shop|inspect|service is provided|pay on delivery|before u make payment|simple/i.test(msgLower)) {
    return {
      stance: 'VERIFYING_DETAILS',
      detected_seller_price: currentOffer,
      counter_offer: currentOffer,
      reply_text: "No wahala boss, that makes total sense. Drop your exact shop address/plaza number and phone number make I come inspect and pay.",
      is_impasse: false,
      deal_closed: false,
      bluff_accepted: false,
      bluff_refused: false,
      payment_details: {
        inspection_required: true,
        amount_ngn: currentOffer
      }
    };
  }

  // 3. Location Inquiries (e.g. "U are in Enugu right", "Where are you")
  if (/are you in|u are in|where you dey|your location/i.test(msgLower)) {
    const cityMatch = msgLower.match(/\bin\s+([a-z]+)\b/i);
    const askedCity = cityMatch ? cityMatch[1] : null;
    if (askedCity && userLoc.toLowerCase().includes(askedCity.toLowerCase())) {
      return {
        stance: 'NEGOTIATING',
        detected_seller_price: askingPrice,
        counter_offer: currentOffer,
        reply_text: `Yes boss, I dey ${userLoc}. Drop your exact shop address make I arrange pickup.`,
        is_impasse: false,
        deal_closed: false,
        bluff_accepted: false,
        bluff_refused: false,
        payment_details: null
      };
    } else {
      return {
        stance: 'NEGOTIATING',
        detected_seller_price: askingPrice,
        counter_offer: currentOffer,
        reply_text: `I dey ${userLoc}, so na waybill we go run am. Which park or bus (e.g. Peace Mass, GIGM) you dey use send am?`,
        is_impasse: false,
        deal_closed: false,
        bluff_accepted: false,
        bluff_refused: false,
        payment_details: {
          deal_type: 'INTERSTATE_WAYBILL',
          waybill_required: true,
          seller_city: askedCity || 'Interstate'
        }
      };
    }
  }

  // 4. Interstate Waybill & Transport Handling
  if (/waybill|send through park|peace mass|gigm|gig\b|interstate|bus park|driver|courier|speedaf/i.test(msgLower)) {
    const hasPhoneOrAcct = /\b(0[789][01]\d{8}|\d{10})\b/.test(msgLower);
    if (hasPhoneOrAcct) {
      return {
        stance: 'AGREED',
        detected_seller_price: currentOffer,
        counter_offer: currentOffer,
        reply_text: "Make I quickly arrange and verify the payment now, I get back to you once done",
        is_impasse: false,
        deal_closed: true,
        bluff_accepted: false,
        bluff_refused: false,
        payment_details: {
          deal_type: 'INTERSTATE_WAYBILL',
          waybill_required: true,
          amount_ngn: currentOffer
        }
      };
    } else {
      return {
        stance: 'NEGOTIATING',
        detected_seller_price: askingPrice,
        counter_offer: currentOffer,
        reply_text: `No wahala boss, we fit run waybill. Which park or bus company you dey use send am, and hope ₦${currentOffer.toLocaleString()} cover the waybill?`,
        is_impasse: false,
        deal_closed: false,
        bluff_accepted: false,
        bluff_refused: false,
        payment_details: {
          deal_type: 'INTERSTATE_WAYBILL',
          waybill_required: true
        }
      };
    }
  }

  // 5. Bank Account & Payment details provided (including 081 accounts and OPay/PalmPay)
  const hasBankMention = /opay|palmpay|kuda|gtb|gtbank|access|zenith|uba|first bank|fcmb|stanbic|sterling|wema|polaris|fidelity|union|moniepoint/i.test(msgLower);
  const hasNumber = /\b(\d{10}|0[789][01]\d{8})\b/.test(msgLower);
  if ((hasBankMention && hasNumber) || (/account|acct/i.test(msgLower) && hasNumber)) {
    return {
      stance: 'AGREED',
      detected_seller_price: currentOffer,
      counter_offer: currentOffer,
      reply_text: "Make I quickly arrange and verify the payment now, I get back to you once done",
      is_impasse: false,
      deal_closed: true,
      bluff_accepted: false,
      bluff_refused: false,
      payment_details: {
        amount_ngn: currentOffer
      }
    };
  }

  // 6. Seller clarifying phone number
  if (/phone number|my number/i.test(msgLower)) {
    return {
      stance: 'NEGOTIATING',
      detected_seller_price: askingPrice,
      counter_offer: currentOffer,
      reply_text: "Noted boss, I see your number. Drop your shop/park details or account make we seal am.",
      is_impasse: false,
      deal_closed: false,
      bluff_accepted: false,
      bluff_refused: false,
      payment_details: null
    };
  }

  // 5. Detect if seller mentioned a price
  let detectedPrice = null;
  const priceMatches = msgLower.match(/\b(\d{2,4})k\b|\b(\d{5,8})\b|\b(\d{1,3}(?:,\d{3})+)\b/);
  if (priceMatches) {
    const rawVal = (priceMatches[1] ? parseInt(priceMatches[1], 10) * 1000 : (priceMatches[2] || priceMatches[3])).toString().replace(/,/g, '');
    detectedPrice = parseInt(rawVal, 10);
  }

  // 5b. Match 3-digit shorthand (e.g. "530" for ₦530k, "850" for ₦850k) when asking price is 50k+
  const shorthandMatch = msgLower.match(/\b([1-9]\d{2})\b/);
  if (!detectedPrice && shorthandMatch && askingPrice >= 50000) {
    const val = parseInt(shorthandMatch[1], 10) * 1000;
    if (val >= askingPrice * 0.4 && val <= askingPrice * 1.6) {
      detectedPrice = val;
    }
  }

  // 6. Check if seller asked how much buyer has or what buyer's budget is
  if (/(?:how\s*much\s*(?:you\s*get|you\s*have|fit\s*pay)|what(?:'s|\s*is)\s*your\s*(?:offer|budget|last\s*card))/i.test(msgLower)) {
    return {
      stance: 'NEGOTIATING',
      detected_seller_price: askingPrice,
      counter_offer: currentOffer,
      reply_text: `I have ₦${currentOffer.toLocaleString()} cash ready on ground right now boss.`,
      is_impasse: false,
      deal_closed: false,
      bluff_accepted: false,
      bluff_refused: false,
      payment_details: null
    };
  }

  // 7. Check if seller asserts firm price or says it is their best/last price without typing digits
  const isBestOrFirmPrice = /(?:best|last|final|bottom|rock\s*bottom|lowest)\s*price|sorry\s*thats\s*the\s*best|thats\s*the\s*best|not\s*reducing|cannot\s*reduce|cant\s*reduce|no\s*reduction|fixed|not\s*selling\s*for\s*anything\s*lower|cannot\s*do\s*lower|non[- ]negotiable/i.test(msgLower);
  if (isBestOrFirmPrice && !detectedPrice) {
    detectedPrice = askingPrice;
  }

  // 8. Check for seller refusal / quality explanation without dropping price (Anti-self-bidding)
  const isQualityOrRefusal = /(quality|grade|clean|original|battery|screen|lesser|no\b|can't|cant|cannot|never)/i.test(msgLower);

  if (isQualityOrRefusal && !detectedPrice) {
    // If seller is refusing and asking price is already within budget, accept on turn >= 2
    if ((session.turn_count || 1) >= 2 && askingPrice <= targetBudget && /cannot|can't|last|no|not selling|fixed/i.test(msgLower)) {
      return {
        stance: 'VERIFYING_DETAILS',
        detected_seller_price: askingPrice,
        counter_offer: askingPrice,
        reply_text: `Deal boss, ₦${askingPrice.toLocaleString()} agreed! Drop your shop address or bank details so I can verify and conclude.`,
        is_impasse: false,
        deal_closed: false,
        bluff_accepted: false,
        bluff_refused: false,
        payment_details: null
      };
    }

    if (/quality|grade|clean|original|battery/i.test(msgLower)) {
      return {
        stance: 'NEGOTIATING',
        detected_seller_price: askingPrice,
        counter_offer: currentOffer,
        reply_text: `I understand say na top quality boss, but wetin be your real rock-bottom last price make I see if my pocket reach am?`,
        is_impasse: false,
        deal_closed: false,
        bluff_accepted: false,
        bluff_refused: session.status === 'BLUFFING_LOWER',
        payment_details: null
      };
    } else {
      return {
        stance: 'NEGOTIATING',
        detected_seller_price: askingPrice,
        counter_offer: currentOffer,
        reply_text: `No problem boss. What is your absolute best last price to let it go today?`,
        is_impasse: false,
        deal_closed: false,
        bluff_accepted: false,
        bluff_refused: session.status === 'BLUFFING_LOWER',
        payment_details: null
      };
    }
  }

  // 9. Seller mentioned a price or affirmed asking price as best price
  if (detectedPrice && detectedPrice >= 10000) {
    if (detectedPrice <= targetBudget) {
      const isFirmOrRepeat = isBestOrFirmPrice || /last|final|rock bottom|no lower|lower than|not selling|firm|cannot|can't|fixed/i.test(msgLower) || (session.turn_count || 1) >= 2;
      if (isFirmOrRepeat) {
        return {
          stance: 'VERIFYING_DETAILS',
          detected_seller_price: detectedPrice,
          counter_offer: detectedPrice,
          reply_text: `Deal boss, ₦${detectedPrice.toLocaleString()} agreed! Drop your shop address or bank details so I can verify and conclude.`,
          is_impasse: false,
          deal_closed: false,
          bluff_accepted: false,
          bluff_refused: false,
          payment_details: null
        };
      } else {
        const nextOffer = Math.min(detectedPrice, Math.round((currentOffer + detectedPrice) / 2));
        return {
          stance: 'NEGOTIATING',
          detected_seller_price: detectedPrice,
          counter_offer: nextOffer,
          reply_text: `Can ₦${nextOffer.toLocaleString()} cash seal this right now make we conclude?`,
          is_impasse: false,
          deal_closed: false,
          bluff_accepted: false,
          bluff_refused: false,
          payment_details: null
        };
      }
    } else {
      // Seller price exceeds budget
      const nextOffer = Math.min(targetBudget, currentOffer + 15000);
      return {
        stance: 'NEGOTIATING',
        detected_seller_price: detectedPrice,
        counter_offer: nextOffer,
        reply_text: `Boss, ₦${targetBudget.toLocaleString()} is my absolute maximum budget cash ready. Can we make it work?`,
        is_impasse: false,
        deal_closed: false,
        bluff_accepted: false,
        bluff_refused: false,
        payment_details: null
      };
    }
  }

  // 10. Default anti-repetition probing reply
  // Check if we have already asked for the last price in conversation history
  const mySentTexts = (session.history || []).filter(m => m.sender === 'me').map(m => (m.text || '').toLowerCase());
  const hasAskedLastPrice = mySentTexts.some(t => t.includes('last price') || t.includes('best price') || t.includes('last card'));

  if (hasAskedLastPrice) {
    if (askingPrice <= targetBudget) {
      if ((session.turn_count || 1) >= 2) {
        return {
          stance: 'VERIFYING_DETAILS',
          detected_seller_price: askingPrice,
          counter_offer: askingPrice,
          reply_text: `Deal boss, ₦${askingPrice.toLocaleString()} agreed! Drop your shop address or bank details so I can verify and conclude.`,
          is_impasse: false,
          deal_closed: false,
          bluff_accepted: false,
          bluff_refused: false,
          payment_details: null
        };
      } else {
        const nextOffer = Math.min(targetBudget, currentOffer + 10000);
        return {
          stance: 'NEGOTIATING',
          detected_seller_price: askingPrice,
          counter_offer: nextOffer,
          reply_text: `Can ₦${nextOffer.toLocaleString()} cash take it today make I come pick am up?`,
          is_impasse: false,
          deal_closed: false,
          bluff_accepted: false,
          bluff_refused: false,
          payment_details: null
        };
      }
    } else {
      return {
        stance: 'NEGOTIATING',
        detected_seller_price: askingPrice,
        counter_offer: targetBudget,
        reply_text: `Boss, ₦${targetBudget.toLocaleString()} is my absolute maximum budget cash ready. Can we make it work?`,
        is_impasse: false,
        deal_closed: false,
        bluff_accepted: false,
        bluff_refused: session.status === 'BLUFFING_LOWER',
        payment_details: null
      };
    }
  }

  return {
    stance: 'NEGOTIATING',
    detected_seller_price: askingPrice,
    counter_offer: currentOffer,
    reply_text: `What is your absolute best last price for cash today boss?`,
    is_impasse: false,
    deal_closed: false,
    bluff_accepted: false,
    bluff_refused: session.status === 'BLUFFING_LOWER',
    payment_details: null
  };
}

// FLOW 1: Generate Opening Pitch via Live Gemini (Strictly 10% to 15% discount)
async function generateOpeningPitch(itemTitle, askingPrice, maxBudget) {
  let safeAsking = Number(askingPrice) || 500000;
  let safeBudget = Number(maxBudget) || safeAsking;

  if (safeAsking >= 10000 && safeBudget < safeAsking * 0.4) {
    safeBudget = Math.round(safeAsking * 0.9);
  }

  // Opening discount strictly 10% to 15% below asking price (averaging 12-14% discount)
  const discountFactor = 0.86; // ~14% discount
  let rawOpening = Math.round(safeAsking * discountFactor);
  if (rawOpening >= 100000) {
    rawOpening = Math.round(rawOpening / 5000) * 5000;
  } else if (rawOpening >= 10000) {
    rawOpening = Math.round(rawOpening / 1000) * 1000;
  }
  const targetOffer = Math.min(rawOpening, safeBudget);

  console.log(`[AI Engine] Generating live opener for: "${itemTitle}" | Asking: ₦${safeAsking.toLocaleString()} | Budget: ₦${safeBudget.toLocaleString()} | Target Opener (10-15% discount): ₦${targetOffer.toLocaleString()}`);

  const promptText = `
TASK: You are newly contacting a seller on Jiji for: "${itemTitle}".
Seller's Asking Price: ₦${safeAsking.toLocaleString()}
Our Maximum Budget: ₦${safeBudget.toLocaleString()}
Target Opening Offer: ₦${targetOffer.toLocaleString()}

PRICING RULES:
1. Your opening offer MUST be around ₦${targetOffer.toLocaleString()} (strictly 10% to 15% below asking price).
2. NEVER propose an insulting lowball (>15% off).
3. Round the opening offer cleanly (e.g. ₦700,000 for ₦800k asking, or ₦765,000 for ₦889k asking).

STYLE & BREVITY:
- Maximum 1 to 2 sentences (under 20 words).
- Speak natural Nigerian English by default with polite confidence (e.g. "Good day, is this still available? Can ₦${targetOffer.toLocaleString()} cash take it today?").
- AVOID long speeches, over-flattery, or cartoonish Pidgin.
`;

  const schemaExample = `{
  "opening_offer": ${targetOffer},
  "reply_text": "Good day, is this still available? Can ₦${targetOffer.toLocaleString()} cash take it today?"
}`;

  try {
    return await callGemini(promptText, schemaExample);
  } catch (err) {
    console.warn(`[AI Engine] LLM opener fallback:`, err.message);
    return {
      opening_offer: targetOffer,
      reply_text: `Good day boss, is this still available? Can ₦${targetOffer.toLocaleString()} cash take it today?`
    };
  }
}

// FLOW 2: Evaluate Ongoing Chat Turn via Live Gemini
async function evaluateChatTurn(session, newSellerMessage) {
  const askingPrice = session.asking_price > 0 ? session.asking_price : (session.target_price > 0 ? session.target_price : 60000);
  const targetBudget = session.target_price > 0 ? session.target_price : askingPrice;
  const currentOffer = session.current_offer > 0 ? session.current_offer : Math.round(askingPrice * 0.86);
  const userLocation = session.user_location || 'Lagos';

  console.log(`[AI Engine] Evaluating live chat turn from ${session.seller_name} for "${session.item_title}" | Asking: ₦${askingPrice.toLocaleString()} | Budget: ₦${targetBudget.toLocaleString()} | Last Offer: ₦${currentOffer.toLocaleString()} | Base Loc: ${userLocation}`);

  // Short-circuit for voice notes
  const msgLower = (newSellerMessage || '').toLowerCase();
  if (msgLower.includes('[voice_note]')) {
    return {
      stance: 'NEGOTIATING',
      detected_seller_price: askingPrice,
      counter_offer: currentOffer,
      reply_text: "Sorry boss, I dey noisy place/meeting now, I no fit listen to voice note at all. Abeg type am for text make we finish am sharp-sharp.",
      is_impasse: false,
      deal_closed: false,
      bluff_accepted: false,
      bluff_refused: false,
      payment_details: null
    };
  }

  const promptText = `
Negotiation Context:
- Item: ${session.item_title}
- Original Asking Price: ₦${askingPrice.toLocaleString()}
- Our Maximum Budget: ₦${targetBudget.toLocaleString()}
- Last Offer We Sent: ₦${currentOffer.toLocaleString()}
- Turn Count: ${session.turn_count || 1}
- Our Base Location: ${userLocation}

Conversation History with Seller (${session.seller_name}):
${(session.history || []).map(m => `${m.sender.toUpperCase()}: ${m.text}`).join('\n')}

New Incoming Message from Seller:
"${newSellerMessage}"

COMMUNICATION & CONVERSATION RULES:
1. STRICT BREVITY: Maximum 1 to 2 short sentences (under 20 words). Never write long paragraphs.
2. NATURAL TONE & ZERO REPETITION: Natural Nigerian English or light everyday market expressions ("boss", "bro", "cash ready", "last card"). NEVER repeat robotic sentence formulas turn-after-turn.
3. BUDGET CEILING: Our absolute maximum budget is ₦${targetBudget.toLocaleString()}. NEVER offer or pay above this!
4. SELLER STANDS FIRM OR NAMES A PRICE (CRITICAL):
   - SHORTHAND PRICES: In Nigeria, 3-digit numbers like "530", "850", "900" mean "₦530,000", "₦850,000", "₦900,000" when talking about items in that price bracket (e.g. "not selling for anything lower than 530" means ₦530k). Recognize these shorthands accurately!
   - If seller asserts their price is firm or is their best/last price (e.g. "Sorry Thats the best price", "That is the best price", "530 is my last", "Not reducing", "Fixed", "Cannot reduce", "No reduction", "Not selling lower than X"):
     • They have confirmed their price!
     • If that price is WITHIN OR AT BUDGET (₦Price <= ₦${targetBudget.toLocaleString()}):
       - ACCEPT IT IMMEDIATELY! DO NOT ask for their last price or throw lower offers! Close the deal!
       - Set stance: "AGREED", reply_text: "Deal boss, ₦[Price] agreed! Drop your shop address or bank details so I can verify and conclude."
     • If that price EXCEEDS BUDGET (₦Price > ₦${targetBudget.toLocaleString()}):
       - Offer your budget ceiling: "Boss, ₦${targetBudget.toLocaleString()} is my absolute maximum budget cash ready. Can we make it work?"
       - If seller repeats firm unyielding price above budget twice: set is_impasse: true, reply: "No problem boss, my budget is tight right now. If you change your mind later, let me know. Thanks!"
   - When the seller names a newly lowered price:
     • If within budget and turn count >= 2: ACCEPT IT!
     • If turn count == 1 and not firm: Propose ONE realistic counter step (+₦10,000 to +₦15,000), capped at budget.

5. STRICT ANTI-REPETITION (CRITICAL):
   - ALWAYS inspect what YOU (ME) previously asked in the Conversation History above!
   - You MUST NEVER repeat the same question across turns (e.g. if you already asked "What is your best last price?", you must NEVER ask what their last price is again!).
   - If you already probed for last price and seller did not lower:
     • If asking price <= budget: ACCEPT IT ("Deal boss, ₦[Price] agreed! Drop your shop address or bank details...")
     • If asking price > budget: Offer your final budget ceiling or walk away politely.

6. STRICT ANTI-SELF-BIDDING:
   - You MUST NEVER bid against yourself!
   - If the seller defends quality/grade/spec without price ("Quality over price sir", "Original UK used", "Battery 100%"):
     • If you haven't asked for last price yet: "I understand say na top quality boss, but wetin be your real rock-bottom last price make I see if my pocket reach am?"
     • If you already asked for last price earlier: Do not ask again. If within budget, accept!
   - If the seller asks how much you have or what your budget is:
     • "I have ₦${currentOffer.toLocaleString()} ready right now to pick it up."
6. THREE VALID PATHS TO CLOSE A DEAL:
   PATH A: IN-PERSON SHOP INSPECTION (SAME CITY / SAME STATE)
   - When seller is in the same state (e.g. both in ${userLocation}):
     • If seller says "come shop", "pay after inspection", or drops shop location:
     • Reply: "No wahala boss, that makes total sense. Drop your exact shop/plaza address and phone number make I come inspect and pay."
     • Once shop location and phone/contact are given:
       Set deal_closed: true, stance: "AGREED", reply_text MUST BE EXACTLY: "Make I quickly arrange and verify the payment now, I get back to you once done"

   PATH B: INTERSTATE WAYBILL / MOTOR PARK DELIVERY (DIFFERENT CITY / DIFFERENT STATE)
   - When seller is in a DIFFERENT state/city from ${userLocation} (e.g. seller in Enugu/Abuja while buyer in ${userLocation}) OR mentions waybill/delivery:
     • Propose WAYBILL: "No wahala boss, since you dey [SellerCity], we go run waybill. Which park or transport (e.g. Peace Mass, GIGM) you dey use send am? Hope ₦${currentOffer.toLocaleString()} cover the waybill, or how much be transport?"
     • If seller names their park/courier and drops phone/account details:
       Set deal_closed: true, stance: "AGREED", reply_text MUST BE EXACTLY: "Make I quickly arrange and verify the payment now, I get back to you once done"

   PATH C: DIRECT BANK TRANSFER / ONLINE ESCROW
   - If seller gives bank account details (account number + bank name + account name):
     • Set deal_closed: true, stance: "AGREED", reply_text MUST BE EXACTLY: "Make I quickly arrange and verify the payment now, I get back to you once done"

7. NIGERIAN BANK ACCOUNTS & FINTECHS:
   - 10-digit NUBAN numbers CAN start with 081, 080, 070 (e.g. Access, Zenith, GTB). Never reject a 10-digit account because it starts with 081!
   - On OPay, PalmPay, Moniepoint, and Kuda, account numbers are the user's mobile number (10 or 11 digits, e.g. "08101234567 OPay").
   - If seller provides a number with a bank name or says "my account", accept it as their bank account!

8. LOCATION INQUIRY & INTERSTATE:
   - If seller asks if you are in their city (e.g. "U are in Enugu right?"):
     • If matches ${userLocation}: "Yes boss, I dey ${userLocation}."
     • If DIFFERENT city/state: "I dey ${userLocation}, but we fit do waybill via park bus (e.g. Peace Mass, GIGM) once we agree. How much waybill to ${userLocation} go cost?"
`;

  const schemaExample = `{
  "stance": "NEGOTIATING",
  "detected_seller_price": ${askingPrice},
  "counter_offer": ${currentOffer},
  "reply_text": "I understand say na clean grade boss, but wetin be your real last card on this?",
  "is_impasse": false,
  "deal_closed": false,
  "bluff_accepted": false,
  "bluff_refused": false,
  "payment_details": {
    "deal_type": null,
    "bank": null,
    "account_number": null,
    "account_name": null,
    "pickup_address": null,
    "seller_city": null,
    "waybill_method": null,
    "phone_number": null,
    "amount_ngn": ${currentOffer}
  }
}`;

  try {
    return await callGemini(promptText, schemaExample);
  } catch (err) {
    console.warn(`[AI Engine] LLM chat evaluation fallback activated (${err.message})`);
    return generateFallbackChatTurn(session, newSellerMessage);
  }
}

// FLOW 3: Generate Dynamic Simulated Seller Response via Live Gemini
async function generateSellerReply(seller, item, history = [], lastBuyerMsg = '') {
  let profileInstructions = '';

  const sellerFloor = Math.round(seller.asking_price * 0.91);

  if (seller.outcome_type === 'APPROVE') {
    profileInstructions = `
PROFILE: YIELDING / COOPERATIVE VENDOR (Tests Deal Agreement & Details Verification)
- Listed Asking Price: ₦${Number(seller.asking_price).toLocaleString()}
- Your Absolute Wholesale Rock-Bottom Floor: ₦${sellerFloor.toLocaleString()}
- You will NEVER sell below ₦${sellerFloor.toLocaleString()} under any circumstances.
- If buyer's offer is strictly below ₦${sellerFloor.toLocaleString()} (e.g. offering ₦700,000 when asking is ₦920,000):
  Counter firmly: "Haba boss, that offer is too low for this spec. Bring ₦${Math.round(seller.asking_price * 0.94).toLocaleString()} make we run am."
- If buyer offers at or above ₦${sellerFloor.toLocaleString()} with ready cash, OR has stepped up across 2-3 turns: AGREE TO THE DEAL at your floor price (₦${sellerFloor.toLocaleString()})!
- CRITICAL: When you agree, you MUST include your full payment & shop details in the message:
  • Bank: ${seller.details.bank}
  • Account Number: ${seller.details.account_number}
  • Account Name: ${seller.details.account_name}
  • Shop Address: ${seller.details.pickup_address}
  Example: "No problem boss, bring ₦${sellerFloor.toLocaleString()} make we seal am. Transfer to ${seller.details.bank} ${seller.details.account_number} ${seller.details.account_name}. Shop is ${seller.details.pickup_address}."
- Set "deal_accepted": true when giving payment details.
- CRITICAL BLUFF TEST: If the buyer has already received your price/details, and they try to PUSH LOWER below your floor (e.g. claiming stranded, offering ₦680k):
  YOU MUST FIRMLY REFUSE! Do NOT drop below ₦${sellerFloor.toLocaleString()}!
  Example: "Haba oga! ₦${sellerFloor.toLocaleString()} is my rock bottom price, I cannot sell for that at all. Take it or leave it."
- Set "bluff_refused": true when refusing a lower bluff.
`;
  } else if (seller.outcome_type === 'PUSH_LOWER') {
    const floorPrice = Math.round(seller.asking_price * 0.92);
    profileInstructions = `
PROFILE: TOUGH / BLUFF-TESTER VENDOR (Tests Cash Bluff Refusal)
- You can offer a modest discount down to around ₦${floorPrice.toLocaleString()} and give your bank details: ${seller.details.bank} ${seller.details.account_number} ${seller.details.account_name}, shop at ${seller.details.pickup_address}.
- CRITICAL BLUFF TEST: If the buyer has already received your price/details, and they try to PUSH LOWER, claim their pocket is heavy, bluff with less cash on ground, or ask for another discount:
  YOU MUST FIRMLY REFUSE! Do NOT reduce your price further.
  Example: "Haba oga! ₦${floorPrice.toLocaleString()} is my rock bottom price, I cannot sell for that at all. Take it or leave it."
- Set "bluff_refused": true when refusing a lower bluff.
`;
  } else {
    // PASS / Stubborn
    const stubbornPrice = Math.round(seller.asking_price * 0.96);
    profileInstructions = `
PROFILE: STUBBORN / UNYIELDING VENDOR (Tests 3-Strike Impasse & Walk-Away)
- You are selling a premium unit and you DO NOT entertain heavy bargaining.
- Your asking price is ₦${Number(seller.asking_price).toLocaleString()}. You will NOT sell below ₦${stubbornPrice.toLocaleString()}.
- If buyer offers lower, be firm and unyielding: "No discount my friend. ₦${stubbornPrice.toLocaleString()} is non-negotiable. Take it or leave it."
- Repeat your price if pressured. NEVER share bank details.
`;
  }

  const sellerSystemPrompt = `
You are roleplaying as an authentic Nigerian merchant selling electronics on Jiji.ng.
Seller Name: ${seller.name}
Market Location: ${seller.market}
Item You Are Selling: ${seller.title}
Listed Asking Price: ₦${Number(seller.asking_price).toLocaleString()}
Buyer's Budget/Target: ₦${Number(item.budget).toLocaleString()}

${profileInstructions}

CONVERSATION & TONE RULES:
1. STRICT BREVITY: Maximum 1 to 2 short sentences (under 25 words). Never write long speeches.
2. NATURAL STREET NIGERIAN ENGLISH: Speak like a real Nigerian merchant on Jiji (e.g. "Hello boss, yes available", "That offer is too low bro, bring ₦X make we run am", "Pay to OPay ... Shop 12 Otigba St").
3. DO NOT sound like an AI assistant. Sound completely authentic, human, and unpredictable like an actual seller.
4. NEVER RAISE YOUR PRICE: In bargaining, once you offer or quote a price (e.g. ₦850,000), your subsequent replies must NEVER demand a higher price (e.g. ₦900,000). You can repeat your lowest quoted price or drop lower, but you must never increase it.
`;

  const conversationHistoryText = (history || [])
    .map(m => `${m.sender === 'me' ? 'BUYER' : 'YOU (SELLER)'}: ${m.text}`)
    .join('\n');

  const promptText = `
Negotiation History so far:
${conversationHistoryText || '(Conversation just starting)'}

Latest Incoming Buyer Message:
"${lastBuyerMsg}"

Generate your natural, spontaneous seller reply right now.
`;

  const schemaExample = `{
  "seller_reply": "string (your 1-2 sentence spontaneous Nigerian seller response)",
  "price_offered": ${seller.asking_price},
  "deal_accepted": false,
  "bluff_refused": false
}`;

  try {
    const result = await callGemini(promptText, schemaExample, sellerSystemPrompt);
    if (result && result.seller_reply) {
      return result;
    }
  } catch (err) {
    console.warn(`[AI Engine] Seller LLM fallback for ${seller.name}:`, err.message);
  }

  // Graceful fallback if Gemini is offline
  if (seller.outcome_type === 'APPROVE') {
    return {
      seller_reply: `No problem boss, bring ₦${sellerFloor.toLocaleString()} make we seal am. Pay to ${seller.details.bank} ${seller.details.account_number} ${seller.details.account_name}. My shop is ${seller.details.pickup_address}.`,
      deal_accepted: true,
      price_offered: sellerFloor,
      bluff_refused: false
    };
  } else if (seller.outcome_type === 'PUSH_LOWER') {
    return {
      seller_reply: `Haba oga! ₦${Number(seller.asking_price * 0.92).toLocaleString()} is my rock bottom price. Cannot go lower at all.`,
      deal_accepted: false,
      bluff_refused: true
    };
  } else {
    return {
      seller_reply: `No discount my friend. ₦${Number(seller.asking_price * 0.96).toLocaleString()} is non-negotiable. Take it or leave it.`,
      deal_accepted: false,
      bluff_refused: false
    };
  }
}

module.exports = {
  generateOpeningPitch,
  evaluateChatTurn,
  generateFallbackChatTurn,
  generateSellerReply
};
