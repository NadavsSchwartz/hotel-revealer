# Live access prerequisite

**Reviewed: 2026-09-07. Status: blocked pending explicit authorization and a verified integration.**

Hotel Revealer's intended live experience compares Express Deal clues with named
hotel listings before booking. No agreement authorizing this use has been supplied.
Live inventory access and portfolio release must remain disabled until the gates
below pass. Offline implementation and synthetic tests do not satisfy this prerequisite
and must not be presented as a working live product.

## Verified findings

- [Priceline terms, §3.2.5](https://www.priceline.com/static-pages/terms_en.html)
  expressly prohibit automated identification of Express Deal and Pricebreaker
  suppliers before booking. Section 2.2.1 separately requires express written
  permission for automated content collection, copying/display, and deep booking links.
  These terms were retrieved during this review.
- [The official PPS status page](https://status.pricelinepartnersolutions.com/)
  lists hotel search, pre-book and booking services. An endpoint name containing
  `Express` does not establish that it supplies Priceline.com's hidden Express Deal
  inventory or permits identifying suppliers.
- The official partner-network repository's
  [onboarding document](https://github.com/priceline-partner-network/api-documentation/blob/master/src/getting-started.md)
  directs new applicants to its
  [affiliate contact form](https://pricelinepartnernetwork.com/contact?type=affiliate),
  existing partners to their account manager for API access, and describes
  certification before production launch. **This is historical guidance:** the
  repository was last updated in 2022. Current onboarding requirements and the
  contact form's availability were not verified.
- The current [PPS website](https://pricelinepartnersolutions.com/) and
  [developer portal](https://pricelinepartnersolutions.com/developers/) returned 403
  to the research tool. No authenticated documentation was accessed.

No published authorization for Hotel Revealer's specific identification use was
found. This does not establish that a negotiated exception is impossible.
Successful ordinary website requests, generic affiliate acceptance, or possession
of an API key would not by themselves resolve the stated use restriction.

## Required evidence before enabling live access

1. Written Priceline/PPS authorization explicitly covering automated pre-booking
   candidate identification and public presentation, applicable to this application.
2. Current integration documentation and authorized credentials demonstrating
   access to the necessary opaque offers, named listings, candidate details, and
   original-offer booking handoff for the same travel context. Verify masking and
   rounding semantics before relying on them in matching rules.
3. Confirmed permissions and requirements for data/image display, attribution,
   cache duration, retained fixtures, booking links, traffic limits, costs, and
   production certification. Adjust implementation defaults to the actual agreement.
4. Scoped verification against the authorized integration, including offer/candidate
   separation, completeness limits, quote freshness, and handoff correctness.
   Never infer matching accuracy from a single candidate without a known outcome.

Record the agreement reference, applicable scope, verification date and owner;
keep confidential agreements and credentials outside the public repository.
If access is refused or unavailable, keep the live objective blocked and request
an explicit product-scope decision. Do not silently substitute a sample-data demo.

## Inquiry draft — not sent

**Subject: Permission and API suitability for Hotel Revealer**

Hello Priceline Partner Solutions,

I'm developing Hotel Revealer, a small public portfolio application for occasional
travelers. It would compare Priceline Express Deal clues with named hotel listings
for the same dates, display possible hotel candidates with uncertainty clearly
stated, and link travelers to the original Priceline offer to book.

Before implementing live access, can Priceline expressly authorize this automated
pre-booking candidate-identification use, including public display? I understand
that the public terms prohibit automated identification of Express Deal suppliers.

If this use can be approved, which partner integration supplies the relevant
opaque offers, named listings, hotel details, and original-offer links? Please also
confirm permitted caching durations, attribution/display rules, traffic limits,
access costs, and launch requirements.

The planned interface supports English/USD, worldwide destination search, room
and adult counts, and children’s ages, with no bookings or payments handled by my
application. Please confirm supported destinations, per-room occupancy and age
requirements, permitted stay lengths, and whether supplied quotes represent one
room or the entire requested trip.

Thank you,
Nadav Schwartz

## Research boundary

This review queried public documentation only. It did not query live hotel
inventory, send this inquiry, submit a partner application, make a booking, or
bypass access controls. Provider permission, live data suitability, hosted behavior,
and live identification accuracy remain unverified.
