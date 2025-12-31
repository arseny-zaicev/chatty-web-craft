import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, LogOut, Search, RefreshCw, Save } from "lucide-react";
import { User } from "@supabase/supabase-js";

interface ClientData {
  id: string;
  company_name: string | null;
  google_sheet_id: string;
  sheet_name: string | null;
}

interface SheetRow {
  [key: string]: string;
  _rowIndex: string;
}

const STATUS_OPTIONS = ["New", "Contacted", "Qualified", "Meeting Scheduled", "Proposal Sent", "Closed Won", "Closed Lost"];

const ClientPortal = () => {
  const [user, setUser] = useState<User | null>(null);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [sheetData, setSheetData] = useState<SheetRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [updatingCells, setUpdatingCells] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          navigate("/client-auth");
        }
      }
    );

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
      await fetchSheetData(data.google_sheet_id, data.sheet_name || "Sheet1");
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSheetData = async (spreadsheetId: string, sheetName: string) => {
    setIsLoadingSheet(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-sheets", {
        body: { spreadsheetId, sheetName, action: "read" },
      });

      if (error) {
        console.error("Error fetching sheet data:", error);
        toast.error("Failed to load sheet data");
        return;
      }

      if (data.error) {
        console.error("Sheet error:", data.error);
        toast.error(data.error);
        return;
      }

      setHeaders(data.headers || []);
      setSheetData(data.data || []);
      toast.success(`Loaded ${data.rowCount || 0} leads`);
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("Failed to connect to Google Sheets");
    } finally {
      setIsLoadingSheet(false);
    }
  };

  const handleCellUpdate = async (rowIndex: string, columnName: string, value: string) => {
    if (!clientData) return;

    const columnIndex = headers.indexOf(columnName);
    if (columnIndex === -1) return;

    const cellKey = `${rowIndex}-${columnName}`;
    setUpdatingCells(prev => new Set(prev).add(cellKey));

    // Convert column index to letter (A, B, C, etc.)
    const columnLetter = String.fromCharCode(65 + columnIndex);
    const range = `${columnLetter}${rowIndex}`;

    try {
      const { data, error } = await supabase.functions.invoke("google-sheets", {
        body: {
          spreadsheetId: clientData.google_sheet_id,
          sheetName: clientData.sheet_name || "Sheet1",
          action: "update",
          range,
          value,
        },
      });

      if (error || data?.error) {
        console.error("Error updating cell:", error || data?.error);
        toast.error("Failed to update cell");
        return;
      }

      // Update local state
      setSheetData(prev => prev.map(row => 
        row._rowIndex === rowIndex ? { ...row, [columnName]: value } : row
      ));
      
      toast.success("Updated successfully");
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("Failed to update");
    } finally {
      setUpdatingCells(prev => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  };

  const handleRefresh = () => {
    if (clientData) {
      fetchSheetData(clientData.google_sheet_id, clientData.sheet_name || "Sheet1");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/client-auth");
  };

  const filteredData = sheetData.filter((row) =>
    Object.entries(row)
      .filter(([key]) => key !== "_rowIndex")
      .some(([, value]) => value.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const isStatusColumn = (header: string) => {
    const statusKeywords = ["status", "stage", "state", "progress"];
    return statusKeywords.some(keyword => header.toLowerCase().includes(keyword));
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Your Leads</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={isLoadingSheet}
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingSheet ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingSheet ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : sheetData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No data available</p>
                <p className="text-sm mt-2">
                  Make sure the Google Sheet is shared with the service account
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
                    {filteredData.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {headers.map((header, cellIndex) => {
                          const cellKey = `${row._rowIndex}-${header}`;
                          const isUpdating = updatingCells.has(cellKey);
                          
                          // Render status dropdown for status columns
                          if (isStatusColumn(header)) {
                            return (
                              <TableCell key={cellIndex} className="whitespace-nowrap">
                                <Select
                                  value={row[header] || ""}
                                  onValueChange={(value) => handleCellUpdate(row._rowIndex, header, value)}
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
                            <TableCell key={cellIndex} className="whitespace-nowrap">
                              {row[header] || "—"}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-sm text-muted-foreground mt-4">
                  Showing {filteredData.length} of {sheetData.length} leads
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
