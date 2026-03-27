import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

interface DraftRow {
  id: string;
  status: string;
  source: string;
  created_at: string;
  from_email: string | null;
  error_message: string | null;
  customer_profile_id: string | null;
}

interface ProfileOption {
  id: string;
  customer_name: string;
}

const ActivityLogPage = () => {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    const load = async () => {
      const { data: pData } = await supabase.from("customer_profiles").select("id, customer_name").order("customer_name");
      if (pData) {
        setProfiles(pData as ProfileOption[]);
        const map: Record<string, string> = {};
        pData.forEach((p: any) => { map[p.id] = p.customer_name; });
        setProfileMap(map);
      }

      const { data: dData } = await supabase
        .from("consignment_drafts")
        .select("id, status, source, created_at, from_email, error_message, customer_profile_id")
        .order("created_at", { ascending: false })
        .limit(200);
      if (dData) setDrafts(dData as DraftRow[]);
    };
    load();
  }, []);

  const filtered = drafts.filter((d) => {
    if (filterCustomer !== "all" && d.customer_profile_id !== filterCustomer) return false;
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Activity Log</CardTitle>
          <div className="flex gap-2">
            <Select value={filterCustomer} onValueChange={setFilterCustomer}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All customers</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.customer_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No activity yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>From Email</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm">{new Date(d.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-sm font-medium">
                      {d.customer_profile_id ? profileMap[d.customer_profile_id] || "Unknown" : "—"}
                    </TableCell>
                    <TableCell><Badge variant="outline">{d.source}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={d.status === "submitted" ? "default" : d.status === "failed" ? "destructive" : "secondary"}>
                        {d.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.from_email || "—"}</TableCell>
                    <TableCell className="text-sm text-destructive max-w-[200px] truncate">{d.error_message || ""}</TableCell>
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

export default ActivityLogPage;
