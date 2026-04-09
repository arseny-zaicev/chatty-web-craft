import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Loader2, 
  RefreshCw, 
  Phone, 
  Mail, 
  Building2, 
  Globe, 
  Calendar,
  FileText,
  Download,
  Eye,
  Trash2,
  MessageSquare,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Submission {
  id: string;
  created_at: string;
  updated_at: string;
  form_type: "qualification" | "seller_leads" | "demo_request";
  status: "new" | "contacted" | "converted" | "rejected";
  data: unknown;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_company: string | null;
  contact_website: string | null;
  notes: string | null;
}

const statusConfig = {
  new: { label: "New", color: "bg-blue-500", icon: AlertCircle },
  contacted: { label: "Contacted", color: "bg-yellow-500", icon: Clock },
  converted: { label: "Converted", color: "bg-green-500", icon: CheckCircle },
  rejected: { label: "Rejected", color: "bg-red-500", icon: XCircle },
};

export const AdminSubmissions = () => {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<"all" | "qualification" | "seller_leads" | "demo_request">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "new" | "contacted" | "converted" | "rejected">("all");
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [editNotes, setEditNotes] = useState("");

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("form_submissions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching submissions:", error);
        toast.error("Failed to load submissions");
        return;
      }

      setSubmissions(data || []);
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("Failed to load submissions");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: Submission["status"]) => {
    try {
      const { error } = await supabase
        .from("form_submissions")
        .update({ status: newStatus })
        .eq("id", id);

      if (error) {
        toast.error("Failed to update status");
        return;
      }

      setSubmissions(prev =>
        prev.map(s => (s.id === id ? { ...s, status: newStatus } : s))
      );
      
      if (selectedSubmission?.id === id) {
        setSelectedSubmission(prev => prev ? { ...prev, status: newStatus } : null);
      }
      
      toast.success("Status updated");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to update status");
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedSubmission) return;

    try {
      const { error } = await supabase
        .from("form_submissions")
        .update({ notes: editNotes })
        .eq("id", selectedSubmission.id);

      if (error) {
        toast.error("Failed to save notes");
        return;
      }

      setSubmissions(prev =>
        prev.map(s => (s.id === selectedSubmission.id ? { ...s, notes: editNotes } : s))
      );
      setSelectedSubmission(prev => prev ? { ...prev, notes: editNotes } : null);
      toast.success("Notes saved");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to save notes");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this submission?")) return;

    try {
      const { error } = await supabase
        .from("form_submissions")
        .delete()
        .eq("id", id);

      if (error) {
        toast.error("Failed to delete");
        return;
      }

      setSubmissions(prev => prev.filter(s => s.id !== id));
      if (selectedSubmission?.id === id) {
        setSelectedSubmission(null);
      }
      toast.success("Deleted");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to delete");
    }
  };

  const handleExportCSV = () => {
    const filtered = getFilteredSubmissions();
    if (filtered.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = ["Date", "Type", "Status", "Name", "Email", "Phone", "Company", "Website", "Notes", "Data"];
    const rows = filtered.map(s => [
      new Date(s.created_at).toLocaleString(),
      s.form_type,
      s.status,
      s.contact_name || "",
      s.contact_email || "",
      s.contact_phone || "",
      s.contact_company || "",
      s.contact_website || "",
      s.notes || "",
      JSON.stringify(s.data),
    ]);

    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `submissions-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported!");
  };

  const getFilteredSubmissions = () => {
    return submissions.filter(s => {
      if (filterType !== "all" && s.form_type !== filterType) return false;
      if (filterStatus !== "all" && s.status !== filterStatus) return false;
      return true;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  const filteredSubmissions = getFilteredSubmissions();

  const stats = {
    total: submissions.length,
    new: submissions.filter(s => s.status === "new").length,
    contacted: submissions.filter(s => s.status === "contacted").length,
    converted: submissions.filter(s => s.status === "converted").length,
    rejected: submissions.filter(s => s.status === "rejected").length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </Card>
        <Card className="p-4 text-center border-blue-500/30 bg-blue-500/5">
          <p className="text-2xl font-bold text-blue-500">{stats.new}</p>
          <p className="text-xs text-muted-foreground">New</p>
        </Card>
        <Card className="p-4 text-center border-yellow-500/30 bg-yellow-500/5">
          <p className="text-2xl font-bold text-yellow-500">{stats.contacted}</p>
          <p className="text-xs text-muted-foreground">Contacted</p>
        </Card>
        <Card className="p-4 text-center border-green-500/30 bg-green-500/5">
          <p className="text-2xl font-bold text-green-500">{stats.converted}</p>
          <p className="text-xs text-muted-foreground">Converted</p>
        </Card>
        <Card className="p-4 text-center border-red-500/30 bg-red-500/5">
          <p className="text-2xl font-bold text-red-500">{stats.rejected}</p>
          <p className="text-xs text-muted-foreground">Rejected</p>
        </Card>
      </div>

      {/* Filters & Actions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle>Form Submissions</CardTitle>
            <CardDescription>
              {filteredSubmissions.length} of {submissions.length} submissions
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Form type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="demo_request">Demo Request</SelectItem>
                <SelectItem value="qualification">Qualification</SelectItem>
                <SelectItem value="seller_leads">Seller Leads</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchSubmissions}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredSubmissions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No submissions yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSubmissions.map((submission) => {
                const StatusIcon = statusConfig[submission.status].icon;
                return (
                  <div
                    key={submission.id}
                    className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge variant={
                          submission.form_type === "demo_request" ? "default" :
                          submission.form_type === "qualification" ? "secondary" : "outline"
                        }>
                          {submission.form_type === "demo_request" ? "Demo Request" :
                           submission.form_type === "qualification" ? "WhatsApp Outreach" : "Seller Leads"}
                        </Badge>
                        <Badge
                          className={`${statusConfig[submission.status].color} text-white`}
                        >
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusConfig[submission.status].label}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(submission.created_at).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-3 text-sm">
                        {submission.contact_name && (
                          <span className="font-medium">{submission.contact_name}</span>
                        )}
                        {submission.contact_phone && (
                          <button
                            onClick={() => copyToClipboard(submission.contact_phone!)}
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          >
                            <Phone className="h-3 w-3" />
                            {submission.contact_phone}
                          </button>
                        )}
                        {submission.contact_email && (
                          <button
                            onClick={() => copyToClipboard(submission.contact_email!)}
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          >
                            <Mail className="h-3 w-3" />
                            {submission.contact_email}
                          </button>
                        )}
                        {submission.contact_company && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            {submission.contact_company}
                          </span>
                        )}
                        {submission.contact_website && (
                          <a
                            href={submission.contact_website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            <Globe className="h-3 w-3" />
                            Website
                          </a>
                        )}
                      </div>

                      {submission.notes && (
                        <p className="text-xs text-muted-foreground flex items-start gap-1">
                          <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                          {submission.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <Select
                        value={submission.status}
                        onValueChange={(v) => handleStatusChange(submission.id, v as Submission["status"])}
                      >
                        <SelectTrigger className="w-[120px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="contacted">Contacted</SelectItem>
                          <SelectItem value="converted">Converted</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedSubmission(submission);
                          setEditNotes(submission.notes || "");
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(submission.id)}
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

      {/* Detail Dialog */}
      <Dialog open={!!selectedSubmission} onOpenChange={(open) => !open && setSelectedSubmission(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Submission Details</DialogTitle>
          </DialogHeader>
          {selectedSubmission && (
            <div className="space-y-6">
              {/* Contact Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="font-medium">{selectedSubmission.contact_name || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Company</p>
                  <p className="font-medium">{selectedSubmission.contact_company || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Phone</p>
                  {selectedSubmission.contact_phone ? (
                    <button
                      onClick={() => copyToClipboard(selectedSubmission.contact_phone!)}
                      className="font-medium text-primary hover:underline"
                    >
                      {selectedSubmission.contact_phone}
                    </button>
                  ) : (
                    <p>—</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Email</p>
                  {selectedSubmission.contact_email ? (
                    <button
                      onClick={() => copyToClipboard(selectedSubmission.contact_email!)}
                      className="font-medium text-primary hover:underline"
                    >
                      {selectedSubmission.contact_email}
                    </button>
                  ) : (
                    <p>—</p>
                  )}
                </div>
                {selectedSubmission.contact_website && (
                  <div className="space-y-1 col-span-2">
                    <p className="text-xs text-muted-foreground">Website</p>
                    <a
                      href={selectedSubmission.contact_website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      {selectedSubmission.contact_website}
                    </a>
                  </div>
                )}
              </div>

              {/* Form Data */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Form Responses</p>
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  {typeof selectedSubmission.data === 'object' && selectedSubmission.data !== null && Object.entries(selectedSubmission.data as Record<string, unknown>).map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-sm">
                      <span className="text-muted-foreground capitalize shrink-0 w-32">{key}:</span>
                      <span className="font-medium">
                        {Array.isArray(value) ? value.join(", ") : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Notes</p>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Add notes about this lead..."
                  rows={3}
                />
                <Button size="sm" onClick={handleSaveNotes}>
                  Save Notes
                </Button>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-xs text-muted-foreground">
                  Submitted: {new Date(selectedSubmission.created_at).toLocaleString()}
                </div>
                <Select
                  value={selectedSubmission.status}
                  onValueChange={(v) => handleStatusChange(selectedSubmission.id, v as Submission["status"])}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="converted">Converted</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
