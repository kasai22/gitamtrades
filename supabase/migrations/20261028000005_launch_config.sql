-- Launch configuration required in every environment:
--   * D-04 launch categories
--   * Policy version 1 (moderation rules, rate limits, thresholds). Mirrors DEFAULT_POLICY in
--     src/features/moderation/policy.ts — tests/db/policy.test.ts asserts they match.
-- The prohibited-term lists are an engineering starting point and MUST be reviewed by the
-- legal/policy owner before launch (PRD §8.4, §17).

-- Future objects created by this role should not inherit Supabase's permissive default grants.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

insert into public.categories (slug, name, description, icon, sort_order, is_ticket) values
  ('electronics', 'Electronics', 'Laptops, phones, calculators, headphones and accessories.', 'laptop', 10, false),
  ('books-study-materials', 'Books & Study Materials', 'Textbooks, notes, lab coats, drawing instruments and stationery.', 'book-open', 20, false),
  ('furniture-room-essentials', 'Furniture & Room Essentials', 'Chairs, tables, shelves, mattresses and storage.', 'armchair', 30, false),
  ('clothing-accessories', 'Clothing & Accessories', 'Clothes, shoes, bags and accessories.', 'shirt', 40, false),
  ('cycles-scooters', 'Cycles & Scooters', 'Bicycles, e-cycles, scooters and accessories.', 'bike', 50, false),
  ('event-tickets', 'Event Tickets', 'Transferable tickets for campus and city events. Codes and QR images are never shown publicly.', 'ticket', 60, true),
  ('hostel-essentials', 'Hostel Essentials', 'Buckets, kettles, lamps, extension boards and daily-use items.', 'lamp-desk', 70, false),
  ('sports-fitness', 'Sports & Fitness', 'Rackets, bats, balls, gym equipment and sportswear.', 'dumbbell', 80, false),
  ('other', 'Other permitted items', 'Anything else that is legal and allowed by the marketplace rules.', 'package', 90, false)
on conflict (slug) do nothing;

insert into public.policy_versions (version, is_active, note, config) values (1, true, 'Initial launch policy (pending legal review)', $json$
{
  "listingExpiryDays": 60,
  "expiryReminderDays": 7,
  "maxImagesPerListing": 8,
  "disabledCategorySlugs": [],
  "rateLimits": {
    "listingsPerDay": 10,
    "messagesPerMinute": 20,
    "messagesPerDay": 400,
    "conversationsPerDay": 30,
    "reportsPerDay": 20
  },
  "reports": {
    "highSeverityAutoLimitThreshold": 2,
    "anyReasonAutoLimitThreshold": 3
  },
  "repeatOffender": {
    "windowDays": 30,
    "blockedListingsThreshold": 3
  },
  "rules": [
    {
      "id": "drugs",
      "action": "block",
      "reasonCode": "prohibited_drugs",
      "terms": ["ganja", "charas", "hashish", "hash oil", "marijuana", "cannabis", "mdma", "ecstasy pills", "lsd", "cocaine", "heroin", "methamphetamine", "meth", "opium", "magic mushrooms", "codeine syrup", "nitrazepam", "alprazolam"]
    },
    {
      "id": "weapons",
      "action": "block",
      "reasonCode": "prohibited_weapons",
      "terms": ["pistol", "revolver", "handgun", "shotgun", "country made gun", "desi katta", "katta", "ammunition", "ammo", "grenade", "explosive", "explosives", "gunpowder", "gun powder", "detonator", "stun gun", "taser", "brass knuckles", "knuckle duster", "switchblade", "butterfly knife"]
    },
    {
      "id": "counterfeit",
      "action": "block",
      "reasonCode": "counterfeit",
      "terms": ["first copy", "master copy", "mirror copy", "7a quality", "aaa quality", "replica watch", "replica shoes", "replica bag", "fake branded", "duplicate branded", "clone phone"]
    },
    {
      "id": "forged-documents",
      "action": "block",
      "reasonCode": "forged_documents",
      "terms": ["fake certificate", "fake marksheet", "fake degree", "degree certificate for sale", "marksheet for sale", "fake id", "fake id card", "fake college id", "fake bonafide", "forged certificate", "forged documents"]
    },
    {
      "id": "identity-documents",
      "action": "block",
      "reasonCode": "identity_documents",
      "terms": ["aadhaar card", "aadhar card", "pan card", "voter id", "passport for sale", "student id card", "pre activated sim", "preactivated sim", "activated sim card"]
    },
    {
      "id": "digital-accounts",
      "action": "block",
      "reasonCode": "digital_accounts",
      "terms": ["hacked account", "cracked software", "pirated", "netflix account", "prime video account", "spotify premium account", "hotstar account", "instagram account for sale", "gmail accounts", "carding", "otp bypass", "keylogger", "malware", "ransomware", "keygen", "crack version"]
    },
    {
      "id": "academic-misconduct",
      "action": "block",
      "reasonCode": "academic_misconduct",
      "terms": ["question paper leak", "leaked paper", "leaked question paper", "exam answers", "proxy attendance", "attendance proxy", "proxy exam", "exam proxy"]
    },
    {
      "id": "regulated-goods",
      "action": "block",
      "reasonCode": "regulated_goods",
      "terms": ["vape", "vapes", "vape pod", "e cigarette", "ecigarette", "juul", "heated tobacco", "liquor", "whisky", "whiskey", "vodka", "alcohol for sale", "beer for sale", "wine for sale", "prescription drugs", "prescription medicine", "steroids", "anabolic", "sleeping pills", "abortion pills", "viagra", "gutka", "gutkha", "chewing tobacco", "cigarette packs"]
    },
    {
      "id": "wildlife",
      "action": "block",
      "reasonCode": "wildlife_animals",
      "terms": ["ivory", "tiger skin", "rhino horn", "elephant tusk", "star tortoise", "pangolin", "snake skin"]
    },
    {
      "id": "hazardous",
      "action": "block",
      "reasonCode": "hazardous_materials",
      "terms": ["chloroform", "cyanide", "mercury for sale", "acid for sale"]
    },
    {
      "id": "other-prohibited",
      "action": "block",
      "reasonCode": "other_prohibited",
      "terms": ["human organ", "kidney for sale", "blood for sale", "escort service", "betting tips", "satta"]
    },
    {
      "id": "review-weapon-like",
      "action": "limit",
      "reasonCode": "needs_review_term",
      "terms": ["knife", "knives", "dagger", "sword", "katana", "air gun", "air rifle", "airsoft", "bb gun", "crossbow", "nunchaku"]
    },
    {
      "id": "review-animals",
      "action": "limit",
      "reasonCode": "needs_review_term",
      "terms": ["puppy", "puppies", "kitten", "kittens", "parrot", "pet bird", "tortoise", "turtle", "pet for sale"]
    },
    {
      "id": "review-substances",
      "action": "limit",
      "reasonCode": "needs_review_term",
      "terms": ["weed", "hookah", "tobacco", "cigarette", "cigarettes", "alcohol", "beer", "wine", "crackers", "fireworks", "medicine", "medicines", "injection", "prescription"]
    },
    {
      "id": "review-accounts-services",
      "action": "limit",
      "reasonCode": "needs_review_term",
      "terms": ["account for sale", "game account", "assignment writing", "record writing", "thesis writing", "project for sale", "replica", "high copy"]
    },
    {
      "id": "scam-language",
      "action": "limit",
      "reasonCode": "possible_scam_language",
      "terms": ["advance payment", "pay in advance", "token amount", "booking amount", "advance booking", "send otp", "share otp", "share the otp", "courier charges", "registration fee", "pay first", "gpay first", "paytm first", "phonepe first", "transfer to my account", "scan qr to receive", "army officer", "i am in army"]
    }
  ]
}
$json$::jsonb)
on conflict (version) do nothing;
