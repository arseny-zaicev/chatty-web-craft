import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle, MessageSquare, Send, BarChart3 } from "lucide-react";

export const WhatsAppHero = () => {
  const scrollToFitCheck = () => {
    document.getElementById("fit-check")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="pt-32 pb-20 relative overflow-hidden">
      {/* Subtle gradient bg */}
      <div className="absolute inset-0 bg-gradient-to-b from-iskra-emerald/5 via-background to-background" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-iskra-emerald text-sm font-semibold uppercase tracking-widest mb-6 animate-fade-in">
            WhatsApp Booking Engine
          </p>

          <h1 className="font-headline text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.1] mb-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            Predictable Pipeline
            <br />
            <span className="text-iskra-emerald">from WhatsApp.</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-in" style={{ animationDelay: "0.2s" }}>
            We build and run your WhatsApp outreach engine — from ICP research and copy 
            to dedicated sending infrastructure and CRM handoff. You get interested replies 
            and booked calls.
          </p>

          {/* Key metrics */}
          <div className="flex flex-wrap justify-center gap-8 mb-10 animate-fade-in" style={{ animationDelay: "0.25s" }}>
            {[
              { icon: Send, label: "10,000+ pilot messages" },
              { icon: MessageSquare, label: "98% delivery rate" },
              { icon: BarChart3, label: "Full funnel tracking" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-foreground/80">
                <Icon className="w-4 h-4 text-iskra-emerald" />
                <span className="text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in" style={{ animationDelay: "0.3s" }}>
            <Button
              onClick={scrollToFitCheck}
              className="group text-base px-8 py-6 bg-iskra-emerald hover:bg-iskra-emerald/90 text-primary-foreground rounded-xl font-semibold shadow-xl shadow-iskra-emerald/20 btn-glow"
            >
              Check if WhatsApp fits your business
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>

        {/* What you get - compact strip */}
        <div className="max-w-5xl mx-auto mt-20 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in" style={{ animationDelay: "0.4s" }}>
          {[
            "ICP & positioning for WhatsApp",
            "Copy & follow-up sequences",
            "Dedicated sending accounts",
            "CRM handoff & KPI tracking",
          ].map((item) => (
            <div key={item} className="card-light rounded-xl p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-iskra-emerald shrink-0 mt-0.5" />
              <span className="text-sm text-foreground/80 font-medium">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
