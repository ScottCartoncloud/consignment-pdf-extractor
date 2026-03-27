import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { payload, draftId } = await req.json();
    if (!payload) throw new Error("payload is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("cc_api_base_url, cc_api_key")
      .limit(1)
      .single();

    if (settingsError || !settings?.cc_api_base_url || !settings?.cc_api_key) {
      throw new Error("CartonCloud API credentials not configured in settings");
    }

    const ccUrl = `${settings.cc_api_base_url.replace(/\/$/, "")}/consignments`;

    const ccResponse = await fetch(ccUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.cc_api_key}`,
      },
      body: JSON.stringify(payload),
    });

    const ccData = await ccResponse.json();

    if (!ccResponse.ok) {
      // Save as failed
      if (draftId) {
        await supabase
          .from("consignment_drafts")
          .update({ status: "failed", mapped_payload: payload })
          .eq("id", draftId);
      }
      throw new Error(ccData?.message || ccData?.error || `CartonCloud API error: ${ccResponse.status}`);
    }

    // Save as submitted
    if (draftId) {
      await supabase
        .from("consignment_drafts")
        .update({ status: "submitted", mapped_payload: payload })
        .eq("id", draftId);
    }

    return new Response(JSON.stringify({ success: true, consignment: ccData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("submit-consignment error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
