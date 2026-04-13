import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, Eye, EyeOff, Upload, ImageIcon, Plus, Trash2, Users } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface CustomerRow {
  id: string;
  customer_name: string;
  cc_customer_id: string;
  inbound_email_slug: string;
  sample_extraction: any;
}

type CustomFieldTab = "consignmentData" | "consignmentItem" | "saleOrderData" | "purchaseOrderData";

interface CustomField {
  name: string;
  shortName: string;
  fieldType: string;
  fieldName: string;
  mappedField: string;
  tab: CustomFieldTab;
  dontSend?: boolean;
}

const TenantDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isNew = id === "new";

  const [form, setForm] = useState({
    name: "",
    cc_tenant_id: "",
    cc_api_base_url: "https://api.cartoncloud.com",
    cc_client_id: "",
    cc_client_secret: "",
  });
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  // Custom fields state
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [activeFieldTab, setActiveFieldTab] = useState<CustomFieldTab>("consignmentData");
  const [extractingData, setExtractingData] = useState(false);
  const [extractingItem, setExtractingItem] = useState(false);
  const [extractingSaleOrderData, setExtractingSaleOrderData] = useState(false);
  const [extractingPurchaseOrderData, setExtractingPurchaseOrderData] = useState(false);
  const [savingSchema, setSavingSchema] = useState(false);

  useEffect(() => {
    if (isNew) return;
    const load = async () => {
      const { data } = await supabase.from("tenants").select("*").eq("id", id!).single();
      if (data) {
        setForm({
          name: data.name,
          cc_tenant_id: data.cc_tenant_id,
          cc_api_base_url: data.cc_api_base_url,
          cc_client_id: data.cc_client_id,
          cc_client_secret: data.cc_client_secret,
        });
        if (data.custom_field_schema) {
          setCustomFields(data.custom_field_schema as unknown as CustomField[]);
        }
      }
    };
    load();
  }, [id, isNew]);

  const saveConnection = async () => {
    if (!form.name || !form.cc_tenant_id) {
      toast({ title: "Missing fields", description: "Name and CC Tenant ID are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const row = {
        name: form.name,
        cc_tenant_id: form.cc_tenant_id,
        cc_api_base_url: form.cc_api_base_url,
        cc_client_id: form.cc_client_id,
        cc_client_secret: form.cc_client_secret,
      };
      if (isNew) {
        const { data, error } = await supabase.from("tenants").insert(row).select().single();
        if (error) throw error;
        toast({ title: "Tenant created" });
        navigate(`/tenants/${data.id}`, { replace: true });
      } else {
        const { error } = await supabase.from("tenants").update(row).eq("id", id!);
        if (error) throw error;
        toast({ title: "Tenant updated" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = useCallback(async (file: File, tab: CustomFieldTab) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" });
      return;
    }
    const extractingSetters: Record<CustomFieldTab, typeof setExtractingData> = {
      consignmentData: setExtractingData,
      consignmentItem: setExtractingItem,
      saleOrderData: setExtractingSaleOrderData,
      purchaseOrderData: setExtractingPurchaseOrderData,
    };
    const setExtracting = extractingSetters[tab];
    setExtracting(true);

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("extract-custom-fields", {
        body: { imageBase64: base64, tab, mediaType: file.type },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const extracted: CustomField[] = data.fields || [];
      // Replace fields for this tab, keep the other tab's fields
      setCustomFields((prev) => [
        ...prev.filter((f) => f.tab !== tab),
        ...extracted,
      ]);
      toast({ title: "Fields extracted", description: `Found ${extracted.length} custom fields.` });
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  }, [toast]);

  const saveSchema = async () => {
    if (isNew) return;
    setSavingSchema(true);
    try {
      const { error } = await supabase
        .from("tenants")
        .update({ custom_field_schema: customFields as any })
        .eq("id", id!);
      if (error) throw error;
      toast({ title: "Custom field schema saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingSchema(false);
    }
  };

  // Customers state
  const [customers, setCustomers] = useState<CustomerRow[]>([]);

  const fetchCustomers = useCallback(async () => {
    if (isNew || !id) return;
    const { data } = await supabase
      .from("customer_profiles")
      .select("id, customer_name, cc_customer_id, inbound_email_slug, sample_extraction")
      .eq("tenant_id", id)
      .order("customer_name");
    if (data) setCustomers(data as CustomerRow[]);
  }, [id, isNew]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const deleteCustomer = async (custId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("customer_profiles").delete().eq("id", custId);
    toast({ title: "Customer deleted" });
    fetchCustomers();
  };

  const filteredFields = customFields.filter((f) => f.tab === activeFieldTab);

  const tabLabels: Record<CustomFieldTab, string> = {
    consignmentData: "Consignment Data",
    consignmentItem: "Consignment Item",
    saleOrderData: "Sale Order Data",
    purchaseOrderData: "Purchase Order Data",
  };

  const UploadZone = ({ tab, isExtracting }: { tab: CustomFieldTab; isExtracting: boolean }) => (
    <label
      className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg py-8 px-4 cursor-pointer transition-colors border-border hover:border-primary/50"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImageUpload(f, tab); }}
    >
      {isExtracting ? (
        <><Loader2 className="h-6 w-6 animate-spin text-primary mb-2" /><p className="text-sm text-muted-foreground">Extracting fields…</p></>
      ) : (
        <><ImageIcon className="h-6 w-6 text-muted-foreground mb-2" /><p className="text-sm font-medium text-foreground">Upload {tabLabels[tab]} screenshot</p><p className="text-xs text-muted-foreground">Drop image or click to browse</p></>
      )}
      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f, tab); }} />
    </label>
  );

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <Button variant="ghost" onClick={() => navigate("/tenants")} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Tenants
      </Button>

      <h1 className="text-xl font-bold">{isNew ? "New Tenant" : form.name}</h1>

      {isNew ? (
        /* New tenant: just show the connection form */
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">CartonCloud Connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tenant Name</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="My Warehouse" />
              </div>
              <div className="space-y-2">
                <Label>CC Tenant ID</Label>
                <Input value={form.cc_tenant_id} onChange={(e) => setForm((f) => ({ ...f, cc_tenant_id: e.target.value }))} placeholder="12345" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>API Base URL</Label>
              <Input value={form.cc_api_base_url} onChange={(e) => setForm((f) => ({ ...f, cc_api_base_url: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Client ID</Label>
                <Input value={form.cc_client_id} onChange={(e) => setForm((f) => ({ ...f, cc_client_id: e.target.value }))} placeholder="client-id" />
              </div>
              <div className="space-y-2">
                <Label>Client Secret</Label>
                <div className="flex gap-2">
                  <Input type={showSecret ? "text" : "password"} value={form.cc_client_secret} onChange={(e) => setForm((f) => ({ ...f, cc_client_secret: e.target.value }))} />
                  <Button size="icon" variant="ghost" onClick={() => setShowSecret(!showSecret)}>
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <Button onClick={saveConnection} disabled={saving} className="w-full">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</> : "Create Tenant"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Existing tenant: tabbed layout */
        <Tabs defaultValue="customers">
          <TabsList>
            <TabsTrigger value="customers">Customers ({customers.length})</TabsTrigger>
            <TabsTrigger value="connection">Connection</TabsTrigger>
            <TabsTrigger value="customFields">Custom Fields</TabsTrigger>
          </TabsList>

          {/* ─── CUSTOMERS TAB ─── */}
          <TabsContent value="customers" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Customers</CardTitle>
                <Button onClick={() => navigate(`/tenants/${id}/customers/new`)}><Plus className="h-4 w-4 mr-2" /> Add Customer</Button>
              </CardHeader>
              <CardContent>
                {customers.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No customers yet. Add one to get started.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer Name</TableHead>
                        <TableHead>CC Customer ID</TableHead>
                        <TableHead>Inbound Email</TableHead>
                        <TableHead>Sample</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customers.map((c) => (
                        <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/tenants/${id}/customers/${c.id}`)}>
                          <TableCell className="font-medium">{c.customer_name}</TableCell>
                          <TableCell>{c.cc_customer_id}</TableCell>
                          <TableCell className="text-sm text-muted-foreground"><TableCell className="text-sm text-muted-foreground">{c.inbound_email_slug}@inbound.cloudy-pdf.com</TableCell></TableCell>
                          <TableCell>
                            <Badge variant={c.sample_extraction ? "default" : "outline"}>
                              {c.sample_extraction ? "Verified" : "None"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete {c.customer_name}?</AlertDialogTitle>
                                  <AlertDialogDescription>This will permanently remove this customer profile.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={(e) => deleteCustomer(c.id, e)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── CONNECTION TAB ─── */}
          <TabsContent value="connection" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">CartonCloud Connection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tenant Name</Label>
                    <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="My Warehouse" />
                  </div>
                  <div className="space-y-2">
                    <Label>CC Tenant ID</Label>
                    <Input value={form.cc_tenant_id} onChange={(e) => setForm((f) => ({ ...f, cc_tenant_id: e.target.value }))} placeholder="12345" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>API Base URL</Label>
                  <Input value={form.cc_api_base_url} onChange={(e) => setForm((f) => ({ ...f, cc_api_base_url: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Client ID</Label>
                    <Input value={form.cc_client_id} onChange={(e) => setForm((f) => ({ ...f, cc_client_id: e.target.value }))} placeholder="client-id" />
                  </div>
                  <div className="space-y-2">
                    <Label>Client Secret</Label>
                    <div className="flex gap-2">
                      <Input type={showSecret ? "text" : "password"} value={form.cc_client_secret} onChange={(e) => setForm((f) => ({ ...f, cc_client_secret: e.target.value }))} />
                      <Button size="icon" variant="ghost" onClick={() => setShowSecret(!showSecret)}>
                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
                <Button onClick={saveConnection} disabled={saving} className="w-full">
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</> : "Save Connection"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── CUSTOM FIELDS TAB ─── */}
          <TabsContent value="customFields" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Custom Fields Schema</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Consignment Fields */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold">Consignment Fields</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <UploadZone tab="consignmentData" isExtracting={extractingData} />
                    <UploadZone tab="consignmentItem" isExtracting={extractingItem} />
                  </div>
                </div>

                {/* Sale Order Fields */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold">Sale Order Fields</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <UploadZone tab="saleOrderData" isExtracting={extractingSaleOrderData} />
                  </div>
                </div>

                {/* Purchase Order Fields */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold">Purchase Order Fields</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <UploadZone tab="purchaseOrderData" isExtracting={extractingPurchaseOrderData} />
                  </div>
                </div>

                {customFields.length > 0 && (
                  <>
                    <Tabs value={activeFieldTab} onValueChange={(v) => setActiveFieldTab(v as CustomFieldTab)}>
                      <TabsList>
                        <TabsTrigger value="consignmentData">
                          Consignment Data ({customFields.filter((f) => f.tab === "consignmentData").length})
                        </TabsTrigger>
                        <TabsTrigger value="consignmentItem">
                          Consignment Item ({customFields.filter((f) => f.tab === "consignmentItem").length})
                        </TabsTrigger>
                        <TabsTrigger value="saleOrderData">
                          Sale Order Data ({customFields.filter((f) => f.tab === "saleOrderData").length})
                        </TabsTrigger>
                        <TabsTrigger value="purchaseOrderData">
                          Purchase Order Data ({customFields.filter((f) => f.tab === "purchaseOrderData").length})
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Short Name</TableHead>
                          <TableHead>Field Type</TableHead>
                          <TableHead>Field Name</TableHead>
                          <TableHead>Mapped Field</TableHead>
                          <TableHead>Don't Send</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredFields.map((f, i) => {
                          const globalIdx = customFields.findIndex((cf) => cf === f);
                          return (
                            <TableRow key={i}>
                              <TableCell className="text-sm">{f.name}</TableCell>
                              <TableCell className="text-sm">{f.shortName}</TableCell>
                              <TableCell><Badge variant="outline">{f.fieldType}</Badge></TableCell>
                              <TableCell className="text-sm font-mono text-xs">{f.fieldName}</TableCell>
                              <TableCell className="text-sm font-mono text-xs">{f.mappedField}</TableCell>
                              <TableCell>
                                <Switch
                                  checked={f.dontSend ?? f.mappedField.includes("serviceType")}
                                  onCheckedChange={(checked) => {
                                    setCustomFields((prev) => {
                                      const updated = [...prev];
                                      updated[globalIdx] = { ...updated[globalIdx], dontSend: checked };
                                      return updated;
                                    });
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {filteredFields.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-4">
                              No fields for this tab. Upload a screenshot to extract them.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>

                    <Button onClick={saveSchema} disabled={savingSchema} className="w-full">
                      {savingSchema ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</> : "Save Schema"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default TenantDetailPage;
