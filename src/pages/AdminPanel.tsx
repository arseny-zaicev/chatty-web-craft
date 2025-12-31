import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, LogOut, Plus, Users, Trash2, RefreshCw, Copy, Eye, EyeOff, FileSpreadsheet, Upload } from "lucide-react";
import { User } from "@supabase/supabase-js";

interface Client {
  id: string;
  user_id: string;
  company_name: string | null;
  google_sheet_id: string;
  sheet_name: string | null;
  created_at: string;
  leads_count?: number;
}

const ADMIN_EMAIL = "arseny@iskra.ae";

const AdminPanel = () => {
  const [user, setUser] = useState<User | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [leadsDialogOpen, setLeadsDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // New client form
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newSheetId, setNewSheetId] = useState("");
  const [newSheetName, setNewSheetName] = useState("Sheet1");
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
        const { data: directData, error: directError } = await supabase
          .from("clients")
          .select("*")
          .order("created_at", { ascending: false });
        
        if (!directError && directData) {
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
          googleSheetId: newSheetId.trim() || "not-used",
          sheetName: newSheetName.trim() || "Sheet1",
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
      setNewSheetId("");
      setNewSheetName("Sheet1");
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
    if (!confirm("Are you sure you want to delete this client?")) return;

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

  const handleOpenLeadsDialog = (client: Client) => {
    setSelectedClient(client);
    setLeadsDialogOpen(true);
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

      // Use the admin edge function to insert leads for the client
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

      toast.success(`Imported ${rows.length} leads for ${selectedClient.company_name || 'client'}`);
      setLeadsDialogOpen(false);
      fetchClients();
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
    toast.success("Copied to clipboard");
  };

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(password);
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

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Clients</CardTitle>
              <CardDescription>Manage client accounts and their leads</CardDescription>
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
                      Create a client account. You can import leads after creating.
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-center">Leads</TableHead>
                      <TableHead className="w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell className="font-medium">
                          {client.company_name || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(client.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenLeadsDialog(client)}
                          >
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Manage
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteClient(client.id, client.user_id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leads Import Dialog */}
        <Dialog open={leadsDialogOpen} onOpenChange={setLeadsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Manage Leads: {selectedClient?.company_name || 'Client'}</DialogTitle>
              <DialogDescription>
                Import leads for this client from a CSV or JSON file
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                onClick={handleImportClick}
                disabled={isImporting}
                className="w-full"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Import CSV/JSON
                  </>
                )}
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                CSV should have columns: Lead Name, Phone Number, Location, Status, etc.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default AdminPanel;
