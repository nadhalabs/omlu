import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/models/operations_models.dart';
import '../auth_provider.dart';

class MenuItem {
  const MenuItem({
    required this.id,
    required this.name,
    required this.price,
    required this.isAvailable,
    this.description,
    this.imageUrl,
    this.optionGroups = const [],
  });

  factory MenuItem.fromJson(Map<String, Object?> json) {
    return MenuItem(
      id: readRequiredId(json['id'] ?? json['menu_item_id'], 'menu_item_id'),
      name: readString(json['name']),
      price: readDouble(json['price']),
      isAvailable:
          json['is_available'] as bool? ?? json['available'] as bool? ?? true,
      description: json['description'] == null
          ? null
          : readString(json['description']),
      imageUrl: json['image_url'] == null
          ? null
          : readString(json['image_url'] ?? json['image']),
      optionGroups: json['option_groups'] as List? ?? const [],
    );
  }

  final int id;
  final String name;
  final double price;
  final bool isAvailable;
  final String? description;
  final String? imageUrl;
  final List<dynamic> optionGroups;
}

class MenuCategory {
  const MenuCategory({
    required this.id,
    required this.name,
    required this.items,
  });

  factory MenuCategory.fromJson(Map<String, Object?> json) {
    final rawItems =
        json['items'] as List? ?? json['menu_items'] as List? ?? const [];
    return MenuCategory(
      id: readRequiredId(json['id'], 'category_id'),
      name: readString(json['name']),
      items: [
        for (final item in rawItems)
          MenuItem.fromJson(Map<String, Object?>.from(item as Map)),
      ],
    );
  }

  final int id;
  final String name;
  final List<MenuItem> items;
}

// Scoped detail loader for a specific table session
final tableDetailProvider = FutureProvider.family<Map<String, Object?>, int>((
  ref,
  tableId,
) async {
  final api = ref.watch(operationsApiProvider);
  return api.fetchStaffTableDetail(tableId);
});

// Parsed category list for a selected table
final menuCategoriesProvider = FutureProvider.family<List<MenuCategory>, int>((
  ref,
  tableId,
) async {
  final detail = await ref.watch(tableDetailProvider(tableId).future);
  final rawCategories = detail['menu_categories'] as List? ?? const [];
  return [
    for (final cat in rawCategories)
      MenuCategory.fromJson(Map<String, Object?>.from(cat as Map)),
  ];
});
