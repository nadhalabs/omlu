class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode, this.details});

  final String message;
  final int? statusCode;
  final Object? details;

  @override
  String toString() => 'ApiException($statusCode): $message';
}

class AuthenticationException extends ApiException {
  const AuthenticationException(
    super.message, {
    super.statusCode,
    super.details,
  });
}

class PermissionDeniedException extends ApiException {
  const PermissionDeniedException(
    super.message, {
    super.statusCode,
    super.details,
  });
}

class NotFoundException extends ApiException {
  const NotFoundException(super.message, {super.statusCode, super.details});
}

class ConflictException extends ApiException {
  const ConflictException(super.message, {super.statusCode, super.details});
}

class ValidationException extends ApiException {
  const ValidationException(super.message, {super.statusCode, super.details});
}

class RateLimitException extends ApiException {
  const RateLimitException(super.message, {super.statusCode, super.details});
}

class ApiTimeoutException extends ApiException {
  const ApiTimeoutException(super.message);
}
