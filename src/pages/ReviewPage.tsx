import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ConsignmentPayload, ConsignmentItem } from "@/types/consignment";
import { Plus, Trash2, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

const emptyItem: ConsignmentItem = { description: "", quantity: 0, weight: 0, length: 0, width: 0, height: 0, pallets: 0, spaces: 0 };

const ReviewPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { extraction, draftId } = (location.state as any) || {};

  const [payload, setPayload] = useState<ConsignmentPayload>(
    extraction || {
      collectAddress: { companyName: "", address1: "", suburb: "", state: "", postcode: "", country: "Australia" },
      deliverAddress: { companyName: "", contactName: "", address1: "", suburb: "", state: "", postcode: "", country: "Australia", instructions: "" },
      items: [{ ...emptyItem }],
      references: { customer: "" },
      type: "DELIVERY",
      fromEmail: "",
    }
  );

  const [customerMatch, setCustomerMatch] = useState<{ cc_customer_id: string; cc_customer_name: string } | null>(null);
  const [emailChecked, setEmailChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; consignmentId?: string; error?: string } | null>(null);

  useEffect(() => {
    if (!extraction) return;
    lookupEmail(extraction.fromEmail);
  }, []);

  const lookupEmail = async (email: string) => {
    if (!email) { setEmailChecked(true); setCustomerMatch(null); return; }
    const { data } = await supabase
      .from("email_customer_mappings")
      .select("cc_customer_id, cc_customer_name")
      .eq("from_email", email)
      .maybeSingle();
    setCustomerMatch(data || null);
    if (data) {
      setPayload((p) => ({ ...p, references: { ...p.references, customer: data.cc_customer_name } }));
    }
    setEmailChecked(true);
  };

  const updateField = (section: string, field: string, value: string) => {
    setPayload((p) => ({ ...p, [section]: { ...(p as any)[section], [field]: value } }));
  };

  const updateItem = (index: number, field: keyof ConsignmentItem, value: string) => {
    setPayload((p) => {
      const items = [...p.items];
      (items[index] as any)[field] = field === "description" ? value : Number(value) || 0;
      return { ...p, items };
    });
  };

  const addItem = () => setPayload((p) => ({ ...p, items: [...p.items, { ...emptyItem }] }));
  const removeItem = (i: number) => setPayload((p) => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("submit-consignment", {
        body: { payload, draftId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSubmitResult({ success: true, consignmentId: data.consignment?.id || "N/A" });
      toast({ title: "Submitted!", description: "Consignment submitted to CartonCloud." });
    } catch (err: any) {
      setSubmitResult({ success: false, error: err.message });
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!extraction) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-6">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6">
            <p className="text-muted-foreground mb-4">No extraction data. Please upload a PDF first.</p>
            <Button onClick={() => navigate("/")}>Go to Upload</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const addressFields = ["companyName", "address1", "suburb", "state", "postcode", "country"] as const;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* From Email */}
      <Card>
        <CardHeader><CardTitle className="text-lg">From Email</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Input
              value={payload.fromEmail}
              onChange={(e) => setPayload((p) => ({ ...p, fromEmail: e.target.value }))}
              onBlur={(e) => lookupEmail(e.target.value)}
              placeholder="sender@example.com"
            />
            {customerMatch && <Badge variant="secondary">{customerMatch.cc_customer_id}</Badge>}
          </div>
          {emailChecked && !customerMatch && payload.fromEmail && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" /> No customer mapping found for this email
            </div>
          )}
          {customerMatch && (
            <p className="text-sm text-muted-foreground">Customer: {customerMatch.cc_customer_name}</p>
          )}
        </CardContent>
      </Card>

      {/* Collect Address */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Collect Address</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {addressFields.map((f) => (
              <div key={f}>
                <Label className="text-xs capitalize">{f.replace(/([A-Z])/g, " $1")}</Label>
                <Input value={(payload.collectAddress as any)[f]} onChange={(e) => updateField("collectAddress", f, e.target.value)} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Deliver Address */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Deliver Address</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {[...addressFields, "contactName" as const, "instructions" as const].map((f) => (
              <div key={f} className={f === "instructions" ? "col-span-2" : ""}>
                <Label className="text-xs capitalize">{f.replace(/([A-Z])/g, " $1")}</Label>
                <Input value={(payload.deliverAddress as any)[f] || ""} onChange={(e) => updateField("deliverAddress", f, e.target.value)} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Items</CardTitle>
          <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-4 w-4 mr-1" /> Add Item</Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="w-16">Qty</TableHead>
                <TableHead className="w-20">Weight</TableHead>
                <TableHead className="w-16">L</TableHead>
                <TableHead className="w-16">W</TableHead>
                <TableHead className="w-16">H</TableHead>
                <TableHead className="w-20">Pallets</TableHead>
                <TableHead className="w-20">Spaces</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payload.items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell><Input value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} /></TableCell>
                  {(["quantity", "weight", "length", "width", "height", "pallets", "spaces"] as const).map((f) => (
                    <TableCell key={f}><Input type="number" value={item[f]} onChange={(e) => updateItem(i, f, e.target.value)} /></TableCell>
                  ))}
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => removeItem(i)} disabled={payload.items.length <= 1}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* References & Type */}
      <Card>
        <CardHeader><CardTitle className="text-lg">References</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Customer Reference</Label>
              <Input value={payload.references.customer} onChange={(e) => setPayload((p) => ({ ...p, references: { ...p.references, customer: e.target.value } }))} />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Input value={payload.type} onChange={(e) => setPayload((p) => ({ ...p, type: e.target.value }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex items-center gap-4">
        <Button onClick={handleSubmit} disabled={isSubmitting} className="min-w-[200px]">
          {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting…</> : "Submit to CartonCloud"}
        </Button>
        {submitResult?.success && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" /> Consignment ID: {submitResult.consignmentId}
          </div>
        )}
        {submitResult && !submitResult.success && (
          <p className="text-sm text-destructive">{submitResult.error}</p>
        )}
      </div>
    </div>
  );
};

export default ReviewPage;
