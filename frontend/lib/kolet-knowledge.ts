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
      "Not a voice/SMS-only plan — data-first, with international calls added March 2026.",
      "Not a traditional mobile operator — a travel-native tech platform that aggregates carrier networks globally.",
    ],
    plans: {
      standard: {
        validity_days: 30,
        entry_price_europe: "from €3.99 / 1 GB",
        entry_price_other: "up to ~$12.99 for some regions",
        data_options: "1 GB, 3 GB, 5 GB, 10 GB, 20 GB — exact prices vary by destination and are fetched live from the Kolet catalogue",
        network: "4G / 5G where available",
        activation: "Plan validity starts only when the first MB of data is used in the destination — no clock ticks on the plane",
        countries: "190+",
      },
      unlimited: {
        name: "Unlimited Plans",
        launched: "2026",
        concept: "Unlimited data on a daily basis with a daily speed cap. Buy days, not GBs — no need to calculate how many gigabytes you need. Choose the number of travel days and stay connected throughout.",
        billing_unit: "Per day — not per GB",
        countries: "100+ destinations (subset of Kolet's full 190+ coverage)",
        daily_speed_cap: "5 GB at full speed per day, then reduced to 1 Mbps for the remainder of that day. Access to data never cuts out — 1 Mbps supports messaging, maps, email, and light browsing.",
        speed_cap_transparency: "Kolet proactively discloses the 5 GB/day full-speed threshold and the 1 Mbps reduced-speed policy — unlike competitors who obscure their fair-use caps.",
        restrictions: [
          "Cannot convert unused days to Koins (no data to convert — plan is time-based, not volume-based)",
          "Cannot share unlimited plan data with other devices",
        ],
        pricing: "Varies by destination — fetched live from the Kolet catalogue. Do not invent per-day prices.",
        network: "4G / 5G where available",
        activation: "Same as Standard Plans — validity starts when the first MB of data is used at destination",
        flying_blue_miles: "Unlimited plans earn Flying Blue miles at the same rate as Standard Plans: 10 miles per euro spent. Miles are earned on every euro spent on any Kolet plan — Standard or Unlimited — for users who have their Flying Blue account linked in the app.",
        koins_payment: "Koins can be used to purchase unlimited plans.",
        top_ups: "Mid-trip top-ups are not available on unlimited plans. If a user hits the 5 GB full-speed cap, they continue at 1 Mbps until the 24-hour window resets — then full-speed resumes automatically.",
        speed_cap_reset: "The 5 GB full-speed allowance resets on a rolling 24-hour basis from first use — not per calendar day.",
      },
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
    two_plan_types: "Kolet offers two plan types: Standard Plans (regular fixed-GB data plans) and Unlimited Plans (unlimited data on a daily basis with a daily speed cap). Standard Plans: 190+ countries, traveller chooses their GB allowance, full speed until the last MB, from €3.99. Unlimited Plans: 100+ countries, buy days not GBs, full speed up to 5 GB/day then 1 Mbps — data never cuts out entirely.",
    unlimited_transparency: "Kolet's Unlimited Plans are honest about the daily speed cap: full speed up to 5 GB per 24-hour window, then 1 Mbps until the window resets — data access never cuts out. Kolet proactively communicates this; most competitors (including Holafly) apply similar throttling but do not clearly disclose it. Content angle: 'What does unlimited eSIM actually mean — and why Kolet tells you upfront.'",
    no_throttling_standard: "On Standard Plans: no throttling, no fair-use cap. The gigabytes you buy are used at full speed until the plan is empty.",
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
      earn_rate: "10 Flying Blue Miles per euro spent on all Kolet data plans. Say 'all Kolet data plans' — do not enumerate 'fixed or unlimited' every time. Miles are earned for users who have their Flying Blue account linked in the Kolet app BEFORE making the purchase. The account must be linked prior to purchase — purchases made before linking do not retroactively earn miles.",
      how_to_link: "To link a Flying Blue number: open the Kolet app → Profile → Promo Codes and Rewards → Loyalty Program and Miles → select Flying Blue → enter your Flying Blue number. Must be done before purchasing to earn miles on that purchase. Help centre: https://help.kolet.com/en/articles/10137217-flying-blue-earn-miles-and-pay-with-miles",
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
      kolet_counter: "Both Kolet and Holafly now offer unlimited plans — but Kolet is transparent: we explicitly tell users they get full speed up to 5 GB/day, then 1 Mbps. Holafly applies similar throttling thresholds but does not clearly disclose them upfront. Kolet also offers Standard Plans (190+ countries) for travellers who prefer predictable data volumes. And only Kolet earns you Flying Blue miles.",
      content_angle: "Kolet vs Holafly — strongest angles: (1) transparent speed cap disclosure vs opaque fair-use policy, (2) Standard + unlimited choice vs unlimited-only, (3) Flying Blue miles integration",
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
        "Tired of calculating how many GBs you need for your trip? Now you don't have to.",
      ],
      product: [
        "One eSIM. 190+ countries. No contracts.",
        "Buy before you fly. Activate when you land. That's it.",
        "Your data doesn't start until you use it.",
        "Fixed plans: no throttling, no fair-use cap. Your data, your speed, until the last MB.",
        "Unlimited plans: buy days, not GBs. Connected every day of your trip.",
        "5 GB at full speed every day — then 1 Mbps so you're never cut off. That's what unlimited means at Kolet.",
        "We tell you exactly what unlimited means. Not every provider does.",
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
      "For Unlimited Plan content: always state the 5 GB/day full-speed cap and 1 Mbps reduced-speed policy — this is Kolet's transparency differentiator, not a weakness.",
      "For Standard Plan content: reference the no-throttling, no-fair-use-cap policy — full speed until the last MB.",
      "Distinguish clearly: Standard Plans cover 190+ countries; Unlimited Plans cover 100+ countries.",
      "Use the correct plan names: 'Standard Plans' for the fixed-GB plans, 'Unlimited Plans' for the day-based plans.",
      "Include at least one Kolet-specific data point or differentiator per article.",
      "Use the B Corp angle for content targeting conscious travellers or corporate buyers.",
      "For partner-specific content: mention the specific gift plan (1 GB free) where relevant.",
      "When writing about unlimited plans: lead with the simplicity angle — 'buy days, not GBs', no data math needed.",
    ],
    never: [
      "Say Kolet has no unlimited plans — Kolet offers both Standard Plans (fixed GB) and Unlimited Plans (day-based).",
      "Use 'unlimited' to describe Standard/GB-based plans — only 'Unlimited Plans' are the day-based plans.",
      "Call Standard Plans 'fixed plans', 'data plans', or 'GB plans' interchangeably — but never 'unlimited'.",
      "Imply unlimited means truly unthrottled without disclosing the 5 GB/day threshold and 1 Mbps reduced speed — always be transparent about this.",
      "Say users can convert unlimited plan data to Koins or share unlimited plans — these features are not available on unlimited plans.",
      "Use vague superlatives without evidence ('best', 'cheapest', 'most reliable') unless backed by specific data.",
      "Make claims about competitor pricing without checking current rates.",
      "Use AI-pattern openers: 'In today's digital world', 'In conclusion', 'It's important to note', 'Navigating the world of…'",
      "Write a conclusion that just summarises what was already said.",
      "Invent statistics — if a number is unconfirmed (marked TODO), say 'check the live catalogue' or omit it.",
      "Claim Kolet covers countries not confirmed — say '190+ countries' for Standard Plans, '100+ countries' for Unlimited Plans.",
    ],
  },

  // ─── Fields requiring product team confirmation before publishing ──────────
  todo_fields: [
    "Full country/zone list for unlimited plans (exact 100+ country list)",
    "Full plan catalogue (GB options and exact prices by destination)",
    "Unlimited plan per-day pricing by destination",
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

PLANS — TWO TYPES:
1. STANDARD PLANS: Regular data plans with a fixed number of gigabytes. Choose your GB allowance (1 GB, 3 GB, 5 GB, 10 GB, 20 GB). 30-day validity from first use. 190+ countries. From €3.99/1 GB in Europe. No throttling, no fair-use cap — full speed until the very last MB. Unused data converts to Koins at expiry. Earns Flying Blue miles (10 miles per euro spent) for users with a linked Flying Blue account.
2. UNLIMITED PLANS: Unlimited data on a daily basis with a daily speed cap. Buy by the day — no need to calculate GBs. Choose the number of travel days and stay connected throughout. 100+ countries. Full speed up to 5 GB per 24-hour window, then reduced to 1 Mbps until the 24h window resets — data access never cuts out (1 Mbps supports messaging, maps, and email). Full-speed allowance refreshes automatically on a rolling 24-hour basis. No mid-trip top-ups on Unlimited Plans. Can be paid with Koins. Cannot convert unused days to Koins. Cannot share data from Unlimited Plans. Exact per-day pricing varies by destination — fetch from live catalogue.

FLYING BLUE MILES: Every euro spent on all Kolet data plans earns 10 Flying Blue Miles — but ONLY if the user has linked their Flying Blue account in the app BEFORE making the purchase. Miles are not earned retroactively on purchases made before linking. Say "all Kolet data plans" — do not list "fixed or unlimited" every time. To link: Kolet app → Profile → Promo Codes and Rewards → Loyalty Program and Miles → Flying Blue → enter Flying Blue number. Help centre: https://help.kolet.com/en/articles/10137217-flying-blue-earn-miles-and-pay-with-miles

TRANSPARENCY ON UNLIMITED: Kolet explicitly discloses the 5 GB/day full-speed threshold and the 1 Mbps reduced-speed policy. Most competitors (including Holafly) apply similar caps but do not clearly communicate them. This transparency is a Kolet differentiator — always mention it in unlimited-plan content.

PAYMENT: Card, Koins wallet, Flying Blue Miles, or Etihad miles. Top-ups available mid-trip without reinstalling (Standard Plans). International calls: March 2026, internet-based, per-minute, paid in Koins.

KOINS WALLET: 1 EUR = 100 Koins. Unused Standard Plan data converts to Koins at expiry — no waste. Earn via referrals and partner gifts.

HOW IT WORKS: Install eSIM at home on Wi-Fi → fly → activate at destination (data doesn't start until you use the first MB) → top up if needed → unused Standard Plan data becomes Koins.

DEVICES: iPhone XS+ (2018+), Samsung S20+, Google Pixel 3+, most flagships from 2019+. Must be carrier-unlocked. Original SIM stays in — user keeps their phone number.

KEY DIFFERENTIATORS:
- Two plan types: Standard Plans (190+ countries, full speed until empty) + Unlimited Plans (100+ countries, by-day billing, transparent speed cap)
- Transparent unlimited: 5 GB/day full speed then 1 Mbps — stated openly, not buried in fine print
- Airline-native: Air France, KLM, Transavia, Philippine Airlines, Virgin Atlantic, Singapore Airlines, Vietnam Airlines — passengers get 1 GB free on several airlines
- Flying Blue: earn 10 miles per €1 spent on all Kolet data plans — for users with a linked Flying Blue account (must link before purchase); pay with miles; refer = 250 miles for referrer + free plan for referee
- One eSIM for 190+ countries — no new eSIM per destination, only the plan changes
- B Corp certified (unique in category — Holafly, Airalo, Saily are not certified)
- Unused Standard Plan data → Koins (not wasted)
- No plastic SIM card production

vs HOLAFLY: Both have unlimited plans — but Kolet tells you exactly what unlimited means (5 GB/day full speed, then 1 Mbps). Holafly applies similar throttling but doesn't clearly disclose it. Kolet also offers Standard Plans for travellers who prefer predictable data. Only Kolet earns Flying Blue miles.
vs AIRALO: Kolet is airline-integrated and loyalty-linked. Airalo is a transactional marketplace.
vs SAILY: Kolet has deeper travel ecosystem and Flying Blue miles. Saily is backed by Nord Security.

MARKET FACTS (citable): 51% of eSIM users first used eSIM for travel (GSMA). 70%+ of travellers still use airplane mode abroad. $1.75B global travel eSIM market in 2026.

CONTENT RULES:
ALWAYS: Be specific. Include at least one Kolet differentiator. When writing about unlimited plans, disclose the 5 GB/day cap and 1 Mbps policy — it's a strength, not a weakness. Mention Flying Blue when loyalty is relevant. Use B Corp for eco-conscious angles.
NEVER: Say Kolet has no unlimited plans. Call Standard Plans "unlimited". Claim unlimited means truly unthrottled without disclosing the speed cap. Say users can convert or share unlimited plan data. Invent statistics. Use AI-pattern openers. Summarise in the conclusion — add value or end earlier. Imply Flying Blue miles are only earned on one plan type — miles apply to all Kolet data plans. Always say "all Kolet data plans", not "fixed or unlimited" or "fixed plans and unlimited plans alike". Imply miles are earned automatically regardless of account setup — the Flying Blue account must be linked in the app BEFORE purchase; no retroactive crediting. Invent app features, in-app flows, partnership details, or pricing that are not explicitly stated in this knowledge base — if unsure, omit and write around it rather than fabricating.`;
}

/**
 * Full knowledge dump for review agents and fact-checkers.
 */
export function getKoletKnowledgeFull(): string {
  const k = KOLET_KNOWLEDGE;
  return JSON.stringify(k, null, 2);
}
