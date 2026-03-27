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

interface CustomerProfile {
  id: string;
  customer_name: string;
  cc_customer_id: string;
  inbound_email_slug: string;
  sample_extraction: any;
  created_at: string;
}

const CustomersListPage = () => {
  const [profiles, setProfiles] = useState<CustomerProfile[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchProfiles = async () => {
    const { data } = await supabase.from("customer_profiles").select("*").order("created_at", { ascending: false });
    if (data) setProfiles(data as CustomerProfile[]);
  };

  useEffect(() => { fetchProfiles(); }, []);

  const deleteProfile = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("customer_profiles").delete().eq("id", id);
    toast({ title: "Profile deleted" });
    fetchProfiles();
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Customers</CardTitle>
          <Button onClick={() => navigate("/profiles/new")}><Plus className="h-4 w-4 mr-2" /> Add Customer</Button>
        </CardHeader>
        <CardContent>
          {profiles.length === 0 ? (
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
                {profiles.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/profiles/${p.id}`)}>
                    <TableCell className="font-medium">{p.customer_name}</TableCell>
                    <TableCell>{p.cc_customer_id}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.inbound_email_slug}@notify.yourdomain.com</TableCell>
                    <TableCell>
                      <Badge variant={p.sample_extraction ? "default" : "outline"}>
                        {p.sample_extraction ? "Verified" : "None"}
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
                            <AlertDialogTitle>Delete {p.customer_name}?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently remove this customer profile.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={(e) => deleteProfile(p.id, e)}>Delete</AlertDialogAction>
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

export default CustomersListPage;
