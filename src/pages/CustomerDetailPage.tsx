import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ConsignmentPayload } from "@/types/consignment";
import PdfExtractionViewer from "@/components/PdfExtractionViewer";
import {
  ArrowLeft, Loader2, Copy, CheckCircle2, Lightbulb, RefreshCw, Send,
} from "lucide-react";

interface CustomerProfile {
  id: string;
  customer_name: string;
  cc_customer_id: string;
  inbound_email_slug: string;
  extraction_hints: string | null;
  sample_extraction: any;
  tenant_id: string | null;
  created_at: string;
}

interface DraftRow {
  id: string;
  status: string;
  source: string;
  created_at: string;
  from_email: string | null;
  error_message: string | null;
  mapped_payload: any;
}

interface TenantOption {
  id: string;
  name: string;
}

interface CustomFieldDef {
  name: string;
  shortName: string;
  fieldType: string;
  fieldName: string;
  mappedField: string;
  tab: string;
}

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const CustomerDetailPage = () => {
  const { id, tenantId } = useParams<{ id: string; tenantId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isNew = id === "new";

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [form, setForm] = useState({ customer_name: "", cc_customer_id: "", inbound_email_slug: "", extraction_hints: "", tenant_id: tenantId || "" });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [customFieldSchema, setCustomFieldSchema] = useState<CustomFieldDef[]>([]);

  // Sample mapping state
  const [sampleExtraction, setSampleExtraction] = useState<ConsignmentPayload | null>(null);
  const [samplePdfUrl, setSamplePdfUrl] = useState<string | null>(null);
  const [sampleBase64, setSampleBase64] = useState<string | null>(null);
  const [isSampleExtracting, setIsSampleExtracting] = useState(false);

  // Upload invoice state
  const [uploadExtraction, setUploadExtraction] = useState<ConsignmentPayload | null>(null);
  const [uploadPdfUrl, setUploadPdfUrl] = useState<string | null>(null);
  const [uploadBase64, setUploadBase64] = useState<string | null>(null);
  const [isUploadExtracting, setIsUploadExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadDraftId, setUploadDraftId] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Custom fields extracted values
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  // History state
  const [drafts, setDrafts] = useState<DraftRow[]>([]);

  useEffect(() => {
    // Load tenant's custom field schema directly using tenantId from URL
    if (tenantId) {
      supabase.from("tenants").select("custom_field_schema").eq("id", tenantId).single().then(({ data }) => {
        if (data?.custom_field_schema) {
          setCustomFieldSchema(data.custom_field_schema as unknown as CustomFieldDef[]);
        }
      });
    }
  }, [tenantId]);

  useEffect(() => {
    if (isNew) return;
    const load = async () => {
      const { data } = await supabase.from("customer_profiles").select("*").eq("id", id!).single();
      if (data) {
        const p = data as CustomerProfile;
        setProfile(p);
        setForm({
          customer_name: p.customer_name,
          cc_customer_id: p.cc_customer_id,
          inbound_email_slug: p.inbound_email_slug,
          extraction_hints: p.extraction_hints || "",
          tenant_id: p.tenant_id || tenantId || "",
        });
        setSampleExtraction(p.sample_extraction as ConsignmentPayload | null);

        // Load tenant's custom field schema
        if (p.tenant_id) {
          const { data: tenant } = await supabase.from("tenants").select("custom_field_schema").eq("id", p.tenant_id).single();
          if (tenant?.custom_field_schema) {
            setCustomFieldSchema(tenant.custom_field_schema as unknown as CustomFieldDef[]);
          }
        }
      }
      const { data: draftData } = await supabase
        .from("consignment_drafts")
        .select("id, status, source, created_at, from_email, error_message, mapped_payload")
        .eq("customer_profile_id", id!)
        .order("created_at", { ascending: false });
      if (draftData) setDrafts(draftData as DraftRow[]);
    };
    load();
  }, [id, isNew]);

  // When tenant changes, load its schema
  useEffect(() => {
    if (!form.tenant_id) { setCustomFieldSchema([]); return; }
    supabase.from("tenants").select("custom_field_schema").eq("id", form.tenant_id).single().then(({ data }) => {
      if (data?.custom_field_schema) {
        setCustomFieldSchema(data.custom_field_schema as unknown as CustomFieldDef[]);
      } else {
        setCustomFieldSchema([]);
      }
    });
  }, [form.tenant_id]);

  const handleNameChange = (name: string) => {
    setForm((f) => ({
      ...f,
      customer_name: name,
      inbound_email_slug: isNew ? slugify(name) : f.inbound_email_slug,
    }));
  };

  const saveProfile = async () => {
    if (!form.customer_name || !form.cc_customer_id || !form.inbound_email_slug) {
      toast({ title: "Missing fields", description: "Name, Customer ID and email slug are required.", variant: "destructive" });
      return;
    }
    if (!form.tenant_id) {
      toast({ title: "Missing tenant", description: "Please select a tenant.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const row = {
        customer_name: form.customer_name,
        cc_customer_id: form.cc_customer_id,
        inbound_email_slug: form.inbound_email_slug,
        extraction_hints: form.extraction_hints || null,
        sample_extraction: sampleExtraction as any,
        tenant_id: form.tenant_id,
      };
      if (isNew) {
        const { data, error } = await supabase.from("customer_profiles").insert(row).select().single();
        if (error) throw error;
        toast({ title: "Profile created" });
        navigate(`/profiles/${data.id}`, { replace: true });
      } else {
        const { error } = await supabase.from("customer_profiles").update(row).eq("id", id!);
        if (error) throw error;
        toast({ title: "Profile updated" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const copyEmail = () => {
    navigator.clipboard.writeText(`${form.inbound_email_slug}@notify.yourdomain.com`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSampleExtract = useCallback(async (base64: string) => {
    setSampleBase64(base64);
    setIsSampleExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-consignment", {
        body: { pdfBase64: base64, extractionHints: form.extraction_hints || undefined, tenantId: form.tenant_id || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSampleExtraction(data.extraction);
      if (data.extraction?.customFields) setCustomFieldValues(data.extraction.customFields);
      toast({ title: "Sample extracted", description: "Review and correct the extraction, then save." });
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSampleExtracting(false);
    }
  }, [form.extraction_hints, form.tenant_id, toast]);

  const reExtractSample = async () => {
    if (!sampleBase64) return;
    setIsSampleExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-consignment", {
        body: { pdfBase64: sampleBase64, extractionHints: form.extraction_hints || undefined, tenantId: form.tenant_id || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSampleExtraction(data.extraction);
      if (data.extraction?.customFields) setCustomFieldValues(data.extraction.customFields);
      toast({ title: "Re-extracted" });
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSampleExtracting(false);
    }
  };

  const handleUploadExtract = useCallback(async (base64: string) => {
    setUploadBase64(base64);
    setIsUploadExtracting(true);
    setSubmitResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("extract-consignment", {
        body: { pdfBase64: base64, customerProfileId: id, extractionHints: form.extraction_hints || undefined, tenantId: form.tenant_id || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setUploadExtraction(data.extraction);
      setUploadDraftId(data.draftId || null);
      if (data.extraction?.customFields) setCustomFieldValues(data.extraction.customFields);
      toast({ title: "Extraction complete", description: "Review and submit to CartonCloud." });
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploadExtracting(false);
    }
  }, [id, form.extraction_hints, form.tenant_id, toast]);

  const submitToCartonCloud = async () => {
    if (!uploadExtraction) return;
    setIsSubmitting(true);
    setSubmitResult(null);
    try {
      const payloadWithCustomFields = { ...uploadExtraction, customFields: customFieldValues };
      const { data, error } = await supabase.functions.invoke("submit-consignment", {
        body: { payload: payloadWithCustomFields, draftId: uploadDraftId, tenantId: form.tenant_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSubmitResult({ success: true });
      toast({ title: "Submitted!", description: "Consignment submitted to CartonCloud." });
      const { data: draftData } = await supabase
        .from("consignment_drafts")
        .select("id, status, source, created_at, from_email, error_message, mapped_payload")
        .eq("customer_profile_id", id!)
        .order("created_at", { ascending: false });
      if (draftData) setDrafts(draftData as DraftRow[]);
    } catch (err: any) {
      setSubmitResult({ success: false, error: err.message });
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const consignmentDataFields = customFieldSchema.filter((f) => f.tab === "consignmentData");
  const consignmentItemFields = customFieldSchema.filter((f) => f.tab === "consignmentItem");

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <Button variant="ghost" onClick={() => navigate("/profiles")} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Customers
      </Button>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="sample">Sample Mapping</TabsTrigger>
          {!isNew && <TabsTrigger value="upload">Upload Invoice</TabsTrigger>}
          {!isNew && <TabsTrigger value="history">History</TabsTrigger>}
        </TabsList>

        {/* ─── PROFILE TAB ─── */}
        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isNew ? "Create" : "Edit"} Customer Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Customer Name</Label>
                  <Input value={form.customer_name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Acme Corp" />
                </div>
                <div className="space-y-2">
                  <Label>CC Customer ID</Label>
                  <Input value={form.cc_customer_id} onChange={(e) => setForm((f) => ({ ...f, cc_customer_id: e.target.value }))} placeholder="12345" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tenant</Label>
                <Select value={form.tenant_id} onValueChange={(v) => setForm((f) => ({ ...f, tenant_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!isNew && profile?.tenant_id && (
                  <p className="text-xs text-muted-foreground">Changing tenant will update the custom field schema used for extractions.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Inbound Email Slug</Label>
                <div className="flex items-center gap-2">
                  <Input value={form.inbound_email_slug} onChange={(e) => setForm((f) => ({ ...f, inbound_email_slug: e.target.value }))} />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">@notify.yourdomain.com</span>
                  <Button size="icon" variant="ghost" onClick={copyEmail}>
                    {copied ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-primary" /> Extraction Hints</Label>
                <Textarea
                  value={form.extraction_hints}
                  onChange={(e) => setForm((f) => ({ ...f, extraction_hints: e.target.value }))}
                  placeholder='e.g. "Weight is always in kg. The collect address is the sender in the top-left."'
                  rows={4}
                />
              </div>
              <Button onClick={saveProfile} disabled={saving} className="w-full">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</> : isNew ? "Create Profile" : "Save Changes"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── SAMPLE MAPPING TAB ─── */}
        <TabsContent value="sample" className="space-y-4">
          <PdfExtractionViewer
            extraction={sampleExtraction}
            onExtractionChange={setSampleExtraction}
            pdfDataUrl={samplePdfUrl}
            onPdfDataUrl={setSamplePdfUrl}
            isExtracting={isSampleExtracting}
            onExtract={handleSampleExtract}
          />

          {/* Custom fields section */}
          {sampleExtraction && consignmentDataFields.length > 0 && (
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Custom Fields</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-2 gap-2">
                  {consignmentDataFields.map((f) => (
                    <div key={f.fieldName}>
                      <Label className="text-xs">{f.name}</Label>
                      <Input
                        className="h-8 text-sm"
                        value={customFieldValues[f.fieldName] || ""}
                        onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [f.fieldName]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {sampleExtraction && sampleBase64 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Did the AI get anything wrong? Update extraction hints on the Profile tab, then re-extract.
                </p>
                <Button size="sm" variant="outline" disabled={isSampleExtracting} onClick={reExtractSample}>
                  {isSampleExtracting ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <RefreshCw className="h-3 w-3 mr-2" />}
                  Re-extract with current hints
                </Button>
              </CardContent>
            </Card>
          )}

          {sampleExtraction && (
            <Button onClick={saveProfile} disabled={saving} className="w-full">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</> : "Save Sample to Profile"}
            </Button>
          )}
        </TabsContent>

        {/* ─── UPLOAD INVOICE TAB ─── */}
        {!isNew && (
          <TabsContent value="upload" className="space-y-4">
            <PdfExtractionViewer
              extraction={uploadExtraction}
              onExtractionChange={setUploadExtraction}
              pdfDataUrl={uploadPdfUrl}
              onPdfDataUrl={setUploadPdfUrl}
              isExtracting={isUploadExtracting}
              onExtract={handleUploadExtract}
              showAddRemoveItems
            />

            {/* Custom fields section */}
            {uploadExtraction && consignmentDataFields.length > 0 && (
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm">Custom Fields</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-2 gap-2">
                    {consignmentDataFields.map((f) => (
                      <div key={f.fieldName}>
                        <Label className="text-xs">{f.name}</Label>
                        <Input
                          className="h-8 text-sm"
                          value={customFieldValues[f.fieldName] || ""}
                          onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [f.fieldName]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {uploadExtraction && (
              <div className="flex items-center gap-4">
                <Button onClick={submitToCartonCloud} disabled={isSubmitting} className="min-w-[200px]">
                  {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting…</> : <><Send className="h-4 w-4 mr-2" /> Submit to CartonCloud</>}
                </Button>
                {submitResult?.success && (
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <CheckCircle2 className="h-4 w-4" /> Submitted successfully
                  </div>
                )}
                {submitResult && !submitResult.success && (
                  <p className="text-sm text-destructive">{submitResult.error}</p>
                )}
              </div>
            )}
          </TabsContent>
        )}

        {/* ─── HISTORY TAB ─── */}
        {!isNew && (
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Consignment History</CardTitle>
              </CardHeader>
              <CardContent>
                {drafts.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No consignments yet for this customer.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>From Email</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drafts.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="text-sm">{new Date(d.created_at).toLocaleString()}</TableCell>
                          <TableCell><Badge variant="outline">{d.source}</Badge></TableCell>
                          <TableCell>
                            <Badge variant={d.status === "submitted" ? "default" : d.status === "failed" ? "destructive" : "secondary"}>
                              {d.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{d.from_email || "—"}</TableCell>
                          <TableCell className="text-sm text-destructive">{d.error_message || ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default CustomerDetailPage;
