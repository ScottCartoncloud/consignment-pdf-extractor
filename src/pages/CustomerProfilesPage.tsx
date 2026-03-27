import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ConsignmentPayload, ConsignmentItem } from "@/types/consignment";
import {
  Plus, Trash2, ArrowLeft, Upload, Loader2, Copy, CheckCircle2, FileText, Pencil,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface CustomerProfile {
  id: string;
  customer_name: string;
  cc_customer_id: string;
  inbound_email_slug: string;
  extraction_hints: string | null;
  sample_extraction: any;
  created_at: string;
}

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const emptyItem: ConsignmentItem = { description: "", quantity: 0, weight: 0, length: 0, width: 0, height: 0, pallets: 0, spaces: 0 };

const CustomerProfilesPage = () => {
  const [profiles, setProfiles] = useState<CustomerProfile[]>([]);
  const [view, setView] = useState<"list" | "form">("list");
  const [editingProfile, setEditingProfile] = useState<CustomerProfile | null>(null);
  const [form, setForm] = useState({ customer_name: "", cc_customer_id: "", inbound_email_slug: "", extraction_hints: "" });
  const [sampleExtraction, setSampleExtraction] = useState<ConsignmentPayload | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const fetchProfiles = async () => {
    const { data } = await supabase.from("customer_profiles").select("*").order("created_at", { ascending: false });
    if (data) setProfiles(data as CustomerProfile[]);
  };

  useEffect(() => { fetchProfiles(); }, []);

  const openCreate = () => {
    setEditingProfile(null);
    setForm({ customer_name: "", cc_customer_id: "", inbound_email_slug: "", extraction_hints: "" });
    setSampleExtraction(null);
    setView("form");
  };

  const openEdit = (p: CustomerProfile) => {
    setEditingProfile(p);
    setForm({
      customer_name: p.customer_name,
      cc_customer_id: p.cc_customer_id,
      inbound_email_slug: p.inbound_email_slug,
      extraction_hints: p.extraction_hints || "",
    });
    setSampleExtraction(p.sample_extraction as ConsignmentPayload | null);
    setView("form");
  };

  const handleNameChange = (name: string) => {
    setForm((f) => ({
      ...f,
      customer_name: name,
      inbound_email_slug: editingProfile ? f.inbound_email_slug : slugify(name),
    }));
  };

  const uploadSample = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file", description: "Please upload a PDF file.", variant: "destructive" });
      return;
    }
    setIsExtracting(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("extract-consignment", {
        body: { pdfBase64: base64, extractionHints: form.extraction_hints || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSampleExtraction(data.extraction);
      toast({ title: "Sample extracted", description: "Review and verify the extraction below." });
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setIsExtracting(false);
    }
  }, [form.extraction_hints, toast]);

  const handleSampleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) uploadSample(file);
  }, [uploadSample]);

  const handleSampleSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadSample(file);
  }, [uploadSample]);

  const updateSampleField = (section: string, field: string, value: string) => {
    if (!sampleExtraction) return;
    setSampleExtraction((p) => ({ ...p!, [section]: { ...(p as any)[section], [field]: value } }));
  };

  const updateSampleItem = (index: number, field: keyof ConsignmentItem, value: string) => {
    if (!sampleExtraction) return;
    setSampleExtraction((p) => {
      const items = [...p!.items];
      (items[index] as any)[field] = field === "description" ? value : Number(value) || 0;
      return { ...p!, items };
    });
  };

  const saveProfile = async () => {
    if (!form.customer_name || !form.cc_customer_id || !form.inbound_email_slug) {
      toast({ title: "Missing fields", description: "Name, Customer ID and email slug are required.", variant: "destructive" });
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
      };
      if (editingProfile) {
        const { error } = await supabase.from("customer_profiles").update(row).eq("id", editingProfile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customer_profiles").insert(row);
        if (error) throw error;
      }
      toast({ title: editingProfile ? "Profile updated" : "Profile created" });
      setView("list");
      fetchProfiles();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteProfile = async (id: string) => {
    await supabase.from("customer_profiles").delete().eq("id", id);
    toast({ title: "Profile deleted" });
    fetchProfiles();
  };

  const copyEmail = (slug: string) => {
    navigator.clipboard.writeText(`${slug}@notify.yourdomain.com`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const addressFields = ["companyName", "address1", "suburb", "state", "postcode", "country"] as const;

  if (view === "form") {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Button variant="ghost" onClick={() => setView("list")} className="mb-2">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Profiles
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{editingProfile ? "Edit" : "Create"} Customer Profile</CardTitle>
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
              <Label>Inbound Email Slug</Label>
              <div className="flex items-center gap-2">
                <Input value={form.inbound_email_slug} onChange={(e) => setForm((f) => ({ ...f, inbound_email_slug: e.target.value }))} />
                <span className="text-sm text-muted-foreground whitespace-nowrap">@notify.yourdomain.com</span>
                <Button size="icon" variant="ghost" onClick={() => copyEmail(form.inbound_email_slug)}>
                  {copied ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Extraction Hints (optional)</Label>
              <Textarea
                value={form.extraction_hints}
                onChange={(e) => setForm((f) => ({ ...f, extraction_hints: e.target.value }))}
                placeholder="e.g. Weight is always in kg. Ignore the 'Ref' column. The delivery address is always in the top-right section."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">These hints are appended to the AI prompt when extracting invoices from this customer.</p>
            </div>
          </CardContent>
        </Card>

        {/* Sample PDF Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sample PDF Verification</CardTitle>
          </CardHeader>
          <CardContent>
            {isExtracting ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground">Extracting sample data with AI…</p>
              </div>
            ) : !sampleExtraction ? (
              <label
                className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg py-12 px-6 cursor-pointer transition-colors border-border hover:border-primary/50"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleSampleDrop}
              >
                <Upload className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-foreground font-medium mb-1">Upload a sample PDF to verify extraction</p>
                <p className="text-sm text-muted-foreground">This helps confirm the AI reads this customer's invoices correctly</p>
                <input type="file" accept=".pdf" className="hidden" onChange={handleSampleSelect} />
              </label>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="secondary" className="gap-1"><FileText className="h-3 w-3" /> Sample verified</Badge>
                  <label className="cursor-pointer">
                    <Button size="sm" variant="outline" asChild><span>Re-upload Sample</span></Button>
                    <input type="file" accept=".pdf" className="hidden" onChange={handleSampleSelect} />
                  </label>
                </div>

                {/* Editable extraction preview */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Collect Address</h4>
                  <div className="grid grid-cols-3 gap-3">
                    {addressFields.map((f) => (
                      <div key={f}>
                        <Label className="text-xs capitalize">{f.replace(/([A-Z])/g, " $1")}</Label>
                        <Input value={(sampleExtraction.collectAddress as any)[f] || ""} onChange={(e) => updateSampleField("collectAddress", f, e.target.value)} />
                      </div>
                    ))}
                  </div>

                  <h4 className="text-sm font-medium">Deliver Address</h4>
                  <div className="grid grid-cols-3 gap-3">
                    {[...addressFields, "contactName" as const, "instructions" as const].map((f) => (
                      <div key={f}>
                        <Label className="text-xs capitalize">{f.replace(/([A-Z])/g, " $1")}</Label>
                        <Input value={(sampleExtraction.deliverAddress as any)[f] || ""} onChange={(e) => updateSampleField("deliverAddress", f, e.target.value)} />
                      </div>
                    ))}
                  </div>

                  <h4 className="text-sm font-medium">Items</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-16">Qty</TableHead>
                        <TableHead className="w-20">Weight</TableHead>
                        <TableHead className="w-16">L</TableHead>
                        <TableHead className="w-16">W</TableHead>
                        <TableHead className="w-16">H</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sampleExtraction.items.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell><Input value={item.description} onChange={(e) => updateSampleItem(i, "description", e.target.value)} /></TableCell>
                          {(["quantity", "weight", "length", "width", "height"] as const).map((f) => (
                            <TableCell key={f}><Input type="number" value={item[f]} onChange={(e) => updateSampleItem(i, f, e.target.value)} /></TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Button onClick={saveProfile} disabled={saving} className="w-full">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</> : editingProfile ? "Update Profile" : "Create Profile"}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Customer Profiles</CardTitle>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> New Profile</Button>
        </CardHeader>
        <CardContent>
          {profiles.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No customer profiles yet. Create one to get started.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>CC Customer ID</TableHead>
                  <TableHead>Inbound Email</TableHead>
                  <TableHead>Sample</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.customer_name}</TableCell>
                    <TableCell>{p.cc_customer_id}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.inbound_email_slug}@notify.yourdomain.com</TableCell>
                    <TableCell>
                      <Badge variant={p.sample_extraction ? "default" : "outline"}>
                        {p.sample_extraction ? "Verified" : "None"}
                      </Badge>
                    </TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete profile?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently remove the profile for {p.customer_name}.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteProfile(p.id)}>Delete</AlertDialogAction>
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
    </div>
  );
};

export default CustomerProfilesPage;
