import { Phone, MapPin, Building2, Calendar, User, CheckCircle2, Clock, PhoneCall } from "lucide-react";

// Mock data with masked names and phones
const mockLeads = [
  {
    id: 1,
    name: "Ahmed M•••••",
    phone: "+971 5• ••• ••12",
    location: "Palm Jumeirah",
    building: "Atlantis The Royal Residences",
    property: "3BR Apartment",
    date: "Today",
    status: "new",
  },
  {
    id: 2,
    name: "Sarah K•••••",
    phone: "+971 5• ••• ••87",
    location: "Downtown Dubai",
    building: "Burj Khalifa",
    property: "2BR Apartment",
    date: "Today",
    status: "contacted",
  },
  {
    id: 3,
    name: "Mohammed A•••••",
    phone: "+971 5• ••• ••45",
    location: "Dubai Marina",
    building: "Marina Gate Tower 1",
    property: "4BR Penthouse",
    date: "Yesterday",
    status: "interested",
  },
  {
    id: 4,
    name: "Fatima R•••••",
    phone: "+971 5• ••• ••23",
    location: "JBR",
    building: "Sadaf 7",
    property: "1BR Apartment",
    date: "Yesterday",
    status: "new",
  },
];

const getStatusBadge = (status: string) => {
  switch (status) {
    case "new":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
          <Clock className="w-3 h-3" />
          New
        </span>
      );
    case "contacted":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
          <PhoneCall className="w-3 h-3" />
          Contacted
        </span>
      );
    case "interested":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3" />
          Interested
        </span>
      );
    default:
      return null;
  }
};

export const DashboardDemo = () => {
  return (
    <div className="rounded-2xl bg-card/80 border border-border/50 overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="px-4 py-3 bg-card border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary">
              <path d="M12 2L14 9L21 12L14 15L12 22L10 15L3 12L10 9L12 2Z" fill="currentColor"/>
            </svg>
            <span className="font-display text-sm font-bold text-foreground">ISKRA</span>
          </div>
          <div className="h-4 w-px bg-border/50" />
          <span className="text-xs text-muted-foreground">Your Leads</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400">
            4 new leads
          </span>
        </div>
      </div>

      {/* Leads List */}
      <div className="divide-y divide-border/30">
        {mockLeads.map((lead) => (
          <div
            key={lead.id}
            className="px-4 py-3 hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {/* Name & Status */}
                <div className="flex items-center gap-2 mb-1.5">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-medium text-sm text-foreground truncate">{lead.name}</span>
                  {getStatusBadge(lead.status)}
                </div>

                {/* Phone - Masked */}
                <div className="flex items-center gap-2 mb-1">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-mono">{lead.phone}</span>
                </div>

                {/* Location & Building */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" />
                    <span>{lead.location}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3 h-3" />
                    <span className="truncate max-w-[120px]">{lead.building}</span>
                  </div>
                </div>
              </div>

              {/* Right side */}
              <div className="text-right shrink-0">
                <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Calendar className="w-3 h-3" />
                  {lead.date}
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-secondary/80 text-foreground/70">
                  {lead.property}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 bg-gradient-to-t from-card to-transparent border-t border-border/30">
        <p className="text-xs text-center text-muted-foreground">
          Real-time leads delivered to your dashboard
        </p>
      </div>
    </div>
  );
};
