import 'package:flutter/material.dart';
import '../colors.dart';
import '../radius.dart';

class OmluSkeletonLoader extends StatefulWidget {
  const OmluSkeletonLoader({
    required this.width,
    required this.height,
    super.key,
    this.borderRadius,
  });

  final double width;
  final double height;
  final BorderRadiusGeometry? borderRadius;

  @override
  State<OmluSkeletonLoader> createState() => _OmluSkeletonLoaderState();
}

class _OmluSkeletonLoaderState extends State<OmluSkeletonLoader>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);
    _animation = Tween<double>(begin: 0.4, end: 0.8).animate(_controller);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _animation,
      child: Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: OmluColors.border.withValues(alpha: 0.5),
          borderRadius: widget.borderRadius ?? OmluRadius.borderMd,
        ),
      ),
    );
  }
}
