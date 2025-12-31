import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, LogOut, Search, RefreshCw, Upload, Phone, MapPin, User as UserIcon, Calendar, MessageSquare } from "lucide-react";
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
  { value: "New", color: "bg-blue-500" },
  { value: "Contacted", color: "bg-yellow-500" },
  { value: "Qualified", color: "bg-purple-500" },
  { value: "Meeting Scheduled", color: "bg-orange-500" },
  { value: "Interested", color: "bg-emerald-500" },
  { value: "Not Interested", color: "bg-gray-500" },
  { value: "Closed Won", color: "bg-green-600" },
  { value: "Closed Lost", color: "bg-red-500" },
];

const ClientPortal = () => {
  const [user, setUser] = useState<User | null>(null);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [updatingLeads, setUpdatingLeads] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
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
      toast.success(`Loaded ${rows.length} leads`);
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("Failed to load leads");
    } finally {
      setIsLoadingLeads(false);
    }
  };

  const handleStatusUpdate = async (leadId: string, value: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    const cellKey = `${leadId}-Status`;
    setUpdatingLeads((prev) => new Set(prev).add(cellKey));

    const updatedData = { ...lead.data, Status: value, "Status Date Change": new Date().toLocaleDateString() };

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

      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, data: updatedData } : l))
      );

      toast.success("Status updated");
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
        // Improved CSV parsing that handles quoted fields
        const lines = text.split(/\r?\n/).filter((line) => line.trim());
        if (lines.length === 0) {
          toast.error("Empty file");
          return;
        }
        
        const parseCSVLine = (line: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result;
        };
        
        const csvHeaders = parseCSVLine(lines[0]);
        for (let i = 1; i < lines.length; i++) {
          const vals = parseCSVLine(lines[i]);
          // Skip empty rows
          if (vals.every(v => !v)) continue;
          
          const obj: Record<string, string> = {};
          csvHeaders.forEach((h, idx) => {
            if (h) obj[h] = vals[idx] || "";
          });
          // Only add if has a name or phone
          if (obj["Lead Name"] || obj["Phone Number"]) {
            rows.push(obj);
          }
        }
      }

      if (rows.length === 0) {
        toast.error("No valid data to import");
        return;
      }

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
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const formatPhoneForCall = (phone: string): string => {
    // Remove all non-digit characters
    return phone.replace(/\D/g, '');
  };

  const getStatusColor = (status: string): string => {
    const found = STATUS_OPTIONS.find(s => s.value.toLowerCase() === status?.toLowerCase());
    return found?.color || "bg-gray-400";
  };

  const filteredLeads = leads.filter((lead) =>
    Object.values(lead.data).some((val) =>
      val?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

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
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg md:text-xl font-display font-bold">
              {clientData?.company_name || "Leads"}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-2 md:px-4 py-4 md:py-8">
        <Card>
          <CardHeader className="p-3 md:p-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base md:text-xl">Your Leads ({leads.length})</CardTitle>
                <div className="flex items-center gap-2">
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
                    className="hidden md:flex"
                  >
                    {isImporting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Import
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleRefresh}
                    disabled={isLoadingLeads}
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoadingLeads ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search leads..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-2 md:p-6 pt-0">
            {isLoadingLeads ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : leads.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No leads yet</p>
                <p className="text-sm mt-2">Import a CSV or JSON file to get started</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={handleImportClick}
                  disabled={isImporting}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import CSV/JSON
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLeads.map((lead) => {
                  const isExpanded = expandedLead === lead.id;
                  const isUpdating = updatingLeads.has(`${lead.id}-Status`);
                  const phone = lead.data["Phone Number"] || "";
                  const name = lead.data["Lead Name"] || "Unknown";
                  const location = lead.data["Location"] || "";
                  const status = lead.data["Status"] || "New";
                  const date = lead.data["Date"] || "";
                  const details = lead.data["Details"] || "";
                  const callDetails = lead.data["Details from the call"] || "";
                  const source = lead.data["Source"] || "";
                  const interestType = lead.data["Interest Type"] || "";

                  return (
                    <div
                      key={lead.id}
                      className="border rounded-lg bg-card overflow-hidden"
                    >
                      {/* Lead Card Header */}
                      <div 
                        className="p-3 md:p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => setExpandedLead(isExpanded ? null : lead.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="font-semibold truncate">{name}</span>
                            </div>
                            
                            {/* Phone - Click to Call */}
                            {phone && (
                              <a
                                href={`tel:${formatPhoneForCall(phone)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-2 text-primary hover:underline mb-1"
                              >
                                <Phone className="h-4 w-4 shrink-0" />
                                <span className="text-sm font-medium">{phone}</span>
                              </a>
                            )}
                            
                            {/* Location snippet */}
                            {location && (
                              <div className="flex items-start gap-2 text-muted-foreground">
                                <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                                <span className="text-xs line-clamp-1">{location}</span>
                              </div>
                            )}
                          </div>
                          
                          {/* Status Badge & Selector */}
                          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                            <Select
                              value={status}
                              onValueChange={(value) => handleStatusUpdate(lead.id, value)}
                              disabled={isUpdating}
                            >
                              <SelectTrigger className="w-auto h-8 border-0 bg-transparent p-0">
                                {isUpdating ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Badge className={`${getStatusColor(status)} text-white text-xs cursor-pointer`}>
                                    {status || "New"}
                                  </Badge>
                                )}
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    <div className="flex items-center gap-2">
                                      <div className={`w-2 h-2 rounded-full ${opt.color}`} />
                                      {opt.value}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        
                        {/* Quick Info Row */}
                        <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                          {date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {date}
                            </span>
                          )}
                          {source && (
                            <span className="bg-muted px-2 py-0.5 rounded">{source}</span>
                          )}
                          {interestType && (
                            <span className="bg-muted px-2 py-0.5 rounded">{interestType}</span>
                          )}
                        </div>
                      </div>
                      
                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="border-t p-3 md:p-4 bg-muted/20 space-y-3">
                          {details && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" />
                                Details
                              </p>
                              <p className="text-sm whitespace-pre-wrap">{details}</p>
                            </div>
                          )}
                          {callDetails && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Call Notes</p>
                              <p className="text-sm whitespace-pre-wrap">{callDetails}</p>
                            </div>
                          )}
                          {location && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Full Location</p>
                              <p className="text-sm whitespace-pre-wrap">{location}</p>
                            </div>
                          )}
                          
                          {/* Large Call Button */}
                          {phone && (
                            <a
                              href={`tel:${formatPhoneForCall(phone)}`}
                              className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-medium transition-colors"
                            >
                              <Phone className="h-5 w-5" />
                              Call {name}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                
                <p className="text-sm text-muted-foreground text-center pt-2">
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
