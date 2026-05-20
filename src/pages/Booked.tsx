import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { CheckCircle2, MessageCircle, Clock, FileText, Target, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import founderPhoto from "@/assets/founder/arsenijs-new.png";
import { ClientLogos } from "@/components/ClientLogos";
import { usePageAnalytics } from "@/hooks/usePageAnalytics";
import { testimonials } from "@/components/Testimonials";

const checklist = [
  { icon: Target, text: "Think about your ideal client profile and target market" },
  { icon: FileText, text: "Have your current outreach numbers ready (if any)" },
  { icon: Clock, text: "Block 30 minutes - we'll cover strategy, not just pitch" },
];

const Booked = () => {
  usePageAnalytics({ pageName: "booked" });

  return (
    <>
      <Helmet>
        <title>You're Booked - See You Soon | ISKRA</title>
        <meta name="description" content="Your strategy call is confirmed. Watch this quick video to get the most out of our session." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <main className="min-h-screen bg-background">
        {/* Header */}
        <header className="py-6 border-b border-border/50">
          <div className="container mx-auto px-4">
            <Link to="/" className="flex items-center gap-2 w-fit" data-track="header_logo_home">
              <svg width="22" height="22" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-foreground">
                <circle cx="32" cy="32" r="4.5" fill="currentColor"/>
                <line x1="32" y1="8" x2="32" y2="22" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <line x1="32" y1="42" x2="32" y2="56" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <line x1="8" y1="32" x2="22" y2="32" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <line x1="42" y1="32" x2="56" y2="32" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <line x1="15" y1="15" x2="24" y2="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <line x1="40" y1="40" x2="49" y2="49" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <line x1="49" y1="15" x2="40" y2="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <line x1="24" y1="40" x2="15" y2="49" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
              </svg>
              <span className="font-display text-xl font-bold tracking-tight text-foreground">ISKRA</span>
            </Link>
          </div>
        </header>

        {/* Confirmation Hero */}
        <section className="pt-16 pb-12 px-4">
          <div className="container mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-iskra-emerald/10 mb-6">
              <CheckCircle2 className="w-8 h-8 text-iskra-emerald" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-[1.05] font-display mb-4">
              You're booked!
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Check your email for the calendar invite. In the meantime, watch this quick video so we can hit the ground running.
            </p>
          </div>
        </section>

        {/* Loom Video */}
        <section className="pb-16 px-4">
          <div className="container mx-auto max-w-3xl">
            <div className="rounded-2xl overflow-hidden shadow-xl border border-border" data-track="loom_video_container">
              <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
                <iframe
                  src="https://www.loom.com/embed/7141dff6f84c48b6b5158651b861fa91?sid=autoplay"
                  frameBorder="0"
                  allowFullScreen
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
                  title="What to expect on our call"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Checklist */}
        <section className="pb-16 px-4">
          <div className="container mx-auto max-w-2xl">
            <h2 className="text-xl md:text-2xl font-bold text-foreground font-display mb-6 text-center">
              Before our call
            </h2>
            <div className="space-y-4">
              {checklist.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-4 p-4 card-light rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-iskra-emerald/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="w-5 h-5 text-iskra-emerald" />
                  </div>
                  <p className="text-foreground text-sm leading-relaxed pt-2">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Social proof: client logos + testimonial */}
        <section className="pb-8 px-4 border-t border-border/50 pt-12">
          <ClientLogos />
        </section>

        <section className="pb-16 px-4">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-10">
              <p className="text-iskra-emerald text-xs font-semibold uppercase tracking-widest mb-3">
                What clients say
              </p>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground">
                Real results, real people
              </h2>
            </div>

            <div className="grid md:grid-cols-2 gap-6 items-stretch">
              {testimonials.map((t) => (
                <div
                  key={t.id}
                  className="bg-card border border-iskra-emerald/30 rounded-2xl p-5 shadow-lg flex flex-col"
                >
                  <div
                    className={`${
                      t.orientation === "portrait"
                        ? "aspect-[9/16] max-h-[520px]"
                        : "aspect-video"
                    } w-full mx-auto bg-black rounded-xl overflow-hidden mb-5`}
                  >
                    <video
                      src={t.videoSrc}
                      poster={t.poster}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-contain"
                      data-track="testimonial_video"
                    />
                  </div>
                  <div className="mt-auto space-y-3">
                    <div>
                      <p className="font-semibold text-foreground">{t.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {t.role},{" "}
                        <a
                          href={t.companyHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-iskra-emerald hover:underline"
                          data-track="testimonial_client_link"
                        >
                          {t.companyLabel}
                        </a>
                      </p>
                    </div>
                    {t.result && (
                      <div className="bg-iskra-emerald/10 rounded-xl p-3 border border-iskra-emerald/20">
                        <p className="text-[10px] font-medium text-iskra-emerald mb-1 uppercase tracking-wider">
                          Result
                        </p>
                        <p className="font-display text-sm md:text-base font-bold text-foreground">
                          {t.result}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

          </div>
        </section>

        {/* Founder + WhatsApp */}
        <section className="pb-16 px-4">
          <div className="container mx-auto max-w-2xl">
            <div className="card-champagne rounded-2xl p-6 md:p-8 text-center">
              <img
                src={founderPhoto}
                alt="Arsenijs - ISKRA Founder"
                className="w-20 h-20 rounded-full object-cover object-top border-2 border-iskra-emerald/20 mx-auto mb-4"
              />
              <h3 className="font-bold text-lg font-display text-foreground mb-2">
                Got questions before the call?
              </h3>
              <p className="text-muted-foreground text-sm mb-5">
                Message me directly - I usually reply within minutes.
              </p>
              <a
                href="https://wa.me/971568785008"
                target="_blank"
                rel="noopener noreferrer"
                data-track="whatsapp_cta_main"
              >
                <Button size="lg" className="bg-[#25D366] hover:bg-[#20BD5A] text-primary-foreground gap-2 text-base px-6 py-5 shadow-lg">
                  <MessageCircle className="w-5 h-5" />
                  Message on WhatsApp
                </Button>
              </a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-6 border-t border-border/50">
          <div className="container mx-auto px-4 text-center">
            <p className="text-muted-foreground text-sm">© {new Date().getFullYear()} ISKRA. All rights reserved.</p>
          </div>
        </footer>
      </main>
    </>
  );
};

export default Booked;
