import 'dart:convert';

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

class FlutterTenantScope {
  const FlutterTenantScope({
    required this.restaurantId,
    required this.actorId,
    required this.role,
    required this.authorityEpoch,
  });

  factory FlutterTenantScope.fromJson(Map<String, Object?> json) {
    final restaurantId = json['restaurant_id'];
    final actorId = json['actor_id'];
    final authorityEpoch = json['authority_epoch'];
    if (restaurantId is! int ||
        restaurantId <= 0 ||
        actorId is! int ||
        actorId <= 0 ||
        authorityEpoch is! String ||
        !authorityEpoch.startsWith('v1.')) {
      throw const FormatException('Invalid authenticated tenant scope.');
    }
    return FlutterTenantScope(
      restaurantId: restaurantId,
      actorId: actorId,
      role: StaffRole.fromJson(json['role'] as String? ?? ''),
      authorityEpoch: authorityEpoch,
    );
  }

  final int restaurantId;
  final int actorId;
  final StaffRole role;
  final String authorityEpoch;

  Map<String, Object?> toJson() => {
    'restaurant_id': restaurantId,
    'actor_id': actorId,
    'role': role.name,
    'authority_epoch': authorityEpoch,
  };

  String get fingerprint => jsonEncode(toJson());

  @override
  bool operator ==(Object other) =>
      other is FlutterTenantScope &&
      restaurantId == other.restaurantId &&
      actorId == other.actorId &&
      role == other.role &&
      authorityEpoch == other.authorityEpoch;

  @override
  int get hashCode => Object.hash(restaurantId, actorId, role, authorityEpoch);
}

class ScopedStorageKeyBuilder {
  const ScopedStorageKeyBuilder();

  String build(
    FlutterTenantScope scope, {
    required String feature,
    String identifier = 'all',
  }) {
    return [
      'omlu',
      'v2',
      'restaurant',
      scope.restaurantId,
      'actor',
      scope.actorId,
      'role',
      Uri.encodeComponent(scope.role.name),
      'authority',
      Uri.encodeComponent(scope.authorityEpoch),
      'feature',
      Uri.encodeComponent(feature),
      'id',
      Uri.encodeComponent(identifier),
    ].join(':');
  }
}
