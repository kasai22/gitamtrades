# Product Requirements Document — University Student Marketplace

> Transcribed from `university_student_marketplace_prd.pdf` (v1.0, "Draft for stakeholder review", 28 Oct 2026).
> This Markdown copy is the engineering source of truth. If it ever disagrees with the PDF, the PDF wins and this file must be corrected.

A university-exclusive, peer-to-peer marketplace for students to discover, list and exchange items on campus.

## Document control

| Attribute | Value |
|---|---|
| Document version | v1.0 |
| Status | Draft for stakeholder review |
| Product owner | Product Management |
| Target platform | Responsive web application |
| Launch market | One university in India |
| Monetization | Free at launch |
| Transaction model | Offline settlement between buyer and seller; no on-platform payment |
| Working product name | University Student Marketplace (placeholder) |

**How to read this PRD:** Confirmed decisions are treated as requirements. Unconfirmed implementation details are marked as assumptions or open questions and must be resolved before launch.

## Executive summary

The product is a single-university, student-only peer-to-peer marketplace that helps students sell items they no longer need and find affordable items from classmates. It takes the familiarity of a classifieds marketplace such as OLX and narrows the community to one university, with university-email verification, campus-context discovery and direct buyer-seller communication.

The platform will not process payments, hold funds, provide escrow, or operate delivery. Buyers and sellers connect through in-app chat and may voluntarily share contact details. They coordinate an in-person exchange and settle payment independently, outside the platform. Sellers publish listings themselves; the system must not require pre-publication human approval. Automated policy checks, reporting and post-publication enforcement protect the community without creating a listing approval queue.

### Product at a glance

| Dimension | Decision / direction |
|---|---|
| Audience | Students verified through the selected university email domain; one university at launch. |
| Listing model | Self-service seller listing with a short, low-friction form. Publish immediately unless an automated policy rule blocks the content. |
| Discovery | Browse, search and filter categories, price, condition and newest listings. |
| Communication | In-app messaging plus optional contact sharing with explicit user consent. |
| Exchange | In-person campus exchange. No platform checkout, payment, escrow or delivery. |
| Trust | Verified university email, visible listing details, automated risk checks, report/block tools and moderation audit trail. |
| Business model | Free for students at launch; no listing fees or paid placement. |

### Core product principle

Self-service by default, safety by design: the platform should feel as easy as posting a classified ad, while automatically preventing clear policy violations and enabling fast user reporting. "No approval" means no routine human approval before publication; it does not mean unlawful or dangerous listings must remain live.

## 1. Product context

### 1.1 Problem statement

Students regularly need to buy, sell or pass on textbooks, electronics, furniture, hostel essentials, clothing, sports equipment, cycles and event tickets. Existing general classifieds can be geographically broad, noisy and harder to trust. Informal campus groups and chats can be fragmented, difficult to search and poor at keeping availability current. Students need a single, searchable space to connect with people from their own university, with clear listing information and a lightweight way to coordinate exchanges.

### 1.2 Product vision

Make the university community the easiest and most trusted place for students to find a second life for useful items and access affordable essentials.

### 1.3 Jobs to be done

- As a seller, I want to publish an item quickly so that interested students can contact me without navigating a complicated selling process.
- As a buyer, I want to find relevant items posted by students at my university so that I can compare options and arrange a convenient campus exchange.
- As a student, I want confidence that other users belong to the university community without exposing my personal contact information publicly.
- As a platform operator, I want illegal or clearly unsafe listings to be stopped or removed with automated controls and clear reporting paths, without manually approving every listing.

## 2. Goals, non-goals and success definition

### 2.1 Goals

- Provide a student-only marketplace for one university in India.
- Allow verified students to enable seller permissions and publish permitted listings without manual pre-approval.
- Make browsing and contacting a seller simple on mobile and desktop browsers.
- Keep all payment and handover arrangements outside the product, with clear user-facing expectations.
- Improve trust through university-email verification, safe contact-sharing defaults, reporting and automated moderation.
- Build a measurable pilot that can validate supply, demand, listing quality and repeat use before expanding to more universities.

### 2.2 Non-goals for launch

- Online checkout, payment gateway, UPI collection, escrow, refunds, commissions or financial custody.
- Logistics, shipping labels, delivery tracking or platform-arranged transport.
- Routine human approval of listings before publication.
- Multi-university discovery, cross-campus shipping or an open public marketplace.
- Seller storefronts for businesses, wholesale selling or professional commercial seller tooling.
- Guaranteeing item condition, authenticity, transaction completion or dispute outcomes.
- Paid listings, advertising, memberships or revenue-generating premium plans at launch.

### 2.3 Definition of success

Success means students can reliably discover relevant listings and make contact, sellers can publish quickly, items become unavailable when sold, and the platform can contain prohibited content without slowing every seller down. Marketplace liquidity and safety are both first-class outcomes; raw sign-ups alone are not sufficient.

## 3. Confirmed decisions, assumptions and open questions

### 3.1 Confirmed decisions

| ID | Confirmed decision |
|---|---|
| D-01 | Responsive web platform. |
| D-02 | Launch for a single university in India. |
| D-03 | University email verification is the identity gate. |
| D-04 | Categories include Electronics; Books & Study Materials; Furniture & Room Essentials; Clothing & Accessories; Cycles & Scooters; Event Tickets; Hostel Essentials; Sports & Fitness; and a broad "Other permitted items" path. |
| D-05 | Exchanges occur offline/in person. |
| D-06 | In-app chat and optional contact sharing are both supported. |
| D-07 | No online payment transactions. Buyer and seller settle independently. |
| D-08 | Free to use at launch. |
| D-09 | Automated moderation; no routine manual pre-approval. |
| D-10 | Listings should be hassle-free and may cover any item permitted by applicable law and platform policy. |

### 3.2 Working assumptions (must be validated)

| ID | Assumption | Why it matters |
|---|---|---|
| A-01 | Any verified student can enable seller permissions on their existing account; the same account can buy and sell. | Avoids separate accounts and reduces friction while preserving the rule that only seller-enabled users can list. |
| A-02 | The university is identified by an approved list of institutional email domains. | A university name and exact domains are not yet supplied. |
| A-03 | The platform displays a campus-defined pickup area or general campus location, not a student's live location or room number. | Helps people coordinate safely while protecting residential privacy. |
| A-04 | Listings can publish with required text fields and without mandatory photos, though image upload is strongly encouraged. | Balances quick publishing with useful product information. |
| A-05 | Listing availability is managed by the seller: Active, On hold (optional), Sold, Expired or Removed. | There is no checkout/order object to infer transaction completion. |
| A-06 | "Automated moderation" means automated checks plus user reports, with human admin intervention only for escalations, appeals, legal requests or edge cases. | Maintains no-pre-approval while allowing accountable enforcement. |
| A-07 | The minimum user age is 18 for the initial pilot unless legal review approves a different model. | Reduces complexity involving minors, consent and safety. |
| A-08 | The initial launch is a limited university pilot with a small operating/admin team. | Sets realistic initial service levels and support capacity. |

### 3.3 Open questions before build freeze

| Priority | Question to resolve | Recommended default |
|---|---|---|
| P0 | Which university and which email domains are allowed? | Launch with one university and all officially approved active student/staff domains, excluding generic mail domains. Confirm whether alumni accounts qualify. |
| P0 | Are users required to be 18 or older? | 18+ at launch. |
| P0 | Can users list event tickets? Under what resale, transfer and organizer restrictions? | Permit only if transfer is lawful and allowed by event/venue terms; block fake, duplicated or non-transferable tickets. Keep ticket evidence private and never expose QR/barcodes. |
| P0 | Which items require additional restriction even if legal in certain circumstances? | Create a policy matrix with counsel before launch; apply a blocklist and category-specific rules. |
| P0 | Which name, domain, logo and campus-specific meetup points will be used? | Treat product name as placeholder; create campus-specific safe exchange guidance. |
| P1 | Should students be able to reserve/hold an item for a buyer? | No commitment feature at MVP; optionally allow seller-set "On hold" status. |
| P1 | Should offers or price negotiation be supported? | Use chat for negotiation; no structured offer or checkout flow at MVP. |
| P1 | Should seller reviews/ratings exist? | Defer until transactions can be reliably validated; otherwise reviews may be manipulated. |
| P1 | Which languages are required? | English at MVP with localization-ready architecture; confirm if Telugu/Hindi are launch requirements. |
| P1 | What retention windows apply to chat, reports, deleted accounts and moderation logs? | Define with legal counsel and privacy notice before launch. |

## 4. Target users and personas

### 4.1 Student seller — "I need to clear my room"

Context: A student is graduating, moving hostels or replacing a device. They want to publish an item quickly and coordinate with serious buyers. They may not want a public phone number or repeated requests for basic details.

Needs: Fast listing form, price/condition fields, photos, edit controls, in-app chat, optional contact share and a one-tap "Mark as sold" action.

### 4.2 Student buyer — "I need an affordable item nearby"

Context: A student needs a textbook, desk lamp, cycle or appliance and wants to compare items within the same campus community.

Needs: Search and filters, clear total asking price, condition/details, recent listings, verified-campus context, an easy way to ask questions and clear meetup safety guidance.

### 4.3 Dual-role student

A student may buy one item and sell another. They should not need a second account or repeat verification to switch between browsing and selling.

### 4.4 Platform administrator / safety operator

Needs: Listing and user search, report queue, automated moderation outcomes, repeat-offender signals, ability to hide/remove content or suspend accounts, audit trails and a path to handle appeals and lawful requests. This role does not pre-approve ordinary listings.

## 5. Core user journeys

### 5.1 Student registration and verification

1. Visitor opens the marketplace and sees the university-specific access message.
2. User enters an institutional email address and accepts the Terms, Privacy Notice and marketplace rules.
3. System sends a one-time verification link/code; user verifies the email.
4. System checks the domain allowlist and creates the student account; the account is labelled "University email verified".
5. User can browse listings and use messaging. Seller permissions are enabled via a self-service "Start selling" action.

### 5.2 Create and publish a listing

6. Seller selects "Sell an item". A short form asks for title, category, asking price (including free), condition and description; images are optional but recommended.
7. Seller selects a general campus meetup area or chooses "Arrange in chat"; personal room numbers and live location are not requested.
8. Seller confirms ownership/authority to sell and that the item complies with law and platform policy.
9. Automated checks evaluate text, images, category and suspicious patterns. Clear permitted listings publish immediately; high-confidence prohibited content is blocked with a plain-language explanation and edit/appeal route.
10. Published listing appears in relevant category/search results and is visible to verified students.

### 5.3 Buyer discovers and connects

11. Buyer browses categories or searches by keyword and optionally filters by category, price, condition and recency.
12. Buyer opens the listing, checks photos, description, condition, price, seller verification badge and availability.
13. Buyer taps "Chat with seller" or "I'm interested" to open a conversation with the listing context attached.
14. Buyer and seller discuss condition, final price, meetup time and location. Either person may choose to share contact details; sharing is explicit and not public by default.
15. They meet and settle the transaction independently. The seller marks the item Sold or On hold; the listing status updates across search and saved views.

### 5.4 Report an issue

16. A user reports a listing or user and chooses a reason, with an optional short explanation.
17. System confirms the report, records the listing/user and relevant context, and runs risk scoring or policy checks.
18. Clear high-risk violations may be automatically hidden while reviewed; low-confidence reports are prioritized without automatically penalizing the reported user.
19. The reporter sees that the report was received. The accused user is informed when required and can appeal eligible restrictions.
20. Admin/audit tooling records the action, reason, time and model/rule version. Escalation follows applicable legal requirements.

## 6. Information architecture and screens

| Area | Primary screens / capabilities |
|---|---|
| Public / access | University landing/access page; sign up; email verification; login; terms and privacy; prohibited items policy. |
| Discovery | Home feed; category pages; search results; filters/sort; listing detail; empty states; sold/unavailable state. |
| Seller | Create listing; edit listing; preview; My Listings; listing status controls; mark sold; delete/archive. |
| Communication | Inbox; conversation view; listing context card; optional contact-share action; block/report controls. |
| Student account | Profile; verified email; seller capability; notification preferences; blocked users; data/account deletion requests. |
| Safety / support | Report listing/user; safety guidance; help/FAQ; grievance contact; appeal or request review. |
| Admin (internal) | Listing/user search; automated decision log; reports; hide/remove/suspend; appeals; legal request handling; audit log; policy configuration. |

## 7. Functional requirements

Priority definitions: P0 = required for a safe, usable pilot; P1 = recommended for early follow-up; P2 = later enhancement.

| ID | Priority | Requirement | Description | Acceptance criteria |
|---|---|---|---|---|
| AUTH-01 | P0 | University email registration | User can register using an approved university email domain. Generic domains are rejected for student verification. | Given an unsupported domain, the user receives a clear reason and cannot complete student verification. |
| AUTH-02 | P0 | Email verification | Send a time-limited verification link or OTP; do not mark the account verified until success. | Unverified users cannot message or list; expiration and resend work securely. |
| AUTH-03 | P0 | Single account, dual capability | Verified users can buy; seller permissions are enabled through a self-service action. | A user can list and buy using the same account without a second registration. |
| AUTH-04 | P0 | Account controls | Provide logout, passwordless/session recovery as appropriate, and account/data deletion request entry points. | Sessions can be terminated and the user can initiate an account request. |
| LIST-01 | P0 | Fast listing creation | Create a listing with title, category, price, condition and description; photos and meetup zone are supported. | A normal listing can be published in under 3 minutes median in pilot usability testing. |
| LIST-02 | P0 | Price and free items | Support INR pricing and a ₹0/free option; do not imply the platform collects payment. | Listing price is visible consistently on card and detail page; ₹0 is rendered as "Free". |
| LIST-03 | P0 | Photos and upload safety | Support multiple item images, image preview, compression and image safety checks. | Rejected file types and oversized files receive actionable errors; images are not publicly accessible before listing publish. |
| LIST-04 | P0 | Instant publishing | Permitted listings publish after automated checks, with no routine human approval queue. | A clear permitted listing becomes visible immediately after checks complete. |
| LIST-05 | P0 | Edit, pause, sold and delete | Sellers can edit, mark sold, optionally put on hold, or remove their own listings. | Status changes propagate to details, search results and saved references. |
| LIST-06 | P0 | Seller declaration | Before publishing, seller confirms they own or are authorized to sell the item and comply with applicable law/policy. | The declaration is recorded with timestamp and policy version. |
| LIST-07 | P0 | Expiry and stale listings | Provide a configurable listing expiry reminder and a way to renew active listings. | Expired listings are hidden from default discovery and seller can renew them. |
| DISC-01 | P0 | Browse categories | Show the selected launch categories and an "Other permitted items" pathway. | A listing is discoverable through its selected category. |
| DISC-02 | P0 | Search | Support keyword search over title and description. | Search handles empty query, no-result and common partial terms gracefully. |
| DISC-03 | P0 | Filters and sort | Filter by category, price range, condition and status; sort by newest and price where relevant. | Selected filters are visible, removable and represented in the URL or shareable state where practical. |
| DISC-04 | P0 | Listing detail and seller status | Display price, condition, description, images, posted/updated time, category, verified indicator and availability. | Unavailable/sold items cannot be contacted as though active. |
| DISC-05 | P1 | Saved listings | Users can save/favorite listings for later. | Saved list survives login across devices. |
| CHAT-01 | P0 | In-app messaging | Verified users can message a seller from a listing; first message retains listing context. | Message appears once in each participant's conversation and sender sees delivery/failed state. |
| CHAT-02 | P0 | Optional contact share | User can voluntarily reveal a contact method inside a conversation. | Contact details are not public by default and are revealed only after a clear user action. |
| CHAT-03 | P0 | Block and report from chat | Users can block another user and report abusive or suspicious messages. | Blocked user cannot initiate new messages to blocker; existing conversation is retained only as policy permits. |
| CHAT-04 | P1 | Notifications | Provide in-product and email notification for new messages, with user preferences. | A user can turn non-essential notifications off without losing in-app messages. |
| SAFE-01 | P0 | Automated listing moderation | Evaluate text, category, image signals and repeat-offender patterns before publication; do not require manual approval for ordinary listings. | Clear allowed listings publish; high-confidence prohibited listings are blocked with a specific reason. |
| SAFE-02 | P0 | Report listings and users | Support report reasons such as prohibited item, suspected scam, counterfeit, misleading details, harassment and safety concern. | Reports create traceable cases and prevent duplicate report spam from causing unbounded actions. |
| SAFE-03 | P0 | Post-publication enforcement | Automatically hide or restrict clear high-risk violations; allow admin intervention for edge cases and lawful requests. | Every enforcement action records reason, time, rule/model version and actor. |
| SAFE-04 | P0 | Appeal / correction path | Users can request review of automated blocks or account restrictions. | Appeal path is accessible from the explanation screen and produces a case ID. |
| SAFE-05 | P0 | Prohibited items policy | Publish readable prohibited/restricted item rules and category-specific guardrails. | Users can view policy before listing; listing confirmation links to the policy. |
| SAFE-06 | P0 | Safe meetup guidance | Display safety tips at listing/contact stages, including public campus locations and avoiding advance transfers to unknown users. | Guidance is visible but does not block normal use. |
| ADMIN-01 | P0 | Admin listing/user search | Authorized admins can search, view status, inspect reports and take proportionate action. | Access is role-based and all privileged actions are audited. |
| ADMIN-02 | P0 | Moderation queue | Provide a queue for user reports, appeals and automated escalations; not a pre-approval queue. | Operators can triage, resolve, escalate and record outcomes. |
| ADMIN-03 | P0 | Policy configuration | Authorized staff can adjust prohibited terms/categories, trusted domains, rate limits and listing thresholds. | Policy changes are versioned and auditable; critical changes can be rolled back. |
| ADMIN-04 | P0 | Grievance contact | Show required platform and grievance contact details, subject to legal review. | Contact details are accessible from footer, policy and support surfaces. |
| AN-01 | P0 | Product analytics | Track key funnel, listing, search, messaging, sold-state and safety events without collecting unnecessary personal data. | Events are documented and respect user choices and privacy requirements. |

## 8. Business rules and listing policy

### 8.1 Roles and permissions

- **Visitor:** can view only the permitted public access surface; the default assumption is that listing details and full contact features require a verified student account.
- **Verified student / buyer:** can browse, search, save listings, start conversations and report content.
- **Seller-enabled student:** can create, edit, publish, pause, mark sold and delete their own listings.
- **Administrator:** can investigate reports and appeals, remove content, restrict accounts, update policy settings and answer lawful requests. Admins do not approve every listing before publication.

### 8.2 Listing fields and validation

| Field | Requirement | Rule |
|---|---|---|
| Title | Required | Short, descriptive; reject empty, repeated spam and obvious deceptive patterns. |
| Category | Required | One approved category; "Other permitted items" must still pass platform policy. |
| Asking price | Required | INR amount or Free (₹0). Clearly label the displayed price as seller-set and non-binding until agreed. |
| Condition | Required | New, Like new, Good, Fair or For parts/repair (wording can be tuned). |
| Description | Recommended / optional at MVP | Encourage defects, included accessories, age, usage and other material details. Set a sane length limit. |
| Images | Optional but recommended | No stolen/private images, nudity, illegal content, ticket QR/barcodes, identity documents or sensitive personal data. |
| Meetup area | Optional | Use approved general campus areas or "Arrange in chat"; never require a dorm room or precise live location. |
| Event ticket details | Conditional | Require confirmation of transferability/terms; do not display barcode/QR or full redeemable code. |

### 8.3 Listing lifecycle

| State | Meaning | Allowed transitions |
|---|---|---|
| Draft | Started but not published. | Draft → Active after successful automated checks; Draft → Deleted. |
| Active | Visible and open to inquiries. | Active → On hold, Sold, Removed, Expired or Draft for re-edit if blocked. |
| On hold (optional) | Seller temporarily pauses new inquiries while talking to a buyer. | On hold → Active, Sold, Removed or Expired. |
| Sold | Seller indicates an offline transaction has completed. | Sold → Active only by explicit seller action; otherwise remains hidden from default discovery. |
| Expired | Listing has passed the configured activity window. | Expired → Active on seller renewal; Expired → Deleted. |
| Removed / Blocked | Removed by seller or policy enforcement. | Seller-removed listings are archived; policy-blocked listings can be edited/appealed as allowed. |

### 8.4 Items that are not permitted

The rule is "anything legally permitted and allowed by platform policy," not literally every possible item. Before launch, legal/policy owners must approve a restricted-items matrix. At minimum, the policy should prohibit listings involving illegal drugs or controlled substances; weapons or ammunition where prohibited; stolen goods; counterfeit goods; forged documents or credentials; identity documents and personal data; malware, stolen accounts or pirated digital goods; hazardous or illegal materials; trafficking or exploitation; and any item whose sale/transfer is unlawful.

Restricted categories may need additional controls. Event tickets are allowed only where transfer/resale is lawful and permitted by the issuer/venue terms. Do not permit fake tickets, duplicated tickets, or public images containing redeemable QR codes/barcodes. Regulated goods must remain disabled until legal review defines eligibility, age checks and any license/transfer requirements.

## 9. Safety, trust and moderation design

### 9.1 Moderation model: no pre-approval, but active safeguards

The system should be publish-first for ordinary listings, with automated risk checks running synchronously or near-real-time. It must not place routine listings in a human approval queue. High-confidence policy matches can be blocked before publication; clear high-risk content discovered later can be hidden automatically. A human operator is available for escalations, complaints, legal requests and appeals, not as a mandatory gate for every seller.

| Signal / situation | Default system action | User experience |
|---|---|---|
| Low risk; policy-compliant | Publish immediately. | Success state with link to listing and option to share it. |
| High-confidence prohibited item | Block publish or hide immediately. | Specific explanation, relevant policy link and edit/appeal option. |
| Ambiguous high-risk signal | Use proportionate temporary restriction or limited visibility; route to review if required. | Tell seller what needs clarification; do not silently delete. |
| User reports a listing | Risk-score and deduplicate reports; automatically restrict only when threshold/risk justifies it. | Reporter receives confirmation; avoid revealing reporter identity. |
| Repeated spam or abusive behavior | Rate-limit or suspend based on evidence and thresholds. | Explain restriction and provide a route to appeal eligible actions. |
| Legal/law-enforcement request | Route to authorized compliance owner; preserve records where legally required; act within applicable timelines. | Communicate where legally permitted. |

### 9.2 Baseline trust and safety controls

- Verified university email badge; do not describe email verification as proof of legal identity or guaranteed safety.
- Contact details private by default. Explicit opt-in is required before sharing a phone number or other contact detail in chat.
- Report and block actions on listing and conversation surfaces.
- Listing rate limits, account age signals, duplicate-image/text checks and abuse throttles to deter spam.
- Clear sold/unavailable status to reduce wasted inquiries and stale listings.
- Safe meetup guidance: prefer populated campus locations, inspect the item before paying, avoid sharing passwords/OTP/ID images and avoid advance transfers to unknown users.
- Never display full ticket codes, QR/barcodes, student ID photos, home addresses or other sensitive information in a public listing.
- Admin audit log for moderation decisions, account restrictions, policy changes and access to sensitive reports.
- Appeal path for automated enforcement and a publicly accessible grievance/help page.

### 9.3 Safety caveat

University email verification and moderation reduce risk but cannot guarantee that an item is genuine, safe or as described, nor can they guarantee the buyer or seller will complete an exchange. Product copy must clearly state that students arrange and settle transactions themselves and should inspect goods before agreeing to buy.

## 10. Non-functional requirements

| Area | Requirement / initial target | Notes |
|---|---|---|
| Performance | p75 initial content render under 2.5 seconds on a reasonable mobile connection; search response under 1 second p95 at pilot scale. | Validate with real-device testing; images should be resized/lazy-loaded. |
| Availability | Target 99.5% monthly uptime during pilot, excluding announced maintenance. | Provisional target; align with hosting budget and operating capacity. |
| Responsive UX | Support modern mobile browsers and desktop layouts; core tasks work at 360px viewport width and above. | Mobile-first because students are expected to use phones frequently. |
| Accessibility | Aim for WCAG 2.2 AA: keyboard access, visible focus, labels, contrast, error summaries and semantic structure. | Automated checks plus manual keyboard/screen-reader review. |
| Security | TLS, secure sessions, server-side authorization, rate limiting, input validation, safe file handling, secret management and protection against common web vulnerabilities. | Use OWASP guidance and perform a security review before launch. |
| Privacy | Data minimization, purpose limitation, clear notice/consent, secure access and deletion/retention process. | Map requirements to current Indian law and phased commencement with counsel. |
| Reliability | Listings and messages should not be lost on network failure; idempotent publish/message operations. | Provide retry states and avoid duplicate listings/messages. |
| Scalability | Initial design should support a pilot of roughly 10,000 registered users and 1,000 concurrent sessions without redesign. | Planning assumption, not a confirmed forecast; load-test before launch. |
| Moderation latency | Automated listing check completes within 3 seconds p95 for text-only and 6 seconds p95 for text plus images. | Keep normal publishing fast; queue slow image analysis asynchronously only where safe. |
| Observability | Structured logs, metrics, error reporting, uptime alerts and moderation-decision audit trail. | Avoid logging message contents or sensitive fields unnecessarily. |
| Maintainability | Category, campus domain, moderation rules and policy text configurable without redeploying the whole product where practical. | All configuration changes versioned. |
| Browser support | Current and previous major versions of Chrome, Edge, Safari and Firefox. | Support matrix to be finalized in engineering design. |

## 11. Analytics and success metrics

### 11.1 North-star metric

Weekly successful connections: the number of unique listing conversations in a week where both participants exchange at least one message. This is a leading indicator, not proof of a completed sale. Pair it with seller-reported Sold status and safety metrics to avoid optimizing only for chat volume.

### 11.2 Pilot metrics and provisional targets

Targets are hypotheses to tune after a 2–4 week baseline period, not industry benchmarks.

| Metric | Definition | Initial target / guardrail |
|---|---|---|
| Verified activation | New verified users who browse or start a seller profile within 24 hours. | Baseline first; establish cohort trend. |
| Listing completion rate | Listing starts that successfully publish. | ≥70% after excluding policy-blocked attempts. |
| Time to publish | Median time from opening "Sell an item" to a live listing. | ≤3 minutes for a straightforward listing. |
| Listing-to-contact rate | Active listing views that result in a new seller conversation. | Improve over baseline; initial hypothesis ≥8%. |
| First inquiry speed | Share of active listings receiving an inquiry within 7 days. | Initial hypothesis ≥30% for categories with sufficient supply. |
| Seller response rate | Conversations where seller replies within 24 hours. | Initial hypothesis ≥50%. |
| Sold status coverage | Listings marked sold after seller reports a successful exchange. | Track trend; no launch commitment until baseline exists. |
| Search success | Search sessions with a listing open or contact action. | Improve over baseline; monitor zero-result queries. |
| Report rate | Unique listing reports per 1,000 active listings. | Monitor by category; spike triggers investigation. |
| Moderation precision | Share of automated blocks that are upheld after appeal/review. | Track false positives and false negatives separately. |
| Safety response time | Time from high-risk report to action. | Define legal/policy SLAs before launch; urgent cases prioritized. |
| Repeat use | Verified users who return and perform a core action within 30 days. | Set target after first cohort completes 30 days. |

### 11.3 Minimum analytics events

| Event | Key properties (minimum) |
|---|---|
| signup_started / email_verified | University domain ID, acquisition source, timestamp; no raw email in general analytics. |
| listing_started / listing_published / listing_blocked | Listing ID, category, time-to-publish, check result, policy/model version. |
| listing_viewed / search_submitted / filter_applied | Listing ID, query category, filters, zero-result flag; avoid storing sensitive free text unless justified. |
| chat_started / message_sent / contact_shared | Conversation ID, listing ID, delivery status; do not send full message body to product analytics. |
| listing_marked_sold / listing_reactivated | Listing ID, days active, category; do not infer payment or successful sale beyond seller self-report. |
| listing_reported / moderation_action / appeal_submitted | Case ID, reason code, severity, action type, time-to-action and outcome. |

## 12. Risks, dependencies and mitigations

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| Low initial supply and demand | High / High | Seed permitted listings through student clubs, hostels and university communities; launch within a narrow campus group; avoid broad expansion before liquidity exists. |
| Illegal or unsafe goods slip through automated moderation | Medium / High | Approved prohibited-items matrix, multi-signal checks, reports, rate limits, fast takedown and audit trail; legal review before launch. |
| False positives frustrate legitimate sellers | Medium / Medium | Explain specific reasons, allow edits and appeals, monitor overturn rate and tune thresholds. |
| Fraud, counterfeit items or misleading descriptions | Medium / High | Seller declarations, report/block controls, safe exchange guidance, suspicious-pattern detection and clear no-guarantee wording. |
| Student email domain includes alumni or external users | Medium / Medium | Confirm university identity policy, use domain and eligibility rules, periodically review domain allowlist. |
| Personal data exposure through chat or images | Medium / High | Contact sharing opt-in, privacy-by-default, image checks, data minimization, secure storage and deletion workflow. |
| Event-ticket scams or non-transferable tickets | Medium / High | Category-specific consent; hide QR/barcodes; require transferability confirmation; block prohibited resale and suspicious patterns. |
| Legal classification and compliance obligations misunderstood | Medium / High | Obtain India-specific legal review of intermediary status, e-commerce rules, DPDP obligations, grievance handling and restricted goods before release. |
| Offline deal disputes attributed to the platform | Medium / Medium | Set expectations clearly; provide reporting and safety guidance; avoid implying escrow, warranty, buyer protection or guaranteed fulfilment. |
| Harassment or spam through messaging | Medium / High | Rate-limit, block/report, enforce conduct rules, provide account restrictions and audit logs. |
| Stale inventory creates poor experience | High / Medium | Expiry reminders, seller status controls, de-rank stale listings and show last-updated time. |

### 12.1 Dependencies

- University-approved domain list and any official identity / student eligibility constraints.
- Legal approval of terms, privacy notice, prohibited-items policy, ticket rules, grievance process and data-retention schedule.
- Email service, image storage/scanning, chat infrastructure, analytics and error monitoring.
- Human owner for legal requests, appeals and escalated safety cases, even though routine listing approval is not required.
- Safe campus meetup recommendations agreed with university context; do not imply official university endorsement without permission.

## 13. MVP scope and release plan

### 13.1 MVP scope (release gate)

| Include in MVP | Explicitly defer |
|---|---|
| University email signup and verification; single-university domain allowlist. | Multi-university federation, cross-campus feeds and campus onboarding self-service. |
| Browse/search/filter, categories, listing detail and availability status. | Recommendations/personalized ranking, seller storefronts and advanced analytics dashboards. |
| Fast self-service seller onboarding, create/edit/remove listing, mark sold, optional on-hold. | Auctions, structured offers, booking/order management and automated transaction completion. |
| In-app chat, optional contact sharing, notifications, block/report. | Voice/video calling, group chat and external messaging integrations. |
| Automated listing checks, post-publication report handling, policy actions, appeals and audit log. | Fully autonomous handling of complex legal, contextual or disputed cases without human oversight. |
| Admin moderation/report console and policy configuration. | Large-scale moderation operations tooling and external risk-data integrations. |
| Privacy notice, terms, prohibited-items policy, safety messaging and grievance entry point. | Payment gateway, escrow, delivery, returns/refunds handled by the platform, paid promotion. |

### 13.2 Phased roadmap

| Phase | Goal | Scope / exit criteria |
|---|---|---|
| Phase 0 — Discovery & policy | Resolve blocking uncertainties. | Confirm university/domain, age policy, listing policy, event-ticket eligibility, legal review, grievance owner, prototype usability and success baseline plan. Exit: P0 decisions recorded. |
| Phase 1 — MVP foundation | Ship trusted core marketplace. | Email verification, browse/search, listing CRUD, publish-first checks, chat, optional contact share, reports/blocks, sold status, admin enforcement and analytics. Exit: critical acceptance criteria pass and no unresolved critical security/safety defects. |
| Phase 2 — Pilot optimization | Improve liquidity and retention. | Saved listings, expiry reminders, better search/filtering, notification preferences, moderation tuning, category-level dashboards and student outreach. Exit: measurable improvements in publish completion and listing-to-contact rate. |
| Phase 3 — Campus expansion readiness | Prepare repeatable rollout. | Configurable university setup, multiple domain allowlists, policy localization, support capacity model, scaling and onboarding playbook. Do not activate additional universities until the first campus meets safety and liquidity gates. |
| Phase 4 — Optional monetization / advanced tools | Evaluate future business model only after product-market signal. | Consider promoted listings or partnerships only after free marketplace value is validated and user trust is protected. Payments remain out of scope unless separately approved. |

## 14. MVP acceptance criteria

| Criterion | Acceptance test |
|---|---|
| AC-01 — Verified access | Only accounts verified through an approved university email domain can initiate conversations or publish listings. |
| AC-02 — Seller permission | A verified student can enable seller privileges without admin approval; buyer-only capability cannot publish until seller permissions are enabled. |
| AC-03 — Hassle-free listing | A student can complete a basic listing using required fields, get validation feedback and publish a permitted item without waiting for a human review. |
| AC-04 — Automated policy handling | A high-confidence prohibited listing is blocked or hidden with a clear explanation; legitimate listings are not held in a manual approval queue. |
| AC-05 — Discovery | Users can browse categories, search titles/descriptions, apply core filters and open a listing detail page on mobile and desktop. |
| AC-06 — Conversation | A buyer can start an in-app conversation from an active listing and both participants can see the listing context. |
| AC-07 — Contact privacy | Phone/contact details are not shown publicly; a user must explicitly choose to share them inside a conversation. |
| AC-08 — Offline transaction | The product never asks users to enter payment details and never represents a message as a confirmed platform order. Copy makes clear that payment and exchange are independent. |
| AC-09 — Sold state | A seller can mark an item Sold; it disappears from default active discovery and the detail page shows its status. |
| AC-10 — Reports and blocking | Users can report a listing/user and block another user; reports create auditable cases and trigger configured risk checks. |
| AC-11 — Admin enforcement | Authorized admins can find reports, investigate, remove a listing or restrict an account, record reasons and view prior actions. |
| AC-12 — Appeals and transparency | A user affected by eligible automated restrictions can access an explanation and appeal/request-review path. |
| AC-13 — Security and privacy | Authorization is enforced server-side; uploaded files are validated; sensitive contact data and report contents are not exposed in public or general analytics. |
| AC-14 — Accessibility and responsive UX | Core flows can be completed at 360px width and with keyboard navigation; no critical accessibility blockers remain in the release checklist. |
| AC-15 — Analytics | Signup, listing, search, message, sold, report, moderation and appeal events are verified in a staging test with documented properties. |
| AC-16 — Legal readiness | Terms, privacy notice, prohibited-item rules, ticket policy, grievance contact and record-retention policy are approved by the designated legal/compliance owner. |

## 15. Launch readiness checklist

- University name, official domain list and initial campus exchange guidance are configured.
- All P0 functional requirements and acceptance criteria are validated in staging.
- Moderation test set includes prohibited goods, near-miss allowed items, counterfeit/scam patterns, explicit content and ticket QR/barcode cases.
- Automated block/appeal behavior is tested for false positives and user explanation quality.
- Reporting, blocking, admin access, audit logs and escalation routes have named owners.
- Email, message delivery, image storage, rate limits and abuse alerts are load- and failure-tested.
- Legal/compliance review covers applicable IT intermediary rules, e-commerce rules, privacy/data-protection requirements, restricted goods and grievance mechanisms.
- Privacy notice and terms match actual data collection, retention, sharing and deletion behavior.
- Product analytics events and dashboards are checked without sending raw contact details or message bodies unnecessarily.
- Pilot support plan, incident response process and rollback plan are documented.

## 16. Legal and compliance considerations

This section is a product planning aid, not legal advice. Before launch, obtain India-specific counsel to determine the exact obligations that apply to the operator and its peer-to-peer model. The site facilitates listings and buyer-seller interactions, so "we do not process payment" should not be treated as an automatic exemption from marketplace, intermediary, privacy, consumer or grievance requirements.

- **Intermediary rules:** assess applicable duties under the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, updated by MeitY. Design for prohibited-content handling, notices, user reports, grievance handling, recordkeeping and appeal workflows as applicable.
- **Consumer e-commerce rules:** review the Consumer Protection (E-Commerce) Rules, 2020 and subsequent amendments, including the 2026 amendment listed by the Department of Consumer Affairs. Applicability may differ for genuinely personal one-off transactions versus a systematic commercial marketplace; do not assume either outcome without advice.
- **Personal data:** review the Digital Personal Data Protection Act, 2023 and Digital Personal Data Protection Rules, 2025, including their phased commencement and any corrigenda/notifications current at launch. Data minimization, a clear privacy notice, purpose limitation, security, user requests, and retention/deletion processes should be designed from the beginning.
- **Restricted products:** validate category-specific laws and policies for tickets and any regulated products, and disable categories until a permitted pathway is defined. User declarations alone are not sufficient safeguards.
- **Grievance and legal requests:** name the responsible owner, publish required contact details where applicable and establish a documented escalation process. The platform needs an accountable person even if routine moderation is automated.

Official reference links checked for the PDF draft: MeitY — IT Intermediary Rules (updated 10 February 2026); MeitY — DPDP Rules, 2025 and related notifications; Department of Consumer Affairs — Consumer Protection Act / E-Commerce Rules index (includes 2026 amendment listing); Department of Consumer Affairs — Consumer Protection (E-Commerce) Rules, 2020 notification. Reference check date: 28 October 2026. Confirm the authoritative Gazette/Ministry version immediately before release.

## 17. Final product decisions needed

| Decision | Owner | Required by | Status |
|---|---|---|---|
| University name, domain list and eligibility (including alumni accounts) | Product + University liaison | Before auth implementation | Open |
| Age eligibility and age-related controls | Product + Legal | Before public pilot | Open |
| Prohibited / restricted items matrix, especially event tickets | Legal + Safety + Product | Before listing build freeze | Open |
| Privacy notice, retention schedule, grievance owner and appeal process | Legal/Compliance + Engineering | Before staging sign-off | Open |
| Approved campus meetup areas and safety wording | Product + Campus liaison | Before launch | Open |
| Final targets for liquidity and reporting SLAs after pilot baseline | Product + Data | After pilot baseline | Open |
| Product name, domain and visual identity | Product + Design | Before public launch | Open |

## Appendix A — Suggested MVP navigation

Home → Search / Category → Listing detail → Chat with seller. For sellers: Home → Sell an item → Listing form → Automated checks → Published listing → My Listings → Mark sold. For safety: Listing or chat → Report / Block → Confirmation → Admin report queue / automated action → Appeal or case closure where applicable.

## Appendix B — Product copy principles

- Use clear, student-friendly language; avoid legal jargon on the primary listing flow.
- Explain automated blocks with a concrete reason and an action the seller can take.
- Never label a student "identity verified" when only university email was verified. Use "University email verified".
- Do not imply payment protection, official university endorsement, warranty, or platform-managed delivery.
- Make privacy choices explicit: contact details stay private unless the user chooses to share them.
- Keep safety guidance brief and contextual at listing, chat and meetup moments.
