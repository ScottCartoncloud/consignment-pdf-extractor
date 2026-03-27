import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { CalendarIcon, ChevronDown, ChevronRight, Search, Download } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface DraftRow {
  id: string;
  status: string;
  source: string;
  created_at: string;
  from_email: string | null;
  error_message: string | null;
  customer_profile_id: string | null;
  mapped_payload: any;
  cc_response: any;
  raw_extraction: any;
}

interface ProfileOption {
  id: string;
  customer_name: string;
}

const PAGE_SIZE = 20;

const ActivityLogPage = () => {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchRef, setSearchRef] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load profiles once
  useEffect(() => {
    const loadProfiles = async () => {
      const { data } = await supabase.from("customer_profiles").select("id, customer_name").order("customer_name");
      if (data) {
        setProfiles(data as ProfileOption[]);
        const map: Record<string, string> = {};
        data.forEach((p: any) => { map[p.id] = p.customer_name; });
        setProfileMap(map);
      }
    };
    loadProfiles();
  }, []);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("consignment_drafts")
      .select("id, status, source, created_at, from_email, error_message, customer_profile_id, mapped_payload, cc_response, raw_extraction", { count: "exact" })
      .in("status", filterStatus !== "all" ? [filterStatus] : ["submitted", "failed"])

    if (filterCustomer !== "all") query = query.eq("customer_profile_id", filterCustomer);
    if (filterStatus !== "all") query = query.eq("status", filterStatus);
    if (dateFrom) query = query.gte("created_at", dateFrom.toISOString());
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      query = query.lte("created_at", end.toISOString());
    }

    query = query.order("created_at", { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    const { data, count } = await query;
    if (data) setDrafts(data as DraftRow[]);
    if (count !== null) setTotalCount(count);
    setLoading(false);
  }, [filterCustomer, filterStatus, dateFrom, dateTo, page]);

  useEffect(() => { fetchDrafts(); }, [fetchDrafts]);

  // Reset to page 0 when filters change
  useEffect(() => { setPage(0); }, [filterCustomer, filterStatus, dateFrom, dateTo, searchRef]);

  // Client-side reference filter (reference is inside JSON)
  const filtered = searchRef.trim()
    ? drafts.filter((d) => {
        const ref = d.mapped_payload?.references?.customer || d.cc_response?.references?.customer || "";
        return ref.toLowerCase().includes(searchRef.trim().toLowerCase());
      })
    : drafts;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getReference = (d: DraftRow) => {
    return d.mapped_payload?.references?.customer || d.cc_response?.references?.customer || "—";
  };

  const handleDownloadPayload = (d: DraftRow) => {
    const data = d.mapped_payload || d.raw_extraction || {};
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consignment-${d.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Activity Log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters row */}
          <div className="flex flex-wrap items-end gap-3">
            {/* Date range */}
            <div className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <span className="pb-2 text-sm text-muted-foreground">–</span>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "End date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            </div>

            {/* Reference search */}
            <div className="space-y-1.5">
              <Label className="text-xs">Reference</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchRef}
                  onChange={(e) => setSearchRef(e.target.value)}
                  placeholder="Search reference…"
                  className="pl-8 w-[180px]"
                />
              </div>
            </div>

            {/* Customer filter */}
            <div className="space-y-1.5">
              <Label className="text-xs">Customer</Label>
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
            </div>

            {/* Status filter */}
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="submitted">Success</SelectItem>
                  <SelectItem value="failed">Error</SelectItem>
                  
                </SelectContent>
              </Select>
            </div>

            {/* Clear filters */}
            {(dateFrom || dateTo || searchRef || filterCustomer !== "all" || filterStatus !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setSearchRef(""); setFilterCustomer("all"); setFilterStatus("all"); }}>
                Clear
              </Button>
            )}
          </div>

          {/* Table */}
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No activity found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => {
                  const isExpanded = expandedId === d.id;
                  const isError = d.status === "failed";
                  const isSuccess = d.status === "submitted";

                  return (
                    <>
                      <TableRow
                        key={d.id}
                        className={cn(
                          "cursor-pointer transition-colors",
                          isError && "hover:bg-red-50",
                          isSuccess && "hover:bg-green-50"
                        )}
                        onClick={() => isError ? setExpandedId(isExpanded ? null : d.id) : undefined}
                      >
                        <TableCell className="w-8 pr-0">
                          {isError && (
                            isExpanded
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{new Date(d.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-sm font-medium">
                          {d.customer_profile_id ? profileMap[d.customer_profile_id] || "Unknown" : "—"}
                        </TableCell>
                        <TableCell className="text-sm font-mono">{getReference(d)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{d.source}</Badge>
                        </TableCell>
                        <TableCell>
                          {isSuccess && (
                            <Badge className="bg-green-600 text-white hover:bg-green-700 border-0">
                              Success
                            </Badge>
                          )}
                          {isError && (
                            <Badge className="bg-red-600 text-white hover:bg-red-700 border-0">
                              Error
                            </Badge>
                          )}
                          {!isSuccess && !isError && (
                            <Badge variant="outline">{d.status}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && isError && (
                        <TableRow key={`${d.id}-detail`}>
                          <TableCell colSpan={6} className="bg-red-50 border-l-4 border-red-400 py-4 px-6">
                            <div className="space-y-3">
                              <div>
                                <p className="text-xs font-semibold text-red-800 uppercase tracking-wide mb-1">Error Message</p>
                                <p className="text-sm text-red-900 whitespace-pre-wrap break-all font-mono bg-white/60 rounded p-3 border border-red-200">
                                  {d.error_message || "No error message recorded."}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => { e.stopPropagation(); handleDownloadPayload(d); }}
                                className="text-xs"
                              >
                                <Download className="h-3.5 w-3.5 mr-1.5" />
                                Download payload
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ActivityLogPage;
