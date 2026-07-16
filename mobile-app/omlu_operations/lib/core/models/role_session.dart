enum StaffRole {
  owner,
  admin,
  staff,
  kitchen;

  static StaffRole fromJson(String value) {
    return StaffRole.values.firstWhere(
      (role) => role.name == value,
      orElse: () => throw FormatException('Unsupported staff role: $value'),
    );
  }
}

enum OperationsHome { staff, kitchen, owner, admin }

class StaffProfile {
  const StaffProfile({
    required this.name,
    required this.email,
    required this.role,
    required this.status,
    required this.mustChangePassword,
    required this.restaurantName,
    required this.restaurantSlug,
    this.username,
  });

  factory StaffProfile.fromJson(Map<String, Object?> json) {
    return StaffProfile(
      name: json['name'] as String? ?? '',
      username: json['username'] as String?,
      email: json['email'] as String? ?? '',
      role: StaffRole.fromJson(json['role'] as String? ?? ''),
      status: json['status'] as String? ?? '',
      mustChangePassword: json['must_change_password'] as bool? ?? false,
      restaurantName: json['restaurant_name'] as String? ?? '',
      restaurantSlug: json['restaurant_slug'] as String? ?? '',
    );
  }

  final String name;
  final String? username;
  final String email;
  final StaffRole role;
  final String status;
  final bool mustChangePassword;
  final String restaurantName;
  final String restaurantSlug;

  Map<String, Object?> toJson() => {
    'name': name,
    'username': username,
    'email': email,
    'role': role.name,
    'status': status,
    'must_change_password': mustChangePassword,
    'restaurant_name': restaurantName,
    'restaurant_slug': restaurantSlug,
  };
}

class RoleSession {
  const RoleSession({
    required this.accessToken,
    required this.expiresAt,
    required this.profile,
  });

  final String accessToken;
  final DateTime expiresAt;
  final StaffProfile profile;

  String get restaurantSlug => profile.restaurantSlug;
  StaffRole get role => profile.role;

  bool get isExpired => !DateTime.now().toUtc().isBefore(expiresAt.toUtc());

  OperationsHome get home {
    return switch (role) {
      StaffRole.owner => OperationsHome.owner,
      StaffRole.admin => OperationsHome.admin,
      StaffRole.staff => OperationsHome.staff,
      StaffRole.kitchen => OperationsHome.kitchen,
    };
  }

  Map<String, Object?> toJson() => {
    'access_token': accessToken,
    'expires_at': expiresAt.toUtc().toIso8601String(),
    'profile': profile.toJson(),
  };

  factory RoleSession.fromJson(Map<String, Object?> json) {
    return RoleSession(
      accessToken: json['access_token'] as String? ?? '',
      expiresAt: DateTime.parse(json['expires_at'] as String),
      profile: StaffProfile.fromJson(
        Map<String, Object?>.from(json['profile'] as Map? ?? {}),
      ),
    );
  }
}
