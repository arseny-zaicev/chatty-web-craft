import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, ArrowLeft, MessageSquare, RefreshCw, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const CALENDLY_URL = "https://calendly.com/arseny-iskra/iskra-ae-whatsapp-outreach-web";

const CAMPAIGN_TYPES = [
  {
    id: "warm",
    label: "Warm Traffic",
    desc: "Automate inbound lead follow-ups via WhatsApp",
    icon: MessageSquare,
  },
  {
    id: "reactivation",
    label: "Database Reactivation",
    desc: "Re-engage old leads and dormant contacts",
    icon: RefreshCw,
  },
  {
    id: "cold",
    label: "Cold Outreach",
    desc: "Full-cycle outreach to new prospects",
    icon: Send,
  },
];

const normalizeWebsite = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export default function Demo() {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const [campaignType, setCampaignType] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessUrl, setBusinessUrl] = useState("");

  const totalSteps = 3;
  const selectedCampaign = CAMPAIGN_TYPES.find((ct) => ct.id === campaignType);
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const canProceedStep1 = campaignType !== "";
  const canProceedStep2 = firstName.trim() !== "" && isValidEmail(email) && phone.trim() !== "";

  const calendlyUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (fullName) params.set("name", fullName);
    if (email.trim()) params.set("email", email.trim().toLowerCase());
    if (phone.trim()) params.set("a1", phone.trim());
    return params.toString() ? `${CALENDLY_URL}?${params.toString()}` : CALENDLY_URL;
  }, [email, fullName, phone]);

  const handleSaveLead = async () => {
    if (!canProceedStep2 || !selectedCampaign) {
      toast.error("Please fill in your name, valid email, and phone number.");
      return;
    }

    if (submissionId) {
      setStep(3);
      return;
    }

    setIsSubmitting(true);
    try {
      const normalizedWebsite = normalizeWebsite(businessUrl);
      const formData = {
        campaign_type: selectedCampaign.id,
        campaign_label: selectedCampaign.label,
        business_url: normalizedWebsite,
        calendar_url: CALENDLY_URL,
        source_page: "/demo",
      };

      const { data, error } = await supabase.functions.invoke("submit-form", {
        body: {
          form_type: "demo_request",
          contact_name: fullName,
          contact_email: email.trim().toLowerCase(),
          contact_phone: phone.trim(),
          contact_website: normalizedWebsite,
          data: formData,
        },
      });

      if (error) throw error;

      setSubmissionId((data as { id?: string } | null)?.id ?? null);
      setStep(3);
      toast.success("Request saved. Pick a time below.");
    } catch (err) {
      console.error("Demo request submit error:", err);
      toast.error("Could not save the request. Please check the fields and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Request a Demo - ISKRA</title>
        <meta name="description" content="See how ISKRA WhatsApp campaigns work for your business. Fill out the form and book a demo call." />
        <link rel="canonical" href="https://iskra.ae/demo" />
        <meta property="og:title" content="Request a Demo - ISKRA" />
        <meta property="og:description" content="See how ISKRA WhatsApp campaigns work for your business. Book a demo call." />
        <meta property="og:url" content="https://iskra.ae/demo" />
        <meta property="og:type" content="website" />
        <meta name="twitter:title" content="Request a Demo - ISKRA" />
        <meta name="twitter:description" content="See how ISKRA WhatsApp campaigns work for your business. Book a demo call." />
      </Helmet>
      <Navbar />
      <main className="min-h-screen bg-background pt-24 pb-16 flex items-center justify-center">
        <div className={`container mx-auto px-4 ${step === 3 ? "max-w-4xl" : "max-w-xl"}`}>
          <div className="flex items-center justify-center gap-2 mb-8">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    i + 1 <= step
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </div>
                {i < totalSteps - 1 && (
                  <div className={`w-8 h-px ${i + 1 < step ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            ))}
          </div>

          <div className="card-light">
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h1 className="font-display text-2xl font-bold text-foreground mb-1">What do you need?</h1>
                  <p className="text-muted-foreground">Select the campaign type that fits your business.</p>
                </div>
                <div className="space-y-3">
                  {CAMPAIGN_TYPES.map((ct) => (
                    <button
                      key={ct.id}
                      onClick={() => setCampaignType(ct.id)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                        campaignType === ct.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <ct.icon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{ct.label}</p>
                        <p className="text-sm text-muted-foreground">{ct.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <Button
                  variant="cta"
                  size="lg"
                  className="w-full"
                  disabled={!canProceedStep1}
                  onClick={() => setStep(2)}
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h1 className="font-display text-2xl font-bold text-foreground mb-1">About you</h1>
                  <p className="text-muted-foreground">We'll save your request first, then you can pick a time.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-foreground">First Name *</Label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-foreground">Last Name</Label>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" className="mt-1" />
                  </div>
                </div>

                <div>
                  <Label className="text-foreground">Phone *</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+971 5XX XXX XXX" className="mt-1" />
                </div>

                <div>
                  <Label className="text-foreground">Email *</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@company.com" className="mt-1" />
                </div>

                <div>
                  <Label className="text-foreground">Business URL</Label>
                  <Input value={businessUrl} onChange={(e) => setBusinessUrl(e.target.value)} placeholder="yourcompany.com" className="mt-1" />
                </div>

                <p className="text-xs text-muted-foreground">
                  By continuing, you consent to your data being processed in accordance with our{" "}
                  <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a> and{" "}
                  <a href="/terms" className="text-primary hover:underline">Terms</a>.
                </p>

                <div className="flex gap-3">
                  <Button variant="outline" size="lg" onClick={() => setStep(1)} className="flex-1">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </Button>
                  <Button variant="cta" size="lg" className="flex-1" disabled={!canProceedStep2 || isSubmitting} onClick={handleSaveLead}>
                    {isSubmitting ? "Saving…" : "Continue"} <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="text-center">
                  <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-4" />
                  <h1 className="font-display text-2xl font-bold text-foreground mb-2">Request saved</h1>
                  <p className="text-muted-foreground max-w-xl mx-auto">
                    Now pick a slot with Arseny. Your details are already saved in admin submissions.
                  </p>
                </div>

                <div className="rounded-xl overflow-hidden border border-border bg-card shadow-card">
                  <iframe
                    src={calendlyUrl}
                    width="100%"
                    height="720"
                    frameBorder="0"
                    title="Schedule a demo with ISKRA"
                    className="block w-full bg-card"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <Button variant="outline" size="lg" onClick={() => setStep(2)} className="w-full sm:w-auto">
                    <ArrowLeft className="w-4 h-4" /> Edit Details
                  </Button>
                  <a
                    href="https://wa.me/971568785008?text=Hi!%20I%20just%20filled%20the%20demo%20form%20on%20iskra.ae"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Can't find a time? Message us on WhatsApp
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
