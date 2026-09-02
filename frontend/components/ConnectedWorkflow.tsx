"use client";

import { useEffect, useRef, useState } from "react";

const WORKFLOW_STEPS = [
  { id: 1, title: "Scan QR", desc: "Guest scans table QR code" },
  { id: 2, title: "Place Order", desc: "Browse menu & submit order" },
  { id: 3, title: "Kitchen", desc: "KDS receives & prepares" },
  { id: 4, title: "Serve", desc: "Staff delivers dishes to table" },
  { id: 5, title: "Request Bill", desc: "Guest requests bill via QR" },
  { id: 6, title: "Payment", desc: "Counter Cash or UPI pay" },
  { id: 7, title: "Table Ready", desc: "Session completed & cleared" },
];

export function ConnectedWorkflow() {
  const [activeStep, setActiveStep] = useState(0);
  const [hasEntered, setHasEntered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setHasEntered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hasEntered) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => {
        if (prev >= WORKFLOW_STEPS.length - 1) {
          clearInterval(interval);
          return WORKFLOW_STEPS.length - 1;
        }
        return prev + 1;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [hasEntered]);

  return (
    <section
      ref={containerRef}
      aria-labelledby="service-flow-title"
      className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 sm:p-8"
    >
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">
          BUILT FOR REAL RESTAURANT SERVICE
        </p>
        <h2 id="service-flow-title" className="mt-2 text-2xl font-black tracking-tight text-[var(--omlu-text-primary)] sm:text-3xl">
          One order. One connected journey.
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--omlu-text-secondary)]">
          OMLU keeps the entire service flow connected from the moment a customer sits down until the table is ready for the next guest.
        </p>
      </div>

      {/* Horizontal Connected Workflow Stepper */}
      <div className="relative mt-8">
        {/* Horizontal Connecting Progress Line on Desktop */}
        <div className="absolute top-4 left-6 right-6 hidden h-0.5 bg-[var(--omlu-border)] md:block" aria-hidden="true">
          <div
            className="h-full bg-orange-600 transition-all duration-300 ease-out"
            style={{ width: `${(activeStep / (WORKFLOW_STEPS.length - 1)) * 100}%` }}
          />
        </div>

        {/* Steps Grid */}
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-7 md:gap-2">
          {WORKFLOW_STEPS.map((step, idx) => {
            const isActive = idx <= activeStep;
            const isCurrent = idx === activeStep;

            return (
              <div
                key={step.id}
                onClick={() => setActiveStep(idx)}
                className={`relative flex flex-col items-center text-center p-3 rounded-xl border transition-colors duration-200 cursor-pointer ${
                  isCurrent
                    ? "border-orange-500/80 bg-orange-500/5"
                    : isActive
                    ? "border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)]"
                    : "border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] opacity-70"
                }`}
              >
                {/* Step Number Circle */}
                <div
                  className={`z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-black transition-colors duration-200 ${
                    isActive
                      ? "bg-orange-600 text-white"
                      : "bg-[var(--omlu-muted-surface)] border border-[var(--omlu-border-strong)] text-[var(--omlu-text-secondary)]"
                  }`}
                >
                  {step.id}
                </div>

                <h3 className="mt-2.5 text-xs font-bold text-[var(--omlu-text-primary)]">{step.title}</h3>
                <p className="mt-1 text-[11px] leading-4 text-[var(--omlu-text-secondary)]">{step.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
