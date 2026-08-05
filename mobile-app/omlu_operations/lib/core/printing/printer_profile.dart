import 'esc_pos_encoder.dart';

enum PrinterProfileType {
  generic58,
  generic80,
  btClassicConservative,
  bleConservative,
  custom,
}

class PrinterProfileConfig {
  const PrinterProfileConfig({
    required this.name,
    required this.paperWidth,
    required this.lineColumns,
    required this.chunkSize,
    required this.interChunkDelayMs,
    required this.autoCut,
    required this.feedLines,
    this.codePage = 'utf-8',
  });

  final String name;
  final PaperWidth paperWidth;
  final int lineColumns;
  final int chunkSize;
  final int interChunkDelayMs;
  final bool autoCut;
  final int feedLines;
  final String codePage;

  static const generic58 = PrinterProfileConfig(
    name: 'Generic ESC/POS 58 mm',
    paperWidth: PaperWidth.mm58,
    lineColumns: 32,
    chunkSize: 128,
    interChunkDelayMs: 10,
    autoCut: false,
    feedLines: 3,
  );

  static const generic80 = PrinterProfileConfig(
    name: 'Generic ESC/POS 80 mm',
    paperWidth: PaperWidth.mm80,
    lineColumns: 48,
    chunkSize: 256,
    interChunkDelayMs: 10,
    autoCut: true,
    feedLines: 4,
  );

  static const btClassicConservative = PrinterProfileConfig(
    name: 'Bluetooth Classic Conservative',
    paperWidth: PaperWidth.mm58,
    lineColumns: 32,
    chunkSize: 64,
    interChunkDelayMs: 30,
    autoCut: false,
    feedLines: 3,
  );

  static const bleConservative = PrinterProfileConfig(
    name: 'BLE Conservative',
    paperWidth: PaperWidth.mm58,
    lineColumns: 32,
    chunkSize: 20,
    interChunkDelayMs: 40,
    autoCut: false,
    feedLines: 3,
  );

  factory PrinterProfileConfig.fromType(PrinterProfileType type) {
    switch (type) {
      case PrinterProfileType.generic58:
        return generic58;
      case PrinterProfileType.generic80:
        return generic80;
      case PrinterProfileType.btClassicConservative:
        return btClassicConservative;
      case PrinterProfileType.bleConservative:
        return bleConservative;
      case PrinterProfileType.custom:
        return generic58;
    }
  }
}
