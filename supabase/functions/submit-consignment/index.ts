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
    const { payload, draftId, tenantId, pdfBase64, pdfFilename } = await req.json();
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
        .select("cc_api_base_url, cc_client_id, cc_client_secret, cc_tenant_id, custom_field_schema")
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
      ccUrl = `${tenant.cc_api_base_url.replace(/\/$/, "")}/tenants/${tenant.cc_tenant_id}/consignments`;

      // Apply custom field mappings to payload
      const customFields = payload.customFields || {};
      const schema: any[] = (tenant.custom_field_schema as any[]) || [];

      if (Object.keys(customFields).length > 0 && schema.length > 0) {
        if (!payload.details) payload.details = {};
        if (!payload.properties) payload.properties = {};

        for (const field of schema) {
          // Skip fields marked as "don't send" (default true for serviceType)
          const dontSend = field.dontSend ?? (field.mappedField && field.mappedField.includes("serviceType"));
          if (dontSend) continue;

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

    // Transform internal payload to CartonCloud API format
    // CC expects state/country as reference objects and companyName to be non-empty.
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

    const toAddressObj = (addr: any, fallbackCompanyName = "") => {
      const stateName = normalizeStateName(addr?.state);
      return {
        companyName: addr?.companyName?.trim() || addr?.contactName?.trim() || fallbackCompanyName,
        address1: addr?.address1 || "",
        suburb: addr?.suburb || "",
        ...(stateName ? { state: { name: stateName } } : {}),
        postcode: addr?.postcode || "",
        country: { name: addr?.country || "Australia" },
      };
    };

    const ccPayload = {
      references: {
        customer: payload.references?.customer || "",
      },
      customer: {
        id: payload.ccCustomerId,
      },
      details: {
        collect: {
          address: toAddressObj(payload.collectAddress, "Collect Address"),
        },
        deliver: {
          address: toAddressObj(payload.deliverAddress, "Delivery Address"),
          instructions: payload.deliverAddress?.instructions || "",
          ...(payload.requiredDate ? { requiredDate: payload.requiredDate } : {}),
        },
        type: payload.type || "DELIVERY",
        ...payload.details,
      },
      properties: payload.properties || {},
      items: (payload.items || []).map((item: any) => ({
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
        ...(item.code ? {
          details: {
            product: {
              references: { code: item.code }
            }
          }
        } : {}),
      })),
    };

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

    console.log("CC response status:", ccResponse.status);
    console.log("CC response body:", ccText);
    console.log("CC request payload:", JSON.stringify(ccPayload, null, 2));

    if (!ccResponse.ok) {
      const errorDetail = typeof ccData === "object" ? JSON.stringify(ccData) : ccText;
      if (draftId) {
        await supabase
          .from("consignment_drafts")
          .update({ status: "failed", mapped_payload: ccPayload, error_message: errorDetail.slice(0, 2000) })
          .eq("id", draftId);
      }
      throw new Error(`CartonCloud API error ${ccResponse.status}: ${errorDetail.slice(0, 500)}`);
    }

    if (draftId) {
      await supabase
        .from("consignment_drafts")
        .update({ status: "submitted", mapped_payload: ccPayload, cc_response: ccData, submitted_at: new Date().toISOString() })
        .eq("id", draftId);
    }

    // Attach PDF document to the consignment if provided
    if (pdfBase64 && ccData?.id && tenantId) {
      try {
        const { data: tenantForDoc } = await supabase
          .from("tenants")
          .select("cc_api_base_url, cc_tenant_id")
          .eq("id", tenantId)
          .single();

        if (tenantForDoc) {
          const docUrl = `${tenantForDoc.cc_api_base_url.replace(/\/$/, "")}/tenants/${tenantForDoc.cc_tenant_id}/consignments/${ccData.id}/documents`;
          const docPayload = {
            type: "CONSIGNMENT_INVOICE",
            content: {
              name: pdfFilename || "consignment.pdf",
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
          console.log("Document attachment response:", docResponse.status);
          if (!docResponse.ok) {
            const docErr = await docResponse.text();
            console.error("Failed to attach PDF document:", docErr);
          }
        }
      } catch (docError) {
        console.error("Error attaching PDF document:", docError);
      }
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
