import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, tab, mediaType } = await req.json();
    if (!imageBase64) throw new Error("imageBase64 is required");
    if (!tab || !["consignmentData", "consignmentItem"].includes(tab)) {
      throw new Error("tab must be 'consignmentData' or 'consignmentItem'");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a data extraction assistant. Given a screenshot of a CartonCloud custom fields configuration table, extract each row into a JSON array.

Each row should become an object with these fields:
- "name": the display name of the custom field
- "shortName": the short name / abbreviation
- "fieldType": the field type (e.g. "Text", "Number", "Select", etc.)
- "fieldName": the internal field name / key
- "mappedField": the mapped field path (e.g. "details.serviceType" or just the field name)
- "tab": "${tab}"

Return ONLY a valid JSON array, no markdown or explanation. If no fields are found, return an empty array [].`;

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
                image_url: { url: `data:image/png;base64,${imageBase64}` },
              },
              {
                type: "text",
                text: "Extract the custom fields from this CartonCloud screenshot and return them as a JSON array.",
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

    let fields;
    try {
      const jsonMatch = textContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                         textContent.match(/```\s*([\s\S]*?)\s*```/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : textContent);
      // Handle both array and { fields: [...] } responses
      fields = Array.isArray(parsed) ? parsed : (parsed.fields || parsed.data || []);
      // Ensure tab is set on each field
      fields = fields.map((f: any) => ({ ...f, tab }));
    } catch {
      throw new Error("Failed to parse AI response as JSON");
    }

    return new Response(JSON.stringify({ fields }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-custom-fields error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
