import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, LogOut, Plus, Users, Trash2, RefreshCw, Copy, Eye, EyeOff, ArrowLeft, Save, X, Key } from "lucide-react";
import { User } from "@supabase/supabase-js";

interface Client {
  id: string;
  user_id: string;
  company_name: string | null;
  google_sheet_id: string;
  sheet_name: string | null;
  password: string | null;
  created_at: string;
}

interface LeadRow {
  id: string;
  data: Record<string, string>;
  isNew?: boolean;
}

const ADMIN_EMAIL = "arseny@iskra.ae";

// Admin zone: editable by admin only
// Client zone: fields after Status - editable by client
const COLUMNS = [
  { key: "Lead Name", width: "150px", zone: "admin" },
  { key: "Phone Number", width: "130px", zone: "admin" },
  { key: "Location", width: "200px", zone: "admin" },
  { key: "Interest Type", width: "100px", type: "select", options: ["Seller", "Buyer", "Investor", "Tenant"], zone: "admin" },
  { key: "Source", width: "100px", type: "select", options: ["WhatsApp", "Call", "Website", "Referral", "Other"], zone: "admin" },
  { key: "Details", width: "250px", zone: "admin" },
  { key: "Date", width: "100px", zone: "admin" },
  { key: "Status", width: "120px", type: "select", options: ["", "New", "Contacted", "Interested", "Not Interested", "Closed"], zone: "admin" },
  // Client zone starts here
  { key: "Allocated To", width: "120px", zone: "client" },
  { key: "Details from the call", width: "200px", zone: "client" },
  { key: "Call Status", width: "120px", type: "select", options: ["Not Called", "Answered", "Not Answered", "Call Back"], zone: "client" },
  { key: "Call Count", width: "80px", zone: "client" },
  { key: "Last Call Date", width: "100px", zone: "client" },
  { key: "Client Comment", width: "200px", zone: "client" },
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
  const [isSaving, setIsSaving] = useState(false);
  const [editedCells, setEditedCells] = useState<Set<string>>(new Set());
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  
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
      setEditedCells(new Set());
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
    if (!confirm("Delete this client and ALL their leads?")) return;

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

  const handleResetPassword = async (userId: string, companyName: string) => {
    const newPassword = prompt(`Введите новый пароль для ${companyName || "клиента"} (мин. 6 символов):`);
    if (!newPassword) return;

    if (newPassword.length < 6) {
      toast.error("Пароль должен быть минимум 6 символов");
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("admin-clients", {
        body: { action: "reset-password", userId, newPassword },
      });

      if (error || data?.error) {
        toast.error(error?.message || data?.error || "Failed to reset password");
        return;
      }

      toast.success(
        <div className="space-y-1">
          <p>Пароль изменён!</p>
          <p className="text-xs font-mono">Новый пароль: {newPassword}</p>
        </div>,
        { duration: 10000 }
      );
      fetchClients(); // Refresh to show new password
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("Failed to reset password");
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    const lead = clientLeads.find(l => l.id === leadId);
    
    // If it's a new unsaved row, just remove from state
    if (lead?.isNew) {
      setClientLeads(prev => prev.filter(l => l.id !== leadId));
      return;
    }

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
    if (editedCells.size > 0) {
      if (!confirm("You have unsaved changes. Discard them?")) return;
    }
    setSelectedClient(null);
    setClientLeads([]);
    setEditedCells(new Set());
  };

  const handleAddRow = () => {
    const newRow: LeadRow = {
      id: `new-${Date.now()}`,
      data: {
        "Lead Name": "",
        "Phone Number": "",
        "Location": "",
        "Interest Type": "Seller",
        "Source": "WhatsApp",
        "Details": "",
        "Date": new Date().toLocaleDateString("en-GB"),
        "Status": "",
        "Allocated To": "",
        "Details from the call": "",
        "Call Status": "Not Called",
        "Call Count": "0",
        "Last Call Date": "",
        "Client Comment": "",
      },
      isNew: true,
    };
    setClientLeads(prev => [...prev, newRow]);
  };

  const handleCellChange = (leadId: string, columnKey: string, value: string) => {
    setClientLeads(prev => prev.map(lead => {
      if (lead.id === leadId) {
        return { ...lead, data: { ...lead.data, [columnKey]: value } };
      }
      return lead;
    }));
    setEditedCells(prev => new Set(prev).add(`${leadId}-${columnKey}`));
  };

  const handleSaveAll = async () => {
    if (!selectedClient) return;
    
    setIsSaving(true);
    
    try {
      // Separate new and existing leads
      const newLeads = clientLeads.filter(l => l.isNew);
      const existingLeads = clientLeads.filter(l => !l.isNew && editedCells.has(`${l.id}-`));
      
      // Find all edited existing leads
      const editedExistingLeads: LeadRow[] = [];
      clientLeads.forEach(lead => {
        if (!lead.isNew) {
          const hasEdits = COLUMNS.some(col => editedCells.has(`${lead.id}-${col.key}`));
          if (hasEdits) {
            editedExistingLeads.push(lead);
          }
        }
      });

      // Save new leads
      if (newLeads.length > 0) {
        const { error } = await supabase.functions.invoke("admin-clients", {
          body: {
            action: "import-leads",
            clientId: selectedClient.id,
            userId: selectedClient.user_id,
            leads: newLeads.map(l => l.data),
          },
        });

        if (error) {
          console.error("Error saving new leads:", error);
          toast.error("Failed to save new leads");
          return;
        }
      }

      // Update existing leads
      for (const lead of editedExistingLeads) {
        const { error } = await supabase.functions.invoke("admin-clients", {
          body: {
            action: "update-lead",
            leadId: lead.id,
            data: lead.data,
          },
        });

        if (error) {
          console.error("Error updating lead:", error);
        }
      }

      toast.success("Saved!");
      setEditedCells(new Set());
      
      // Refresh to get proper IDs for new rows
      fetchClientLeads(selectedClient);
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Failed to save");
    } finally {
      setIsSaving(false);
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

  const hasUnsavedChanges = editedCells.size > 0 || clientLeads.some(l => l.isNew);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Spreadsheet View for Client Leads
  if (selectedClient) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b bg-card shrink-0">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={handleBackToClients}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-lg font-display font-bold">{selectedClient.company_name || "Client"}</h1>
                <p className="text-sm text-muted-foreground">{clientLeads.length} leads</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleAddRow}>
                <Plus className="h-4 w-4 mr-1" />
                Add Row
              </Button>
              <Button 
                size="sm" 
                onClick={handleSaveAll} 
                disabled={!hasUnsavedChanges || isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Save
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          {isLoadingLeads ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-max border-collapse text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted">
                    <th className="border border-border px-2 py-2 text-left font-medium w-10">#</th>
                    {COLUMNS.map(col => (
                      <th 
                        key={col.key} 
                        className={`border border-border px-2 py-2 text-left font-medium whitespace-nowrap ${
                          col.zone === "client" ? "bg-blue-600/20 text-blue-200" : ""
                        }`}
                        style={{ minWidth: col.width }}
                      >
                        {col.key}
                        {col.zone === "client" && (
                          <span className="ml-1 text-[10px] text-blue-300 font-normal">(client)</span>
                        )}
                      </th>
                    ))}
                    <th className="border border-border px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {clientLeads.map((lead, index) => (
                    <tr key={lead.id} className={lead.isNew ? "bg-green-50 dark:bg-green-950/20" : ""}>
                      <td className="border border-border px-2 py-1 text-muted-foreground text-center">
                        {index + 1}
                      </td>
                      {COLUMNS.map(col => {
                        const cellKey = `${lead.id}-${col.key}`;
                        const isEdited = editedCells.has(cellKey);
                        const value = lead.data[col.key] || "";
                        const isClientZone = col.zone === "client";
                        const clientZoneClass = isClientZone ? "bg-blue-600/10" : "";
                        
                        if (col.type === "select") {
                          return (
                            <td key={col.key} className={`border border-border p-0 ${clientZoneClass}`}>
                              <Select
                                value={value}
                                onValueChange={(v) => handleCellChange(lead.id, col.key, v)}
                              >
                                <SelectTrigger className={`border-0 rounded-none h-8 text-xs ${isEdited ? "bg-yellow-100 dark:bg-yellow-900/30" : ""}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-popover border shadow-lg">
                                  {col.options?.map(opt => (
                                    <SelectItem key={opt} value={opt || "empty"}>
                                      {opt || "(empty)"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          );
                        }
                        
                        return (
                          <td key={col.key} className={`border border-border p-0 ${clientZoneClass}`}>
                            <Input
                              value={value}
                              onChange={(e) => handleCellChange(lead.id, col.key, e.target.value)}
                              className={`border-0 rounded-none h-8 text-xs focus-visible:ring-1 focus-visible:ring-inset ${isEdited ? "bg-yellow-100 dark:bg-yellow-900/30" : ""}`}
                            />
                          </td>
                        );
                      })}
                      <td className="border border-border px-1 py-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteLead(lead.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {/* Empty row hint */}
                  <tr>
                    <td 
                      colSpan={COLUMNS.length + 2} 
                      className="border border-border px-4 py-3 text-center text-muted-foreground cursor-pointer hover:bg-muted/50"
                      onClick={handleAddRow}
                    >
                      <Plus className="h-4 w-4 inline mr-2" />
                      Click to add new lead
                    </td>
                  </tr>
                </tbody>
              </table>
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
              <CardDescription>Click to open and manage leads</CardDescription>
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
                      Create a client account
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
              </div>
            ) : (
              <div className="space-y-2">
                {clients.map((client) => {
                  const isPasswordVisible = visiblePasswords.has(client.id);
                  return (
                    <div
                      key={client.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => handleSelectClient(client)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{client.company_name || "Unnamed Client"}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>Created {new Date(client.created_at).toLocaleDateString()}</span>
                          {client.password && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                Pass: 
                                <code className="bg-muted px-1 rounded text-xs">
                                  {isPasswordVisible ? client.password : "••••••••"}
                                </code>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setVisiblePasswords(prev => {
                                      const next = new Set(prev);
                                      if (next.has(client.id)) {
                                        next.delete(client.id);
                                      } else {
                                        next.add(client.id);
                                      }
                                      return next;
                                    });
                                  }}
                                >
                                  {isPasswordVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(client.password!);
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Сменить пароль"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResetPassword(client.user_id, client.company_name || "");
                          }}
                        >
                          <Key className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          title="Удалить клиента"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClient(client.id, client.user_id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminPanel;
