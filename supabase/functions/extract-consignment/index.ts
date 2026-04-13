import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  return `You are a sale order data extraction assistant. Given a PDF document, extract sale order information and return a JSON object matching this EXACT structure:

{
  "references": { "customer": "" },
  "deliverAddress": { "companyName": "", "contactName": "", "address1": "", "suburb": "", "state": "", "postcode": "", "country": "", "instructions": "" },
  "items": [{ "code": "", "description": "", "quantity": 0, "unitOfMeasure": "UNITS" }],
  "deliverRequiredDate": "",
  "collectRequiredDate": "",
  "instructions": "",
  "warehouse": ""
}

CRITICAL: Return EXACTLY the JSON structure shown above. Do not attempt to build a CartonCloud API payload. Do not nest data under "details", "customer", "measures", or "properties". Use the flat structure shown above with top-level keys only.

Rules:
- The "deliverAddress" object is REQUIRED. Extract the ship-to / delivery address from the document and populate all address fields (companyName, address1, suburb, state, postcode, country). Do not skip this even if the address seems incomplete.
- For references.customer, extract the sale order number, SO number, or primary order reference
- Items must be a flat array with "code", "description", "quantity", "unitOfMeasure" at the top level of each item object. Do not nest under details/measures/properties.
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
  return `You are a purchase order data extraction assistant. Given a PDF document, extract purchase order / inbound order information and return a JSON object matching this EXACT structure:

{
  "references": { "customer": "" },
  "items": [{ "code": "", "description": "", "quantity": 0, "unitOfMeasure": "UNITS", "batch": "", "expiryDate": "" }],
  "arrivalDate": "",
  "instructions": "",
  "warehouse": ""
}

CRITICAL: Return EXACTLY the JSON structure shown above. Do not attempt to build a CartonCloud API payload. Do not nest data under "details", "customer", "measures", or "properties". Use the flat structure shown above with top-level keys only.

Rules:
- For references.customer, extract the PO number, job number, or primary order reference
- Items must be a flat array with "code", "description", "quantity", "unitOfMeasure", "batch", "expiryDate" at the top level of each item object. Do not nest under details/measures/properties.
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

// Normalize a sale order extraction if the AI returned a CC API-shaped payload
// instead of the flat intermediate structure we asked for
function normalizeSaleOrder(entity: any): any {
  // If it already has deliverAddress at top level with actual data, it's probably fine
  if (entity.deliverAddress && entity.deliverAddress.companyName) {
    // Still normalize items in case they're nested
    if (entity.items) {
      entity.items = entity.items.map(normalizeItem);
    }
    return entity;
  }

  const normalized: any = {
    references: entity.references || { customer: "" },
    deliverAddress: { companyName: "", contactName: "", address1: "", suburb: "", state: "", postcode: "", country: "", instructions: "" },
    items: [],
    deliverRequiredDate: entity.deliverRequiredDate || "",
    collectRequiredDate: entity.collectRequiredDate || "",
    instructions: entity.instructions || "",
    warehouse: entity.warehouse?.name || entity.warehouse || "",
    customFields: entity.customFields || undefined,
  };

  // Unwrap deliver address from details.deliver.address
  const deliverAddr = entity.details?.deliver?.address;
  if (deliverAddr) {
    normalized.deliverAddress = {
      companyName: deliverAddr.companyName || "",
      contactName: deliverAddr.contactName || "",
      address1: deliverAddr.address1 || "",
      suburb: deliverAddr.suburb || "",
      state: typeof deliverAddr.state === "object" ? deliverAddr.state?.name || "" : deliverAddr.state || "",
      postcode: deliverAddr.postcode || "",
      country: typeof deliverAddr.country === "object" ? deliverAddr.country?.name || "" : deliverAddr.country || "",
      instructions: deliverAddr.instructions || entity.details?.deliver?.instructions || "",
    };
  }

  // Unwrap dates
  if (!normalized.deliverRequiredDate) {
    normalized.deliverRequiredDate = entity.details?.deliver?.requiredDate || "";
  }
  if (!normalized.collectRequiredDate) {
    normalized.collectRequiredDate = entity.details?.collect?.requiredDate || "";
  }

  // Unwrap instructions
  if (!normalized.instructions) {
    normalized.instructions = entity.details?.instructions || entity.details?.deliver?.instructions || "";
  }

  // Unwrap references
  if (entity.references?.customer) {
    normalized.references.customer = entity.references.customer;
  }

  // Normalize items from nested CC API shape to flat shape
  if (entity.items && Array.isArray(entity.items)) {
    normalized.items = entity.items.map(normalizeItem);
  }

  return normalized;
}

// Normalize a purchase order extraction if the AI returned a CC API-shaped payload
function normalizePurchaseOrder(entity: any): any {
  // If items already have flat "code" field, it's probably fine
  const firstItem = entity.items?.[0];
  if (firstItem && typeof firstItem.code === "string" && !firstItem.details) {
    return entity;
  }

  const normalized: any = {
    references: entity.references || { customer: "" },
    items: [],
    arrivalDate: entity.arrivalDate || "",
    instructions: entity.instructions || "",
    warehouse: entity.warehouse?.name || entity.warehouse || "",
    customFields: entity.customFields || undefined,
  };

  // Unwrap arrivalDate from details
  if (!normalized.arrivalDate) {
    normalized.arrivalDate = entity.details?.arrivalDate || "";
  }

  // Unwrap instructions from details
  if (!normalized.instructions) {
    normalized.instructions = entity.details?.instructions || "";
  }

  // Normalize items
  if (entity.items && Array.isArray(entity.items)) {
    normalized.items = entity.items.map((item: any) => {
      const flat = normalizeItem(item);
      // Also handle PO-specific fields
      flat.batch = item.batch || item.properties?.batch || "";
      flat.expiryDate = item.expiryDate || item.properties?.expiryDate || "";
      return flat;
    });
  }

  return normalized;
}

// Normalize a single item from potentially nested CC API shape to flat shape
function normalizeItem(item: any): any {
  // Already flat
  if (typeof item.code === "string" && typeof item.quantity === "number" && !item.details && !item.measures) {
    return item;
  }

  return {
    code: item.code || item.details?.product?.references?.code || "",
    description: item.description || item.properties?.description || "",
    quantity: item.quantity ?? item.measures?.quantity ?? 0,
    unitOfMeasure: item.unitOfMeasure || item.details?.unitOfMeasure?.type || "UNITS",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { pdfBase64, customerProfileId, extractionHints, tenantId, entityType: rawEntityType } = await req.json();
    if (!pdfBase64) throw new Error("pdfBase64 is required");

    const entityType = rawEntityType || "consignment";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch extraction hints and map_item_codes from profile if provided
    let hints = extractionHints || "";
    let mapItemCodes = false;
    if (customerProfileId) {
      const { data: profile } = await supabase
        .from("customer_profiles")
        .select("extraction_hints, map_item_codes")
        .eq("id", customerProfileId)
        .maybeSingle();
      if (profile) {
        if (!hints && profile.extraction_hints) hints = profile.extraction_hints;
        mapItemCodes = profile.map_item_codes ?? false;
      }
    }

    // Fetch tenant's custom field schema and API base URL if tenantId provided
    let customFieldSchema: any[] = [];
    let defaultCountry = "Australia";
    if (tenantId) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("custom_field_schema, cc_api_base_url")
        .eq("id", tenantId)
        .maybeSingle();
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

    // Select system prompt based on entity type
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

    // Inject custom field schema into prompt
    if (customFieldSchema.length > 0) {
      const fieldList = customFieldSchema.map((f: any) =>
        `- "${f.name}" (${f.fieldType}) → mappedField: "${f.mappedField}", fieldName: "${f.fieldName}"`
      ).join("\n");

      systemPrompt += `\n\nAdditionally, extract these custom fields if present in the document:
${fieldList}

Return them in a "customFields" object on the response, keyed by fieldName:
{ "customFields": { "fieldName1": "value1", "fieldName2": "value2" } }`;
    }

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
      if (aiResponse.status === 429) throw new Error("Rate limit exceeded. Please try again in a moment.");
      if (aiResponse.status === 402) throw new Error("AI credits exhausted. Please add funds in Settings > Workspace > Usage.");
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
      // sale_order and purchase_order use "orders" wrapper
      const isMultiple = extracted.orders && Array.isArray(extracted.orders);
      entities = isMultiple ? extracted.orders : [extracted];
    }

    // Normalize entities to expected flat structure if AI returned CC API-shaped payload
    entities = entities.map((entity: any) => {
      if (entityType === "sale_order") {
        return normalizeSaleOrder(entity);
      } else if (entityType === "purchase_order") {
        return normalizePurchaseOrder(entity);
      }
      return entity;
    });

    // Save drafts only for real uploads (when customerProfileId is provided)
    const draftIds: string[] = [];
    if (customerProfileId) {
      for (const entity of entities) {
        const { data, error: draftError } = await supabase
          .from("consignment_drafts")
          .insert({
            raw_extraction: entity,
            mapped_payload: entity,
            status: "draft",
            from_email: entity.fromEmail || "",
            customer_profile_id: customerProfileId,
            entity_type: entityType,
          })
          .select()
          .single();

        if (draftError) {
          console.error("Failed to save draft:", draftError);
        } else if (data) {
          draftIds.push(data.id);
        }
      }
    }

    // Build response with backward compatibility
    const response: any = {
      extractions: entities,
      draftIds,
      count: entities.length,
    };

    // Backward compat: if single entity, also include top-level extraction/draftId
    if (entities.length === 1) {
      response.extraction = entities[0];
      response.draftId = draftIds[0] || null;
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-consignment error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
