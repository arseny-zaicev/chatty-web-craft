import { Send, CheckCheck, MessageSquare, ThumbsUp, Phone, BarChart3, Bell } from "lucide-react";
import reactivationProof from "@/assets/reactivation-proof.png";
import { useCountUp } from "@/hooks/useCountUp";
import { useRef } from "react";

const stats = [
  { icon: Send, label: "Sent", value: 10247, color: "text-foreground" },
  { icon: CheckCheck, label: "Delivered", value: 10042, color: "text-iskra-emerald" },
  { icon: MessageSquare, label: "Replies", value: 4611, color: "text-iskra-emerald-dark" },
  { icon: ThumbsUp, label: "Positive", value: 2561, color: "text-iskra-emerald" },
  { icon: Phone, label: "Booked", value: 410, color: "text-iskra-gold" },
];

const bars = [
  { label: "Sent", width: "100%", color: "bg-foreground/40" },
  { label: "Delivered", width: "98%", color: "bg-iskra-emerald" },
  { label: "Replies", width: "45%", color: "bg-iskra-emerald-dark" },
  { label: "Positive", width: "25%", color: "bg-iskra-emerald-light" },
  { label: "Booked", width: "4%", color: "bg-iskra-gold" },
];

export const DashboardDemo = () => {
  return (
    <div className="rounded-2xl bg-secondary/60 border border-border/50 overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <BarChart3 className="w-5 h-5 text-iskra-emerald" />
          <span className="font-display text-base font-bold text-foreground">Reactivation Campaign Overview</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bell className="w-4 h-4 text-iskra-emerald" />
          Notifications ON
        </div>
      </div>

      {/* Stats Row */}
      <div className="px-5 pb-1">
        <div className="grid grid-cols-5 gap-2">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl bg-background/60 border border-border/30 p-3 text-center">
              <stat.icon className={`w-5 h-5 mx-auto mb-1.5 ${stat.color} opacity-60`} />
              <div className={`text-xl md:text-2xl font-bold ${stat.color}`}>
                {stat.value.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Live dot */}
        <div className="flex justify-center py-2">
          <div className="w-2 h-2 rounded-full bg-iskra-emerald animate-pulse" />
        </div>
      </div>

      {/* Bars */}
      <div className="px-5 pb-4 space-y-2.5">
        {bars.map((bar) => (
          <div key={bar.label} className="flex items-center gap-3">
            <span className="text-xs font-medium text-foreground w-20 shrink-0">{bar.label}</span>
            <div className="flex-1 h-3 bg-border/30 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${bar.color} transition-all duration-1000`}
                style={{ width: bar.width }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Live notification */}
      <div className="mx-5 mb-3 rounded-xl bg-iskra-emerald/10 border border-iskra-emerald/20 px-4 py-3 flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full bg-iskra-emerald animate-pulse shrink-0" />
        <p className="text-sm text-foreground">
          <span className="font-semibold text-iskra-emerald">New positive reply</span>
          {' — "Yes, I\'m interested. When can we talk?" — '}
          <span className="text-muted-foreground">2 min ago</span>
        </p>
      </div>

      {/* Client proof screenshot */}
      <div className="mx-5 mb-4 rounded-xl overflow-hidden border border-border/30 shadow-sm">
        <img
          src={reactivationProof}
          alt="Client result: 3 sales after reactivation message, 10k+ full pays"
          className="w-full h-auto"
          loading="eager"
        />
      </div>
    </div>
  );
};
