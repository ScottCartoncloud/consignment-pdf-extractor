import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const UploadPage = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const processFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file", description: "Please upload a PDF file.", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("extract-consignment", {
        body: { pdfBase64: base64 },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Extraction complete", description: "Consignment data extracted successfully." });
      navigate("/review", { state: { extraction: data.extraction, draftId: data.draftId } });
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message || "Unknown error", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  }, [navigate, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-xl">Upload Consignment PDF</CardTitle>
        </CardHeader>
        <CardContent>
          {isProcessing ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-muted-foreground">Extracting consignment data with AI…</p>
            </div>
          ) : (
            <label
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg py-16 px-6 cursor-pointer transition-colors ${
                dragOver ? "border-primary bg-accent" : "border-border hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-foreground font-medium mb-1">Drop a PDF here or click to browse</p>
              <p className="text-sm text-muted-foreground">Only PDF files are accepted</p>
              <input type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />
            </label>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UploadPage;
