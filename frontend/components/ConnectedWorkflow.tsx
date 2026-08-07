"use client";

import { useEffect, useRef, useState } from "react";

const WORKFLOW_STEPS = [
  { id: 1, title: "Scan QR", desc: "Guest scans table QR code" },
  { id: 2, title: "Place Order", desc: "Browse menu & submit" },
  { id: 3, title: "Kitchen", desc: "KDS receives & prepares" },
  { id: 4, title: "Serve", desc: "Staff delivers fresh dishes" },
  { id: 5, title: "Request Bill", desc: "Guest requests bill via QR" },
  { id: 6, title: "Payment", desc: "Counter Cash or UPI pay" },
  { id: 7, title: "Table Ready", desc: "Session closed & ready" },
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
      { threshold: 0.25 }
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
    }, 450);
    return () => clearInterval(interval);
  }, [hasEntered]);

  return (
    <section
      ref={containerRef}
      aria-labelledby="service-flow-title"
      className="overflow-hidden rounded-3xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 sm:p-10 shadow-sm"
    >
      <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">
        BUILT FOR REAL RESTAURANT SERVICE
      </p>
      <h2 id="service-flow-title" className="mt-2 text-3xl font-black tracking-tight text-[var(--omlu-text-primary)] sm:text-4xl">
        One order. One connected journey.
      </h2>

      {/* Horizontal Workflow Stepper on Desktop / Scrollable on Mobile */}
      <div className="relative mt-10">
        {/* Connection Line */}
        <div className="absolute top-5 left-4 right-4 hidden h-1 bg-[var(--omlu-border)] md:block" aria-hidden="true">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${(activeStep / (WORKFLOW_STEPS.length - 1)) * 100}%` }}
          />
        </div>

        {/* Steps Grid */}
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-7 md:gap-2">
          {WORKFLOW_STEPS.map((step, idx) => {
            const isActive = idx <= activeStep;
            const isCurrent = idx === activeStep;

            return (
              <div
                key={step.id}
                onClick={() => setActiveStep(idx)}
                className={`relative cursor-pointer flex flex-col items-center text-center p-3 rounded-2xl border transition-all duration-300 ${
                  isCurrent
                    ? "border-orange-500 bg-orange-500/10 shadow-md scale-[1.03]"
                    : isActive
                    ? "border-emerald-500/40 bg-emerald-500/5 text-[var(--omlu-text-primary)]"
                    : "border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] text-[var(--omlu-text-secondary)] opacity-70"
                }`}
              >
                {/* Step Circle Badge */}
                <div
                  className={`z-10 flex h-9 w-9 items-center justify-center rounded-full text-xs font-black transition-all duration-300 ${
                    isCurrent
                      ? "bg-orange-600 text-white ring-4 ring-orange-500/30"
                      : isActive
                      ? "bg-emerald-600 text-white"
                      : "bg-[var(--omlu-border)] text-[var(--omlu-text-secondary)]"
                  }`}
                >
                  {step.id}
                </div>

                <h3 className="mt-3 text-xs font-black text-[var(--omlu-text-primary)]">{step.title}</h3>
                <p className="mt-1 text-[11px] leading-4 text-[var(--omlu-text-secondary)]">{step.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-8 text-sm leading-7 text-[var(--omlu-text-secondary)] sm:text-base">
        OMLU keeps the entire service flow connected from the moment a customer sits down until the table is ready for the next guest.
      </p>
    </section>
  );
}
