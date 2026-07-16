"use client";

import type React from "react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { FormToast } from "@/components/FormToast";
import { PasswordInput } from "@/components/PasswordInput";
import { ApiError, changeStaffPassword } from "@/lib/api";
import { FieldErrors, firstError, focusField, validatePassword } from "@/lib/formValidation";
import { roleHomePath } from "@/lib/roleRoutes";

export default function ChangePasswordClient() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<"current_password" | "new_password" | "confirm_password">>({});
  const [loading, setLoading] = useState(false);
  const fieldOrder: ("current_password" | "new_password" | "confirm_password")[] = [
    "current_password",
    "new_password",
    "confirm_password",
  ];

  const setFieldError = useCallback((field: "current_password" | "new_password" | "confirm_password", message?: string) => {
    setFieldErrors((current) => ({ ...current, [field]: message }));
  }, []);

  const validateForm = () => {
    const errors: FieldErrors<"current_password" | "new_password" | "confirm_password"> = {};
    if (!currentPassword) errors.current_password = "Current password is required.";
    const passwordError = validatePassword(newPassword);
    if (passwordError) errors.new_password = passwordError;
    if (!confirmPassword || newPassword !== confirmPassword) errors.confirm_password = "Passwords do not match.";
    return errors;
  };

  const showValidationError = (errors: FieldErrors<"current_password" | "new_password" | "confirm_password">) => {
    setFieldErrors(errors);
    const first = firstError(errors, fieldOrder);
    if (first) {
      setError("Please correct the highlighted fields.");
      setToast(first.message);
      focusField(first.field);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    const validation = validateForm();
    if (firstError(validation, fieldOrder)) {
      showValidationError(validation);
      return;
    }
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      const response = await changeStaffPassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      router.replace(roleHomePath({ ...response.staff, must_change_password: false }));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const field = err.field as "current_password" | "new_password" | "confirm_password" | undefined;
        if (field && fieldOrder.includes(field)) {
          showValidationError({ [field]: err.message });
        } else {
          setError(err.message);
          setToast(err.message);
        }
      } else {
        setError("Could not change password.");
        setToast("Could not change password.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-4">
      <FormToast message={toast} onDismiss={() => setToast(null)} dark />
      <form onSubmit={submit} className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Change Password</h1>
          <p className="text-sm text-zinc-500 mt-1">Set a new password before accessing the restaurant workspace.</p>
        </div>
        {error && <div className="rounded-lg border border-red-800/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">{error}</div>}
        <PasswordInput
          name="current_password"
          label="Current temporary password"
          value={currentPassword}
          error={fieldErrors.current_password}
          disabled={loading}
          autoComplete="current-password"
          dark
          onChange={(value) => {
            setCurrentPassword(value);
            setFieldError("current_password");
          }}
        />
        <PasswordInput
          name="new_password"
          label="New password"
          value={newPassword}
          error={fieldErrors.new_password}
          disabled={loading}
          autoComplete="new-password"
          showChecklist
          dark
          onChange={(value) => {
            setNewPassword(value);
            setFieldError("new_password");
            if (confirmPassword && value !== confirmPassword) {
              setFieldError("confirm_password", "Passwords do not match.");
            } else {
              setFieldError("confirm_password");
            }
          }}
        />
        <PasswordInput
          name="confirm_password"
          label="Confirm new password"
          value={confirmPassword}
          error={fieldErrors.confirm_password}
          disabled={loading}
          autoComplete="new-password"
          dark
          onChange={(value) => {
            setConfirmPassword(value);
            setFieldError("confirm_password");
          }}
        />
        <button disabled={loading} className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-800 px-4 py-3 text-sm font-black text-white">
          {loading ? "Changing..." : "Change Password"}
        </button>
      </form>
    </div>
  );
}
