import { useEffect, useRef, useCallback } from "react";
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

export const useFormAnalytics = ({ formType, totalSteps, stepNames }: UseFormAnalyticsOptions) => {
  const sessionIdRef = useRef<string>(generateSessionId());
  const trackedStepsRef = useRef<Set<number>>(new Set());
  const completedStepsRef = useRef<Set<number>>(new Set());

  // Track step view (when user arrives at a step)
  const trackStepView = useCallback(async (stepNumber: number) => {
    // Only track each step view once per session
    if (trackedStepsRef.current.has(stepNumber)) return;
    trackedStepsRef.current.add(stepNumber);

    try {
      await supabase.from("form_analytics").insert({
        session_id: sessionIdRef.current,
        form_type: formType,
        step_number: stepNumber,
        step_name: stepNames[stepNumber - 1] || `Step ${stepNumber}`,
        event_type: "step_viewed",
      });
    } catch (error) {
      console.error("Error tracking step view:", error);
    }
  }, [formType, stepNames]);

  // Track step completion (when user clicks "Continue")
  const trackStepComplete = useCallback(async (stepNumber: number) => {
    // Only track each step completion once per session
    if (completedStepsRef.current.has(stepNumber)) return;
    completedStepsRef.current.add(stepNumber);

    try {
      await supabase.from("form_analytics").insert({
        session_id: sessionIdRef.current,
        form_type: formType,
        step_number: stepNumber,
        step_name: stepNames[stepNumber - 1] || `Step ${stepNumber}`,
        event_type: "step_completed",
      });
    } catch (error) {
      console.error("Error tracking step completion:", error);
    }
  }, [formType, stepNames]);

  // Track form submission
  const trackFormSubmit = useCallback(async () => {
    try {
      await supabase.from("form_analytics").insert({
        session_id: sessionIdRef.current,
        form_type: formType,
        step_number: totalSteps,
        step_name: "Form Submitted",
        event_type: "form_submitted",
      });
    } catch (error) {
      console.error("Error tracking form submission:", error);
    }
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
