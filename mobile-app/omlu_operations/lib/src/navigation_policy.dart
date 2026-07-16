class NavigationPolicy {
  const NavigationPolicy();

  bool isAuthRoute(Uri uri) {
    final path = _normalizedPath(uri);
    return path == '/login' ||
        path == '/staff/login' ||
        path == '/register' ||
        path == '/staff/change-password' ||
        path.contains('/change-password');
  }

  bool isAuthenticatedWorkspace(Uri uri) {
    final path = _normalizedPath(uri);
    return path == '/staff' ||
        path.startsWith('/staff/') ||
        path == '/admin' ||
        path.startsWith('/admin/') ||
        path == '/kitchen' ||
        path.startsWith('/kitchen/');
  }

  bool isRoleRoot(Uri uri) {
    final path = _normalizedPath(uri);
    return path == '/staff' ||
        path == '/admin' ||
        path == '/admin/dashboard' ||
        path == '/kitchen' ||
        RegExp(r'^/kitchen/[^/]+$').hasMatch(path);
  }

  Uri roleHomeFor(Uri currentUri, Uri initialUrl) {
    final path = _normalizedPath(currentUri);
    if (path.startsWith('/admin')) {
      return initialUrl.replace(path: '/admin', query: null);
    }
    if (path.startsWith('/kitchen')) {
      final parts = path.split('/').where((part) => part.isNotEmpty).toList();
      final kitchenPath = parts.length >= 2
          ? '/kitchen/${parts[1]}'
          : '/kitchen';
      return initialUrl.replace(path: kitchenPath, query: null);
    }
    return initialUrl.replace(path: '/staff', query: null);
  }

  String _normalizedPath(Uri uri) {
    final path = uri.path.isEmpty ? '/' : uri.path;
    return path.length > 1 && path.endsWith('/')
        ? path.substring(0, path.length - 1)
        : path;
  }
}
