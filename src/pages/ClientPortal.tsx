import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, LogOut, Search, RefreshCw, Phone, MapPin, User as UserIcon, Calendar, MessageSquare, Copy, Check, PhoneCall, PhoneOff, PhoneMissed, Bell, BarChart3 } from "lucide-react";
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

const CALL_STATUS_OPTIONS = [
  { value: "Not Called", label: "Not Called", icon: Phone, color: "bg-gray-400" },
  { value: "Answered", label: "Answered", icon: PhoneCall, color: "bg-green-500" },
  { value: "Not Answered", label: "Not Answered", icon: PhoneOff, color: "bg-red-500" },
  { value: "Call Back", label: "Call Back", icon: PhoneMissed, color: "bg-yellow-500" },
];

const ClientPortal = () => {
  const [user, setUser] = useState<User | null>(null);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [updatingLeads, setUpdatingLeads] = useState<Set<string>>(new Set());
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [editingCallDetails, setEditingCallDetails] = useState<string | null>(null);
  const [callDetailsText, setCallDetailsText] = useState("");
  const [showStatusReminder, setShowStatusReminder] = useState(false);
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
      
      // Check for uncalled leads and show reminder after 13 seconds
      const uncalledLeads = rows.filter(l => !l.data["Call Status"] || l.data["Call Status"] === "Not Called");
      if (uncalledLeads.length > 0 && rows.length > 0) {
        setTimeout(() => setShowStatusReminder(true), 13000);
      }
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("Failed to load leads");
    } finally {
      setIsLoadingLeads(false);
    }
  };

  const handleLeadUpdate = async (leadId: string, updates: Record<string, string>) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    const cellKey = `${leadId}-update`;
    setUpdatingLeads((prev) => new Set(prev).add(cellKey));

    const updatedData = { ...lead.data, ...updates };

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

  const handleCallStatusChange = (leadId: string, status: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    const currentCalls = parseInt(lead.data["Call Count"] || "0", 10);
    const updates: Record<string, string> = {
      "Call Status": status,
      "Last Call Date": new Date().toLocaleDateString(),
    };

    // Increment call count only when marking as called (not for "Not Called")
    if (status !== "Not Called") {
      updates["Call Count"] = String(currentCalls + 1);
    }

    handleLeadUpdate(leadId, updates);
  };

  const handleSaveComment = (leadId: string) => {
    handleLeadUpdate(leadId, { "Client Comment": commentText });
    setEditingComment(null);
    setCommentText("");
  };

  const handleSaveCallDetails = (leadId: string) => {
    handleLeadUpdate(leadId, { "Details from the call": callDetailsText });
    setEditingCallDetails(null);
    setCallDetailsText("");
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

  const copyToClipboard = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    toast.success("Phone copied");
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  const getCallStatusOption = (status: string) => {
    return CALL_STATUS_OPTIONS.find(s => s.value === status) || CALL_STATUS_OPTIONS[0];
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
          <div className="flex items-center gap-2">
            <Link to="/client-stats">
              <Button variant="outline" size="sm">
                <BarChart3 className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Statistics</span>
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-2 md:px-4 py-4 md:py-8">
        <Card>
          <CardHeader className="p-3 md:p-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base md:text-xl">Your Leads ({leads.length})</CardTitle>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleRefresh}
                  disabled={isLoadingLeads}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingLeads ? "animate-spin" : ""}`} />
                </Button>
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
                <p className="text-sm mt-2">Leads will appear here when added by admin</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLeads.map((lead) => {
                  const isExpanded = expandedLead === lead.id;
                  const isUpdating = updatingLeads.has(`${lead.id}-update`);
                  const phone = lead.data["Phone Number"] || "";
                  const name = lead.data["Lead Name"] || "Unknown";
                  const location = lead.data["Location"] || "";
                  const date = lead.data["Date"] || "";
                  const details = lead.data["Details"] || "";
                  const source = lead.data["Source"] || "";
                  const interestType = lead.data["Interest Type"] || "";
                  const callStatus = lead.data["Call Status"] || "Not Called";
                  const callCount = lead.data["Call Count"] || "0";
                  const lastCallDate = lead.data["Last Call Date"] || "";
                  const clientComment = lead.data["Client Comment"] || "";
                  const statusOption = getCallStatusOption(callStatus);

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
                            
                            {/* Phone with Copy */}
                            {phone && (
                              <div className="flex items-center gap-2 mb-1">
                                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-sm font-medium">{phone}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(phone);
                                  }}
                                >
                                  {copiedPhone === phone ? (
                                    <Check className="h-3 w-3 text-green-500" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            )}
                            
                            {/* Location snippet */}
                            {location && (
                              <div className="flex items-start gap-2 text-muted-foreground">
                                <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                                <span className="text-xs line-clamp-1">{location}</span>
                              </div>
                            )}
                          </div>
                          
                          {/* Call Status & Count */}
                          <div className="shrink-0 flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Select
                              value={callStatus}
                              onValueChange={(value) => handleCallStatusChange(lead.id, value)}
                              disabled={isUpdating}
                            >
                              <SelectTrigger className="w-auto h-8 border-0 bg-transparent p-0">
                                {isUpdating ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Badge className={`${statusOption.color} text-white text-xs cursor-pointer`}>
                                    <statusOption.icon className="h-3 w-3 mr-1" />
                                    {statusOption.label}
                                  </Badge>
                                )}
                              </SelectTrigger>
                              <SelectContent className="bg-popover border shadow-lg">
                                {CALL_STATUS_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    <div className="flex items-center gap-2">
                                      <opt.icon className="h-4 w-4" />
                                      {opt.label}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <span className="text-xs text-muted-foreground">
                              {callCount} calls
                            </span>
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
                          {lastCallDate && (
                            <span className="flex items-center gap-1 text-primary">
                              <PhoneCall className="h-3 w-3" />
                              Last: {lastCallDate}
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
                          {location && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Full Location</p>
                              <p className="text-sm whitespace-pre-wrap">{location}</p>
                            </div>
                          )}
                          
                          {/* Client editable: Details from the call */}
                          <div className="pt-2 border-t">
                            <p className="text-xs font-medium text-emerald-500 mb-2 flex items-center gap-1">
                              <PhoneCall className="h-3 w-3" />
                              Details from the call <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">your zone</span>
                            </p>
                            {editingCallDetails === lead.id ? (
                              <div className="space-y-2">
                                <Textarea
                                  value={callDetailsText}
                                  onChange={(e) => setCallDetailsText(e.target.value)}
                                  placeholder="Add details from your call..."
                                  className="min-h-[80px] bg-background/50 border-border"
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleSaveCallDetails(lead.id)}
                                    disabled={isUpdating}
                                    className="bg-emerald-600 hover:bg-emerald-700"
                                  >
                                    {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setEditingCallDetails(null);
                                      setCallDetailsText("");
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div
                                className="bg-emerald-500/10 rounded-lg p-3 min-h-[60px] cursor-pointer hover:bg-emerald-500/20 transition-colors border border-emerald-500/30"
                                onClick={() => {
                                  setEditingCallDetails(lead.id);
                                  setCallDetailsText(lead.data["Details from the call"] || "");
                                }}
                              >
                                {lead.data["Details from the call"] ? (
                                  <p className="text-sm whitespace-pre-wrap">{lead.data["Details from the call"]}</p>
                                ) : (
                                  <p className="text-sm text-muted-foreground italic">Click to add call details...</p>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Comment Section */}
                          <div className="pt-2 border-t border-border/50">
                            <p className="text-xs font-medium text-emerald-500 mb-2 flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              Your Comment <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">your zone</span>
                            </p>
                            {editingComment === lead.id ? (
                              <div className="space-y-2">
                                <Textarea
                                  value={commentText}
                                  onChange={(e) => setCommentText(e.target.value)}
                                  placeholder="Add your notes about this lead..."
                                  className="min-h-[80px] bg-background/50 border-border"
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleSaveComment(lead.id)}
                                    disabled={isUpdating}
                                    className="bg-emerald-600 hover:bg-emerald-700"
                                  >
                                    {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setEditingComment(null);
                                      setCommentText("");
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div
                                className="bg-emerald-500/10 rounded-lg p-3 min-h-[60px] cursor-pointer hover:bg-emerald-500/20 transition-colors border border-emerald-500/30"
                                onClick={() => {
                                  setEditingComment(lead.id);
                                  setCommentText(clientComment);
                                }}
                              >
                                {clientComment ? (
                                  <p className="text-sm whitespace-pre-wrap">{clientComment}</p>
                                ) : (
                                  <p className="text-sm text-muted-foreground italic">Click to add a comment...</p>
                                )}
                              </div>
                            )}
                          </div>
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

      {/* Status Reminder Popup */}
      <Dialog open={showStatusReminder} onOpenChange={setShowStatusReminder}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Don't Forget to Update Statuses!
            </DialogTitle>
            <DialogDescription className="pt-2 space-y-3">
              <p>
                You have leads that haven't been called yet. Please update the call status after each call:
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Badge className="bg-green-500 text-white text-xs">Answered</Badge>
                  <span>— if the lead answered</span>
                </li>
                <li className="flex items-center gap-2">
                  <Badge className="bg-red-500 text-white text-xs">Not Answered</Badge>
                  <span>— if no answer</span>
                </li>
                <li className="flex items-center gap-2">
                  <Badge className="bg-yellow-500 text-white text-xs">Call Back</Badge>
                  <span>— if they asked to call later</span>
                </li>
              </ul>
              <p className="text-xs text-muted-foreground">
                This helps us track performance and improve lead quality!
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end pt-2">
            <Button onClick={() => setShowStatusReminder(false)}>
              Got it!
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientPortal;
