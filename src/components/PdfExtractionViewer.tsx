import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ConsignmentPayload, ConsignmentItem,
  SaleOrderPayload, SaleOrderItem,
  PurchaseOrderPayload, PurchaseOrderItem,
  EntityType,
} from "@/types/consignment";
import { Upload, Loader2, FileText, CheckCircle2, RefreshCw, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AnyPayload = ConsignmentPayload | SaleOrderPayload | PurchaseOrderPayload;

const emptyConsignmentItem: ConsignmentItem = { description: "", quantity: 0, weight: 0, length: 0, width: 0, height: 0, pallets: 0, spaces: 0 };
const emptySaleOrderItem: SaleOrderItem = { code: "", description: "", quantity: 0, unitOfMeasure: "UNITS" };
const emptyPurchaseOrderItem: PurchaseOrderItem = { code: "", description: "", quantity: 0, unitOfMeasure: "UNITS" };

const numInputClass = "h-7 text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

interface PdfExtractionViewerProps {
  extraction: AnyPayload | null;
  onExtractionChange: (extraction: AnyPayload) => void;
  pdfDataUrl: string | null;
  onPdfDataUrl: (url: string | null) => void;
  isExtracting: boolean;
  onExtract: (base64: string) => Promise<void>;
  showUpload?: boolean;
  showAddRemoveItems?: boolean;
  showCodeColumn?: boolean;
  extractionHints?: string;
  lastPdfBase64?: string | null;
  onReExtract?: () => Promise<void>;
  entityType?: EntityType;
}

const addressFields = ["companyName", "address1", "suburb", "state", "postcode", "country"] as const;

const PdfExtractionViewer = ({
  extraction,
  onExtractionChange,
  pdfDataUrl,
  onPdfDataUrl,
  isExtracting,
  onExtract,
  showUpload = true,
  showAddRemoveItems = false,
  showCodeColumn = false,
  entityType = "consignment",
}: PdfExtractionViewerProps) => {
  const { toast } = useToast();

  const handleFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file", description: "Please upload a PDF file.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    onPdfDataUrl(`data:application/pdf;base64,${base64}`);
    await onExtract(base64);
  }, [onExtract, onPdfDataUrl, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const updateField = (section: string, field: string, value: string) => {
    if (!extraction) return;
    onExtractionChange({ ...extraction, [section]: { ...(extraction as any)[section], [field]: value } } as AnyPayload);
  };

  const updateTopLevel = (field: string, value: string) => {
    if (!extraction) return;
    onExtractionChange({ ...extraction, [field]: value } as AnyPayload);
  };

  // Consignment item updater
  const updateConsignmentItem = (index: number, field: keyof ConsignmentItem, value: string) => {
    if (!extraction) return;
    const ext = extraction as ConsignmentPayload;
    const items = [...ext.items];
    (items[index] as any)[field] = field === "description" || field === "code" ? value : Number(value) || 0;
    onExtractionChange({ ...ext, items } as ConsignmentPayload);
  };

  // Sale order item updater
  const updateSaleOrderItem = (index: number, field: keyof SaleOrderItem, value: string) => {
    if (!extraction) return;
    const ext = extraction as SaleOrderPayload;
    const items = [...ext.items];
    (items[index] as any)[field] = field === "quantity" ? Number(value) || 0 : value;
    onExtractionChange({ ...ext, items } as SaleOrderPayload);
  };

  // Purchase order item updater
  const updatePurchaseOrderItem = (index: number, field: keyof PurchaseOrderItem, value: string) => {
    if (!extraction) return;
    const ext = extraction as PurchaseOrderPayload;
    const items = [...ext.items];
    (items[index] as any)[field] = field === "quantity" ? Number(value) || 0 : value;
    onExtractionChange({ ...ext, items } as PurchaseOrderPayload);
  };

  const addItem = () => {
    if (!extraction) return;
    if (entityType === "sale_order") {
      const ext = extraction as SaleOrderPayload;
      onExtractionChange({ ...ext, items: [...ext.items, { ...emptySaleOrderItem }] } as SaleOrderPayload);
    } else if (entityType === "purchase_order") {
      const ext = extraction as PurchaseOrderPayload;
      onExtractionChange({ ...ext, items: [...ext.items, { ...emptyPurchaseOrderItem }] } as PurchaseOrderPayload);
    } else {
      const ext = extraction as ConsignmentPayload;
      onExtractionChange({ ...ext, items: [...ext.items, { ...emptyConsignmentItem }] } as ConsignmentPayload);
    }
  };

  const removeItem = (i: number) => {
    if (!extraction) return;
    const items = (extraction as any).items.filter((_: any, idx: number) => idx !== i);
    onExtractionChange({ ...extraction, items } as AnyPayload);
  };

  const hasCodeField = showCodeColumn || ((extraction as ConsignmentPayload)?.items?.some((item: any) => item.code !== undefined) ?? false);

  // Upload prompt (no PDF yet)
  if (!extraction && !isExtracting && !pdfDataUrl && showUpload) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upload PDF</CardTitle>
        </CardHeader>
        <CardContent>
          <label
            className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg py-12 px-6 cursor-pointer transition-colors border-border hover:border-primary/50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <Upload className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-foreground font-medium mb-1">Drop a PDF here or click to browse</p>
            <p className="text-sm text-muted-foreground">PDF files only</p>
            <input type="file" accept=".pdf" className="hidden" onChange={handleSelect} />
          </label>
        </CardContent>
      </Card>
    );
  }

  const renderConsignmentExtraction = () => {
    const ext = extraction as ConsignmentPayload;
    return (
      <>
        {/* Collect Address */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Collect Address</h4>
          <div className="grid grid-cols-2 gap-2">
            {addressFields.map((f) => (
              <div key={f}>
                <Label className="text-xs capitalize">{f.replace(/([A-Z])/g, " $1")}</Label>
                <Input className="h-8 text-sm" value={(ext.collectAddress as any)[f] || ""} onChange={(e) => updateField("collectAddress", f, e.target.value)} />
              </div>
            ))}
          </div>
        </div>

        {/* Deliver Address */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Deliver Address</h4>
          <div className="grid grid-cols-2 gap-2">
            {[...addressFields, "contactName" as const, "instructions" as const].map((f) => (
              <div key={f}>
                <Label className="text-xs capitalize">{f.replace(/([A-Z])/g, " $1")}</Label>
                <Input className="h-8 text-sm" value={(ext.deliverAddress as any)[f] || ""} onChange={(e) => updateField("deliverAddress", f, e.target.value)} />
              </div>
            ))}
          </div>
        </div>

        {/* References */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">References</h4>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Customer Reference</Label>
              <Input className="h-8 text-sm" value={ext.references.customer} onChange={(e) => onExtractionChange({ ...ext, references: { ...ext.references, customer: e.target.value } })} />
            </div>
            <div>
              <Label className="text-xs">Required Delivery Date</Label>
              <Input className="h-8 text-sm" type="date" value={ext.requiredDate || ""} onChange={(e) => onExtractionChange({ ...ext, requiredDate: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Input className="h-8 text-sm" value={ext.type} onChange={(e) => onExtractionChange({ ...ext, type: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Items */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Items</h4>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Description</TableHead>
                  {hasCodeField && <TableHead className="text-xs w-20">Code</TableHead>}
                  <TableHead className="text-xs w-14">Qty</TableHead>
                  <TableHead className="text-xs w-16">Weight</TableHead>
                  <TableHead className="text-xs w-14">L</TableHead>
                  <TableHead className="text-xs w-14">W</TableHead>
                  <TableHead className="text-xs w-14">H</TableHead>
                  <TableHead className="text-xs w-14">Pallets</TableHead>
                  <TableHead className="text-xs w-14">Spaces</TableHead>
                  <TableHead className="text-xs w-16">Cubic</TableHead>
                  {showAddRemoveItems && <TableHead className="text-xs w-8"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ext.items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="p-1"><Input className="h-7 text-xs" value={item.description} onChange={(e) => updateConsignmentItem(i, "description", e.target.value)} /></TableCell>
                    {hasCodeField && (
                      <TableCell className="p-1"><Input className="h-7 text-xs" value={item.code || ""} onChange={(e) => updateConsignmentItem(i, "code", e.target.value)} /></TableCell>
                    )}
                    {(["quantity", "weight", "length", "width", "height", "pallets", "spaces"] as const).map((f) => (
                      <TableCell key={f} className="p-1"><Input className={numInputClass} type="number" value={item[f]} onChange={(e) => updateConsignmentItem(i, f, e.target.value)} /></TableCell>
                    ))}
                    <TableCell className="p-1">
                      <Input className={`${numInputClass} bg-muted/50`} type="number" readOnly value={((item.length * item.width * item.height) / 1000000 * item.quantity).toFixed(3)} />
                    </TableCell>
                    {showAddRemoveItems && (
                      <TableCell className="p-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeItem(i)} disabled={ext.items.length <= 1}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </>
    );
  };

  const renderSaleOrderExtraction = () => {
    const ext = extraction as SaleOrderPayload;
    return (
      <>
        {/* Deliver Address */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Deliver Address</h4>
          <div className="grid grid-cols-2 gap-2">
            {[...addressFields, "contactName" as const, "instructions" as const].map((f) => (
              <div key={f}>
                <Label className="text-xs capitalize">{f.replace(/([A-Z])/g, " $1")}</Label>
                <Input className="h-8 text-sm" value={(ext.deliverAddress as any)?.[f] || ""} onChange={(e) => updateField("deliverAddress", f, e.target.value)} />
              </div>
            ))}
          </div>
        </div>

        {/* References */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">References</h4>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Customer Reference</Label>
              <Input className="h-8 text-sm" value={ext.references?.customer || ""} onChange={(e) => onExtractionChange({ ...ext, references: { ...ext.references, customer: e.target.value } } as SaleOrderPayload)} />
            </div>
            <div>
              <Label className="text-xs">Deliver Required Date</Label>
              <Input className="h-8 text-sm" type="date" value={ext.deliverRequiredDate || ""} onChange={(e) => onExtractionChange({ ...ext, deliverRequiredDate: e.target.value } as SaleOrderPayload)} />
            </div>
            <div>
              <Label className="text-xs">Collect Required Date</Label>
              <Input className="h-8 text-sm" type="date" value={ext.collectRequiredDate || ""} onChange={(e) => onExtractionChange({ ...ext, collectRequiredDate: e.target.value } as SaleOrderPayload)} />
            </div>
          </div>
        </div>

        {/* Warehouse */}
        <div>
          <Label className="text-xs">Warehouse</Label>
          <Input className="h-8 text-sm" value={ext.warehouse || ""} onChange={(e) => updateTopLevel("warehouse", e.target.value)} />
        </div>

        {/* Instructions */}
        <div>
          <Label className="text-xs">Instructions</Label>
          <Input className="h-8 text-sm" value={ext.instructions || ""} onChange={(e) => updateTopLevel("instructions", e.target.value)} />
        </div>

        {/* Items */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Items</h4>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Code</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs w-14">Qty</TableHead>
                  <TableHead className="text-xs w-24">Unit of Measure</TableHead>
                  {showAddRemoveItems && <TableHead className="text-xs w-8"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ext.items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="p-1"><Input className="h-7 text-xs" value={item.code} onChange={(e) => updateSaleOrderItem(i, "code", e.target.value)} /></TableCell>
                    <TableCell className="p-1"><Input className="h-7 text-xs" value={item.description} onChange={(e) => updateSaleOrderItem(i, "description", e.target.value)} /></TableCell>
                    <TableCell className="p-1"><Input className={numInputClass} type="number" value={item.quantity} onChange={(e) => updateSaleOrderItem(i, "quantity", e.target.value)} /></TableCell>
                    <TableCell className="p-1"><Input className="h-7 text-xs" value={item.unitOfMeasure || "UNITS"} onChange={(e) => updateSaleOrderItem(i, "unitOfMeasure", e.target.value)} /></TableCell>
                    {showAddRemoveItems && (
                      <TableCell className="p-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeItem(i)} disabled={ext.items.length <= 1}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </>
    );
  };

  const renderPurchaseOrderExtraction = () => {
    const ext = extraction as PurchaseOrderPayload;
    return (
      <>
        {/* References */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">References</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Customer Reference</Label>
              <Input className="h-8 text-sm" value={ext.references?.customer || ""} onChange={(e) => onExtractionChange({ ...ext, references: { ...ext.references, customer: e.target.value } } as PurchaseOrderPayload)} />
            </div>
            <div>
              <Label className="text-xs">Arrival Date</Label>
              <Input className="h-8 text-sm" type="date" value={ext.arrivalDate || ""} onChange={(e) => onExtractionChange({ ...ext, arrivalDate: e.target.value } as PurchaseOrderPayload)} />
            </div>
          </div>
        </div>

        {/* Warehouse */}
        <div>
          <Label className="text-xs">Warehouse</Label>
          <Input className="h-8 text-sm" value={ext.warehouse || ""} onChange={(e) => updateTopLevel("warehouse", e.target.value)} />
        </div>

        {/* Instructions */}
        <div>
          <Label className="text-xs">Instructions</Label>
          <Input className="h-8 text-sm" value={ext.instructions || ""} onChange={(e) => updateTopLevel("instructions", e.target.value)} />
        </div>

        {/* Items */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Items</h4>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Code</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs w-14">Qty</TableHead>
                  <TableHead className="text-xs w-24">Unit of Measure</TableHead>
                  <TableHead className="text-xs w-20">Batch</TableHead>
                  <TableHead className="text-xs w-24">Expiry Date</TableHead>
                  {showAddRemoveItems && <TableHead className="text-xs w-8"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ext.items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="p-1"><Input className="h-7 text-xs" value={item.code} onChange={(e) => updatePurchaseOrderItem(i, "code", e.target.value)} /></TableCell>
                    <TableCell className="p-1"><Input className="h-7 text-xs" value={item.description} onChange={(e) => updatePurchaseOrderItem(i, "description", e.target.value)} /></TableCell>
                    <TableCell className="p-1"><Input className={numInputClass} type="number" value={item.quantity} onChange={(e) => updatePurchaseOrderItem(i, "quantity", e.target.value)} /></TableCell>
                    <TableCell className="p-1"><Input className="h-7 text-xs" value={item.unitOfMeasure || "UNITS"} onChange={(e) => updatePurchaseOrderItem(i, "unitOfMeasure", e.target.value)} /></TableCell>
                    <TableCell className="p-1"><Input className="h-7 text-xs" value={item.batch || ""} onChange={(e) => updatePurchaseOrderItem(i, "batch", e.target.value)} /></TableCell>
                    <TableCell className="p-1"><Input className="h-7 text-xs" value={item.expiryDate || ""} onChange={(e) => updatePurchaseOrderItem(i, "expiryDate", e.target.value)} /></TableCell>
                    {showAddRemoveItems && (
                      <TableCell className="p-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeItem(i)} disabled={ext.items.length <= 1}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </>
    );
  };

  // Side-by-side layout
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">
          {isExtracting ? "Extracting…" : extraction ? "Extraction Result" : "Upload a PDF"}
        </h2>
        {showUpload && (
          <label className="cursor-pointer">
            <Button size="sm" variant="outline" asChild>
              <span><RefreshCw className="h-3 w-3 mr-2" /> Re-upload</span>
            </Button>
            <input type="file" accept=".pdf" className="hidden" onChange={handleSelect} />
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4" style={{ minHeight: "700px" }}>
        {/* LEFT: PDF */}
        <Card className="overflow-hidden">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" /> Original PDF
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 h-full">
            {pdfDataUrl ? (
              <iframe src={pdfDataUrl} className="w-full border-0" style={{ height: "calc(100% - 52px)", minHeight: "640px" }} title="Uploaded PDF" />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-8">
                <p>No PDF loaded. Upload a file to see it here.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* RIGHT: Extraction */}
        <Card className="overflow-auto">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> AI Extraction Result
            </CardTitle>
            {showAddRemoveItems && extraction && (
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3 w-3 mr-1" /> Item</Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-4">
            {isExtracting ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground">Extracting with AI…</p>
              </div>
            ) : extraction ? (
              entityType === "sale_order" ? renderSaleOrderExtraction() :
              entityType === "purchase_order" ? renderPurchaseOrderExtraction() :
              renderConsignmentExtraction()
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PdfExtractionViewer;
