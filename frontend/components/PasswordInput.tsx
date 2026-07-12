"use client";

import { useId, useState } from "react";
import { PASSWORD_RULES } from "@/lib/formValidation";

type PasswordInputProps = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
  showChecklist?: boolean;
  dark?: boolean;
};

export function PasswordInput({
  label,
  name,
  value,
  onChange,
  error,
  placeholder,
  disabled,
  autoComplete,
  showChecklist,
  dark = false,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5 text-sm font-bold">
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`h-12 w-full rounded-lg border px-4 pr-12 text-sm font-medium outline-none transition focus:border-amber-600 ${
            dark ? "bg-zinc-950 text-zinc-100" : "bg-white text-zinc-950"
          } ${error ? "border-red-500" : dark ? "border-zinc-800" : "border-zinc-300"} ${
            disabled ? "cursor-not-allowed opacity-70" : ""
          }`}
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((current) => !current)}
          disabled={disabled}
          className={`absolute inset-y-0 right-0 flex w-12 items-center justify-center transition focus:outline-none focus:ring-2 focus:ring-amber-600 disabled:cursor-not-allowed ${
            dark ? "text-zinc-500 hover:text-zinc-100" : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            {visible ? (
              <>
                <path d="M3 3l18 18" />
                <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                <path d="M9.5 5.2A10.6 10.6 0 0 1 12 5c5 0 9 5 9 7a8.6 8.6 0 0 1-2.1 3.2" />
                <path d="M6.6 6.7C4.4 8.2 3 10.5 3 12c0 2 4 7 9 7a10.8 10.8 0 0 0 4.1-.8" />
              </>
            ) : (
              <>
                <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
      </div>
      {showChecklist && (
        <ul className="grid gap-1 text-xs font-semibold text-zinc-500 sm:grid-cols-2">
          {PASSWORD_RULES.map((rule) => {
            const passed = rule.test(value);
            return (
              <li key={rule.key} className={passed ? (dark ? "text-emerald-300" : "text-emerald-600") : "text-zinc-500"}>
                {passed ? "[x]" : "[ ]"} {rule.label}
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p id={errorId} className={`text-xs font-semibold ${dark ? "text-red-300" : "text-red-600"}`}>
          {error}
        </p>
      )}
    </div>
  );
}
