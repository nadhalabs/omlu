import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../../design_system/widgets/omlu_button.dart';
import '../../design_system/widgets/omlu_skeleton_loader.dart';
import 'service_requests_provider.dart';

class RequestsScreen extends ConsumerStatefulWidget {
  const RequestsScreen({super.key});

  @override
  ConsumerState<RequestsScreen> createState() => _RequestsScreenState();
}

class _RequestsScreenState extends ConsumerState<RequestsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final Set<int> _resolvingIds = {};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _resolve(int requestId) async {
    setState(() => _resolvingIds.add(requestId));
    try {
      await HapticFeedback.lightImpact();
      await ref
          .read(serviceRequestsProvider.notifier)
          .resolveRequest(requestId);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('This action could not be completed. Refresh status and try again.'),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _resolvingIds.remove(requestId));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final requestsState = ref.watch(serviceRequestsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Requests', style: OmluTypography.h2),
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        actions: [
          IconButton(
            icon: const Icon(
              Icons.refresh_rounded,
              color: OmluColors.textPrimary,
            ),
            onPressed: () =>
                ref.read(serviceRequestsProvider.notifier).fetchRequests(),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: OmluColors.accent,
          labelColor: OmluColors.accent,
          unselectedLabelColor: OmluColors.textSecondary,
          labelStyle: OmluTypography.bodyMedium.copyWith(
            fontWeight: FontWeight.bold,
          ),
          unselectedLabelStyle: OmluTypography.bodyMedium,
          tabs: const [
            Tab(text: 'Active'),
            Tab(text: 'Completed'),
          ],
        ),
      ),
      body: requestsState.when(
        data: (requests) {
          final activeRequests = requests.where((req) {
            if (req is! Map) return false;
            final status = req['status']?.toString().toLowerCase();
            final resolvedAt = req['resolved_at'];
            return status == 'pending' || resolvedAt == null;
          }).toList();

          final completedRequests = requests.where((req) {
            if (req is! Map) return false;
            final status = req['status']?.toString().toLowerCase();
            final resolvedAt = req['resolved_at'];
            return status == 'resolved' || resolvedAt != null;
          }).toList();

          return TabBarView(
            controller: _tabController,
            children: [
              _RequestsList(
                requests: activeRequests,
                resolvingIds: _resolvingIds,
                onResolve: _resolve,
                isActive: true,
              ),
              _RequestsList(
                requests: completedRequests,
                resolvingIds: _resolvingIds,
                onResolve: _resolve,
                isActive: false,
              ),
            ],
          );
        },
        loading: () => TabBarView(
          controller: _tabController,
          children: [_SkeletonList(), _SkeletonList()],
        ),
        error: (err, st) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.error_outline_rounded,
                size: 48,
                color: Colors.red,
              ),
              const SizedBox(height: 16),
              const Text('Could not load requests. Check the connection and try again.', style: OmluTypography.bodyMedium),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () =>
                    ref.read(serviceRequestsProvider.notifier).fetchRequests(),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RequestsList extends StatelessWidget {
  const _RequestsList({
    required this.requests,
    required this.resolvingIds,
    required this.onResolve,
    required this.isActive,
  });

  final List<dynamic> requests;
  final Set<int> resolvingIds;
  final ValueChanged<int> onResolve;
  final bool isActive;

  String _formatTime(String? isoTime) {
    if (isoTime == null) return '';
    try {
      final dateTime = DateTime.parse(isoTime).toLocal();
      final hour = dateTime.hour.toString().padLeft(2, '0');
      final minute = dateTime.minute.toString().padLeft(2, '0');
      return '$hour:$minute';
    } catch (_) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    if (requests.isEmpty) {
      return Center(
        child: Text(
          isActive
              ? 'No active service requests.'
              : 'No completed service requests.',
          style: OmluTypography.bodyMedium.copyWith(
            color: OmluColors.textSecondary,
          ),
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(OmluSpacing.md),
      itemCount: requests.length,
      separatorBuilder: (context, index) =>
          const SizedBox(height: OmluSpacing.md),
      itemBuilder: (context, index) {
        final req = requests[index] as Map;
        final id = req['id'] as int? ?? 0;
        final tableNumber = req['table_number']?.toString() ?? 'Table';
        final requestType = req['request_type']?.toString() ?? 'Request';
        final createdAt = req['created_at']?.toString();
        final timeString = _formatTime(createdAt);
        final isResolving = resolvingIds.contains(id);

        return OmluCard(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Details
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          tableNumber,
                          style: OmluTypography.h2.copyWith(fontSize: 20),
                        ),
                        if (timeString.isNotEmpty) ...[
                          const SizedBox(width: OmluSpacing.sm),
                          Text(timeString, style: OmluTypography.bodySmall),
                        ],
                      ],
                    ),
                    const SizedBox(height: OmluSpacing.xxs),
                    Text(
                      requestType,
                      style: OmluTypography.bodyMedium.copyWith(
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: OmluSpacing.md),

              // Action
              if (isActive)
                OmluButton(
                  text: 'Resolve',
                  isLoading: isResolving,
                  isFullWidth: false,
                  onPressed: () => onResolve(id),
                )
              else
                Row(
                  children: [
                    const Icon(
                      Icons.check_circle_rounded,
                      color: OmluColors.statusAvailable,
                      size: 24,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      'Resolved',
                      style: OmluTypography.bodyMedium.copyWith(
                        color: OmluColors.statusAvailable,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
            ],
          ),
        );
      },
    );
  }
}

class _SkeletonList extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.all(OmluSpacing.md),
      itemCount: 4,
      itemBuilder: (context, index) => const Padding(
        padding: EdgeInsets.only(bottom: OmluSpacing.md),
        child: OmluSkeletonLoader(width: double.infinity, height: 76),
      ),
    );
  }
}
