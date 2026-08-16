import 'dart:async';
import 'dart:io';

import '../api/api_exceptions.dart';
import '../printing/printer_adapter.dart';

enum ErrorContext { general, itemCancellation, printing, issueAndPrint }

String userFacingError(
  Object error, {
  ErrorContext context = ErrorContext.general,
}) {
  if (context == ErrorContext.issueAndPrint && error is PrinterException) {
    return 'The bill was issued successfully but printing failed. Check the printer and retry printing.';
  }
  if (error is ApiTimeoutException || error is TimeoutException) {
    return 'OMLU is taking longer than expected. Try again.';
  }
  if (error is SocketException ||
      (error is ApiException && error.message == 'Network request failed.')) {
    return "You're offline. Check your connection and try again.";
  }
  if (error is AuthenticationException) {
    return 'Your session has expired. Please sign in again.';
  }
  if (error is PermissionDeniedException) {
    return "You don't have permission to do that.";
  }
  if (error is ConflictException) {
    return _conflictMessage(error.message, context: context);
  }
  if (error is ValidationException) {
    return _safeServerMessage(error.message) ??
        'Check the information and try again.';
  }
  if (error is RateLimitException) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  if (error is PrinterException || context == ErrorContext.printing) {
    return _printerMessage(error);
  }
  if (error is ApiException) {
    return _safeServerMessage(error.message) ??
        'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

String _conflictMessage(String message, {required ErrorContext context}) {
  final normalized = message.toLowerCase();
  if (normalized.contains('already cancelled')) {
    return 'This item has already been cancelled.';
  }
  if (context == ErrorContext.itemCancellation &&
      (normalized.contains('preparing') ||
          normalized.contains('ready') ||
          normalized.contains('served') ||
          normalized.contains('cannot be cancelled'))) {
    return 'Preparation has already started. Please ask the kitchen or manager for help.';
  }
  if (normalized.contains('bill') && normalized.contains('issued')) {
    return 'This bill has already been issued and can no longer be changed.';
  }
  if (normalized.contains('session') || normalized.contains('table')) {
    return 'This table session has changed. Refresh and try again.';
  }
  return 'This action is no longer available. Refresh and try again.';
}

String _printerMessage(Object error) {
  final message = error is PrinterException
      ? error.message.toLowerCase()
      : error.toString().toLowerCase();
  if (message.contains('permission')) {
    return 'Printer permission is unavailable. Allow Bluetooth access in device settings.';
  }
  if (message.contains('not connected') || message.contains('unavailable')) {
    return 'The printer is unavailable. Check that it is powered on and connected.';
  }
  if (message.contains('connect')) {
    return 'Could not connect to the printer. Check the printer and try again.';
  }
  return 'Printing failed. Check the printer and try again.';
}

String? _safeServerMessage(String message) {
  final trimmed = message.trim();
  if (trimmed.isEmpty ||
      RegExp(
        r'(exception|stack|sql|http://|https://|status\s*code|socket|dio)',
        caseSensitive: false,
      ).hasMatch(trimmed)) {
    return null;
  }
  return trimmed;
}
