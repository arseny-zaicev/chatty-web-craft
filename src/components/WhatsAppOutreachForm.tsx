import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useFormAnalytics } from "@/hooks/useFormAnalytics";

const STEP_NAMES = [
  "Message Volume",
  "Target Audience",
  "Current Method",
  "Timeline",
  "Budget",
  "Contact Info",
];
type FormStep = 1 | 2 | 3 | 4 | 5 | 6;

interface FormData {
  messageVolume: string;
  targetAudience: string;
  currentMethod: string;
  timeline: string;
  budget: string;
  // Contact fields
  fullName: string;
  phone: string;
  email: string;
  companyName: string;
  webLink: string;
}

const messageVolumeOptions = [
  { key: "A", label: "100–500 messages/month" },
  { key: "B", label: "500–2,000 messages/month" },
  { key: "C", label: "2,000–5,000 messages/month" },
  { key: "D", label: "5,000–10,000 messages/month" },
  { key: "E", label: "10,000+ messages/month" },
];

const targetAudienceOptions = [
  { key: "A", label: "B2B – companies & decision makers" },
  { key: "B", label: "B2C – consumers" },
  { key: "C", label: "Real estate (buyers/sellers)" },
  { key: "D", label: "E-commerce customers" },
  { key: "E", label: "Event attendees" },
  { key: "F", label: "Other" },
];

const currentMethodOptions = [
  { key: "A", label: "Manual messaging" },
  { key: "B", label: "Email marketing" },
  { key: "C", label: "Cold calling" },
  { key: "D", label: "Social media DMs" },
  { key: "E", label: "Not doing outreach yet" },
  { key: "F", label: "Other platform/tool" },
];

const timelineOptions = [
  { key: "A", label: "ASAP (this week)" },
  { key: "B", label: "Within 30 days" },
  { key: "C", label: "1–3 months" },
  { key: "D", label: "Just exploring options" },
];

const budgetOptions = [
  { key: "A", label: "€500 – €1,000/month" },
  { key: "B", label: "€1,000 – €2,500/month" },
  { key: "C", label: "€2,500 – €5,000/month" },
  { key: "D", label: "€5,000+/month" },
];

const totalSteps = 6;

export const WhatsAppOutreachForm = () => {
  const [step, setStep] = useState<FormStep>(1);
  const [formData, setFormData] = useState<FormData>({
    messageVolume: "",
    targetAudience: "",
    currentMethod: "",
    timeline: "",
    budget: "",
    fullName: "",
    phone: "",
    email: "",
    companyName: "",
    webLink: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { trackStepView, trackStepComplete, trackFormSubmit, resetSession } = useFormAnalytics({
    formType: "whatsapp_outreach",
    totalSteps,
    stepNames: STEP_NAMES,
  });

  // Track step views
  useEffect(() => {
    trackStepView(step);
  }, [step, trackStepView]);

  const handleNext = () => {
    if (step < totalSteps) {
      trackStepComplete(step);
      setStep((prev) => (prev + 1) as FormStep);
    }
  };

  const handlePrev = () => {
    if (step > 1) {
      setStep((prev) => (prev - 1) as FormStep);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase.from("form_submissions").insert({
        form_type: "qualification" as const, // Using qualification type for now
        status: "new" as const,
        contact_name: formData.fullName,
        contact_email: formData.email,
        contact_phone: formData.phone,
        contact_company: formData.companyName,
        contact_website: formData.webLink || null,
        data: {
          formSource: "WhatsApp Outreach",
          messageVolume: messageVolumeOptions.find(o => o.key === formData.messageVolume)?.label || formData.messageVolume,
          targetAudience: targetAudienceOptions.find(o => o.key === formData.targetAudience)?.label || formData.targetAudience,
          currentMethod: currentMethodOptions.find(o => o.key === formData.currentMethod)?.label || formData.currentMethod,
          timeline: timelineOptions.find(o => o.key === formData.timeline)?.label || formData.timeline,
          budget: budgetOptions.find(o => o.key === formData.budget)?.label || formData.budget,
        },
      });

      if (error) {
        console.error("Error submitting form:", error);
        toast.error("Something went wrong. Please try again.");
        return;
      }

      toast.success("Application submitted! We'll be in touch within 24 hours.");
      await trackFormSubmit();
      resetSession();
      setStep(1);
      setFormData({
        messageVolume: "",
        targetAudience: "",
        currentMethod: "",
        timeline: "",
        budget: "",
        fullName: "",
        phone: "",
        email: "",
        companyName: "",
        webLink: "",
      });
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStepValid = () => {
    switch (step) {
      case 1:
        return formData.messageVolume.length > 0;
      case 2:
        return formData.targetAudience.length > 0;
      case 3:
        return formData.currentMethod.length > 0;
      case 4:
        return formData.timeline.length > 0;
      case 5:
        return formData.budget.length > 0;
      case 6:
        return (
          formData.fullName.length > 0 &&
          formData.phone.length >= 10 &&
          formData.email.includes("@") &&
          formData.companyName.length > 0
        );
      default:
        return false;
    }
  };

  const renderSingleSelect = (
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
              ? "bg-iskra-emerald border-iskra-emerald text-background"
              : "bg-background/5 border-background/20 text-background hover:bg-background/10"
          }`}
        >
          <span className="w-8 h-8 rounded-lg bg-background/20 flex items-center justify-center text-sm font-semibold shrink-0">
            {option.key}
          </span>
          <span className="font-medium">{option.label}</span>
          {value === option.key && <Check className="w-5 h-5 ml-auto shrink-0" />}
        </button>
      ))}
    </div>
  );

  const getStepContent = () => {
    switch (step) {
      case 1:
        return {
          title: "How many WhatsApp messages do you need to send monthly?",
          subtitle: "Message Volume",
          required: true,
        };
      case 2:
        return {
          title: "Who is your target audience?",
          subtitle: "Target Audience",
          required: true,
        };
      case 3:
        return {
          title: "How are you currently reaching prospects?",
          subtitle: "Current Outreach Method",
          required: true,
        };
      case 4:
        return {
          title: "When do you want to start?",
          subtitle: "Timeline",
          required: true,
        };
      case 5:
        return {
          title: "What's your monthly budget for WhatsApp outreach?",
          subtitle: "Budget Range",
          required: true,
        };
      case 6:
        return {
          title: "How can we reach you?",
          subtitle: "Contact Information",
          required: true,
        };
      default:
        return { title: "", subtitle: "", required: false };
    }
  };

  const content = getStepContent();

  return (
    <section id="whatsapp-contact" className="py-24 bg-foreground">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-background mb-4">
              Get WhatsApp Outreach Quote
            </h2>
            <p className="text-background/70">
              Answer a few questions to get a customized WhatsApp outreach plan.
            </p>
          </div>

          {/* Progress Bar */}
          <div className="flex gap-2 mb-8">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                  s <= step ? "bg-iskra-emerald" : "bg-background/20"
                }`}
              />
            ))}
          </div>

          {/* Form Card */}
          <div className="bg-background/10 backdrop-blur-xl rounded-3xl p-8 md:p-10 border border-background/20">
            <div className="flex items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-iskra-emerald text-background flex items-center justify-center text-sm font-semibold">
                  {step}
                </span>
                <span className="text-background/60 text-sm">
                  Step {step} of {totalSteps}
                </span>
              </div>
              {content.required && (
                <span className="text-iskra-emerald text-xs font-medium">Required *</span>
              )}
            </div>

            {/* Step Content */}
            <div className="animate-fade-in" key={step}>
              <h3 className="text-xl font-semibold text-background mb-6">
                {content.title}
              </h3>

              {step === 1 &&
                renderSingleSelect(messageVolumeOptions, formData.messageVolume, (key) =>
                  setFormData({ ...formData, messageVolume: key })
                )}

              {step === 2 &&
                renderSingleSelect(targetAudienceOptions, formData.targetAudience, (key) =>
                  setFormData({ ...formData, targetAudience: key })
                )}

              {step === 3 &&
                renderSingleSelect(currentMethodOptions, formData.currentMethod, (key) =>
                  setFormData({ ...formData, currentMethod: key })
                )}

              {step === 4 &&
                renderSingleSelect(timelineOptions, formData.timeline, (key) =>
                  setFormData({ ...formData, timeline: key })
                )}

              {step === 5 &&
                renderSingleSelect(budgetOptions, formData.budget, (key) =>
                  setFormData({ ...formData, budget: key })
                )}

              {step === 6 && (
                <div className="space-y-4">
                  <Input
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="Full Name *"
                    className="bg-background/10 border-background/20 text-background placeholder:text-background/40 h-14"
                  />
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Phone Number *"
                    type="tel"
                    className="bg-background/10 border-background/20 text-background placeholder:text-background/40 h-14"
                  />
                  <Input
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Email *"
                    type="email"
                    className="bg-background/10 border-background/20 text-background placeholder:text-background/40 h-14"
                  />
                  <Input
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    placeholder="Company Name *"
                    className="bg-background/10 border-background/20 text-background placeholder:text-background/40 h-14"
                  />
                  <Input
                    value={formData.webLink}
                    onChange={(e) => setFormData({ ...formData, webLink: e.target.value })}
                    placeholder="Website (optional)"
                    type="url"
                    className="bg-background/10 border-background/20 text-background placeholder:text-background/40 h-14"
                  />
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between mt-8 pt-6 border-t border-background/10">
              <Button
                variant="ghost"
                onClick={handlePrev}
                disabled={step === 1}
                className="text-background hover:bg-background/10 disabled:opacity-30"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>

              {step < totalSteps ? (
                <Button
                  variant="emerald"
                  onClick={handleNext}
                  disabled={!isStepValid()}
                  className="group"
                >
                  Continue
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              ) : (
                <Button
                  variant="emerald"
                  onClick={handleSubmit}
                  disabled={!isStepValid() || isSubmitting}
                  className="group"
                >
                  {isSubmitting ? "Submitting..." : "Get My Quote"}
                  {!isSubmitting && (
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
