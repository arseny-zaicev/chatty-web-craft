import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowRight, ArrowLeft, MessageSquare, RefreshCw, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const CRM_OPTIONS = [
  "Pipedrive",
  "GoHighLevel",
  "HubSpot",
  "Close CRM",
  "Salesforce",
  "Follow Up Boss",
  "Other",
  "No CRM",
];

const CAMPAIGN_TYPES = [
  {
    id: "warm",
    label: "Warm Traffic",
    desc: "Automate inbound lead follow-ups via WhatsApp",
    icon: MessageSquare,
  },
  {
    id: "reactivation",
    label: "Base Reactivation",
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

const LEADS_PER_DAY = ["0 - 5", "6 - 50", "51 - 250", "251+"];
const BASE_SIZES = ["Under 1,000", "1,000 - 5,000", "5,000 - 20,000", "20,000+"];
const BASE_AGES = ["Less than 6 months", "6 - 12 months", "1 - 2 years", "2+ years"];
const TEAM_SIZES = ["Just me", "1 - 5", "6 - 20", "21+"];

export default function Demo() {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Form data
  const [campaignType, setCampaignType] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessUrl, setBusinessUrl] = useState("");
  const [crm, setCrm] = useState("");
  const [crmOther, setCrmOther] = useState("");
  const [leadsPerDay, setLeadsPerDay] = useState("");
  const [baseSize, setBaseSize] = useState("");
  const [baseAge, setBaseAge] = useState("");
  const [hasMobileNumbers, setHasMobileNumbers] = useState("");
  const [teamSize, setTeamSize] = useState("");

  const totalSteps = 3;

  const canProceedStep1 = campaignType !== "";
  const canProceedStep2 =
    firstName.trim() !== "" &&
    email.trim() !== "" &&
    phone.trim() !== "" &&
    crm !== "" &&
    (crm !== "Other" || crmOther.trim() !== "");

  const canProceedStep3 = (() => {
    if (campaignType === "warm") return leadsPerDay !== "" && teamSize !== "";
    if (campaignType === "reactivation") return baseSize !== "" && baseAge !== "" && teamSize !== "";
    if (campaignType === "cold") return hasMobileNumbers !== "" && teamSize !== "";
    return false;
  })();

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const formData = {
        campaign_type: campaignType,
        crm: crm === "Other" ? crmOther : crm,
        business_url: businessUrl,
        team_size: teamSize,
        ...(campaignType === "warm" && { leads_per_day: leadsPerDay }),
        ...(campaignType === "reactivation" && { base_size: baseSize, base_age: baseAge }),
        ...(campaignType === "cold" && { has_mobile_numbers: hasMobileNumbers }),
      };

      const { error } = await supabase.functions.invoke("submit-form", {
        body: {
          form_type: "demo_request",
          contact_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          contact_email: email.trim(),
          contact_phone: phone.trim(),
          contact_website: businessUrl.trim() || null,
          data: formData,
        },
      });

      if (error) throw error;
      setSubmitted(true);
    } catch (err) {
      console.error("Submit error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <>
        <Helmet>
          <title>Demo Booked — ISKRA</title>
        </Helmet>
        <Navbar />
        <main className="min-h-screen bg-background pt-24 pb-16 flex items-center justify-center">
          <div className="container mx-auto px-4 max-w-2xl">
            <div className="card-light text-center py-12">
              <CheckCircle2 className="w-16 h-16 text-primary mx-auto mb-6" />
              <h1 className="font-display text-3xl font-bold mb-3 text-foreground">You're all set!</h1>
              <p className="text-muted-foreground text-lg mb-8">
                Pick a time below that works for you, and we'll walk you through how it works for your case.
              </p>
              {/* Calendly Embed */}
              <div className="rounded-xl overflow-hidden border border-border">
                <iframe
                  src="https://calendly.com/iskra-demo/30min"
                  width="100%"
                  height="630"
                  frameBorder="0"
                  title="Schedule a demo"
                  className="bg-card"
                />
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Can't find a time?{" "}
                <a
                  href="https://wa.me/971568785008?text=Hi!%20I%20just%20filled%20the%20demo%20form%20on%20iskra.ae"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Message us on WhatsApp
                </a>
              </p>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Request a Demo — ISKRA</title>
        <meta name="description" content="See how ISKRA WhatsApp campaigns work for your business. Fill out the form and book a demo call." />
      </Helmet>
      <Navbar />
      <main className="min-h-screen bg-background pt-24 pb-16 flex items-center justify-center">
        <div className="container mx-auto px-4 max-w-xl">
          {/* Progress */}
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
            {/* Step 1: Campaign Type */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-2xl font-bold text-foreground mb-1">What do you need?</h2>
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

            {/* Step 2: Contact Info */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="font-display text-2xl font-bold text-foreground mb-1">About you</h2>
                  <p className="text-muted-foreground">We'll use this to prepare a personalized demo.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
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
                  <Input value={businessUrl} onChange={(e) => setBusinessUrl(e.target.value)} placeholder="https://yourcompany.com" className="mt-1" />
                </div>

                <div>
                  <Label className="text-foreground">What CRM do you use? *</Label>
                  <RadioGroup value={crm} onValueChange={setCrm} className="mt-2 space-y-2">
                    {CRM_OPTIONS.map((option) => (
                      <div key={option} className="flex items-center gap-2">
                        <RadioGroupItem value={option} id={`crm-${option}`} />
                        <Label htmlFor={`crm-${option}`} className="text-foreground cursor-pointer">{option}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                  {crm === "Other" && (
                    <Input
                      value={crmOther}
                      onChange={(e) => setCrmOther(e.target.value)}
                      placeholder="Your CRM name"
                      className="mt-2"
                    />
                  )}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" size="lg" onClick={() => setStep(1)} className="flex-1">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </Button>
                  <Button variant="cta" size="lg" className="flex-1" disabled={!canProceedStep2} onClick={() => setStep(3)}>
                    Continue <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Campaign-specific questions */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="font-display text-2xl font-bold text-foreground mb-1">
                    {campaignType === "warm" && "About your inbound leads"}
                    {campaignType === "reactivation" && "About your contact base"}
                    {campaignType === "cold" && "About your outreach"}
                  </h2>
                  <p className="text-muted-foreground">This helps us tailor the demo to your situation.</p>
                </div>

                {/* Warm-specific */}
                {campaignType === "warm" && (
                  <div>
                    <Label className="text-foreground">How many new leads do you get per day? *</Label>
                    <RadioGroup value={leadsPerDay} onValueChange={setLeadsPerDay} className="mt-2 space-y-2">
                      {LEADS_PER_DAY.map((opt) => (
                        <div key={opt} className="flex items-center gap-2">
                          <RadioGroupItem value={opt} id={`leads-${opt}`} />
                          <Label htmlFor={`leads-${opt}`} className="text-foreground cursor-pointer">{opt}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                )}

                {/* Reactivation-specific */}
                {campaignType === "reactivation" && (
                  <>
                    <div>
                      <Label className="text-foreground">How large is your contact base? *</Label>
                      <RadioGroup value={baseSize} onValueChange={setBaseSize} className="mt-2 space-y-2">
                        {BASE_SIZES.map((opt) => (
                          <div key={opt} className="flex items-center gap-2">
                            <RadioGroupItem value={opt} id={`base-${opt}`} />
                            <Label htmlFor={`base-${opt}`} className="text-foreground cursor-pointer">{opt}</Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                    <div>
                      <Label className="text-foreground">How old are these contacts? *</Label>
                      <RadioGroup value={baseAge} onValueChange={setBaseAge} className="mt-2 space-y-2">
                        {BASE_AGES.map((opt) => (
                          <div key={opt} className="flex items-center gap-2">
                            <RadioGroupItem value={opt} id={`age-${opt}`} />
                            <Label htmlFor={`age-${opt}`} className="text-foreground cursor-pointer">{opt}</Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                  </>
                )}

                {/* Cold-specific */}
                {campaignType === "cold" && (
                  <div>
                    <Label className="text-foreground">Do you have mobile numbers of your target audience? *</Label>
                    <RadioGroup value={hasMobileNumbers} onValueChange={setHasMobileNumbers} className="mt-2 space-y-2">
                      {["Yes, I have a list", "No, I need you to source them", "Partially"].map((opt) => (
                        <div key={opt} className="flex items-center gap-2">
                          <RadioGroupItem value={opt} id={`mobile-${opt}`} />
                          <Label htmlFor={`mobile-${opt}`} className="text-foreground cursor-pointer">{opt}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                )}

                {/* Team size — all types */}
                <div>
                  <Label className="text-foreground">What is the size of your sales team? *</Label>
                  <RadioGroup value={teamSize} onValueChange={setTeamSize} className="mt-2 space-y-2">
                    {TEAM_SIZES.map((opt) => (
                      <div key={opt} className="flex items-center gap-2">
                        <RadioGroupItem value={opt} id={`team-${opt}`} />
                        <Label htmlFor={`team-${opt}`} className="text-foreground cursor-pointer">{opt}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <p className="text-xs text-muted-foreground">
                  By submitting, you consent to your data being processed in accordance with our{" "}
                  <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a> and{" "}
                  <a href="/terms" className="text-primary hover:underline">Terms</a>.
                </p>

                <div className="flex gap-3">
                  <Button variant="outline" size="lg" onClick={() => setStep(2)} className="flex-1">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </Button>
                  <Button
                    variant="cta"
                    size="lg"
                    className="flex-1"
                    disabled={!canProceedStep3 || isSubmitting}
                    onClick={handleSubmit}
                  >
                    {isSubmitting ? "Submitting…" : "Book a Demo"} <ArrowRight className="w-4 h-4" />
                  </Button>
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
