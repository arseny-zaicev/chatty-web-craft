import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, Upload, X, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const formSchema = z.object({
  full_name: z.string().trim().min(2, "Name is required").max(100),
  email: z.string().trim().email("Valid email required").max(255),
  phone: z.string().trim().min(6, "Phone is required").max(30),
  location: z.string().trim().min(2, "Location is required").max(100),
  has_bm: z.enum(["yes", "no", "not_sure"]),
  is_verified: z.enum(["yes", "no", "not_sure"]),
  bm_age: z.enum(["lt_3m", "3_6m", "6_12m", "12m_plus", "not_sure"]),
  used_whatsapp: z.enum(["yes", "no", "not_sure"]),
  can_provide_access: z.enum(["yes", "no", "need_details"]),
  notes: z.string().trim().max(2000).optional(),
});

type FormData = z.infer<typeof formSchema>;

const initialData: Partial<FormData> = {
  full_name: "",
  email: "",
  phone: "",
  location: "",
  notes: "",
};

export const BMAccessForm = () => {
  const [step, setStep] = useState<Step>(0);
  const [data, setData] = useState<Partial<FormData>>(initialData);
  const [files, setFiles] = useState<File[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const update = (key: keyof FormData, value: string) => {
    setData((d) => ({ ...d, [key]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    const valid = newFiles.filter((f) => {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name} exceeds 10MB`);
        return false;
      }
      const ok = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"].includes(f.type);
      if (!ok) {
        toast.error(`${f.name}: only PNG, JPG, WebP, or PDF`);
        return false;
      }
      return true;
    });
    setFiles((prev) => [...prev, ...valid].slice(0, 5));
  };

  const removeFile = (i: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  };

  const validateFormFields = () => {
    const result = formSchema.safeParse(data);
    if (!result.success) {
      const firstError = result.error.issues[0];
      toast.error(firstError.message);
      return false;
    }
    return true;
  };

  const canProceed = (): boolean => {
    if (step === 3) {
      return !!(data.full_name && data.email && data.phone && data.location);
    }
    if (step === 4) {
      return !!(
        data.has_bm &&
        data.is_verified &&
        data.bm_age &&
        data.used_whatsapp &&
        data.can_provide_access
      );
    }
    if (step === 5) {
      return files.length >= 2;
    }
    return true;
  };

  const next = () => {
    if (step === 3 && !canProceed()) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (step === 4 && !canProceed()) {
      toast.error("Please answer all questions");
      return;
    }
    if (step === 5 && !canProceed()) {
      toast.error("Please upload at least 2 screenshots");
      return;
    }
    setStep((s) => Math.min(6, s + 1) as Step);
  };

  const back = () => setStep((s) => Math.max(0, s - 1) as Step);

  const handleSubmit = async () => {
    if (!agreed) {
      toast.error("Please agree to the terms");
      return;
    }
    if (!validateFormFields()) return;

    setSubmitting(true);
    setUploadProgress(0);

    try {
      // Upload files to private bucket
      const submissionId = crypto.randomUUID();
      const uploadedPaths: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split(".").pop();
        const path = `${submissionId}/${i + 1}-${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("bm-screenshots")
          .upload(path, file, { upsert: false });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }
        uploadedPaths.push(path);
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }

      // Submit form via edge function
      const { error } = await supabase.functions.invoke("submit-form", {
        body: {
          form_type: "bm_access",
          contact_name: data.full_name,
          contact_email: data.email,
          contact_phone: data.phone,
          data: {
            submission_id: submissionId,
            location: data.location,
            has_bm: data.has_bm,
            is_verified: data.is_verified,
            bm_age: data.bm_age,
            used_whatsapp: data.used_whatsapp,
            can_provide_access: data.can_provide_access,
            notes: data.notes || "",
            screenshot_paths: uploadedPaths,
          },
        },
      });

      if (error) throw error;

      setSubmitted(true);
      setStep(6);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const totalSteps = 7;
  const progress = ((step + 1) / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {!submitted && (
          <div className="mb-8">
            <Progress value={progress} className="h-1" />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Step {step + 1} of {totalSteps}
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
                Old Business Manager Access
              </h1>
              <div className="space-y-4 text-muted-foreground text-lg leading-relaxed text-left">
                <p>
                  To receive the <strong className="text-foreground">$30 payment</strong>, you must
                  first complete the form below.
                </p>
                <p>
                  Once submitted, our team will review your Business Manager details and contact you
                  if your account is a fit for our setup.
                </p>
                <p>
                  If we successfully connect WhatsApp API on your Business Manager, we will send
                  you $30.
                </p>
              </div>
              <Button size="lg" onClick={next} className="w-full md:w-auto px-12">
                Start <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 1: How payment works */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="font-display text-3xl md:text-4xl font-bold">
                Important: How to Receive Your $30
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  To receive the $30 payment, you must first complete the form provided.
                </p>
                <p>
                  Once submitted, our team will review your account details and verify whether your
                  Business Manager is suitable.
                </p>
                <p>
                  If approved, we will contact you with the next steps.{" "}
                  <strong className="text-foreground">
                    Payment is sent only after WhatsApp API is successfully connected on the
                    Business Manager.
                  </strong>
                </p>
              </div>
              <NavButtons onBack={back} onNext={next} />
            </div>
          )}

          {/* Step 2: What we look for */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="font-display text-3xl md:text-4xl font-bold">
                What We Are Looking For
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>We are looking for old Business Manager accounts, ideally verified.</p>
                <p>
                  If your account is a good fit, we may be able to work together with our team on
                  an ongoing basis.
                </p>
                <p>
                  This is not guaranteed for every submission. Our team reviews each account
                  individually before approval.
                </p>
              </div>
              <NavButtons onBack={back} onNext={next} />
            </div>
          )}

          {/* Step 3: Contact info */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="font-display text-3xl font-bold">Your Details</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="full_name">Full Name *</Label>
                  <Input
                    id="full_name"
                    value={data.full_name || ""}
                    onChange={(e) => update("full_name", e.target.value)}
                    placeholder="John Smith"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={data.email || ""}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Telephone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={data.phone || ""}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder="+1 555 123 4567"
                  />
                </div>
                <div>
                  <Label htmlFor="location">Current Location *</Label>
                  <Input
                    id="location"
                    value={data.location || ""}
                    onChange={(e) => update("location", e.target.value)}
                    placeholder="City, Country"
                  />
                </div>
              </div>
              <NavButtons onBack={back} onNext={next} />
            </div>
          )}

          {/* Step 4: BM questions */}
          {step === 4 && (
            <div className="space-y-8">
              <h2 className="font-display text-3xl font-bold">Business Manager Details</h2>

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
                label="Have you already used WhatsApp API on it?"
                value={data.used_whatsapp}
                onChange={(v) => update("used_whatsapp", v)}
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                  { value: "not_sure", label: "Not sure" },
                ]}
              />

              <RadioField
                label="Can you provide admin access if approved?"
                value={data.can_provide_access}
                onChange={(v) => update("can_provide_access", v)}
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                  { value: "need_details", label: "Need more details" },
                ]}
              />

              <div>
                <Label htmlFor="notes">Anything else we should know?</Label>
                <Textarea
                  id="notes"
                  value={data.notes || ""}
                  onChange={(e) => update("notes", e.target.value)}
                  placeholder="Optional"
                  rows={4}
                />
              </div>

              <NavButtons onBack={back} onNext={next} />
            </div>
          )}

          {/* Step 5: Upload */}
          {step === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-3xl font-bold mb-3">
                  Please Upload 2-3 Screenshots of Your Business Manager
                </h2>
                <p className="text-muted-foreground">
                  Please upload clear screenshots showing the Business Manager details, account age
                  if visible, and verification status if available.
                </p>
              </div>

              <label
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:border-primary transition-colors"
              >
                <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="font-medium mb-1">Click to upload screenshots</p>
                <p className="text-xs text-muted-foreground">
                  Accepted: PNG, JPG, WebP, PDF · max 10MB each · up to 5 files
                </p>
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
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
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
                  <p className="text-xs text-muted-foreground">
                    {files.length} of 5 files · minimum 2 required
                  </p>
                </div>
              )}

              <NavButtons onBack={back} onNext={next} nextDisabled={files.length < 2} />
            </div>
          )}

          {/* Step 6: Agreement + submit, OR thank you */}
          {step === 6 && !submitted && (
            <div className="space-y-6">
              <h2 className="font-display text-3xl font-bold">Agreement</h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  By submitting this form, you confirm that the Business Manager belongs to you or
                  that you are authorized to provide access to it.
                </p>
                <p>
                  You understand that our team will review the account to determine whether it is
                  suitable for WhatsApp API setup.
                </p>
                <p>
                  <strong className="text-foreground">
                    The $30 payment is sent only if the account is approved and WhatsApp API is
                    successfully connected.
                  </strong>
                </p>
                <p>We do not guarantee approval for every submission.</p>
              </div>

              <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-muted/50">
                <Checkbox
                  checked={agreed}
                  onCheckedChange={(c) => setAgreed(c === true)}
                  className="mt-0.5"
                />
                <span className="text-sm font-medium">
                  I Agree to the terms above
                </span>
              </label>

              {submitting && uploadProgress > 0 && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} />
                  <p className="text-xs text-muted-foreground text-center">
                    Uploading screenshots... {uploadProgress}%
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={back} disabled={submitting}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!agreed || submitting}
                  className="flex-1"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Application"
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === 6 && submitted && (
            <div className="space-y-6 text-center py-8">
              <CheckCircle2 className="h-16 w-16 text-iskra-emerald mx-auto" />
              <h2 className="font-display text-3xl md:text-4xl font-bold">Submission Received</h2>
              <p className="text-muted-foreground text-lg leading-relaxed max-w-lg mx-auto">
                Thank you. Our team will review your submission and contact you if your Business
                Manager is a fit.
              </p>
              <p className="text-muted-foreground leading-relaxed max-w-lg mx-auto">
                If approved, we will explain the next steps clearly before moving forward.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

const NavButtons = ({
  onBack,
  onNext,
  nextDisabled,
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
}) => (
  <div className="flex gap-3 pt-4">
    <Button variant="outline" onClick={onBack}>
      <ArrowLeft className="mr-2 h-4 w-4" /> Back
    </Button>
    <Button onClick={onNext} className="flex-1" disabled={nextDisabled}>
      Continue <ArrowRight className="ml-2 h-4 w-4" />
    </Button>
  </div>
);

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
