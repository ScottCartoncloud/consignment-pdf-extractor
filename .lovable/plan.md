

# Attach PDF to First Consignment Only

## Summary
When a consignment is submitted to CartonCloud, the source PDF will be uploaded as a document attachment — but only to the **first** consignment when multiple are created from a single PDF.

## Changes

### 1. `supabase/functions/submit-consignment/index.ts`
- Accept optional `pdfBase64` and `pdfFilename` in the request body
- After a successful consignment creation (when `ccData.id` exists), POST the PDF to:
  `{cc_api_base_url}/tenants/{cc_tenant_id}/consignments/{ccData.id}/documents`
- Payload: `{ "type": "CONSIGNMENT_INVOICE", "content": { "name": "filename.pdf", "data": "<base64>" } }`
- Wrap in try/catch — attachment failure logged but does not fail the submission
- Works for both tenant-based (OAuth2) and legacy credential paths

### 2. `supabase/functions/inbound-email/index.ts`
- The PDF base64 is already available from the email attachment
- After the **first** consignment in the loop is successfully submitted, attach the PDF using the same documents API call
- Skip attachment for subsequent consignments (use a boolean flag like `attachmentSent`)
- Wrap in try/catch so attachment failure doesn't affect other consignments

### 3. `src/pages/CustomerDetailPage.tsx`
- When calling `submit-consignment`, include the existing `pdfBase64` and `pdfFilename` in the payload
- Only pass PDF data for the first consignment if multiple are being submitted

### 4. `src/components/PdfExtractionViewer.tsx`
- Ensure the base64 data is accessible and passed through to the submit call (may already be available via props/state)

### 5. `src/types/consignment.ts`
- Add optional `pdfBase64?: string` and `pdfFilename?: string` to `ConsignmentPayload`

## Files Modified
- `supabase/functions/submit-consignment/index.ts`
- `supabase/functions/inbound-email/index.ts`
- `src/pages/CustomerDetailPage.tsx`
- `src/components/PdfExtractionViewer.tsx`
- `src/types/consignment.ts`

