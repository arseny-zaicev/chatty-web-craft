import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, Upload, X, CheckCircle2, ArrowRight, ArrowLeft, Calendar } from "lucide-react";
import bmExample from "@/assets/bm-example.jpg";
import { useFormAnalytics } from "@/hooks/useFormAnalytics";

type Step = 0 | 1 | 2 | 3;

const CALENDLY_URL = "https://calendly.com/nitish-iskra/20min";

const schema = z.object({
  contact_phone: z.string().trim().regex(/^[\+]?[\d\s\-\(\)]{10,20}$/, "Please enter a valid phone number"),
  has_bm: z.enum(["yes", "no", "not_sure"]),
  bm_age: z.enum(["lt_3m", "3_6m", "6_12m", "12m_plus", "not_sure"]),
  is_verified: z.enum(["yes", "no", "not_sure"]),
  ran_ads: z.enum(["yes", "no", "not_sure"]),
});

type FormData = z.infer<typeof schema>;

const STEP_NAMES = ["Welcome", "BM Details", "Upload Screenshot"];

export const BMAccessForm = () => {
  const [step, setStep] = useState<Step>(0);
  const [data, setData] = useState<Partial<FormData>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const analytics = useFormAnalytics({
    formType: "bm_access",
    totalSteps: 3,
    stepNames: STEP_NAMES,
  });

  useEffect(() => {
    if (step <= 2) analytics.trackStepView(step + 1);
  }, [step, analytics]);

  const update = (key: keyof FormData, value: string) =>
    setData((d) => ({ ...d, [key]: value }));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    const valid = newFiles.filter((f) => {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name} exceeds 10MB`);
        return false;
      }
      const ok = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"].includes(f.type);
      if (!ok) {
        toast.error(`${f.name}: only PNG, JPG, or PDF`);
        return false;
      }
      return true;
    });
    setFiles((prev) => [...prev, ...valid].slice(0, 3));
  };

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const next = () => {
    if (step === 1) {
      const result = schema.safeParse(data);
      if (!result.success) {
        toast.error("Please answer all questions");
        return;
      }
    }
    analytics.trackStepComplete(step + 1);
    setStep((s) => Math.min(3, s + 1) as Step);
  };

  const back = () => setStep((s) => Math.max(0, s - 1) as Step);

  const handleSubmit = async () => {
    if (files.length < 1) {
      toast.error("Please upload at least 1 screenshot");
      return;
    }
    const result = schema.safeParse(data);
    if (!result.success) {
      toast.error("Please complete the previous step");
      return;
    }

    setSubmitting(true);
    setUploadProgress(0);

    try {
      const submissionId = crypto.randomUUID();
      const uploadedPaths: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split(".").pop();
        const path = `${submissionId}/${i + 1}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("bm-screenshots")
          .upload(path, file, { upsert: false });
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
        uploadedPaths.push(path);
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }

      const { error } = await supabase.functions.invoke("submit-form", {
        body: {
          form_type: "bm_access",
          contact_phone: data.contact_phone,
          data: {
            submission_id: submissionId,
            contact_phone: data.contact_phone,
            has_bm: data.has_bm,
            bm_age: data.bm_age,
            is_verified: data.is_verified,
            ran_ads: data.ran_ads,
            screenshot_paths: uploadedPaths,
          },
        },
      });

      if (error) throw error;
      analytics.trackStepComplete(3);
      analytics.trackFormSubmit();
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const totalSteps = 3;
  const progress = ((Math.min(step, 2) + 1) / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {!submitted && (
          <div className="mb-8">
            <Progress value={progress} className="h-1" />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Step {Math.min(step, 2) + 1} of {totalSteps}
            </p>
          </div>
        )}

        <Card className="p-8 md:p-12 shadow-elegant">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="space-y-6 text-center">
              <div className="inline-block px-3 py-1 bg-iskra-emerald/10 text-iskra-emerald rounded-full text-xs font-medium tracking-wide uppercase">
                Partnership Opportunity
              </div>
              <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">
                Rent Your Old Business Manager
              </h1>
              <div className="space-y-4 text-muted-foreground text-lg leading-relaxed">
                <p>Have an old Meta Business Manager?</p>
                <p>
                  You can rent access to our team and earn{" "}
                  <strong className="text-foreground">$200 to $400 per month</strong>.
                </p>
                <p>We will review your account first.</p>
              </div>
              <Button size="lg" onClick={next} className="w-full md:w-auto px-12">
                Start <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 1: BM Details */}
          {step === 1 && (
            <div className="space-y-8">
              <h2 className="font-display text-3xl font-bold">Business Manager Details</h2>

              <div className="space-y-3">
                <Label htmlFor="phone" className="text-base font-medium">Your phone number (WhatsApp)</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={data.contact_phone || ""}
                  onChange={(e) => update("contact_phone", e.target.value)}
                />
              </div>

              <RadioField
                label="Do you already have an old Business Manager?"
                value={data.has_bm}
                onChange={(v) => update("has_bm", v)}
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                  { value: "not_sure", label: "Not sure" },
                ]}
              />

              <RadioField
                label="How old is the Business Manager?"
                value={data.bm_age}
                onChange={(v) => update("bm_age", v)}
                options={[
                  { value: "lt_3m", label: "Less than 3 months" },
                  { value: "3_6m", label: "3 to 6 months" },
                  { value: "6_12m", label: "6 to 12 months" },
                  { value: "12m_plus", label: "12+ months" },
                  { value: "not_sure", label: "Not sure" },
                ]}
              />

              <RadioField
                label="Is the Business Manager verified?"
                value={data.is_verified}
                onChange={(v) => update("is_verified", v)}
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                  { value: "not_sure", label: "Not sure" },
                ]}
              />

              <RadioField
                label="Have you already run ads on it?"
                value={data.ran_ads}
                onChange={(v) => update("ran_ads", v)}
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                  { value: "not_sure", label: "Not sure" },
                ]}
              />

              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={back}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={next} className="flex-1">
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Upload + Submit */}
          {step === 2 && !submitted && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-3xl font-bold mb-3">Upload Screenshot</h2>
                <p className="text-muted-foreground">Upload a screenshot of your Business Manager.</p>
                <p className="text-muted-foreground mt-2">
                  The screenshot should show what your account looks like.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Example screenshot:</p>
                <img
                  src={bmExample}
                  alt="Example Business Manager screenshot"
                  className="w-full rounded-lg border border-border"
                />
              </div>

              <label
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:border-primary transition-colors"
              >
                <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="font-medium mb-1">Click to upload screenshot</p>
                <p className="text-xs text-muted-foreground">Accepted: PNG, JPG, PDF · max 10MB</p>
                <input
                  id="file-upload"
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <span className="text-sm truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {submitting && uploadProgress > 0 && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} />
                  <p className="text-xs text-muted-foreground text-center">
                    Uploading... {uploadProgress}%
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={back} disabled={submitting}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={handleSubmit} disabled={submitting || files.length < 1} className="flex-1">
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...
                    </>
                  ) : (
                    "Submit"
                  )}
                </Button>
              </div>
            </div>
          )}

          {submitted && (
            <div className="space-y-8 text-center py-4">
              <CheckCircle2 className="h-16 w-16 text-iskra-emerald mx-auto" />
              <div className="space-y-3">
                <h2 className="font-display text-3xl md:text-4xl font-bold">Submission Received</h2>
                <p className="text-muted-foreground text-lg leading-relaxed max-w-lg mx-auto">
                  Thank you. Our team will review your Business Manager and contact you if it is a fit.
                </p>
              </div>

              <div className="border-t border-border pt-8 space-y-5">
                <div className="space-y-2">
                  <h3 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                    Book Your Call Now
                  </h3>
                  <p className="text-base text-muted-foreground">
                    The call will be conducted in <strong className="text-foreground">Hindi</strong>.
                  </p>
                </div>
                <Button
                  size="lg"
                  asChild
                  className="w-full md:w-auto px-12 h-14 text-lg"
                >
                  <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
                    <Calendar className="mr-2 h-5 w-5" />
                    Book a Time Slot
                  </a>
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

const RadioField = ({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) => (
  <div className="space-y-3">
    <Label className="text-base font-medium">{label}</Label>
    <RadioGroup value={value} onValueChange={onChange}>
      {options.map((opt) => (
        <label
          key={opt.value}
          className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
        >
          <RadioGroupItem value={opt.value} />
          <span className="text-sm">{opt.label}</span>
        </label>
      ))}
    </RadioGroup>
  </div>
);
