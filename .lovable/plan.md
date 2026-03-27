

# Restructured App — Customer-Centric Workflow

## The Problem

The current app is organized around actions (Upload → Review → Submit), but the real workflow is customer-centric: you set up each customer once, then process their invoices ongoing. The Upload page and Review page are disconnected from customer context.

## New Information Architecture

```text
Sidebar:
  ┌─────────────────────┐
  │ ConsignmentBuilder   │
  │                      │
  │ 📋 Customers         │  ← list of customer profiles
  │ 📊 Activity Log      │  ← history of all processed consignments
  │ ⚙️ Settings          │  ← CC API keys etc.
  └─────────────────────┘
```

**Removed**: Upload (standalone), Review (standalone), Email Mappings (absorbed into profiles).

## Customers Page (list)

Table of all customer profiles: Name, CC Customer ID, Inbound Email, Last Activity, Status.

"Add Customer" button opens the create flow.

Clicking a customer row opens the **Customer Detail** page.

## Customer Detail Page (`/profiles/:id`)

A single page with everything for that customer:

### Tabs or sections:

1. **Profile** — name, CC Customer ID, inbound email slug (read-only with copy), extraction hints textarea. Save button.

2. **Sample Mapping** — side-by-side PDF viewer + extracted fields (existing functionality). Upload sample, verify/correct, save. This is the "teach the AI" step done once.

3. **Upload Invoice** — drag-and-drop a PDF for this customer. Extracts using this customer's hints, then shows the Review/Edit form inline (same side-by-side layout). Submit to CartonCloud button right there.

4. **History** — table of all consignment drafts for this customer, showing: date, source (manual upload / inbound email), status (draft / submitted / failed), reference, and a link to view details.

## Activity Log Page (`/log`)

Global view across all customers:
- Date, Customer Name, Source, Status, Reference, Error (if failed)
- Filterable by customer, status, date range
- Powered by `consignment_drafts` table with additional columns

## Database Changes

### Update `consignment_drafts`
- Add `source` column (text, default `'manual'`) — values: `manual`, `email`
- Add `submitted_at` (timestamptz, nullable)
- Add `cc_response` (jsonb, nullable) — store CartonCloud API response
- Add `error_message` (text, nullable)
- Ensure `customer_profile_id` is always set for new drafts

### Drop standalone pages
- Remove `email_customer_mappings` dependency (email mapping is now just the inbound slug on the profile)
- The `email_customer_mappings` table can stay for now but is no longer the primary lookup

## Sidebar & Routing Changes

- `/` → redirect to `/profiles`
- `/profiles` → Customer list
- `/profiles/:id` → Customer detail (with tabs: Profile, Sample, Upload, History)
- `/profiles/new` → Create customer flow
- `/log` → Activity log
- `/settings` → Settings (unchanged)
- Remove `/review`, `/upload`, `/email-mappings` routes

## Implementation Order

1. **Database migration** — add `source`, `submitted_at`, `cc_response`, `error_message` to `consignment_drafts`
2. **Customer Detail page** — new page with tabbed layout containing Profile, Sample Mapping, Upload, and History sections
3. **Refactor Upload + Review into Customer Detail** — move the upload-and-review flow into the customer's "Upload Invoice" tab, pre-wired with that customer's profile
4. **Activity Log page** — new page querying `consignment_drafts` joined with `customer_profiles`
5. **Update sidebar and routing** — simplify navigation to Customers, Activity Log, Settings
6. **Remove orphaned pages** — clean up old Upload, Review, Email Mappings pages

## Technical Notes

- The side-by-side PDF viewer + editable extraction form is reused across Sample Mapping and Upload Invoice tabs — extract into a shared component
- Submit to CartonCloud happens inline on the Upload tab, storing the response in `consignment_drafts.cc_response`
- The History tab queries `consignment_drafts` filtered by `customer_profile_id`
- Activity Log is the same query without the customer filter

