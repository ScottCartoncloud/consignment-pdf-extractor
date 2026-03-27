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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { payload, draftId, tenantId } = await req.json();
    if (!payload) throw new Error("payload is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Determine credentials source: tenant or legacy settings
    let ccUrl: string;
    let accessToken: string;

    if (tenantId) {
      // Use tenant-specific OAuth2 credentials
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .select("cc_api_base_url, cc_client_id, cc_client_secret, custom_field_schema")
        .eq("id", tenantId)
        .single();

      if (tenantError || !tenant?.cc_client_id || !tenant?.cc_client_secret) {
        throw new Error("Tenant CartonCloud credentials not configured");
      }

      // OAuth2 client credentials flow
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

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        throw new Error(`OAuth token request failed: ${tokenResponse.status} - ${errText}`);
      }

      const tokenData = await tokenResponse.json();
      accessToken = tokenData.access_token;
      ccUrl = `${tenant.cc_api_base_url.replace(/\/$/, "")}/consignments`;

      // Apply custom field mappings to payload
      const customFields = payload.customFields || {};
      const schema: any[] = (tenant.custom_field_schema as any[]) || [];

      if (Object.keys(customFields).length > 0 && schema.length > 0) {
        if (!payload.details) payload.details = {};
        if (!payload.properties) payload.properties = {};

        for (const field of schema) {
          const value = customFields[field.fieldName];
          if (value === undefined || value === "") continue;

          if (field.tab === "consignmentItem") {
            // Apply to each item
            if (payload.items) {
              for (const item of payload.items) {
                if (!item.properties) item.properties = {};
                item.properties[field.mappedField] = value;
              }
            }
          } else if (field.mappedField && field.mappedField.includes(".")) {
            setNestedValue(payload.details, field.mappedField, value);
          } else if (field.mappedField) {
            payload.properties[field.mappedField] = value;
          }
        }
      }

      // Remove customFields from payload before sending to CC
      delete payload.customFields;
    } else {
      // Legacy: use settings table
      const { data: settings, error: settingsError } = await supabase
        .from("settings")
        .select("cc_api_base_url, cc_api_key")
        .limit(1)
        .single();

      if (settingsError || !settings?.cc_api_base_url || !settings?.cc_api_key) {
        throw new Error("CartonCloud API credentials not configured in settings");
      }

      ccUrl = `${settings.cc_api_base_url.replace(/\/$/, "")}/consignments`;
      accessToken = settings.cc_api_key;
    }

    const ccResponse = await fetch(ccUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const ccData = await ccResponse.json();

    if (!ccResponse.ok) {
      if (draftId) {
        await supabase
          .from("consignment_drafts")
          .update({ status: "failed", mapped_payload: payload, error_message: ccData?.message || ccData?.error || `CartonCloud API error: ${ccResponse.status}` })
          .eq("id", draftId);
      }
      throw new Error(ccData?.message || ccData?.error || `CartonCloud API error: ${ccResponse.status}`);
    }

    if (draftId) {
      await supabase
        .from("consignment_drafts")
        .update({ status: "submitted", mapped_payload: payload, cc_response: ccData, submitted_at: new Date().toISOString() })
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
