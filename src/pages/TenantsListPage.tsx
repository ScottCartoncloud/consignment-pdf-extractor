import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Tenant {
  id: string;
  name: string;
  cc_tenant_id: string;
  custom_field_schema: any;
  created_at: string;
  customer_count?: number;
}

const TenantsListPage = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [customerCounts, setCustomerCounts] = useState<Record<string, number>>({});
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchTenants = async () => {
    const { data } = await supabase.from("tenants").select("*").order("created_at", { ascending: false });
    if (data) setTenants(data as Tenant[]);

    const { data: profiles } = await supabase.from("customer_profiles").select("tenant_id");
    if (profiles) {
      const counts: Record<string, number> = {};
      profiles.forEach((p: any) => {
        if (p.tenant_id) counts[p.tenant_id] = (counts[p.tenant_id] || 0) + 1;
      });
      setCustomerCounts(counts);
    }
  };

  useEffect(() => { fetchTenants(); }, []);

  const deleteTenant = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("tenants").delete().eq("id", id);
    toast({ title: "Tenant deleted" });
    fetchTenants();
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Tenants</CardTitle>
          <Button onClick={() => navigate("/tenants/new")}><Plus className="h-4 w-4 mr-2" /> Add Tenant</Button>
        </CardHeader>
        <CardContent>
          {tenants.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No tenants yet. Add one to get started.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>CC Tenant ID</TableHead>
                  <TableHead>Customers</TableHead>
                  <TableHead>Custom Fields</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate(`/tenants/${t.id}`)}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.cc_tenant_id}</TableCell>
                    <TableCell>{customerCounts[t.id] || 0}</TableCell>
                    <TableCell>
                      <Badge variant={t.custom_field_schema ? "default" : "outline"}>
                        {t.custom_field_schema ? "Yes" : "No"}
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
                            <AlertDialogTitle>Delete {t.name}?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently remove this tenant.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={(e) => deleteTenant(t.id, e)}>Delete</AlertDialogAction>
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

export default TenantsListPage;
