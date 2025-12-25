import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";

type FormStep = 1 | 2 | 3 | 4;

interface FormData {
  location: string;
  revenue: string;
  service: string;
  contact: string;
}

const revenueOptions = [
  { key: "A", label: "Under $10k/month" },
  { key: "B", label: "$10k - $25k/month" },
  { key: "C", label: "$25k - $50k/month" },
  { key: "D", label: "$50k - $100k+/month" },
];

const serviceOptions = [
  { key: "A", label: "AI Chatbot" },
  { key: "B", label: "WhatsApp Outreach" },
  { key: "C", label: "Web Development" },
  { key: "D", label: "All Services" },
];

export const QualificationForm = () => {
  const [step, setStep] = useState<FormStep>(1);
  const [formData, setFormData] = useState<FormData>({
    location: "",
    revenue: "",
    service: "",
    contact: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNext = () => {
    if (step < 4) {
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
    // Simulate submission
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsSubmitting(false);
    toast.success("Application submitted! We'll be in touch within 24 hours.");
    setStep(1);
    setFormData({ location: "", revenue: "", service: "", contact: "" });
  };

  const isStepValid = () => {
    switch (step) {
      case 1:
        return formData.location.length > 0;
      case 2:
        return formData.revenue.length > 0;
      case 3:
        return formData.service.length > 0;
      case 4:
        return formData.contact.includes("@") || formData.contact.length >= 10;
      default:
        return false;
    }
  };

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
            {[1, 2, 3, 4].map((s) => (
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
            <div className="flex items-center gap-3 mb-6">
              <span className="w-8 h-8 rounded-full bg-iskra-emerald text-background flex items-center justify-center text-sm font-semibold">
                {step}
              </span>
              <span className="text-background/60 text-sm">Step {step} of 4</span>
            </div>

            {/* Step 1: Location */}
            {step === 1 && (
              <div className="animate-fade-in">
                <h3 className="text-xl font-semibold text-background mb-2">
                  Where is your business located?
                </h3>
                <p className="text-background/60 mb-6">
                  Enter your city or country to check availability.
                </p>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g., New York, USA"
                  className="bg-background/10 border-background/20 text-background placeholder:text-background/40 h-14 text-lg"
                />
              </div>
            )}

            {/* Step 2: Revenue */}
            {step === 2 && (
              <div className="animate-fade-in">
                <h3 className="text-xl font-semibold text-background mb-2">
                  What's your current monthly revenue?
                </h3>
                <p className="text-background/60 mb-6">
                  This helps us understand your business scale.
                </p>
                <div className="grid gap-3">
                  {revenueOptions.map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setFormData({ ...formData, revenue: option.key })}
                      className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 text-left ${
                        formData.revenue === option.key
                          ? "bg-iskra-emerald border-iskra-emerald text-background"
                          : "bg-background/5 border-background/20 text-background hover:bg-background/10"
                      }`}
                    >
                      <span className="w-8 h-8 rounded-lg bg-background/20 flex items-center justify-center text-sm font-semibold">
                        {option.key}
                      </span>
                      <span className="font-medium">{option.label}</span>
                      {formData.revenue === option.key && (
                        <Check className="w-5 h-5 ml-auto" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Service */}
            {step === 3 && (
              <div className="animate-fade-in">
                <h3 className="text-xl font-semibold text-background mb-2">
                  Which service interests you most?
                </h3>
                <p className="text-background/60 mb-6">
                  Select the primary service you're looking for.
                </p>
                <div className="grid gap-3">
                  {serviceOptions.map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setFormData({ ...formData, service: option.key })}
                      className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 text-left ${
                        formData.service === option.key
                          ? "bg-iskra-emerald border-iskra-emerald text-background"
                          : "bg-background/5 border-background/20 text-background hover:bg-background/10"
                      }`}
                    >
                      <span className="w-8 h-8 rounded-lg bg-background/20 flex items-center justify-center text-sm font-semibold">
                        {option.key}
                      </span>
                      <span className="font-medium">{option.label}</span>
                      {formData.service === option.key && (
                        <Check className="w-5 h-5 ml-auto" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 4: Contact */}
            {step === 4 && (
              <div className="animate-fade-in">
                <h3 className="text-xl font-semibold text-background mb-2">
                  How can we reach you?
                </h3>
                <p className="text-background/60 mb-6">
                  Enter your email or phone number.
                </p>
                <Input
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  placeholder="email@example.com or +1 234 567 890"
                  className="bg-background/10 border-background/20 text-background placeholder:text-background/40 h-14 text-lg"
                />
              </div>
            )}

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

              {step < 4 ? (
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
