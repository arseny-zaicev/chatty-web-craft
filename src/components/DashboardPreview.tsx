import { Clock, Zap, Users, Target } from "lucide-react";

const stats = [
  {
    icon: Clock,
    value: "142",
    label: "Hours Saved This Month",
    subtext: "That's $8,520 in labor costs saved",
    trend: "+23%",
  },
  {
    icon: Zap,
    value: "2,847",
    label: "Tasks Automated",
    subtext: "↑ 18% this week",
  },
  {
    icon: Users,
    value: "384",
    label: "Leads Qualified",
    subtext: "↑ 31% this week",
  },
  {
    icon: Target,
    value: "98.7%",
    label: "Accuracy Rate",
    subtext: "Industry avg: 82%",
  },
];

const workflows = [
  { name: "Lead Qualification Bot", status: "Processing 24 new leads", live: true },
  { name: "Sales Follow-up", status: "12 messages queued", live: true },
  { name: "Customer Support AI", status: "Active conversations: 8", live: true },
];

export const DashboardPreview = () => {
  return (
    <section className="py-24 bg-iskra-cream">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            What Our Clients Achieve
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We don't just send messages — we build full control systems. See meetings being booked. Manage real conversations — all in one place.
          </p>
        </div>

        {/* Dashboard Mockup */}
        <div className="max-w-5xl mx-auto">
          <div className="glass-card rounded-3xl p-6 md:p-8 shadow-xl">
            {/* Dashboard Header */}
            <div className="flex items-center gap-3 mb-8">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <span className="text-sm text-muted-foreground">
                ISKRA Dashboard — Your Business
              </span>
            </div>

            {/* Stats Grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {stats.map((stat, index) => (
                <div
                  key={stat.label}
                  className="bg-background rounded-2xl p-5 border border-border/50 hover:shadow-soft transition-shadow"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <stat.icon className="w-5 h-5 text-muted-foreground" />
                    {stat.trend && (
                      <span className="text-xs font-medium text-iskra-emerald bg-iskra-emerald/10 px-2 py-0.5 rounded-full">
                        {stat.trend}
                      </span>
                    )}
                  </div>
                  <div className="text-3xl font-bold text-foreground mb-1">
                    {stat.value}
                  </div>
                  <div className="text-sm text-muted-foreground mb-1">
                    {stat.label}
                  </div>
                  {stat.subtext && (
                    <div className="text-xs text-iskra-emerald">
                      {stat.subtext}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Active Workflows */}
            <div className="bg-background rounded-2xl p-5 border border-border/50">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-foreground">Active Workflows</h4>
                <span className="text-sm text-iskra-emerald cursor-pointer hover:underline">
                  View all →
                </span>
              </div>
              <div className="space-y-3">
                {workflows.map((workflow) => (
                  <div
                    key={workflow.name}
                    className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-iskra-emerald/10 flex items-center justify-center">
                        <Zap className="w-5 h-5 text-iskra-emerald" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{workflow.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {workflow.status}
                        </div>
                      </div>
                    </div>
                    {workflow.live && (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-iskra-emerald">
                        <div className="w-2 h-2 rounded-full bg-iskra-emerald animate-pulse" />
                        Live
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ROI Badge */}
            <div className="mt-6 flex justify-center">
              <div className="inline-flex items-center gap-3 px-6 py-3 bg-iskra-emerald/10 rounded-full">
                <Target className="w-5 h-5 text-iskra-emerald" />
                <span className="text-sm font-medium text-foreground">ROI This Quarter:</span>
                <span className="text-2xl font-bold text-iskra-emerald">347%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
