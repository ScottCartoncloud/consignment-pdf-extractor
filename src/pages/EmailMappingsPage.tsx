import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Save } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Mapping {
  id: string;
  from_email: string;
  cc_customer_id: string;
  cc_customer_name: string;
}

const EmailMappingsPage = () => {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [newRow, setNewRow] = useState({ from_email: "", cc_customer_id: "", cc_customer_name: "" });
  const { toast } = useToast();

  const fetchMappings = async () => {
    const { data } = await supabase.from("email_customer_mappings").select("*").order("created_at", { ascending: false });
    if (data) setMappings(data);
  };

  useEffect(() => { fetchMappings(); }, []);

  const addMapping = async () => {
    if (!newRow.from_email || !newRow.cc_customer_id || !newRow.cc_customer_name) {
      toast({ title: "Missing fields", description: "All fields are required.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("email_customer_mappings").insert(newRow);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Added" });
      setNewRow({ from_email: "", cc_customer_id: "", cc_customer_name: "" });
      fetchMappings();
    }
  };

  const deleteMapping = async (id: string) => {
    await supabase.from("email_customer_mappings").delete().eq("id", id);
    toast({ title: "Deleted" });
    fetchMappings();
  };

  const updateMapping = async (mapping: Mapping) => {
    const { error } = await supabase
      .from("email_customer_mappings")
      .update({ from_email: mapping.from_email, cc_customer_id: mapping.cc_customer_id, cc_customer_name: mapping.cc_customer_name })
      .eq("id", mapping.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Updated" });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Email → Customer Mappings</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From Email</TableHead>
                <TableHead>CC Customer Name</TableHead>
                <TableHead>CC Customer ID</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Input value={m.from_email} onChange={(e) => setMappings((prev) => prev.map((p) => p.id === m.id ? { ...p, from_email: e.target.value } : p))} />
                  </TableCell>
                  <TableCell>
                    <Input value={m.cc_customer_name} onChange={(e) => setMappings((prev) => prev.map((p) => p.id === m.id ? { ...p, cc_customer_name: e.target.value } : p))} />
                  </TableCell>
                  <TableCell>
                    <Input value={m.cc_customer_id} onChange={(e) => setMappings((prev) => prev.map((p) => p.id === m.id ? { ...p, cc_customer_id: e.target.value } : p))} />
                  </TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => updateMapping(m)}><Save className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete mapping?</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently remove the mapping for {m.from_email}.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMapping(m.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
              {/* Add new row */}
              <TableRow>
                <TableCell><Input placeholder="email@example.com" value={newRow.from_email} onChange={(e) => setNewRow((r) => ({ ...r, from_email: e.target.value }))} /></TableCell>
                <TableCell><Input placeholder="Customer Name" value={newRow.cc_customer_name} onChange={(e) => setNewRow((r) => ({ ...r, cc_customer_name: e.target.value }))} /></TableCell>
                <TableCell><Input placeholder="Customer ID" value={newRow.cc_customer_id} onChange={(e) => setNewRow((r) => ({ ...r, cc_customer_id: e.target.value }))} /></TableCell>
                <TableCell>
                  <Button size="icon" variant="outline" onClick={addMapping}><Plus className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailMappingsPage;
