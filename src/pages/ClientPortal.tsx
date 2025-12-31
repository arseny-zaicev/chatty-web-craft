import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, LogOut, Search, RefreshCw, Upload } from "lucide-react";
import { User } from "@supabase/supabase-js";

interface ClientData {
  id: string;
  company_name: string | null;
  google_sheet_id: string;
  sheet_name: string | null;
}

interface LeadRow {
  id: string;
  data: Record<string, string>;
}

const STATUS_OPTIONS = [
  "New",
  "Contacted",
  "Qualified",
  "Meeting Scheduled",
  "Proposal Sent",
  "Closed Won",
  "Closed Lost",
];

const ClientPortal = () => {
  const [user, setUser] = useState<User | null>(null);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [updatingLeads, setUpdatingLeads] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/client-auth");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/client-auth");
      } else {
        fetchClientData(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchClientData = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching client data:", error);
        toast.error("Failed to load your account data");
        return;
      }

      if (!data) {
        toast.error("No client account found. Please contact support.");
        setIsLoading(false);
        return;
      }

      setClientData(data);
      await fetchLeads(data.id, userId);
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLeads = async (clientId: string, userId: string) => {
    setIsLoadingLeads(true);
    try {
      const { data, error } = await supabase
        .from("client_leads")
        .select("id, data")
        .eq("client_id", clientId)
        .eq("user_id", userId)
        .order("row_index", { ascending: true });

      if (error) {
        console.error("Error fetching leads:", error);
        toast.error("Failed to load leads");
        return;
      }

      const rows: LeadRow[] = (data || []).map((row) => ({
        id: row.id,
        data: (row.data as Record<string, string>) || {},
      }));

      setLeads(rows);

      // Derive headers from all keys across all rows
      const allKeys = new Set<string>();
      rows.forEach((r) => Object.keys(r.data).forEach((k) => allKeys.add(k)));
      setHeaders(Array.from(allKeys));

      toast.success(`Loaded ${rows.length} leads`);
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("Failed to load leads");
    } finally {
      setIsLoadingLeads(false);
    }
  };

  const handleCellUpdate = async (
    leadId: string,
    columnName: string,
    value: string
  ) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    const cellKey = `${leadId}-${columnName}`;
    setUpdatingLeads((prev) => new Set(prev).add(cellKey));

    const updatedData = { ...lead.data, [columnName]: value };

    try {
      const { error } = await supabase
        .from("client_leads")
        .update({ data: updatedData })
        .eq("id", leadId);

      if (error) {
        console.error("Error updating lead:", error);
        toast.error("Failed to update");
        return;
      }

      // Update local state
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, data: updatedData } : l))
      );

      toast.success("Updated");
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("Failed to update");
    } finally {
      setUpdatingLeads((prev) => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  };

  const handleRefresh = () => {
    if (clientData && user) {
      fetchLeads(clientData.id, user.id);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/client-auth");
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !clientData || !user) return;

    setIsImporting(true);

    try {
      const text = await file.text();

      let rows: Record<string, string>[] = [];

      if (file.name.endsWith(".json")) {
        const json = JSON.parse(text);
        rows = Array.isArray(json) ? json : [json];
      } else {
        // CSV parsing (simple)
        const lines = text.split(/\r?\n/).filter((line) => line.trim());
        if (lines.length === 0) {
          toast.error("Empty file");
          return;
        }
        const csvHeaders = lines[0].split(",").map((h) => h.trim());
        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(",");
          const obj: Record<string, string> = {};
          csvHeaders.forEach((h, idx) => {
            obj[h] = vals[idx]?.trim() || "";
          });
          rows.push(obj);
        }
      }

      if (rows.length === 0) {
        toast.error("No data to import");
        return;
      }

      // Insert all rows
      const inserts = rows.map((data, idx) => ({
        client_id: clientData.id,
        user_id: user.id,
        row_index: leads.length + idx + 1,
        data,
      }));

      const { error } = await supabase.from("client_leads").insert(inserts);

      if (error) {
        console.error("Import error:", error);
        toast.error("Failed to import leads");
        return;
      }

      toast.success(`Imported ${rows.length} leads`);
      await fetchLeads(clientData.id, user.id);
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to parse file");
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const filteredLeads = leads.filter((lead) =>
    Object.values(lead.data).some((val) =>
      val?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const isStatusColumn = (header: string) => {
    const statusKeywords = ["status", "stage", "state", "progress"];
    return statusKeywords.some((keyword) =>
      header.toLowerCase().includes(keyword)
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-display font-bold">
              {clientData?.company_name || "Client Portal"}
            </h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
            <CardTitle>Your Leads</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleImportClick}
                disabled={isImporting}
              >
                {isImporting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Import CSV/JSON
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={isLoadingLeads}
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoadingLeads ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingLeads ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : leads.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No leads yet</p>
                <p className="text-sm mt-2">
                  Import a CSV or JSON file to get started
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.map((header, index) => (
                        <TableHead key={index} className="whitespace-nowrap">
                          {header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.map((lead) => (
                      <TableRow key={lead.id}>
                        {headers.map((header, cellIndex) => {
                          const cellKey = `${lead.id}-${header}`;
                          const isUpdating = updatingLeads.has(cellKey);

                          // Render status dropdown for status columns
                          if (isStatusColumn(header)) {
                            return (
                              <TableCell
                                key={cellIndex}
                                className="whitespace-nowrap"
                              >
                                <Select
                                  value={lead.data[header] || ""}
                                  onValueChange={(value) =>
                                    handleCellUpdate(lead.id, header, value)
                                  }
                                  disabled={isUpdating}
                                >
                                  <SelectTrigger className="w-40">
                                    {isUpdating ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <SelectValue placeholder="Select status" />
                                    )}
                                  </SelectTrigger>
                                  <SelectContent>
                                    {STATUS_OPTIONS.map((status) => (
                                      <SelectItem key={status} value={status}>
                                        {status}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            );
                          }

                          return (
                            <TableCell
                              key={cellIndex}
                              className="whitespace-nowrap"
                            >
                              {lead.data[header] || "—"}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-sm text-muted-foreground mt-4">
                  Showing {filteredLeads.length} of {leads.length} leads
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ClientPortal;
