import { useState, useEffect } from "react";
import { BarChart3, Bell, Send, MessageSquare, ThumbsUp, Phone } from "lucide-react";
import { ScrollReveal } from "@/hooks/useScrollReveal";

const metrics = [
  { label: "Sent", value: "10,000", icon: Send, color: "text-foreground" },
  { label: "Delivered", value: "9,800", icon: Send, color: "text-iskra-emerald" },
  { label: "Replies", value: "4,500", icon: MessageSquare, color: "text-iskra-emerald" },
  { label: "Positive", value: "2,500", icon: ThumbsUp, color: "text-iskra-emerald-light" },
  { label: "Booked", value: "400", icon: Phone, color: "text-iskra-gold" },
];

const PHONE_NOTIFS = [
  { title: "ISKRA Leads", body: "Reactivated lead replied - 'I'm interested.'" },
  { title: "ISKRA Leads", body: "Booked call from old CRM contact" },
  { title: "ISKRA Leads", body: 'Positive reply from dormant lead' },
  { title: "ISKRA Leads", body: "45% reply rate reached this batch" },
  { title: "ISKRA Leads", body: "Meeting booked - Thursday 11 AM" },
];

const PhoneMockup = () => {
  const [notifIndex, setNotifIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const initialTimer = setTimeout(() => setVisible(true), 1500);
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setNotifIndex((prev) => (prev + 1) % PHONE_NOTIFS.length);
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
    <div className="hidden xl:flex flex-col items-center flex-shrink-0">
      <div className="relative w-[200px] h-[420px]">
        <div className="absolute inset-0 rounded-[36px] border-[3px] border-foreground/20 bg-background shadow-2xl shadow-black/50">
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-4 bg-black rounded-full z-20" />

          <div className="flex items-center justify-between px-5 pt-2 text-[8px] text-foreground/50 font-medium">
            <span>9:41</span>
            <div className="w-3 h-1.5 border border-foreground/40 rounded-sm">
              <div className="w-2 h-full bg-iskra-emerald rounded-sm" />
            </div>
          </div>

          <div className="flex flex-col items-center pt-12 px-3">
            <div className="text-2xl font-light text-foreground/80 mb-0.5">9:41</div>
            <div className="text-[8px] text-foreground/40 mb-6">Tuesday, February 11</div>

            <div
              className="w-full transition-all duration-500 ease-out"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0) scale(1)" : "translateY(-10px) scale(0.95)",
              }}
            >
              <div className="bg-foreground/10 backdrop-blur-xl rounded-xl p-2.5 border border-foreground/10">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-4 h-4 rounded-md bg-iskra-emerald/20 flex items-center justify-center flex-shrink-0">
                    <Bell className="w-2 h-2 text-iskra-emerald" />
                  </div>
                  <span className="text-[8px] font-semibold text-foreground/70 uppercase tracking-wide">{notif.title}</span>
                  <span className="text-[7px] text-foreground/30 ml-auto">now</span>
                </div>
                <p className="text-[9px] text-foreground/60 leading-snug pl-[22px]">{notif.body}</p>
              </div>
            </div>
          </div>

          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-14 h-1 bg-foreground/20 rounded-full" />
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
              Reactivation campaigns tracked live - from delivery and replies to positive intent and booked calls from your old CRM base.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <div className="max-w-5xl mx-auto flex items-center gap-8">
            <div className="flex-1 glass-card rounded-2xl p-6 md:p-8 border-iskra-emerald/20">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-5 h-5 text-iskra-emerald" />
                  <span className="font-headline font-bold">Reactivation Campaign Overview</span>
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
                    <div className="h-full bg-iskra-emerald rounded-full" style={{ width: "45%" }} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16">Positive</span>
                  <div className="flex-1 h-3 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-iskra-emerald-light rounded-full" style={{ width: "25%" }} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16">Booked</span>
                  <div className="flex-1 h-3 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-iskra-gold rounded-full" style={{ width: "4%" }} />
                  </div>
                </div>
              </div>

              <div className="mt-6 bg-iskra-emerald/10 border border-iskra-emerald/20 rounded-xl p-4 flex items-center gap-3">
                <div className="w-2 h-2 bg-iskra-emerald rounded-full animate-pulse" />
                <p className="text-sm">
                  <span className="font-semibold text-iskra-emerald">New reactivated lead</span>
                  <span className="text-muted-foreground"> - "Yes, I'm interested. When can we talk?" - </span>
                  <span className="text-foreground/70 text-xs">2 min ago</span>
                </p>
              </div>
            </div>

            {/* Phone mockup */}
            <PhoneMockup />
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};
