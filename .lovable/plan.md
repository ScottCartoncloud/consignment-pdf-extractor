

# Customer Profiles & Email-to-Consignment Pipeline

## Concept

Add **Customer Profiles** — each profile ties a customer to their invoice format, generates a unique email address, and optionally stores extraction hints to improve AI accuracy.

## Flow

```text
1. Admin creates Customer Profile
   → enters customer name, CC customer ID
   → uploads a sample PDF
   → AI extracts data, admin verifies/corrects
   → saves profile (with optional extraction hints)
   → system generates unique email: {slug}@notify.yourdomain.com

2. Customer sends invoice to their unique email
   → email webhook receives PDF attachment
   → looks up customer profile by recipient address
   → runs AI extraction with customer-specific hints
   → creates consignment draft, ready for review

3. Admin reviews draft on Review page
   → customer auto-matched, fields pre-filled
   → submit to CartonCloud
```

## Database Changes

### New table: `customer_profiles`
- `id` (uuid, PK)
- `customer_name` (text)
- `cc_customer_id` (text)
- `inbound_email_slug` (text, unique) — e.g. "acme-corp" → acme-corp@...
- `extraction_hints` (text, nullable) — free-text instructions appended to AI prompt (e.g. "Weight is always in kg, ignore the 'Ref' column")
- `sample_extraction` (jsonb, nullable) — the verified sample extraction for reference
- `created_at` (timestamptz)

### Update `email_customer_mappings`
- Add `customer_profile_id` (uuid, FK to customer_profiles, nullable) — links email senders to profiles

### Update `consignment_drafts`
- Add `customer_profile_id` (uuid, FK, nullable) — tracks which profile was used

## New Page: Customer Profiles

Located in sidebar between "Upload" and "Review":

1. **Profile list** — table showing all profiles with name, CC ID, inbound email, sample status
2. **Create/Edit profile** — form with:
   - Customer name, CC Customer ID
   - Sample PDF upload zone
   - AI extraction preview (same form as Review page but in "validation mode")
   - Extraction hints textarea
   - Generated inbound email address (read-only, with copy button)
3. **Delete** with confirmation

## Edge Function Changes

### `extract-consignment`
- Accept optional `customer_profile_id`
- If provided, fetch the profile's `extraction_hints` and append to the system prompt
- This gives the AI customer-specific context without rigid templates

## Phase 2 (Future — not in this build)

- **Inbound email webhook** — receives emails at generated addresses, extracts PDF attachments, auto-creates drafts
- This requires email domain setup and webhook configuration, so it's better as a follow-up

## What We Build Now

1. `customer_profiles` table + migration
2. Customer Profiles page (CRUD + sample upload/verify flow)
3. Update `extract-consignment` to accept and use extraction hints
4. Update Upload page to optionally select a customer profile before uploading
5. Wire profile selection into the Review page for auto-matching

## Technical Details

- The sample verification flow reuses the existing `extract-consignment` edge function — upload sample, show results in an editable form, save verified extraction to the profile
- Extraction hints are injected into the system prompt as an additional paragraph: "Additional context for this customer: {hints}"
- Inbound email slugs are auto-generated from customer name (slugified, deduped) but editable
- The unique email address display is informational for now (Phase 2 enables actual receiving)

