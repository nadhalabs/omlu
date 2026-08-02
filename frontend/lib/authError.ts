import { ApiError } from "./api";

export type AuthErrorPresentation = {
  title?: string;
  message: string;
  retryable: boolean;
};

const CONNECTION_MESSAGE = "We couldn’t reach OMLU. Check your internet connection and try again.";
const OFFLINE_MESSAGE = "You appear to be offline. Reconnect to the internet and try again.";

export function presentAuthError(error: unknown, offline: boolean, unexpectedMessage = "Something went wrong while signing in. Please try again."): AuthErrorPresentation {
  if (offline) return { title: "Unable to connect", message: OFFLINE_MESSAGE, retryable: true };

  if (error instanceof ApiError) {
    const message = error.message.toLowerCase();
    if (error.status === 504 || /timed? out|timeout/.test(message)) {
      return { title: "Unable to connect", message: "The connection took too long. Check your internet connection and try again.", retryable: true };
    }
    if (error.status === 502 || error.status === 503 || /temporarily unavailable|service unavailable/.test(message)) {
      return { title: "Unable to connect", message: "OMLU is temporarily unavailable. Please try again shortly.", retryable: true };
    }
    if (/could not connect|failed to fetch|network(?:error| request failed)|load failed/.test(message)) {
      return { title: "Unable to connect", message: CONNECTION_MESSAGE, retryable: true };
    }
    if (error.status >= 400 && error.status < 500) {
      const invalidCredentials = error.status === 401 && /invalid.*(?:credential|password)|login failed/.test(message);
      return { message: invalidCredentials ? "Invalid restaurant credentials, email, or password." : error.message, retryable: false };
    }
  }

  return { message: unexpectedMessage, retryable: true };
}
