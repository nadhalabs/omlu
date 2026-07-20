import { RestaurantRegistrationRequest, StaffAccountCreateRequest, StaffLoginRequest } from "./types";

export type FieldErrors<T extends string = string> = Partial<Record<T, string>>;

export const PASSWORD_ERROR = "Password must include uppercase, lowercase, number, and symbol.";
export const PASSWORD_RULES = [
  { key: "length", label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  { key: "upper", label: "One uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { key: "lower", label: "One lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { key: "number", label: "One number", test: (value: string) => /\d/.test(value) },
  { key: "symbol", label: "One symbol", test: (value: string) => /[^A-Za-z0-9\s]/.test(value) },
] as const;

const restaurantUsernameRe = /^[a-z0-9](?:[a-z0-9]|[-_](?![-_])){1,38}[a-z0-9]$/;
const personalUsernameRe = /^[a-z0-9](?:[a-z0-9]|[._-](?![._-])){1,28}[a-z0-9]$/;
const restaurantNameRe = /^[A-Za-z0-9 '&.-]+$/;
const cityRe = /^[A-Za-z '\-]+$/;
const ownerNameRe = /^[A-Za-z '.\-]+$/;
const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function passwordMeetsRules(value: string) {
  return value.length <= 128 && value.trim().length > 0 && PASSWORD_RULES.every((rule) => rule.test(value));
}

export function validatePassword(
  value: string,
  options: { restaurantUsername?: string; personalUsername?: string } = {}
) {
  if (!passwordMeetsRules(value)) return PASSWORD_ERROR;
  const lowered = value.toLowerCase();
  if (options.restaurantUsername && lowered === options.restaurantUsername.toLowerCase()) {
    return "Password must not match the restaurant username.";
  }
  if (options.personalUsername && lowered === options.personalUsername.toLowerCase()) {
    return "Password must not match the personal username.";
  }
  return null;
}

export function validateRegistration(form: RestaurantRegistrationRequest) {
  const errors: FieldErrors<keyof RestaurantRegistrationRequest | "restaurant_username"> = {};
  const restaurantName = normalizeSpaces(form.restaurant_name);
  const city = normalizeSpaces(form.city);
  const ownerName = normalizeSpaces(form.owner_full_name);
  const restaurantSlug = form.restaurant_slug.trim().toLowerCase();
  const ownerUsername = form.owner_username.trim().toLowerCase();
  const contactEmail = form.contact_email.trim().toLowerCase();
  const ownerEmail = form.owner_email.trim().toLowerCase();
  const phoneRaw = form.phone_number.trim();
  const phoneCompact = phoneRaw.replace(/\s+/g, "");
  const phoneDigits = phoneCompact.startsWith("+91")
    ? phoneCompact.slice(3)
    : phoneCompact.startsWith("91") && phoneCompact.length === 12
      ? phoneCompact.slice(2)
      : phoneCompact;

  if (restaurantName.length < 2 || restaurantName.length > 100 || !restaurantNameRe.test(restaurantName) || !/[A-Za-z]/.test(restaurantName)) {
    errors.restaurant_name = "Enter a valid restaurant name.";
  }
  if (!restaurantUsernameRe.test(restaurantSlug)) {
    errors.restaurant_slug = "Use only lowercase letters, numbers, hyphens, or underscores.";
  }
  if (contactEmail.length > 254 || !emailRe.test(contactEmail)) {
    errors.contact_email = "Enter a valid contact email address.";
  }
  if (!phoneRaw || /[A-Za-z]/.test(phoneRaw) || /[^0-9+\s]/.test(phoneRaw) || !/^[6-9][0-9]{9}$/.test(phoneDigits)) {
    errors.phone_number = "Enter a valid 10-digit phone number.";
  }
  if (city.length < 2 || city.length > 80 || !cityRe.test(city) || !/[A-Za-z]/.test(city)) {
    errors.city = "Enter a valid city name.";
  }
  if (ownerName.length < 2 || ownerName.length > 100 || !ownerNameRe.test(ownerName) || !/[A-Za-z]/.test(ownerName)) {
    errors.owner_full_name = "Enter the owner's full name.";
  }
  if (!personalUsernameRe.test(ownerUsername)) {
    errors.owner_username = "Use 3-30 lowercase letters, numbers, periods, underscores, or hyphens.";
  }
  if (ownerEmail.length > 254 || !emailRe.test(ownerEmail)) {
    errors.owner_email = "Enter a valid owner email address.";
  }
  const passwordError = validatePassword(form.password, {
    restaurantUsername: restaurantSlug,
    personalUsername: ownerUsername,
  });
  if (passwordError) errors.password = passwordError;
  if (!form.confirm_password || form.password !== form.confirm_password) {
    errors.confirm_password = "Passwords do not match.";
  }
  if (!form.accept_terms) {
    errors.accept_terms = "You must accept the terms to create the restaurant.";
  }

  return {
    errors,
    normalized: {
      ...form,
      restaurant_name: restaurantName,
      restaurant_slug: restaurantSlug,
      contact_email: contactEmail,
      phone_number: phoneRaw,
      city,
      owner_full_name: ownerName,
      owner_username: ownerUsername,
      owner_email: ownerEmail,
    },
  };
}

export function validateLogin(form: StaffLoginRequest) {
  const errors: FieldErrors<keyof StaffLoginRequest> = {};
  if (!form.restaurant_slug.trim()) errors.restaurant_slug = "Restaurant username is required.";
  if (!form.login.trim()) errors.login = "Personal username or email is required.";
  if (!form.password) errors.password = "Password is required.";
  return errors;
}

export function validateStaffAccount(form: StaffAccountCreateRequest) {
  const errors: FieldErrors<keyof StaffAccountCreateRequest> = {};
  const name = normalizeSpaces(form.name);
  const username = form.username.trim().toLowerCase();
  const email = (form.email || "").trim().toLowerCase();
  if (name.length < 2 || name.length > 100 || !ownerNameRe.test(name) || !/[A-Za-z]/.test(name)) {
    errors.name = "Enter the staff member's full name.";
  }
  if (!personalUsernameRe.test(username)) {
    errors.username = "Use 3-30 lowercase letters, numbers, periods, underscores, or hyphens.";
  }
  if (form.role === "admin" && (email.length > 254 || !emailRe.test(email))) {
    errors.email = "Enter a valid email address.";
  }
  if (form.role === "staff" || form.role === "kitchen") {
    if (!/^\d{6}$/.test(form.pin || "")) errors.pin = "PIN must be exactly 6 digits.";
    if (form.confirm_pin !== form.pin) errors.confirm_pin = "PINs do not match.";
  } else {
    const passwordError = validatePassword(form.temporary_password || "", { personalUsername: username });
    if (passwordError) errors.temporary_password = passwordError;
  }
  return {
    errors,
    normalized: form.role === "admin"
      ? { ...form, name, username, email, pin: undefined, confirm_pin: undefined }
      : { ...form, name, username, email: undefined, temporary_password: undefined },
  };
}

export function firstError<T extends string>(errors: FieldErrors<T>, order: T[]) {
  const field = order.find((key) => errors[key]);
  return field ? { field, message: errors[field] as string } : null;
}

export function focusField(field: string) {
  window.requestAnimationFrame(() => {
    const input = document.querySelector<HTMLElement>(`[name="${field}"]`);
    input?.focus();
    input?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

export function backendFieldName(field?: string) {
  if (field === "restaurant_username") return "restaurant_slug";
  return field;
}
