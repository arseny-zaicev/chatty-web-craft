import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";

type FormStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

interface FormData {
  currentSource: string;
  duration: string;
  satisfaction: string;
  salesCount: string;
  areas: string;
  propertyType: string;
  leadsPerListing: string;
  commission: string;
  responseTime: string;
  // Contact info
  fullName: string;
  phone: string;
  email: string;
  companyName: string;
  webLink: string;
}

const currentSourceOptions = [
  { key: "A", label: "Cold calling / Door knocking" },
  { key: "B", label: "Referrals from existing clients" },
  { key: "C", label: "Paid ads (Facebook, Google)" },
  { key: "D", label: "Portals (Bayut, Property Finder)" },
  { key: "E", label: "Developer partnerships" },
  { key: "F", label: "No consistent system yet" },
];

const durationOptions = [
  { key: "A", label: "Less than 6 months" },
  { key: "B", label: "6–12 months" },
  { key: "C", label: "1–2 years" },
  { key: "D", label: "More than 2 years" },
];

const satisfactionOptions = [
  { key: "A", label: "Very happy — getting enough quality leads" },
  { key: "B", label: "It works, but could be better" },
  { key: "C", label: "Struggling to find motivated sellers" },
  { key: "D", label: "Need a completely new approach" },
];

const salesCountOptions = [
  { key: "A", label: "0 sales" },
  { key: "B", label: "1–3 sales" },
  { key: "C", label: "4–6 sales" },
  { key: "D", label: "7+ sales" },
];

const propertyTypeOptions = [
  { key: "A", label: "Mostly ready properties" },
  { key: "B", label: "Mostly off-plan" },
  { key: "C", label: "Mix of both" },
];

const leadsPerListingOptions = [
  { key: "A", label: "5–10 leads" },
  { key: "B", label: "10–20 leads" },
  { key: "C", label: "20–50 leads" },
  { key: "D", label: "50+ leads" },
];

const commissionOptions = [
  { key: "A", label: "Under AED 50,000" },
  { key: "B", label: "AED 50,000 – 100,000" },
  { key: "C", label: "AED 100,000 – 200,000" },
  { key: "D", label: "AED 200,000+" },
];

const responseTimeOptions = [
  { key: "A", label: "Within 5 minutes" },
  { key: "B", label: "Within 1 hour" },
  { key: "C", label: "Same day" },
  { key: "D", label: "Next day or later" },
];

const totalSteps = 8;

export const SellerLeadsForm = () => {
  const [step, setStep] = useState<FormStep>(1);
  const [formData, setFormData] = useState<FormData>({
    currentSource: "",
    duration: "",
    satisfaction: "",
    salesCount: "",
    areas: "",
    propertyType: "",
    leadsPerListing: "",
    commission: "",
    responseTime: "",
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

  const handleSubmit = async () => {
    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsSubmitting(false);
    toast.success("Thank you! We'll reach out to schedule a quick 15-minute call.");
    setStep(1);
    setFormData({
      currentSource: "",
      duration: "",
      satisfaction: "",
      salesCount: "",
      areas: "",
      propertyType: "",
      leadsPerListing: "",
      commission: "",
      responseTime: "",
      fullName: "",
      phone: "",
      email: "",
      companyName: "",
      webLink: "",
    });
  };

  const isStepValid = () => {
    switch (step) {
      case 1:
        return formData.currentSource.length > 0;
      case 2:
        return formData.duration.length > 0;
      case 3:
        return formData.satisfaction.length > 0;
      case 4:
        return formData.salesCount.length > 0;
      case 5:
        return formData.areas.length > 0 && formData.propertyType.length > 0;
      case 6:
        return formData.leadsPerListing.length > 0 && formData.commission.length > 0;
      case 7:
        return formData.responseTime.length > 0;
      case 8:
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
          title: "How are you currently getting seller leads?",
          subtitle: "Current Lead Source",
          required: true,
        };
      case 2:
        return {
          title: "How long have you been doing it this way?",
          subtitle: "Experience Duration",
          required: true,
        };
      case 3:
        return {
          title: "Are you happy with the results?",
          subtitle: "Current Satisfaction",
          required: true,
        };
      case 4:
        return {
          title: "Roughly how many property sales have you closed in the last 3 months?",
          subtitle: "Recent Sales",
          required: true,
        };
      case 5:
        return {
          title: "Tell us about your focus area",
          subtitle: "Geography & Property Type",
          required: true,
        };
      case 6:
        return {
          title: "Let's talk numbers",
          subtitle: "Lead Economics",
          required: true,
        };
      case 7:
        return {
          title: "How quickly do you usually respond to new leads?",
          subtitle: "Response Time",
          required: true,
        };
      case 8:
        return {
          title: "Great! Let's schedule a quick call",
          subtitle: "Contact Information",
          note: "We'll show you how this could work for you and run the numbers together.",
          required: true,
        };
      default:
        return { title: "", subtitle: "", required: false };
    }
  };

  const content = getStepContent();

  return (
    <section id="seller-leads-form" className="py-24 bg-foreground">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-background mb-4">
              See If You Qualify
            </h2>
            <p className="text-background/70">
              Answer a few questions so we can understand your business and show you how our leads can help.
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
                renderSingleSelect(currentSourceOptions, formData.currentSource, (key) =>
                  setFormData({ ...formData, currentSource: key })
                )}

              {step === 2 &&
                renderSingleSelect(durationOptions, formData.duration, (key) =>
                  setFormData({ ...formData, duration: key })
                )}

              {step === 3 &&
                renderSingleSelect(satisfactionOptions, formData.satisfaction, (key) =>
                  setFormData({ ...formData, satisfaction: key })
                )}

              {step === 4 &&
                renderSingleSelect(salesCountOptions, formData.salesCount, (key) =>
                  setFormData({ ...formData, salesCount: key })
                )}

              {step === 5 && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-background/80 text-sm mb-2">Which areas do you mainly work in?</label>
                    <Input
                      value={formData.areas}
                      onChange={(e) => setFormData({ ...formData, areas: e.target.value })}
                      placeholder="e.g., Dubai Marina, Downtown, JBR..."
                      className="bg-background/10 border-background/20 text-background placeholder:text-background/40 h-14"
                    />
                  </div>
                  <div>
                    <label className="block text-background/80 text-sm mb-3">Property focus:</label>
                    {renderSingleSelect(propertyTypeOptions, formData.propertyType, (key) =>
                      setFormData({ ...formData, propertyType: key })
                    )}
                  </div>
                </div>
              )}

              {step === 6 && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-background/80 text-sm mb-3">On average, how many leads do you need to get one listing?</label>
                    {renderSingleSelect(leadsPerListingOptions, formData.leadsPerListing, (key) =>
                      setFormData({ ...formData, leadsPerListing: key })
                    )}
                  </div>
                  <div>
                    <label className="block text-background/80 text-sm mb-3">What's the typical commission per deal for you?</label>
                    {renderSingleSelect(commissionOptions, formData.commission, (key) =>
                      setFormData({ ...formData, commission: key })
                    )}
                  </div>
                </div>
              )}

              {step === 7 &&
                renderSingleSelect(responseTimeOptions, formData.responseTime, (key) =>
                  setFormData({ ...formData, responseTime: key })
                )}

              {step === 8 && (
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
                  {isSubmitting ? "Submitting..." : "Schedule Call"}
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
