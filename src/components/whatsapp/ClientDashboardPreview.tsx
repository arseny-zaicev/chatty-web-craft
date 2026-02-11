import { BarChart3, Bell, Send, MessageSquare, ThumbsUp, Phone } from "lucide-react";
import { ScrollReveal } from "@/hooks/useScrollReveal";

const metrics = [
  { label: "Sent", value: "10,247", icon: Send, color: "text-foreground" },
  { label: "Delivered", value: "10,042", icon: Send, color: "text-iskra-emerald" },
  { label: "Replies", value: "823", icon: MessageSquare, color: "text-iskra-emerald" },
  { label: "Positive", value: "287", icon: ThumbsUp, color: "text-iskra-emerald-light" },
  { label: "Booked", value: "143", icon: Phone, color: "text-iskra-gold" },
];


export const ClientDashboardPreview = () => {
  return (
    <section className="py-24 bg-muted/20">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="text-center mb-16">
            <p className="text-iskra-emerald text-sm font-semibold uppercase tracking-widest mb-3">
              Client Dashboard
            </p>
            <h2 className="font-headline text-3xl md:text-4xl font-bold mb-4">
              Full Transparency, Real-Time
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Daily stats on every metric. Instant notifications when a lead responds positively — so your sales team acts while the lead is hot.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <div className="max-w-4xl mx-auto relative">
            {/* Mock dashboard */}
            <div className="glass-card rounded-2xl p-6 md:p-8 border-iskra-emerald/20 relative z-[5]">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-5 h-5 text-iskra-emerald" />
                  <span className="font-headline font-bold">Campaign Overview</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Bell className="w-4 h-4 text-iskra-emerald" />
                  <span>Notifications ON</span>
                </div>
              </div>

              {/* Metrics row */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                {metrics.map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="bg-background/40 rounded-xl p-4 text-center">
                    <Icon className={`w-4 h-4 ${color} mx-auto mb-2`} />
                    <p className="text-xl font-bold font-headline">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>

              {/* Funnel bar */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16">Sent</span>
                  <div className="flex-1 h-3 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-foreground/30 rounded-full" style={{ width: "100%" }} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16">Delivered</span>
                  <div className="flex-1 h-3 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-iskra-emerald/60 rounded-full" style={{ width: "98%" }} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16">Replies</span>
                  <div className="flex-1 h-3 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-iskra-emerald rounded-full" style={{ width: "8%" }} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16">Positive</span>
                  <div className="flex-1 h-3 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-iskra-emerald-light rounded-full" style={{ width: "2.8%" }} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16">Booked</span>
                  <div className="flex-1 h-3 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-iskra-gold rounded-full" style={{ width: "1.4%" }} />
                  </div>
                </div>
              </div>

              {/* Live notification mock */}
              <div className="mt-6 bg-iskra-emerald/10 border border-iskra-emerald/20 rounded-xl p-4 flex items-center gap-3">
                <div className="w-2 h-2 bg-iskra-emerald rounded-full animate-pulse" />
                <p className="text-sm">
                  <span className="font-semibold text-iskra-emerald">New positive reply</span>
                  <span className="text-muted-foreground"> — "Yes, I'm interested. When can we talk?" — </span>
                  <span className="text-foreground/70 text-xs">2 min ago</span>
                </p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};
