import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, LogOut, Plus, Users, Trash2, RefreshCw, Copy, Eye, EyeOff, ArrowLeft, Upload, Phone, MessageSquare, PhoneCall, PhoneOff, PhoneMissed, Edit, Search } from "lucide-react";
import { User } from "@supabase/supabase-js";

interface Client {
  id: string;
  user_id: string;
  company_name: string | null;
  google_sheet_id: string;
  sheet_name: string | null;
  created_at: string;
}

interface LeadRow {
  id: string;
  data: Record<string, string>;
}

const ADMIN_EMAIL = "arseny@iskra.ae";

const CALL_STATUS_OPTIONS = [
  { value: "Not Called", color: "bg-gray-400", icon: Phone },
  { value: "Answered", color: "bg-green-500", icon: PhoneCall },
  { value: "Not Answered", color: "bg-red-500", icon: PhoneOff },
  { value: "Call Back", color: "bg-yellow-500", icon: PhoneMissed },
];

const AdminPanel = () => {
  const [user, setUser] = useState<User | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // View for client leads
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientLeads, setClientLeads] = useState<LeadRow[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // New client form
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [showPassword, setShowPassword] = useState(true);
  
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        
        if (!currentUser) {
          navigate("/admin-auth");
        } else if (currentUser.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
          supabase.auth.signOut();
          navigate("/admin-auth");
          toast.error("Access denied. Admin only.");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      if (!currentUser) {
        navigate("/admin-auth");
      } else if (currentUser.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        supabase.auth.signOut();
        navigate("/admin-auth");
        toast.error("Access denied. Admin only.");
      } else {
        fetchClients();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchClients = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-clients", {
        body: { action: "list" },
      });

      if (error) {
        console.error("Error fetching clients:", error);
        const { data: directData } = await supabase
          .from("clients")
          .select("*")
          .order("created_at", { ascending: false });
        
        if (directData) {
          setClients(directData);
        }
        return;
      }

      setClients(data?.clients || []);
    } catch (error) {
      console.error("Unexpected error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchClientLeads = async (client: Client) => {
    setIsLoadingLeads(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-clients", {
        body: { action: "get-leads", clientId: client.id },
      });

      if (error) {
        console.error("Error fetching leads:", error);
        toast.error("Failed to load leads");
        return;
      }

      const rows: LeadRow[] = (data?.leads || []).map((row: { id: string; data: Record<string, string> }) => ({
        id: row.id,
        data: row.data || {},
      }));

      setClientLeads(rows);
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("Failed to load leads");
    } finally {
      setIsLoadingLeads(false);
    }
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newEmail || !newPassword) {
      toast.error("Email and password are required");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setIsAddingClient(true);

    try {
      const { data, error } = await supabase.functions.invoke("admin-clients", {
        body: {
          action: "create",
          email: newEmail.trim(),
          password: newPassword,
          companyName: newCompanyName.trim() || null,
          googleSheetId: "not-used",
          sheetName: "Sheet1",
        },
      });

      if (error) {
        console.error("Error creating client:", error);
        toast.error(error.message || "Failed to create client");
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success(
        <div className="space-y-1">
          <p>Client created!</p>
          <p className="text-xs font-mono">Email: {newEmail.trim()}</p>
          <p className="text-xs font-mono">Password: {newPassword}</p>
        </div>,
        { duration: 10000 }
      );
      
      setNewEmail("");
      setNewPassword("");
      setNewCompanyName("");
      setDialogOpen(false);
      
      fetchClients();
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("Failed to create client");
    } finally {
      setIsAddingClient(false);
    }
  };

  const handleDeleteClient = async (clientId: string, userId: string) => {
    if (!confirm("Are you sure you want to delete this client and ALL their leads?")) return;

    try {
      const { data, error } = await supabase.functions.invoke("admin-clients", {
        body: { action: "delete", clientId, userId },
      });

      if (error || data?.error) {
        toast.error(error?.message || data?.error || "Failed to delete client");
        return;
      }

      toast.success("Client deleted");
      fetchClients();
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("Failed to delete client");
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!confirm("Delete this lead?")) return;

    try {
      const { data, error } = await supabase.functions.invoke("admin-clients", {
        body: { action: "delete-lead", leadId },
      });

      if (error || data?.error) {
        toast.error("Failed to delete lead");
        return;
      }

      toast.success("Lead deleted");
      setClientLeads(prev => prev.filter(l => l.id !== leadId));
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("Failed to delete lead");
    }
  };

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    fetchClientLeads(client);
  };

  const handleBackToClients = () => {
    setSelectedClient(null);
    setClientLeads([]);
    setSearchTerm("");
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedClient) return;

    setIsImporting(true);

    try {
      const text = await file.text();
      let rows: Record<string, string>[] = [];

      if (file.name.endsWith(".json")) {
        const json = JSON.parse(text);
        rows = Array.isArray(json) ? json : [json];
      } else {
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
          if (vals.every(v => !v)) continue;
          
          const obj: Record<string, string> = {};
          csvHeaders.forEach((h, idx) => {
            if (h) obj[h] = vals[idx] || "";
          });
          if (obj["Lead Name"] || obj["Phone Number"]) {
            rows.push(obj);
          }
        }
      }

      if (rows.length === 0) {
        toast.error("No valid data to import");
        return;
      }

      const { data, error } = await supabase.functions.invoke("admin-clients", {
        body: {
          action: "import-leads",
          clientId: selectedClient.id,
          userId: selectedClient.user_id,
          leads: rows,
        },
      });

      if (error || data?.error) {
        console.error("Import error:", error || data?.error);
        toast.error("Failed to import leads");
        return;
      }

      toast.success(`Imported ${rows.length} leads`);
      fetchClientLeads(selectedClient);
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin-auth");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(password);
  };

  const getCallStatusOption = (status: string) => {
    return CALL_STATUS_OPTIONS.find(s => s.value === status) || CALL_STATUS_OPTIONS[0];
  };

  const filteredLeads = clientLeads.filter((lead) =>
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

  // Client Leads View
  if (selectedClient) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={handleBackToClients}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-display font-bold">{selectedClient.company_name || "Client"}</h1>
                <p className="text-sm text-muted-foreground">{clientLeads.length} leads</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button onClick={handleImportClick} disabled={isImporting}>
                {isImporting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Import CSV
              </Button>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6">
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search leads..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 max-w-md"
              />
            </div>
          </div>

          {isLoadingLeads ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : clientLeads.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <p>No leads yet</p>
                <p className="text-sm mt-2">Import a CSV file to add leads</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredLeads.map((lead) => {
                const name = lead.data["Lead Name"] || "Unknown";
                const phone = lead.data["Phone Number"] || "";
                const callStatus = lead.data["Call Status"] || "Not Called";
                const callCount = lead.data["Call Count"] || "0";
                const lastCallDate = lead.data["Last Call Date"] || "";
                const clientComment = lead.data["Client Comment"] || "";
                const details = lead.data["Details"] || "";
                const statusOption = getCallStatusOption(callStatus);

                return (
                  <Card key={lead.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold">{name}</span>
                            <Badge className={`${statusOption.color} text-white text-xs`}>
                              <statusOption.icon className="h-3 w-3 mr-1" />
                              {callStatus}
                            </Badge>
                          </div>
                          
                          {phone && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                              <Phone className="h-4 w-4" />
                              <span>{phone}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => copyToClipboard(phone)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-2">
                            <span>{callCount} calls</span>
                            {lastCallDate && <span>Last call: {lastCallDate}</span>}
                          </div>

                          {details && (
                            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{details}</p>
                          )}

                          {clientComment && (
                            <div className="bg-muted/50 rounded-lg p-3 mt-2">
                              <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" />
                                Client Comment
                              </p>
                              <p className="text-sm">{clientComment}</p>
                            </div>
                          )}
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive shrink-0"
                          onClick={() => handleDeleteLead(lead.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </main>
      </div>
    );
  }

  // Clients List View
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold">Admin Panel</h1>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Clients</CardTitle>
              <CardDescription>Click on a client to manage their leads</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={fetchClients}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Client
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Client</DialogTitle>
                    <DialogDescription>
                      Create a client account. You can import leads after.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAddClient} className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="clientEmail">Client Email *</Label>
                      <Input
                        id="clientEmail"
                        type="email"
                        placeholder="client@company.com"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="clientPassword">Password *</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            id="clientPassword"
                            type={showPassword ? "text" : "password"}
                            placeholder="Min 6 characters"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            className="pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                        <Button type="button" variant="outline" onClick={generatePassword}>
                          Generate
                        </Button>
                        {newPassword && (
                          <Button type="button" variant="outline" size="icon" onClick={() => copyToClipboard(newPassword)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Company Name</Label>
                      <Input
                        id="companyName"
                        placeholder="Acme Inc"
                        value={newCompanyName}
                        onChange={(e) => setNewCompanyName(e.target.value)}
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isAddingClient}>
                        {isAddingClient ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          "Create Client"
                        )}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {clients.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No clients yet</p>
                <p className="text-sm mt-2">Click "Add Client" to create the first one</p>
              </div>
            ) : (
              <div className="space-y-2">
                {clients.map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleSelectClient(client)}
                  >
                    <div>
                      <p className="font-medium">{client.company_name || "Unnamed Client"}</p>
                      <p className="text-sm text-muted-foreground">
                        Created {new Date(client.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClient(client.id, client.user_id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminPanel;
