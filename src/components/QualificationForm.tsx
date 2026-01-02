import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type FormStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface FormData {
  revenue: string;
  timeline: string;
  bottlenecks: string[];
  techStack: string; // Free text input for CRM/tools
  budget: string;
  focus: string;
  // Contact fields
  fullName: string;
  phone: string;
  email: string;
  companyName: string;
  webLink: string;
}

const revenueOptions = [
  { key: "A", label: "0 – $250k" },
  { key: "B", label: "$250k – $500k" },
  { key: "C", label: "$500k – $1M" },
  { key: "D", label: "$1M – $3M" },
  { key: "E", label: "$3M+" },
];

const timelineOptions = [
  { key: "A", label: "ASAP (this month)" },
  { key: "B", label: "30–60 days" },
  { key: "C", label: "60–90 days" },
  { key: "D", label: "Just researching" },
];

const bottleneckOptions = [
  { key: "A", label: "Replying to leads manually" },
  { key: "B", label: "Following up with leads" },
  { key: "C", label: "Booking meetings / scheduling" },
  { key: "D", label: "Managing chats across platforms" },
  { key: "E", label: "Updating CRM / pipelines" },
  { key: "F", label: "Paying staff for repetitive work" },
  { key: "G", label: "Other" },
];

// Tech stack is now a free text input

const budgetOptions = [
  { key: "A", label: "$2,000 – $5,000" },
  { key: "B", label: "$5,000 – $10,000" },
  { key: "C", label: "$10,000+" },
];

const focusOptions = [
  { key: "A", label: "Closing more deals" },
  { key: "B", label: "Scaling the business" },
  { key: "C", label: "Marketing & growth" },
  { key: "D", label: "Operations" },
  { key: "E", label: "Personal time" },
  { key: "F", label: "Other" },
];

const totalSteps = 7;

export const QualificationForm = () => {
  const [step, setStep] = useState<FormStep>(1);
  const [formData, setFormData] = useState<FormData>({
    revenue: "",
    timeline: "",
    bottlenecks: [],
    techStack: "",
    budget: "",
    focus: "",
    fullName: "",
    phone: "",
    email: "",
    companyName: "",
    webLink: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNext = () => {
    if (step < totalSteps) {
      setStep((prev) => (prev + 1) as FormStep);
    }
  };

  const handlePrev = () => {
    if (step > 1) {
      setStep((prev) => (prev - 1) as FormStep);
    }
  };

  const toggleArrayItem = (array: string[], item: string): string[] => {
    return array.includes(item)
      ? array.filter((i) => i !== item)
      : [...array, item];
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase.from("form_submissions").insert({
        form_type: "qualification" as const,
        status: "new" as const,
        contact_name: formData.fullName,
        contact_email: formData.email,
        contact_phone: formData.phone,
        contact_company: formData.companyName,
        contact_website: formData.webLink || null,
        data: {
          revenue: revenueOptions.find(o => o.key === formData.revenue)?.label || formData.revenue,
          timeline: timelineOptions.find(o => o.key === formData.timeline)?.label || formData.timeline,
          bottlenecks: formData.bottlenecks.map(k => bottleneckOptions.find(o => o.key === k)?.label || k),
          techStack: formData.techStack || "Not specified",
          budget: budgetOptions.find(o => o.key === formData.budget)?.label || formData.budget,
          focus: focusOptions.find(o => o.key === formData.focus)?.label || formData.focus,
        },
      });

      if (error) {
        console.error("Error submitting form:", error);
        toast.error("Something went wrong. Please try again.");
        return;
      }

      toast.success("Application submitted! We'll be in touch within 24 hours.");
      setStep(1);
      setFormData({
        revenue: "",
        timeline: "",
        bottlenecks: [],
        techStack: "",
        budget: "",
        focus: "",
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
        return formData.revenue.length > 0;
      case 2:
        return formData.timeline.length > 0;
      case 3:
        return formData.bottlenecks.length > 0;
      case 4:
        return formData.techStack.length > 0;
      case 5:
        return formData.budget.length > 0;
      case 6:
        return true; // Optional step
      case 7:
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

  const renderMultiSelect = (
    options: { key: string; label: string }[],
    values: string[],
    onChange: (key: string) => void
  ) => (
    <div className="grid gap-3 max-h-[400px] overflow-y-auto pr-2">
      {options.map((option) => (
        <button
          key={option.key}
          onClick={() => onChange(option.key)}
          className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 text-left ${
            values.includes(option.key)
              ? "bg-iskra-emerald border-iskra-emerald text-background"
              : "bg-background/5 border-background/20 text-background hover:bg-background/10"
          }`}
        >
          <span className="w-8 h-8 rounded-lg bg-background/20 flex items-center justify-center text-sm font-semibold shrink-0">
            {option.key}
          </span>
          <span className="font-medium">{option.label}</span>
          {values.includes(option.key) && (
            <Check className="w-5 h-5 ml-auto shrink-0" />
          )}
        </button>
      ))}
    </div>
  );

  const getStepContent = () => {
    switch (step) {
      case 1:
        return {
          title: "What is your current annual revenue?",
          subtitle: "Current Annual Revenue",
          required: true,
        };
      case 2:
        return {
          title: "When do you want this AI system live?",
          subtitle: "Project Timeline",
          required: true,
        };
      case 3:
        return {
          title: "Which manual process is costing you the most time or money?",
          subtitle: "Main Bottleneck",
          note: "Select all that apply",
          required: true,
        };
      case 4:
        return {
          title: "What tools are you currently using?",
          subtitle: "Current Tech Stack",
          note: "List your CRM, calendars, and other tools",
          required: false,
        };
      case 5:
        return {
          title: "What budget range are you comfortable investing to replace manual work with AI?",
          subtitle: "Estimated Budget",
          required: true,
        };
      case 6:
        return {
          title: "If AI handled your chats and bookings, what would you focus on instead?",
          subtitle: "Your Focus (Optional)",
          required: false,
        };
      case 7:
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
    <section id="contact" className="py-24 bg-foreground">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-background mb-4">
              Check If You Qualify
            </h2>
            <p className="text-background/70">
              Answer a few quick questions to see if ISKRA is the right fit for your business.
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
              <h3 className="text-xl font-semibold text-background mb-2">
                {content.title}
              </h3>
              {content.note && (
                <p className="text-background/60 mb-6">{content.note}</p>
              )}
              {!content.note && <div className="mb-6" />}

              {step === 1 &&
                renderSingleSelect(revenueOptions, formData.revenue, (key) =>
                  setFormData({ ...formData, revenue: key })
                )}

              {step === 2 &&
                renderSingleSelect(timelineOptions, formData.timeline, (key) =>
                  setFormData({ ...formData, timeline: key })
                )}

              {step === 3 &&
                renderMultiSelect(bottleneckOptions, formData.bottlenecks, (key) =>
                  setFormData({
                    ...formData,
                    bottlenecks: toggleArrayItem(formData.bottlenecks, key),
                  })
                )}

              {step === 4 && (
                <div className="space-y-4">
                  <Input
                    value={formData.techStack}
                    onChange={(e) => setFormData({ ...formData, techStack: e.target.value })}
                    placeholder="e.g. Pipedrive + Google Drive + Calendly..."
                    className="bg-background/10 border-background/20 text-background placeholder:text-background/40 h-14"
                  />
                  <p className="text-background/50 text-sm">
                    List your CRM, calendars, and other tools you currently use
                  </p>
                </div>
              )}

              {step === 5 &&
                renderSingleSelect(budgetOptions, formData.budget, (key) =>
                  setFormData({ ...formData, budget: key })
                )}

              {step === 6 &&
                renderSingleSelect(focusOptions, formData.focus, (key) =>
                  setFormData({ ...formData, focus: key })
                )}

              {step === 7 && (
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
                  {isSubmitting ? "Submitting..." : "Submit Application"}
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
