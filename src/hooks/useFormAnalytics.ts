import { useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// Generate a unique session ID for this form session
const generateSessionId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

interface UseFormAnalyticsOptions {
  formType: string;
  totalSteps: number;
  stepNames: string[];
}

// Helper function to track analytics via Edge Function
async function trackAnalyticsEvent(data: {
  session_id: string;
  form_type: string;
  step_number: number;
  step_name: string;
  event_type: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const { error } = await supabase.functions.invoke("submit-form", {
      body: {
        action: "track-analytics",
        ...data,
      },
    });
    
    if (error) {
      console.error("Error tracking analytics:", error);
    }
  } catch (error) {
    console.error("Error tracking analytics:", error);
  }
}

export const useFormAnalytics = ({ formType, totalSteps, stepNames }: UseFormAnalyticsOptions) => {
  const sessionIdRef = useRef<string>(generateSessionId());
  const trackedStepsRef = useRef<Set<number>>(new Set());
  const completedStepsRef = useRef<Set<number>>(new Set());

  // Track step view (when user arrives at a step)
  const trackStepView = useCallback(async (stepNumber: number) => {
    // Only track each step view once per session
    if (trackedStepsRef.current.has(stepNumber)) return;
    trackedStepsRef.current.add(stepNumber);

    await trackAnalyticsEvent({
      session_id: sessionIdRef.current,
      form_type: formType,
      step_number: stepNumber,
      step_name: stepNames[stepNumber - 1] || `Step ${stepNumber}`,
      event_type: "step_viewed",
    });
  }, [formType, stepNames]);

  // Track step completion (when user clicks "Continue")
  const trackStepComplete = useCallback(async (stepNumber: number) => {
    // Only track each step completion once per session
    if (completedStepsRef.current.has(stepNumber)) return;
    completedStepsRef.current.add(stepNumber);

    await trackAnalyticsEvent({
      session_id: sessionIdRef.current,
      form_type: formType,
      step_number: stepNumber,
      step_name: stepNames[stepNumber - 1] || `Step ${stepNumber}`,
      event_type: "step_completed",
    });
  }, [formType, stepNames]);

  // Track form submission
  const trackFormSubmit = useCallback(async () => {
    await trackAnalyticsEvent({
      session_id: sessionIdRef.current,
      form_type: formType,
      step_number: totalSteps + 1,
      step_name: "Submitted",
      event_type: "form_submitted",
    });
  }, [formType, totalSteps]);

  // Reset session (after successful submit)
  const resetSession = useCallback(() => {
    sessionIdRef.current = generateSessionId();
    trackedStepsRef.current = new Set();
    completedStepsRef.current = new Set();
  }, []);

  return {
    trackStepView,
    trackStepComplete,
    trackFormSubmit,
    resetSession,
    sessionId: sessionIdRef.current,
  };
};
