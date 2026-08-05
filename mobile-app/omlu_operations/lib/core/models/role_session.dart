import '../auth/flutter_tenant_scope.dart';

export '../auth/flutter_tenant_scope.dart' show StaffRole;

enum OperationsHome { staff, kitchen, owner, admin }

enum EntryMode {
  ownerAdmin,
  staffPin,
  kitchenDevice;

  static EntryMode defaultForRole(StaffRole role) {
    return switch (role) {
      StaffRole.owner || StaffRole.admin => EntryMode.ownerAdmin,
      StaffRole.staff => EntryMode.staffPin,
      StaffRole.kitchen => EntryMode.kitchenDevice,
    };
  }
}

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
  RoleSession({
    required this.accessToken,
    required this.expiresAt,
    required this.profile,
    required this.tenantScope,
    EntryMode? entryMode,
  }) : entryMode = entryMode ?? EntryMode.defaultForRole(profile.role);

  final String accessToken;
  final DateTime expiresAt;
  final StaffProfile profile;
  final FlutterTenantScope tenantScope;
  final EntryMode entryMode;

  String get restaurantSlug => profile.restaurantSlug;
  StaffRole get role => profile.role;

  bool get isExpired => !DateTime.now().toUtc().isBefore(expiresAt.toUtc());

  bool get isEntryModeValid {
    return switch (entryMode) {
      EntryMode.ownerAdmin => role == StaffRole.owner || role == StaffRole.admin,
      EntryMode.staffPin => role == StaffRole.staff,
      EntryMode.kitchenDevice => role == StaffRole.kitchen,
    };
  }

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
    'tenant_scope': tenantScope.toJson(),
    'entry_mode': entryMode.name,
  };

  factory RoleSession.fromJson(Map<String, Object?> json) {
    final profile = StaffProfile.fromJson(
      Map<String, Object?>.from(json['profile'] as Map? ?? {}),
    );
    final rawMode = json['entry_mode'] as String?;
    final entryMode = rawMode != null
        ? EntryMode.values.firstWhere(
            (m) => m.name == rawMode,
            orElse: () => EntryMode.defaultForRole(profile.role),
          )
        : EntryMode.defaultForRole(profile.role);

    return RoleSession(
      accessToken: json['access_token'] as String? ?? '',
      expiresAt: DateTime.parse(json['expires_at'] as String),
      profile: profile,
      tenantScope: FlutterTenantScope.fromJson(
        Map<String, Object?>.from(json['tenant_scope'] as Map? ?? {}),
      ),
      entryMode: entryMode,
    );
  }
}
