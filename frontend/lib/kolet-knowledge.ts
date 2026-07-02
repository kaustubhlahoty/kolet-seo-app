/**
 * Kolet SEO Knowledge Base — v1.0 (June 2026)
 * Authoritative source of facts about Kolet for all AI-generated content.
 * Update this file when partnerships launch, funding is announced, or the catalogue changes.
 * Fields marked TODO require confirmation from the product/data team before publishing.
 */

export const KOLET_KNOWLEDGE = {

  // ─── Company ───────────────────────────────────────────────────────────────
  company: {
    name: "Kolet",
    type: "French tech startup, B2B2C eSIM provider",
    founded: "January 2024",
    headquarters: "6 rue d'Armaillé, Paris 75017, France",
    website: "kolet.com",
    countries_covered: "190+",
    travellers_served: "500,000+ (as of mid-2026)",
    total_funding: "~$16.6M across two rounds (Seed + Series A)",
    stage: "Series A",
    b_corp: {
      certified: true,
      date: "January 2026",
      score: "99.7 / 200",
      median_score_for_reference: "50.9 (median score of ordinary businesses)",
      note: "Only certified B Corp among major travel eSIM providers. Holafly, Airalo, and Saily are not B Corp certified.",
    },
    mission: "Internet access for all — make mobile connectivity abroad simple, affordable, and available to every traveller.",
  },

  // ─── Founding team ──────────────────────────────────────────────────────────
  team: {
    founders: [
      {
        name: "Eduardo Ronzano",
        role: "CEO & Co-founder",
        background: "Previously founded KelDoc (French healthcare booking platform, analogous to Doctolib). Active angel investor in the Paris startup ecosystem.",
      },
      {
        name: "Anne-Carole Cöen",
        role: "CMO & Co-founder",
        background: "Senior roles at Swile (employee benefits), Frichti (food delivery), FreeNow (mobility). Her quote on the updated app: 'We designed this new version as a co-pilot for travelers. It works for everyone — even those who've never used an eSIM before. It's simple, fast, and, above all, reassuring.'",
      },
      {
        name: "Mehdi Chraibi",
        role: "Co-founder",
        background: "Operational and business development expertise.",
      },
    ],
    board: [
      { name: "Philippe Chérèque", background: "Formerly at American Express Global Business Travel (Amex GBT) and Amadeus" },
      { name: "Shane O'Flaherty", background: "Global Director of Travel and Hospitality at Microsoft" },
      { name: "Mauricio Prieto", background: "Co-founder of eDreams, one of Europe's largest online travel agencies" },
    ],
  },

  // ─── Funding ────────────────────────────────────────────────────────────────
  funding: {
    seed: {
      date: "March 2024",
      amount: "€5 million",
      lead_investors: ["Daphni (European VC specialising in digital innovation)", "9900 Capital"],
    },
    series_a: {
      date: "June 2025",
      amount: "$10 million (~€9M) + €1M from Bpifrance (non-dilutive)",
      lead_investor: "Daphni (follow-on)",
      angel_investors: [
        "Peter Kern — former global CEO of Expedia Group",
        "Jon Gieselman — former VP of Marketing at Apple (during Apple's push to make eSIM standard in every iPhone)",
      ],
      bpifrance: "€1 million non-dilutive from Bpifrance (French public investment bank backing strategically important companies)",
      use_of_funds: "App enhancement, freemium offer launch, eSIM installation simplification, hiring ~10 tech/product/business roles internationally",
    },
  },

  // ─── Product ────────────────────────────────────────────────────────────────
  product: {
    type: "eSIM (embedded SIM — no physical card, installed via QR code)",
    what_it_is_not: [
      "Not an 'unlimited' provider — Kolet sells fixed data plans. Deliberate choice: transparent, predictable pricing, no hidden throttling.",
      "Not a voice/SMS-only plan — data-first, with international calls added March 2026.",
      "Not a traditional mobile operator — a travel-native tech platform that aggregates carrier networks globally.",
    ],
    plans: {
      validity_days: 30,
      entry_price_europe: "from €3.99 / 1 GB",
      entry_price_other: "up to ~$12.99 for some regions",
      data_options: "1 GB, 3 GB, 5 GB, 10 GB, 20 GB — exact prices vary by destination and are fetched live from the Kolet catalogue",
      network: "4G / 5G where available",
      activation: "Plan validity starts only when the first MB of data is used in the destination — no clock ticks on the plane",
    },
    features: {
      top_ups: "Buy additional data from within the app without reinstalling — seamless mid-trip refill using euros, Koins, or Flying Blue Miles",
      international_calls: {
        launched: "March 2026",
        description: "Place calls to any landline or mobile worldwide from the Kolet app. Internet connection only — no eSIM required for calling, no roaming charges.",
        pricing: "Transparent per-minute rates shown before placing each call, by destination",
        payment: "Paid using Koins (internal wallet)",
      },
      wallet: {
        name: "Koins",
        rate: "1 EUR = 100 Koins (fixed rate for euro payments); other currencies converted at day's exchange rate so each Koin always equals €0.01 EUR",
        earn: "Via referrals, partner gifts, unused data conversion, customer care adjustments",
        spend: "Data plan purchases, top-ups, international calls",
        unused_data: "Unused data at plan expiry converts automatically to Koins — no waste",
      },
      data_donation: "Roadmap feature allowing users to gift unused GBs to travellers who lack internet access — aligned with 'internet access for all' mission",
    },
    payment_methods: ["Credit/debit card (Stripe)", "Koins (pre-loaded wallet)", "Flying Blue Miles (via PointsPay)", "Etihad miles (via PointsPay)"],
  },

  // ─── How it works (step by step) ──────────────────────────────────────────
  how_it_works: [
    "1. Check device compatibility — most flagship smartphones from 2019 onwards are supported.",
    "2. Download the Kolet app (iOS and Android) — single interface for everything.",
    "3. Choose your plan — select destination, data allowance, price shown upfront.",
    "4. Install the eSIM before departure (requires Wi-Fi). Original SIM stays in — you keep your phone number.",
    "5. Activate at destination — automatically starts when you use the first MB of data.",
    "6. Use data, top up if needed — instantly from the app, no reinstall required.",
    "7. Convert unused data to Koins for your next trip.",
  ],
  how_it_works_reassurance: [
    "You keep your existing phone number throughout.",
    "Your original SIM card is not removed or affected.",
    "The eSIM does not interfere with calls or SMS on your primary line.",
    "Install in advance — it stays dormant until you activate it.",
    "Activation is instant — the plan starts automatically the moment you use the first MB of data at your destination.",
  ],

  // ─── Key differentiators ──────────────────────────────────────────────────
  differentiators: {
    no_throttling: "No throttling, no fair-use cap. The data you buy is the data you get, at full speed. Direct contrast with Holafly's 'unlimited' plans which throttle after threshold. Content angle: 'Why unlimited eSIM plans are misleading.'",
    airline_native: "Only travel eSIM provider embedded directly into the booking and pre-departure journeys of Air France, KLM, Transavia, Philippine Airlines, Virgin Atlantic, Singapore Airlines, Vietnam Airlines. Appears at the exact moment a traveller confirms a flight — not in an app store.",
    flying_blue_miles: "Earn 10 Flying Blue Miles per euro spent on Kolet. Pay for plans with Flying Blue Miles. No other eSIM provider offers a miles-earning programme of this depth.",
    one_esim_everywhere: "A single Kolet eSIM works across all 190+ covered destinations. No new eSIM needed per country — only the plan changes.",
    transparent_pricing: "No contracts, no subscriptions, no roaming fees. Price shown before purchase and confirmed before every call.",
    b_corp_unique: "Only certified B Corp among major travel eSIM providers (Holafly, Airalo, Saily are not certified). Score: 99.7/200 vs industry median 50.9.",
    data_to_koins: "Unused data converts to Koins rather than being wasted — reduces the anxiety of buying 'too much' data.",
    plastic_free: "No physical SIM card produced, no packaging, no logistics. Every Kolet activation = a plastic SIM card not manufactured.",
    expert_founders: "Founded by telecom industry experts (not a generic app reselling another provider's data). Board includes figures from Amadeus, Microsoft Travel, and eDreams.",
    investor_validation: "Backed by former CEO of Expedia (Peter Kern) and former VP of Marketing at Apple (Jon Gieselman — who was at Apple during the eSIM standardisation push).",
  },

  // ─── Device compatibility ─────────────────────────────────────────────────
  devices: {
    iphone: "iPhone XS and later (2018 onwards) — covers XS, XS Max, XR, 11, 12, 13, 14, 15, 16 series",
    samsung: "Galaxy S20 and later",
    google: "Pixel 3 and later",
    general: "Most flagship Android devices from 2019 onwards",
    important_notes: [
      "Dual SIM phones run both the Kolet eSIM and a physical SIM simultaneously — home number stays active.",
      "Some carrier-locked devices may not support third-party eSIM — users should check with their home carrier.",
      "eSIM is a hardware feature — cannot be added to a device that does not support it.",
      "Estimated 1.6 billion eSIM-enabled devices globally, growing to 3.6 billion.",
    ],
    content_angle: "High-intent SEO article: 'Does my phone support eSIM? A complete guide for 2026.'",
  },

  // ─── Partner ecosystem ────────────────────────────────────────────────────
  partners: {
    airlines: [
      { name: "Air France", detail: "Co-branded Kolet shop; pre-departure emails; MMB (Manage My Booking) integration — deep, embedded in booking flow" },
      { name: "KLM", detail: "Co-branded shop; AlwaysOn CRM campaigns (NL, GB, DE, CA, DK); pre-departure email — proactive CRM push" },
      { name: "Flying Blue", detail: "Air France–KLM loyalty programme — miles payment and earning on all purchases (revenue-level integration)" },
      { name: "Transavia France", detail: "1 GB free for first 2 days, launched May 2026; ~400 routes from France, Netherlands, Belgium — embedded in post-booking journey" },
      { name: "Philippine Airlines", detail: "myPAL eSIM — 1 GB free for 2 days for all PAL passengers; co-branded website and app" },
      { name: "Virgin Atlantic", detail: "1 GB free for 48h; integrated across website, app, booking confirmation, and pre-departure comms" },
      { name: "Singapore Airlines", detail: "Partnership confirmed March 2026" },
      { name: "Vietnam Airlines", detail: "Partnership confirmed March 2026" },
    ],
    otas: [
      { name: "Kiwi.com", detail: "OTA integration; publicly endorsed Kolet at Series A" },
      { name: "Wego", detail: "Middle East & Asia-Pacific focused travel platform" },
      { name: "MakeMyTrip", detail: "India's largest OTA" },
      { name: "Exoticca", detail: "Curated tour packages" },
      { name: "Evaneos", detail: "Tailor-made travel agency" },
      { name: "Omio", detail: "Multi-modal transport booking (trains, buses, flights)" },
      { name: "Hopper", detail: "Price prediction and booking app" },
    ],
    insurance: [
      { name: "AXA Partners", detail: "Physical QR-code gifting in France, Italy (including Trippy brand), Spain, Colombia" },
    ],
    corporate: [
      { name: "AFKLM Group (B2E)", detail: "Air France, KLM, and group employees — automatic gift plan on login" },
      { name: "Elior", detail: "Corporate employee benefit programme" },
    ],
    seo_note: "Each partner is a named brand generating search volume. 'Air France eSIM', 'KLM eSIM', 'Philippine Airlines eSIM', 'Virgin Atlantic eSIM' are high-intent queries where Kolet should rank.",
  },

  // ─── Loyalty & rewards ────────────────────────────────────────────────────
  loyalty: {
    flying_blue: {
      earn_rate: "10 Flying Blue Miles per euro spent on Kolet",
      redeem: "Pay for Kolet data plans using Flying Blue Miles",
      referral: "Referrer earns 250 Flying Blue Miles; referee receives a free Kolet data plan",
      programme_size: "One of the world's largest airline loyalty programmes — tens of millions of members across 140+ countries",
    },
    koins: {
      rate: "1 EUR = 100 Koins (fixed for euro); other currencies converted at day's rate — each Koin always equals €0.01 EUR",
      earn: "Referrals, partner gifts, unused data conversion at plan expiry, customer care adjustments",
      spend: "Data plans, top-ups, international calls",
    },
  },

  // ─── Competitive landscape ────────────────────────────────────────────────
  competitors: {
    holafly: {
      their_claim: "Unlimited data, no top-ups needed",
      kolet_counter: "Kolet has no throttling, no fair-use cap — Holafly's 'unlimited' hides speed limits after a threshold. Kolet's finite plans deliver full speed until empty.",
      content_angle: "Kolet vs Holafly — strongest angle: throttling transparency",
    },
    airalo: {
      their_claim: "Huge catalogue, lowest prices on some routes, marketplace breadth",
      kolet_counter: "Kolet is loyalty-integrated, airline-embedded, B Corp certified — Airalo is transactional and marketplace-style. Airalo raised $220M (CVC, 2024) = confirms category but different strategy.",
      content_angle: "Kolet vs Airalo — strongest angle: airline integration and loyalty rewards",
    },
    saily: {
      their_claim: "Simple UX, credibility from Nord Security (NordVPN) brand",
      kolet_counter: "Kolet has deeper travel ecosystem, Flying Blue miles integration, B2B2C airline moat",
      content_angle: "Kolet vs Saily — strongest angle: travel ecosystem depth",
    },
    broader: ["Nomad", "UPeSIM", "Pocket eSIM", "Truely", "Roamless", "GigSky", "Ubigi", "Sim Local"],
  },

  // ─── Target audience ──────────────────────────────────────────────────────
  personas: {
    flying_blue_member: "Air France/KLM passenger, 4–12 trips/year, optimises loyalty. Chooses Kolet for miles earning and miles payment. High LTV.",
    leisure_traveller: "1–3 international trips/year. Pain: roaming bill shock, eSIM confusion. Needs how-to content, device compatibility reassurance, step-by-step guides.",
    digital_nomad: "Works from multiple countries. Values: reliability, data quantity, transparent pricing, no throttling. Wants destination-specific coverage data.",
    business_traveller: "Frequent flyer, corporate expense claims. Values: transparency, simplicity. Enters via employer B2E programme or Flying Blue.",
    family_traveller: "Multiple devices, multiple destinations. Values: ease of use, predictable costs. May not know what eSIM is — educational content is the entry point.",
  },
  priority_markets: ["France", "Netherlands", "United Kingdom", "Philippines", "India", "Middle East", "South-East Asia", "Germany", "Canada", "Denmark"],

  // ─── Market context ───────────────────────────────────────────────────────
  market: {
    esim_adoption_stats: [
      "51% of eSIM users first used the technology for travel — travel is the #1 driver of eSIM adoption globally (GSMA)",
      "~15% of all travel connectivity is now powered by eSIMs",
      "More than 70% of travellers still switch to airplane mode abroad — TAM is largely untapped",
      "Estimated 1.6 billion eSIM-enabled devices globally today",
    ],
    market_size: "$1.75 billion global travel eSIM market in 2026; projected $4–10 billion by 2033–2035",
    why_now: [
      "Apple made eSIM the default (and in some markets only option) on new iPhones from 2022",
      "Android flagship eSIM adoption near-universal from 2019 models",
      "5G rollout expanding in Kolet's key destination markets",
    ],
  },

  // ─── Brand voice & messaging hooks ────────────────────────────────────────
  brand_voice: {
    positioning: "The travel eSIM built for how airlines think about passengers — not how carriers think about billing.",
    tone: ["Direct and reassuring", "Transparent — lead with what the product does AND doesn't do", "Confident, not arrogant", "Human, not telecom-corporate"],
    hooks: {
      problem: [
        "Stop paying roaming fees. There's a better way.",
        "More than 70% of travellers still turn on airplane mode abroad. Here's why they shouldn't have to.",
        "Your carrier charges you €15/day to roam. Here's what that's actually paying for — and what you can do instead.",
      ],
      product: [
        "One eSIM. 190+ countries. No contracts.",
        "Buy before you fly. Activate when you land. That's it.",
        "Your data doesn't start until you use it.",
        "No throttling. No fair-use cap. No surprises.",
      ],
      partner: [
        "The eSIM that earns you Air France–KLM miles.",
        "Now included in your Air France booking: free data on arrival.",
        "Virgin Atlantic passengers: stay connected from the moment you land.",
      ],
      sustainability: [
        "The world's highest-scoring B Corp eSIM provider.",
        "No plastic card. No packaging. No waste.",
        "Unused data doesn't disappear. It converts to credit for your next trip.",
      ],
      authority: [
        "Backed by the former CEO of Expedia and ex-VP of Marketing at Apple.",
        "Trusted by Air France, KLM, Virgin Atlantic, and Philippine Airlines.",
        "Founded by telecom experts. Built for travellers.",
      ],
    },
  },

  // ─── Content rules ────────────────────────────────────────────────────────
  content_rules: {
    always: [
      "Give the reader something actionable they can use immediately.",
      "Be specific — exact prices, exact compatibility, exact steps.",
      "Acknowledge when a competitor is genuinely better in a specific niche (builds trust).",
      "Mention Flying Blue when travel loyalty is relevant to the topic.",
      "Reference no-throttling policy when discussing unlimited or heavy-data scenarios.",
      "Include at least one Kolet-specific data point or differentiator per article.",
      "Use the B Corp angle for content targeting conscious travellers or corporate buyers.",
      "For partner-specific content: mention the specific gift plan (1 GB free) where relevant.",
    ],
    never: [
      "Use 'unlimited' to describe Kolet plans — Kolet sells fixed data plans, not unlimited.",
      "Use vague superlatives without evidence ('best', 'cheapest', 'most reliable') unless backed by specific data.",
      "Make claims about competitor pricing without checking current rates.",
      "Use AI-pattern openers: 'In today's digital world', 'In conclusion', 'It's important to note', 'Navigating the world of…'",
      "Write a conclusion that just summarises what was already said.",
      "Invent statistics — if a number is unconfirmed (marked TODO), say 'check the live catalogue' or omit it.",
      "Claim Kolet covers countries not confirmed — say '190+ countries' not a specific list without verification.",
    ],
  },

  // ─── Fields requiring product team confirmation before publishing ──────────
  todo_fields: [
    "Full country/zone list (exact)",
    "Full plan catalogue (GB options and exact prices by destination)",
    "Average activation time in minutes from purchase to connected",
    "NPS score or satisfaction rating",
    "Support SLA (average response time, support channels available)",
    "Named tier-1 carrier partners per key market",
    "Activation success rate",
    "Top 10 destinations by purchase volume",
    "Flying Blue miles earning rate (confirm 10 miles/€ is still current)",
    "Etihad miles programme details",
  ],

} as const;

/**
 * Compact brief for injection into article generation prompts.
 * Covers the most commonly needed facts without overwhelming the context window.
 */
export function getKoletKnowledgeBrief(): string {
  return `== KOLET BRAND FACTS (verified — cite these, do not invent alternatives) ==

COMPANY: French eSIM startup, founded January 2024, Paris. 190+ countries, 500,000+ travellers served (mid-2026). B Corp certified January 2026, score 99.7/200 — the ONLY major travel eSIM with B Corp (Holafly, Airalo, Saily are not certified). Total funding: ~$16.6M.

FOUNDERS: Eduardo Ronzano (CEO, ex-KelDoc), Anne-Carole Cöen (CMO, ex-Swile/Frichti/FreeNow), Mehdi Chraibi. Backed by Peter Kern (former CEO of Expedia) and Jon Gieselman (former VP Marketing at Apple). Board: figures from Amadeus, Microsoft Travel, eDreams.

MISSION: "Internet access for all." Eliminate roaming fees and SIM card complexity for travellers.

PRODUCT: Fixed data plans (not unlimited — deliberate choice). 30-day validity. From €3.99/1 GB in Europe. Pay with card, Koins, Flying Blue Miles, or Etihad miles. Top-ups available mid-trip without reinstalling. International calls launched March 2026 (internet-based, per-minute pricing, paid in Koins).

KOINS WALLET: 1 EUR = 100 Koins. Unused data converts to Koins at expiry — no waste. Earn via referrals and partner gifts.

HOW IT WORKS: Install eSIM at home on Wi-Fi → fly → activate at destination (data doesn't start until you use the first MB) → top up if needed → unused data becomes Koins.

DEVICES: iPhone XS+ (2018+), Samsung S20+, Google Pixel 3+, most flagships from 2019+. Must be carrier-unlocked. Original SIM stays in — user keeps their phone number.

KEY DIFFERENTIATORS:
- No throttling, no fair-use cap (vs Holafly which throttles "unlimited" plans after threshold)
- Airline-native: Air France, KLM, Transavia, Philippine Airlines, Virgin Atlantic, Singapore Airlines, Vietnam Airlines — passengers get 1 GB free on several airlines
- Flying Blue: earn 10 miles per €1 spent; pay with miles; refer = 250 miles for referrer + free plan for referee
- One eSIM for 190+ countries — no new eSIM per destination, only the plan changes
- Transparent pricing — cost shown before purchase and before every call
- B Corp certified (unique in category)
- Unused data → Koins (not wasted)
- No plastic SIM card production

vs HOLAFLY: Kolet never throttles. Holafly's "unlimited" has a speed cap after a threshold.
vs AIRALO: Kolet is airline-integrated and loyalty-linked. Airalo is a transactional marketplace.
vs SAILY: Kolet has deeper travel ecosystem and Flying Blue miles. Saily is backed by Nord Security.

MARKET FACTS (citable): 51% of eSIM users first used eSIM for travel (GSMA). 70%+ of travellers still use airplane mode abroad. $1.75B global travel eSIM market in 2026.

CONTENT RULES:
ALWAYS: Be specific. Include at least one Kolet differentiator. Mention Flying Blue when loyalty is relevant. Use B Corp for eco-conscious angles.
NEVER: Say "unlimited" about Kolet plans. Invent statistics. Use AI-pattern openers. Summarise in the conclusion — add value or end earlier.`;
}

/**
 * Full knowledge dump for review agents and fact-checkers.
 */
export function getKoletKnowledgeFull(): string {
  const k = KOLET_KNOWLEDGE;
  return JSON.stringify(k, null, 2);
}
