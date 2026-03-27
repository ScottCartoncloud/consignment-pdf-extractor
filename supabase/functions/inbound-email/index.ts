import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
      .select("id, tenant_id, extraction_hints")
      .eq("inbound_email_slug", slug)
      .maybeSingle();

    if (!profile) {
      return new Response(JSON.stringify({ error: "no matching customer" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find first PDF attachment
    const pdfAttachment = (payload.Attachments || []).find(
      (a: any) => a.ContentType === "application/pdf"
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
    const hints = profile.extraction_hints || "";

    // Fetch tenant's custom field schema if tenantId provided
    let customFieldSchema: any[] = [];
    if (tenantId) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("custom_field_schema")
        .eq("id", tenantId)
        .maybeSingle();
      if (tenant?.custom_field_schema) {
        customFieldSchema = tenant.custom_field_schema as any[];
      }
    }

    // Build AI prompt (same logic as extract-consignment)
    let systemPrompt = `You are a consignment data extraction assistant. Given a PDF document, extract consignment/delivery information and return a JSON object matching this exact structure:

{
  "collectAddress": { "companyName": "", "address1": "", "suburb": "", "state": "", "postcode": "", "country": "Australia" },
  "deliverAddress": { "companyName": "", "contactName": "", "address1": "", "suburb": "", "state": "", "postcode": "", "country": "Australia", "instructions": "" },
  "items": [{ "description": "", "quantity": 0, "weight": 0, "length": 0, "width": 0, "height": 0, "pallets": 0, "spaces": 0 }],
  "references": { "customer": "" },
  "type": "DELIVERY",
  "fromEmail": ""
}

Rules:
- Extract all available fields from the document
- Use 0 for numeric fields if not found
- Use empty string for text fields if not found
- Default country to "Australia" if not specified
- Default type to "DELIVERY"
- Return ONLY valid JSON, no markdown or explanation`;

    if (hints) {
      systemPrompt += `\n\nAdditional context for this customer: ${hints}`;
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
                text: "Extract the consignment data from this PDF document and return it as JSON.",
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

    // Save draft with source "email"
    const { data: draft, error: draftError } = await supabase
      .from("consignment_drafts")
      .insert({
        raw_extraction: extracted,
        mapped_payload: extracted,
        status: "draft",
        source: "email",
        from_email: payload.From || "",
        customer_profile_id: customerProfileId,
      })
      .select()
      .single();

    if (draftError) console.error("Failed to save draft:", draftError);

    return new Response(JSON.stringify({ success: true, draftId: draft?.id }), {
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
