import { useState, useEffect } from "react";
import { BarChart3, Bell, Send, MessageSquare, ThumbsUp, Phone } from "lucide-react";
import { ScrollReveal } from "@/hooks/useScrollReveal";

const metrics = [
  { label: "Sent", value: "10,247", icon: Send, color: "text-foreground" },
  { label: "Delivered", value: "10,042", icon: Send, color: "text-iskra-emerald" },
  { label: "Replies", value: "823", icon: MessageSquare, color: "text-iskra-emerald" },
  { label: "Positive", value: "287", icon: ThumbsUp, color: "text-iskra-emerald-light" },
  { label: "Booked", value: "143", icon: Phone, color: "text-iskra-gold" },
];

const PHONE_NOTIFS = [
  { title: "ISKRA Leads", body: "New positive reply from Ahmed K." },
  { title: "ISKRA Leads", body: "Meeting booked — Tomorrow 2:00 PM" },
  { title: "ISKRA Leads", body: '"I\'m interested, send details"' },
  { title: "ISKRA Leads", body: "3 new replies in last hour" },
  { title: "ISKRA Leads", body: "Meeting booked — Thursday 11 AM" },
];

const PhoneMockup = () => {
  const [notifIndex, setNotifIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const initialTimer = setTimeout(() => setVisible(true), 1500);
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setNotifIndex(prev => (prev + 1) % PHONE_NOTIFS.length);
        setVisible(true);
      }, 500);
    }, 5000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  const notif = PHONE_NOTIFS[notifIndex];

  return (
    <div className="absolute -right-16 top-1/2 -translate-y-1/2 hidden xl:block z-10">
      <div className="relative w-[200px] h-[400px]">
        <div className="absolute inset-0 rounded-[36px] border-[3px] border-foreground/15 bg-background/90 backdrop-blur-sm shadow-2xl shadow-black/40 overflow-hidden">
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-5 bg-black rounded-full z-20" />
          <div className="flex items-center justify-between px-6 pt-2 text-[8px] text-foreground/50 font-medium">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <div className="w-3 h-1.5 border border-foreground/40 rounded-sm">
                <div className="w-2 h-full bg-iskra-emerald rounded-sm" />
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center pt-16 px-4">
            <div className="text-3xl font-light text-foreground/80 mb-1">9:41</div>
            <div className="text-[9px] text-foreground/40 mb-8">Tuesday, February 11</div>
            <div
              className="w-full transition-all duration-500 ease-out"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.95)",
              }}
            >
              <div className="bg-foreground/10 backdrop-blur-xl rounded-2xl p-3 border border-foreground/5">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-5 h-5 rounded-md bg-iskra-emerald/20 flex items-center justify-center flex-shrink-0">
                    <Bell className="w-2.5 h-2.5 text-iskra-emerald" />
                  </div>
                  <span className="text-[9px] font-semibold text-foreground/70 uppercase tracking-wide">{notif.title}</span>
                  <span className="text-[8px] text-foreground/30 ml-auto">now</span>
                </div>
                <p className="text-[10px] text-foreground/60 leading-snug pl-7">{notif.body}</p>
              </div>
            </div>
          </div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-16 h-1 bg-foreground/20 rounded-full" />
        </div>
      </div>
    </div>
  );
};

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
            <PhoneMockup />

            <div className="glass-card rounded-2xl p-6 md:p-8 border-iskra-emerald/20 relative z-[5]">
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

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                {metrics.map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="bg-background/40 rounded-xl p-4 text-center">
                    <Icon className={`w-4 h-4 ${color} mx-auto mb-2`} />
                    <p className="text-xl font-bold font-headline">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>

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
