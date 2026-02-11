import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, ArrowLeft, CheckCircle, XCircle, Calendar } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ScrollReveal } from "@/hooks/useScrollReveal";

type FormStep = 1 | 2 | 3 | 4 | 5;

interface FormData {
  avgDealSize: string;
  closeRate: string;
  weeklyCapacity: string;
  responseSpeed: string;
  // Contact
  fullName: string;
  phone: string;
  email: string;
  companyName: string;
}

const dealSizeOptions = [
  { key: "A", label: "Under €1,000" },
  { key: "B", label: "€1,000 – €5,000" },
  { key: "C", label: "€5,000 – €20,000" },
  { key: "D", label: "€20,000+" },
];

const closeRateOptions = [
  { key: "A", label: "Under 10%" },
  { key: "B", label: "10% – 25%" },
  { key: "C", label: "25% – 40%" },
  { key: "D", label: "40%+" },
];

const capacityOptions = [
  { key: "A", label: "1–5 calls/week" },
  { key: "B", label: "5–15 calls/week" },
  { key: "C", label: "15–30 calls/week" },
  { key: "D", label: "30+ calls/week" },
];

const responseOptions = [
  { key: "A", label: "Under 1 hour" },
  { key: "B", label: "1–4 hours" },
  { key: "C", label: "Same day" },
  { key: "D", label: "Next day or longer" },
];

const totalSteps = 5;

// Scoring logic
const getScore = (data: FormData): { score: number; qualified: boolean; reason: string } => {
  let score = 0;
  
  // Deal size scoring
  if (data.avgDealSize === "C" || data.avgDealSize === "D") score += 3;
  else if (data.avgDealSize === "B") score += 2;
  else score += 1;

  // Close rate scoring
  if (data.closeRate === "C" || data.closeRate === "D") score += 3;
  else if (data.closeRate === "B") score += 2;
  else score += 1;

  // Capacity scoring
  if (data.weeklyCapacity === "C" || data.weeklyCapacity === "D") score += 3;
  else if (data.weeklyCapacity === "B") score += 2;
  else score += 1;

  // Response speed scoring
  if (data.responseSpeed === "A") score += 3;
  else if (data.responseSpeed === "B") score += 2;
  else if (data.responseSpeed === "C") score += 1;
  else score += 0;

  const qualified = score >= 7;
  const reason = qualified
    ? "Your business metrics indicate a strong fit for WhatsApp outreach. Let's discuss your pilot plan."
    : "Based on current metrics, WhatsApp outreach may need adjustments to work effectively. Let's discuss your options.";

  return { score, qualified, reason };
};

export const FitCheckForm = () => {
  const [step, setStep] = useState<FormStep>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; qualified: boolean; reason: string } | null>(null);
  const [formData, setFormData] = useState<FormData>({
    avgDealSize: "",
    closeRate: "",
    weeklyCapacity: "",
    responseSpeed: "",
    fullName: "",
    phone: "",
    email: "",
    companyName: "",
  });

  const handleNext = () => {
    if (step < totalSteps) setStep((s) => (s + 1) as FormStep);
  };
  const handlePrev = () => {
    if (step > 1) setStep((s) => (s - 1) as FormStep);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const assessment = getScore(formData);

      const { error } = await supabase.functions.invoke("submit-form", {
        body: {
          form_type: "qualification",
          contact_name: formData.fullName,
          contact_email: formData.email,
          contact_phone: formData.phone,
          contact_company: formData.companyName,
          data: {
            formSource: "WhatsApp Fit Check",
            avgDealSize: dealSizeOptions.find((o) => o.key === formData.avgDealSize)?.label,
            closeRate: closeRateOptions.find((o) => o.key === formData.closeRate)?.label,
            weeklyCapacity: capacityOptions.find((o) => o.key === formData.weeklyCapacity)?.label,
            responseSpeed: responseOptions.find((o) => o.key === formData.responseSpeed)?.label,
            fitScore: assessment.score,
            qualified: assessment.qualified,
          },
        },
      });

      if (error) {
        toast.error("Something went wrong. Please try again.");
        return;
      }

      setResult(assessment);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStepValid = () => {
    switch (step) {
      case 1: return formData.avgDealSize.length > 0;
      case 2: return formData.closeRate.length > 0;
      case 3: return formData.weeklyCapacity.length > 0;
      case 4: return formData.responseSpeed.length > 0;
      case 5: return formData.fullName.length > 0 && formData.phone.length >= 7 && formData.email.includes("@") && formData.companyName.length > 0;
      default: return false;
    }
  };

  const renderOptions = (
    options: { key: string; label: string }[],
    value: string,
    onChange: (key: string) => void
  ) => (
    <div className="grid gap-3">
      {options.map((option) => (
        <button
          key={option.key}
          onClick={() => onChange(option.key)}
          className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 text-left ${
            value === option.key
              ? "bg-iskra-emerald border-iskra-emerald text-primary-foreground"
              : "bg-card/50 border-border hover:border-iskra-emerald/40"
          }`}
        >
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0 ${
            value === option.key ? "bg-primary-foreground/20" : "bg-muted"
          }`}>
            {option.key}
          </span>
          <span className="font-medium text-sm">{option.label}</span>
        </button>
      ))}
    </div>
  );

  const stepData = [
    { title: "What's your average deal size?", subtitle: "This helps us estimate your ROI" },
    { title: "What's your close rate on qualified calls?", subtitle: "Higher close rate = fewer messages needed" },
    { title: "How many calls can your team handle per week?", subtitle: "We'll match volume to capacity" },
    { title: "How fast can your team follow up on interest?", subtitle: "Speed determines conversion" },
    { title: "How can we reach you?", subtitle: "We'll share your Fit Check results" },
  ];

  // Result screen
  if (result) {
    return (
      <section id="fit-check" className="py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-lg mx-auto">
            <div className="glass-card rounded-2xl p-8 md:p-10 text-center">
              {result.qualified ? (
                <CheckCircle className="w-16 h-16 text-iskra-emerald mx-auto mb-6" />
              ) : (
                <XCircle className="w-16 h-16 text-iskra-gold mx-auto mb-6" />
              )}

              <h2 className="font-headline text-2xl font-bold mb-3">
                {result.qualified ? "Great Fit! ✅" : "Let's Talk 💬"}
              </h2>
              <p className="text-muted-foreground mb-8">{result.reason}</p>

              <Button
                className="group text-base px-8 py-6 bg-iskra-emerald hover:bg-iskra-emerald/90 text-primary-foreground rounded-xl font-semibold btn-glow"
                onClick={() => window.open("https://wa.me/971568785008?text=Hi!%20I%20just%20completed%20the%20Fit%20Check%20on%20iskra.ae", "_blank")}
              >
                <Calendar className="w-5 h-5 mr-2" />
                Book Your Strategy Call
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>

              <p className="text-xs text-muted-foreground mt-4">
                Or WhatsApp us directly at +971 56 878 5008
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const current = stepData[step - 1];

  return (
    <section id="fit-check" className="py-24">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="text-center mb-12">
            <p className="text-iskra-emerald text-sm font-semibold uppercase tracking-widest mb-3">
              Free Assessment
            </p>
            <h2 className="font-headline text-3xl md:text-4xl font-bold mb-4">
              Is WhatsApp Right for Your Business?
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              4 quick questions to check if WhatsApp outreach can generate ROI for you.
            </p>
          </div>
        </ScrollReveal>

        <div className="max-w-lg mx-auto">
          {/* Progress */}
          <div className="flex gap-2 mb-6">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                  i < step ? "bg-iskra-emerald" : "bg-border"
                }`}
              />
            ))}
          </div>

          <div className="glass-card rounded-2xl p-7 md:p-9">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-8 h-8 rounded-full bg-iskra-emerald text-primary-foreground flex items-center justify-center text-sm font-semibold">
                {step}
              </span>
              <span className="text-muted-foreground text-sm">Step {step} of {totalSteps}</span>
            </div>

            <div key={step} className="animate-fade-in">
              <h3 className="font-headline text-lg font-bold mb-1">{current.title}</h3>
              <p className="text-sm text-muted-foreground mb-6">{current.subtitle}</p>

              {step === 1 && renderOptions(dealSizeOptions, formData.avgDealSize, (k) => setFormData({ ...formData, avgDealSize: k }))}
              {step === 2 && renderOptions(closeRateOptions, formData.closeRate, (k) => setFormData({ ...formData, closeRate: k }))}
              {step === 3 && renderOptions(capacityOptions, formData.weeklyCapacity, (k) => setFormData({ ...formData, weeklyCapacity: k }))}
              {step === 4 && renderOptions(responseOptions, formData.responseSpeed, (k) => setFormData({ ...formData, responseSpeed: k }))}
              {step === 5 && (
                <div className="space-y-4">
                  <Input value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} placeholder="Full Name *" className="h-12" />
                  <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="Phone *" type="tel" className="h-12" />
                  <Input value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="Email *" type="email" className="h-12" />
                  <Input value={formData.companyName} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })} placeholder="Company Name *" className="h-12" />
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between mt-8 pt-6 border-t border-border">
              <Button variant="ghost" onClick={handlePrev} disabled={step === 1} className="disabled:opacity-30">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
              {step < totalSteps ? (
                <Button variant="hero" onClick={handleNext} disabled={!isStepValid()} className="group">
                  Continue <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              ) : (
                <Button variant="hero" onClick={handleSubmit} disabled={!isStepValid() || isSubmitting} className="group">
                  {isSubmitting ? "Checking..." : "Get My Results"}
                  {!isSubmitting && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
