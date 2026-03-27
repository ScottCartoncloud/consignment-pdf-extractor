# ConsignmentBuilder — Implementation Plan

## Overview

A single-page app for extracting consignment data from PDFs using AI, reviewing/editing the extracted data, and submitting to CartonCloud. Built with React/TypeScript frontend and Supabase backend.

## Supabase Setup

### Tables

1. **email_customer_mappings** — `id`, `from_email` (unique), `cc_customer_id`, `cc_customer_name`, `created_at`
2. **settings** — single-row config: `id`, `cc_api_base_url`, `cc_api_key`, `claude_api_key`
3. **consignment_drafts** — `id`, `raw_extraction` (jsonb), `mapped_payload` (jsonb), `status` (draft/submitted/failed), `from_email`, `created_at`

RLS disabled (single tenancy, no auth).

### Edge Functions

1. **extract-consignment** — Receives base64 PDF, reads Claude API key from settings table, calls Claude API with system prompt to extract consignment JSON, returns structured data.
2. **submit-consignment** — Receives confirmed payload, reads CC API credentials from settings table, POSTs to CartonCloud, saves draft with status, returns result.

## Pages & Navigation

Sidebar or top-nav with 4 sections: **Upload**, **Review**, **Email Mappings**, **Settings**.

### 1. Upload Page

- Drag-and-drop zone or file picker (PDF only)
- On upload: show spinner/processing state, send base64 PDF to `extract-consignment` edge function
- On success: navigate to Review page with extracted data
- On error: show error toast

### 2. Review Page

- **From Email** field at top — on change/blur, lookup `email_customer_mappings`:
  - Match found → auto-fill customer name, show CC Customer ID as read-only badge
  - No match → warning banner, allow manual entry of customer name
- **Collect Address** section — editable fields: companyName, address1, suburb, state, postcode, country
- **Deliver Address** section — same fields + contactName, instructions
- **Items** table — editable rows with add/remove. Columns: description, quantity, weight, L/W/H, pallets, spaces
- **References** section — customer reference field
- **Type** field (defaulting to "DELIVERY")
- **Submit to CartonCloud** button → calls `submit-consignment` edge function
  - Success: save draft as `submitted`, show success with CC consignment ID
  - Failure: save draft as `failed`, show error message

### 3. Email Mappings Page

- CRUD table for `email_customer_mappings`
- Columns: From Email, CC Customer Name, CC Customer ID
- Add new / edit inline / delete with confirmation

### 4. Settings Page

- Form fields: CC API Base URL, CC API Key (masked input), Claude API Key (masked input)
- Save button — upserts single row in settings table

## UI Design

- Clean, professional layout using shadcn/ui components (Card, Table, Input, Button, Badge, Tabs)
- Responsive but desktop-first
- Toast notifications for success/error states