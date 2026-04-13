import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function setNestedValue(obj: any, path: string, value: any) {
  const keys = path.split(".");
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

const normalizeStateName = (value: string | undefined) => {
  if (!value) return undefined;
  const raw = value.trim();
  const upper = raw.toUpperCase();
  const map: Record<string, string> = {
    NSW: "New South Wales",
    VIC: "Victoria",
    QLD: "Queensland",
    SA: "South Australia",
    WA: "Western Australia",
    TAS: "Tasmania",
    NT: "Northern Territory",
    ACT: "Australian Capital Territory",
  };
  return map[upper] || raw;
};

const toAddressObj = (addr: any, fallbackCompanyName = "", defaultCountry = "Australia") => {
  const stateName = normalizeStateName(addr?.state);
  return {
    companyName: addr?.companyName?.trim() || addr?.contactName?.trim() || fallbackCompanyName,
    address1: addr?.address1 || "",
    suburb: addr?.suburb || "",
    ...(stateName ? { state: { name: stateName } } : {}),
    postcode: addr?.postcode || "",
    country: { name: addr?.country || defaultCountry },
  };
};

function applyCustomFieldMappings(submissionPayload: any, customFieldSchema: any[]) {
  const customFields = submissionPayload.customFields || {};
  if (Object.keys(customFields).length > 0 && customFieldSchema.length > 0) {
    if (!submissionPayload.details) submissionPayload.details = {};
    if (!submissionPayload.properties) submissionPayload.properties = {};

    for (const field of customFieldSchema) {
      const dontSend = field.dontSend ?? (field.mappedField && field.mappedField.includes("serviceType"));
      if (dontSend) continue;

      const value = customFields[field.fieldName];
      if (value === undefined || value === "") continue;

      if (field.tab === "consignmentItem") {
        if (submissionPayload.items) {
          for (const item of submissionPayload.items) {
            if (!item.properties) item.properties = {};
            item.properties[field.mappedField] = value;
          }
        }
      } else if (field.mappedField && field.mappedField.includes(".")) {
        setNestedValue(submissionPayload.details, field.mappedField, value);
      } else if (field.mappedField) {
        submissionPayload.properties[field.mappedField] = value;
      }
    }
  }
  delete submissionPayload.customFields;
}

function buildCcPayload(entity: any, ccCustomerId: string, customFieldSchema: any[], defaultCountry: string, entityType: string) {
  const submissionPayload = { ...entity };
  applyCustomFieldMappings(submissionPayload, customFieldSchema);

  if (entityType === "sale_order") {
    return {
      type: "OUTBOUND",
      references: { customer: submissionPayload.references?.customer || "" },
      customer: { id: ccCustomerId },
      details: {
        deliver: {
          address: toAddressObj(submissionPayload.deliverAddress, "Delivery Address", defaultCountry),
          requiredDate: submissionPayload.deliverRequiredDate || undefined,
          instructions: submissionPayload.instructions || "",
        },
        collect: { requiredDate: submissionPayload.collectRequiredDate || undefined },
        instructions: submissionPayload.instructions || "",
      },
      properties: submissionPayload.properties || {},
      items: (submissionPayload.items || []).map((item: any) => ({
        details: {
          product: { references: { code: item.code } },
          unitOfMeasure: { type: item.unitOfMeasure || "UNITS" },
        },
        measures: { quantity: item.quantity || 0 },
        properties: item.properties || {},
      })),
      ...(submissionPayload.warehouse ? { warehouse: { name: submissionPayload.warehouse } } : {}),
    };
  }

  if (entityType === "purchase_order") {
    return {
      type: "INBOUND",
      references: { customer: submissionPayload.references?.customer || "" },
      customer: { id: ccCustomerId },
      details: {
        arrivalDate: submissionPayload.arrivalDate || undefined,
        instructions: submissionPayload.instructions || "",
      },
      properties: submissionPayload.properties || {},
      items: (submissionPayload.items || []).map((item: any) => ({
        details: {
          product: { references: { code: item.code } },
          unitOfMeasure: { type: item.unitOfMeasure || "UNITS" },
        },
        measures: { quantity: item.quantity || 0 },
        properties: {
          ...(item.batch ? { batch: item.batch } : {}),
          ...(item.expiryDate ? { expiryDate: item.expiryDate } : {}),
          ...(item.properties || {}),
        },
      })),
      ...(submissionPayload.warehouse ? { warehouse: { name: submissionPayload.warehouse } } : {}),
    };
  }

  // Consignment (default)
  return {
    references: { customer: submissionPayload.references?.customer || "" },
    customer: { id: ccCustomerId },
    details: {
      collect: { address: toAddressObj(submissionPayload.collectAddress, "Collect Address", defaultCountry) },
      deliver: {
        address: toAddressObj(submissionPayload.deliverAddress, "Delivery Address", defaultCountry),
        instructions: submissionPayload.deliverAddress?.instructions || "",
        ...(submissionPayload.requiredDate ? { requiredDate: submissionPayload.requiredDate } : {}),
      },
      type: submissionPayload.type || "DELIVERY",
      ...submissionPayload.details,
    },
    properties: submissionPayload.properties || {},
    items: (submissionPayload.items || []).map((item: any) => ({
      properties: {
        description: item.description || "",
        ...(item.properties || {}),
      },
      measures: {
        quantity: item.quantity || 0,
        weight: item.weight || 0,
        pallets: item.pallets || 0,
        spaces: item.spaces || 0,
        cubic: item.length && item.width && item.height
          ? parseFloat(((item.length * item.width * item.height) / 1000000 * item.quantity).toFixed(3))
          : 0,
      },
      ...(item.code ? { details: { product: { references: { code: item.code } } } } : {}),
    })),
  };
}

// --- System prompt builders ---

function buildConsignmentPrompt(defaultCountry: string) {
  return `You are a consignment data extraction assistant. Given a PDF document, extract consignment/delivery information and return a JSON object matching this exact structure:

{
  "collectAddress": { "companyName": "", "address1": "", "suburb": "", "state": "", "postcode": "", "country": "" },
  "deliverAddress": { "companyName": "", "contactName": "", "address1": "", "suburb": "", "state": "", "postcode": "", "country": "", "instructions": "" },
  "items": [{ "description": "", "quantity": 0, "weight": 0, "length": 0, "width": 0, "height": 0, "pallets": 0, "spaces": 0 }],
  "references": { "customer": "" },
  "type": "DELIVERY",
  "fromEmail": "",
  "requiredDate": ""
}

Rules:
- Extract all available fields from the document
- Use 0 for numeric fields if not found
- Use empty string for text fields if not found
- Infer the country from context (address, state, postcode). If the country cannot be determined, default to "${defaultCountry}"
- Default type to "DELIVERY"
- Extract the required delivery date if present. Format as YYYY-MM-DD. Use empty string if not found.
- Return ONLY valid JSON, no markdown or explanation

If the document contains multiple separate consignments (e.g. multiple delivery dockets or order references on separate pages), return them as:
{ "consignments": [ {...}, {...} ] }
where each item matches the single consignment structure above.
If there is only one consignment, return the single object as before with no wrapper.`;
}

function buildSaleOrderPrompt(defaultCountry: string) {
  return `You are a sale order data extraction assistant. Given a PDF document, extract sale order information and return a JSON object matching this exact structure:

{
  "references": { "customer": "" },
  "deliverAddress": { "companyName": "", "contactName": "", "address1": "", "suburb": "", "state": "", "postcode": "", "country": "", "instructions": "" },
  "items": [{ "code": "", "description": "", "quantity": 0, "unitOfMeasure": "UNITS" }],
  "deliverRequiredDate": "",
  "collectRequiredDate": "",
  "instructions": "",
  "warehouse": ""
}

Rules:
- Extract all available fields from the document
- For references.customer, extract the sale order number, SO number, or primary order reference
- For items, always extract the product code/SKU/item number into "code". This is required.
- Use "UNITS" as the default unitOfMeasure unless the document specifies otherwise (e.g. CASES, PALLETS, CARTONS, EACH)
- Use 0 for numeric fields if not found
- Use empty string for text fields if not found
- Infer the country from context. If not determinable, default to "${defaultCountry}"
- Format dates as YYYY-MM-DD. Use empty string if not found.
- deliverRequiredDate is the delivery due date or required date
- collectRequiredDate is the ship date or collection date
- Return ONLY valid JSON, no markdown or explanation

If the document contains multiple separate sale orders, return them as:
{ "orders": [ {...}, {...} ] }
If there is only one, return the single object with no wrapper.`;
}

function buildPurchaseOrderPrompt(defaultCountry: string) {
  return `You are a purchase order data extraction assistant. Given a PDF document, extract purchase order / inbound order information and return a JSON object matching this exact structure:

{
  "references": { "customer": "" },
  "items": [{ "code": "", "description": "", "quantity": 0, "unitOfMeasure": "UNITS", "batch": "", "expiryDate": "" }],
  "arrivalDate": "",
  "instructions": "",
  "warehouse": ""
}

Rules:
- Extract all available fields from the document
- For references.customer, extract the PO number, job number, or primary order reference
- For items, always extract the product code/SKU/item number into "code". This is required.
- Use "UNITS" as the default unitOfMeasure unless the document specifies otherwise (e.g. CASES, PALLETS, CARTONS, EACH)
- Extract batch numbers and expiry dates per item if present, empty string if not
- Use 0 for numeric fields if not found
- Use empty string for text fields if not found
- Format dates as YYYY-MM-DD. Use empty string if not found.
- arrivalDate is the expected arrival, delivery, or scheduled date for the goods
- Return ONLY valid JSON, no markdown or explanation

If the document contains multiple separate purchase orders, return them as:
{ "orders": [ {...}, {...} ] }
If there is only one, return the single object with no wrapper.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();

    // Extract slug from TO address
    const toEmail: string = payload.ToFull?.[0]?.Email || "";
    const slug = toEmail.split("@")[0];
    if (!slug) {
      return new Response(JSON.stringify({ error: "no TO address" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up customer profile by slug
    const { data: profile } = await supabase
      .from("customer_profiles")
      .select("id, tenant_id, extraction_hints, cc_customer_id, map_item_codes, entity_type")
      .eq("inbound_email_slug", slug)
      .maybeSingle();

    if (!profile) {
      return new Response(JSON.stringify({ error: "no matching customer" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find first PDF attachment (by ContentType or file extension)
    const pdfAttachment = (payload.Attachments || []).find(
      (a: any) => a.ContentType === "application/pdf" ||
        a.Name?.toLowerCase().endsWith(".pdf")
    );
    if (!pdfAttachment) {
      return new Response(JSON.stringify({ error: "no PDF attachment" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pdfBase64 = pdfAttachment.Content;
    const customerProfileId = profile.id;
    const tenantId = profile.tenant_id;
    const ccCustomerId = profile.cc_customer_id;
    const hints = profile.extraction_hints || "";
    const mapItemCodes = profile.map_item_codes ?? false;
    const entityType = (profile as any).entity_type || "consignment";

    // Fetch tenant data (credentials + custom field schema)
    let tenant: any = null;
    let customFieldSchema: any[] = [];
    let defaultCountry = "Australia";
    if (tenantId) {
      const { data } = await supabase
        .from("tenants")
        .select("cc_api_base_url, cc_client_id, cc_client_secret, cc_tenant_id, custom_field_schema")
        .eq("id", tenantId)
        .maybeSingle();
      tenant = data;
      if (tenant?.custom_field_schema) {
        customFieldSchema = tenant.custom_field_schema as any[];
      }
      if (tenant?.cc_api_base_url) {
        if (tenant.cc_api_base_url.includes("api.na.cartoncloud")) {
          defaultCountry = "United States";
        } else if (tenant.cc_api_base_url.includes("api.cartoncloud")) {
          defaultCountry = "Australia";
        }
      }
    }

    // Build AI prompt based on entity type
    let systemPrompt: string;
    let userMessage: string;
    if (entityType === "sale_order") {
      systemPrompt = buildSaleOrderPrompt(defaultCountry);
      userMessage = "Extract the sale order data from this PDF document and return it as JSON.";
    } else if (entityType === "purchase_order") {
      systemPrompt = buildPurchaseOrderPrompt(defaultCountry);
      userMessage = "Extract the purchase order data from this PDF document and return it as JSON.";
    } else {
      systemPrompt = buildConsignmentPrompt(defaultCountry);
      userMessage = "Extract the consignment data from this PDF document and return it as JSON.";
    }

    if (hints) {
      systemPrompt += `\n\nAdditional context for this customer: ${hints}`;
    }

    // map_item_codes only applies to consignment entity type
    if (entityType === "consignment" && mapItemCodes) {
      systemPrompt += `\n\nFor each item, also extract the product code or SKU reference from the PDF (e.g. a "Code", "SKU", "Product Code" or similar column) and include it as a "code" field on each item object:
{ "description": "", "code": "", "quantity": 0, ... }
If no code is found for an item, use an empty string.`;
    }

    if (customFieldSchema.length > 0) {
      const fieldList = customFieldSchema.map((f: any) =>
        `- "${f.name}" (${f.fieldType}) → mappedField: "${f.mappedField}", fieldName: "${f.fieldName}"`
      ).join("\n");

      systemPrompt += `\n\nAdditionally, extract these custom fields if present in the document:
${fieldList}

Return them in a "customFields" object on the response, keyed by fieldName:
{ "customFields": { "fieldName1": "value1", "fieldName2": "value2" } }`;
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${pdfBase64}` },
              },
              {
                type: "text",
                text: userMessage,
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const textContent = aiData.choices?.[0]?.message?.content;
    if (!textContent) throw new Error("No response from AI");

    let extracted;
    try {
      const jsonMatch = textContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                         textContent.match(/```\s*([\s\S]*?)\s*```/);
      extracted = JSON.parse(jsonMatch ? jsonMatch[1] : textContent);
    } catch {
      throw new Error("Failed to parse AI response as JSON");
    }

    // Normalize to array based on entity type
    let entities: any[];
    if (entityType === "consignment") {
      const isMultiple = extracted.consignments && Array.isArray(extracted.consignments);
      entities = isMultiple ? extracted.consignments : [extracted];
    } else {
      const isMultiple = extracted.orders && Array.isArray(extracted.orders);
      entities = isMultiple ? extracted.orders : [extracted];
    }

    // Obtain OAuth token once
    let accessToken: string | null = null;
    let baseApiUrl = "";
    if (tenant && tenant.cc_client_id && tenant.cc_client_secret) {
      const tokenUrl = `${tenant.cc_api_base_url.replace(/\/$/, "")}/uaa/oauth/token`;
      const basicAuth = btoa(`${tenant.cc_client_id}:${tenant.cc_client_secret}`);
      const tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        accessToken = tokenData.access_token;
        baseApiUrl = `${tenant.cc_api_base_url.replace(/\/$/, "")}/tenants/${tenant.cc_tenant_id}`;
      } else {
        console.error("OAuth token request failed:", tokenResponse.status);
      }
    }

    // Determine CC API endpoint based on entity type
    let ccEntityPath: string;
    if (entityType === "sale_order") {
      ccEntityPath = "outbound-orders";
    } else if (entityType === "purchase_order") {
      ccEntityPath = "inbound-orders";
    } else {
      ccEntityPath = "consignments";
    }
    const ccUrl = baseApiUrl ? `${baseApiUrl}/${ccEntityPath}` : "";

    // Process each entity independently — attach PDF to first only
    const results: any[] = [];
    let attachmentSent = false;
    for (const entity of entities) {
      try {
        // Save draft with source "email"
        const { data: draft, error: draftError } = await supabase
          .from("consignment_drafts")
          .insert({
            raw_extraction: entity,
            mapped_payload: entity,
            status: "draft",
            source: "email",
            from_email: payload.From || "",
            customer_profile_id: customerProfileId,
            entity_type: entityType,
          })
          .select()
          .single();

        if (draftError) {
          console.error("Failed to save draft:", draftError);
          results.push({ status: "failed", error: "Failed to save draft" });
          continue;
        }

        const draftId = draft.id;

        if (!accessToken || !ccUrl) {
          await supabase
            .from("consignment_drafts")
            .update({ status: "failed", error_message: "Tenant CartonCloud credentials not configured or OAuth failed" })
            .eq("id", draftId);
          results.push({ draftId, status: "failed", error: "No credentials" });
          continue;
        }

        // Build and submit CC payload
        const ccPayload = buildCcPayload(entity, ccCustomerId, customFieldSchema, defaultCountry, entityType);

        const ccResponse = await fetch(ccUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "Accept-Version": "1",
          },
          body: JSON.stringify(ccPayload),
        });

        const ccText = await ccResponse.text();
        let ccData: any;
        try { ccData = JSON.parse(ccText); } catch { ccData = { rawBody: ccText }; }

        console.log("CC response status:", ccResponse.status, "for draft:", draftId);

        if (!ccResponse.ok) {
          const errorDetail = typeof ccData === "object" ? JSON.stringify(ccData) : ccText;
          await supabase
            .from("consignment_drafts")
            .update({ status: "failed", mapped_payload: ccPayload, error_message: errorDetail.slice(0, 2000) })
            .eq("id", draftId);
          results.push({ draftId, status: "failed", error: "CartonCloud submission failed" });
        } else {
          await supabase
            .from("consignment_drafts")
            .update({ status: "submitted", mapped_payload: ccPayload, cc_response: ccData, submitted_at: new Date().toISOString() })
            .eq("id", draftId);

          // Attach PDF to first successfully submitted entity (skip for purchase orders)
          if (!attachmentSent && ccData?.id && tenant && entityType !== "purchase_order") {
            try {
              const docType = entityType === "sale_order" ? "OUTBOUND_ORDER_INVOICE" : "CONSIGNMENT_INVOICE";
              const docUrl = `${baseApiUrl}/${ccEntityPath}/${ccData.id}/documents`;
              const docPayload = {
                type: docType,
                content: {
                  name: pdfAttachment.Name || "document.pdf",
                  data: pdfBase64,
                },
              };
              const docResponse = await fetch(docUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${accessToken}`,
                  "Accept-Version": "1",
                },
                body: JSON.stringify(docPayload),
              });
              console.log("Document attachment response:", docResponse.status, "for entity:", ccData.id);
              if (!docResponse.ok) {
                const docErr = await docResponse.text();
                console.error("Failed to attach PDF document:", docErr);
              }
              attachmentSent = true;
            } catch (docError) {
              console.error("Error attaching PDF document:", docError);
            }
          }

          results.push({ draftId, status: "submitted" });
        }
      } catch (entityErr) {
        console.error("Error processing entity:", entityErr);
        results.push({ status: "failed", error: entityErr instanceof Error ? entityErr.message : "Unknown error" });
      }
    }

    return new Response(JSON.stringify({ success: true, count: entities.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("inbound-email error:", e);
    // Always return 200 to prevent Postmark retries
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
