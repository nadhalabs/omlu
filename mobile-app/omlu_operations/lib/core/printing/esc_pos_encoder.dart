import 'dart:convert';
import 'dart:typed_data';
import 'package:qr/qr.dart';
import 'receipt_data.dart';

enum PaperWidth { mm58, mm80 }

enum QrPrintMode { native, raster }

class EscPosEncoder {
  final PaperWidth paperWidth;
  final QrPrintMode qrMode;

  EscPosEncoder({
    this.paperWidth = PaperWidth.mm58,
    this.qrMode = QrPrintMode.raster,
  });

  int get maxColumns => paperWidth == PaperWidth.mm58 ? 32 : 48;

  List<int> encodeReceipt(ReceiptData receipt) {
    final List<int> bytes = [];

    // Initialize printer
    bytes.addAll([0x1B, 0x40]);

    // Header: Restaurant Name & Title
    bytes.addAll(_alignCenter());
    bytes.addAll(_boldOn());
    bytes.addAll(utf8.encode('${receipt.restaurantName}\n'));
    bytes.addAll(_boldOff());

    if (receipt.legalBusinessName != null &&
        receipt.legalBusinessName!.isNotEmpty) {
      bytes.addAll(utf8.encode('${receipt.legalBusinessName}\n'));
    }
    if (receipt.address != null && receipt.address!.isNotEmpty) {
      bytes.addAll(utf8.encode('${receipt.address}\n'));
    }
    if (receipt.gstin != null && receipt.gstin!.isNotEmpty) {
      bytes.addAll(utf8.encode('GSTIN: ${receipt.gstin}\n'));
    }
    bytes.addAll(_boldOn());
    bytes.addAll(utf8.encode('${receipt.receiptTitle}\n'));
    bytes.addAll(_boldOff());
    final status = receipt.paymentStatus.toUpperCase();
    if (receipt.tableNumber != null && receipt.tableNumber!.isNotEmpty) {
      bytes.addAll(utf8.encode('Table ${receipt.tableNumber} - $status\n'));
    }
    bytes.addAll(_alignLeft());

    // Metadata
    if (receipt.invoiceNumber != null && receipt.invoiceNumber!.isNotEmpty) {
      bytes.addAll(
        utf8.encode(_wrappedText('Invoice: ${receipt.invoiceNumber}')),
      );
    }
    bytes.addAll(utf8.encode(_wrappedText('Bill: ${receipt.billNumber}')));
    bytes.addAll(utf8.encode(_wrappedText(receipt.createdAt)));
    if (receipt.tableNumber == null || receipt.tableNumber!.isEmpty) {
      bytes.addAll(utf8.encode('$status\n'));
    }

    bytes.addAll(utf8.encode(_divider()));

    // Line Items
    for (final item in receipt.items) {
      for (final line in _wrap(item.name, maxColumns)) {
        bytes.addAll(utf8.encode('$line\n'));
      }
      bytes.addAll(
        utf8.encode(
          _row2Cols('${item.quantity} x ${item.unitPrice}', item.lineTotal),
        ),
      );
      for (final option in item.options) {
        for (final line in _wrap('   + $option', maxColumns)) {
          bytes.addAll(utf8.encode('$line\n'));
        }
      }
    }

    bytes.addAll(utf8.encode(_divider()));

    // Financial Totals
    bytes.addAll(utf8.encode(_row2Cols('Subtotal:', receipt.subtotal)));

    if (double.tryParse(receipt.discountAmount) != null &&
        double.parse(receipt.discountAmount) > 0) {
      bytes.addAll(
        utf8.encode(_row2Cols('Discount:', '-${receipt.discountAmount}')),
      );
    }

    if (receipt.isOfficialInvoice &&
        double.tryParse(receipt.taxAmount) != null &&
        double.parse(receipt.taxAmount) > 0) {
      bytes.addAll(utf8.encode(_row2Cols('Taxable:', receipt.taxableAmount)));
      if ((double.tryParse(receipt.igstAmount) ?? 0) > 0) {
        bytes.addAll(utf8.encode(_row2Cols('IGST:', receipt.igstAmount)));
      } else {
        bytes.addAll(utf8.encode(_row2Cols('CGST:', receipt.cgstAmount)));
        bytes.addAll(utf8.encode(_row2Cols('SGST:', receipt.sgstAmount)));
      }
    }

    // Grand Total
    bytes.addAll(_boldOn());
    bytes.addAll(
      utf8.encode(
        _row2Cols('TOTAL:', '${receipt.currency} ${receipt.grandTotal}'),
      ),
    );
    bytes.addAll(_boldOff());

    bytes.addAll(utf8.encode(_divider()));

    // Footer & Status
    bytes.addAll(_alignCenter());
    bytes.addAll(
      utf8.encode(
        '$status${receipt.paymentMethod == null ? '' : ' - ${receipt.paymentMethod!.toUpperCase()}'}\n',
      ),
    );
    bytes.addAll(utf8.encode('Thank you\n'));

    // Cut paper command GS V A 0
    bytes.addAll([0x1D, 0x56, 0x41, 0x00]);

    return bytes;
  }

  List<int> encodeTestPage() => <int>[
    0x1B,
    0x40,
    ..._alignCenter(),
    ...utf8.encode('OMLU QR TEST\n'),
    ..._rasterQrCode('https://omlu.in/receipt/qr-test'),
    ...utf8.encode('Scan me\n'),
    0x1D,
    0x56,
    0x41,
    0x00,
  ];

  String _divider() {
    return '${'-' * maxColumns}\n';
  }

  String _row2Cols(String left, String right) {
    final int rightLen = right.length;
    final int availableLeft = maxColumns - rightLen - 1;
    String formattedLeft = left;

    if (formattedLeft.length > availableLeft) {
      formattedLeft = formattedLeft.substring(0, availableLeft);
    }

    final int padding = maxColumns - formattedLeft.length - rightLen;
    return '$formattedLeft${' ' * (padding > 0 ? padding : 1)}$right\n';
  }

  List<String> _wrap(String value, int width) {
    final normalized = value.trimRight();
    if (normalized.isEmpty) return [''];
    final lines = <String>[];
    var remaining = normalized;
    while (remaining.length > width) {
      var split = remaining.lastIndexOf(' ', width);
      if (split < 1) split = width;
      lines.add(remaining.substring(0, split).trimRight());
      remaining = remaining.substring(split).trimLeft();
    }
    lines.add(remaining);
    return lines;
  }

  String _wrappedText(String value) =>
      _wrap(value, maxColumns).map((line) => '$line\n').join();

  List<int> _alignCenter() => [0x1B, 0x61, 0x01];
  List<int> _alignLeft() => [0x1B, 0x61, 0x00];
  List<int> _boldOn() => [0x1B, 0x45, 0x01];
  List<int> _boldOff() => [0x1B, 0x45, 0x00];

  // Retained for non-receipt printer diagnostics; bill receipts never call it.
  // ignore: unused_element
  List<int> _nativeQrCode(String value) {
    final data = ascii.encode(value);
    final length = data.length + 3;
    final size = paperWidth == PaperWidth.mm58 ? 5 : 7;
    return [
      0x1D,
      0x28,
      0x6B,
      0x04,
      0x00,
      0x31,
      0x41,
      0x32,
      0x00,
      0x1D,
      0x28,
      0x6B,
      0x03,
      0x00,
      0x31,
      0x43,
      size,
      0x1D,
      0x28,
      0x6B,
      0x03,
      0x00,
      0x31,
      0x45,
      0x31,
      0x1D,
      0x28,
      0x6B,
      length & 0xFF,
      (length >> 8) & 0xFF,
      0x31,
      0x50,
      0x30,
      ...data,
      0x1D,
      0x28,
      0x6B,
      0x03,
      0x00,
      0x31,
      0x51,
      0x30,
    ];
  }

  List<int> _rasterQrCode(String value) {
    final code = QrCode.fromData(
      data: value,
      errorCorrectLevel: QrErrorCorrectLevel.M,
    );
    final image = QrImage(code);
    const quiet = 4;
    final targetDots = paperWidth == PaperWidth.mm58 ? 200 : 240;
    final modules = image.moduleCount + quiet * 2;
    final scale = (targetDots + modules - 1) ~/ modules;
    final size = modules * (scale < 1 ? 1 : scale);
    final actualScale = size ~/ modules;
    final widthBytes = (size + 7) ~/ 8;
    final bytes = <int>[
      0x1D,
      0x76,
      0x30,
      0x00,
      widthBytes & 0xFF,
      (widthBytes >> 8) & 0xFF,
      size & 0xFF,
      (size >> 8) & 0xFF,
    ];
    for (var y = 0; y < size; y++) {
      for (var xb = 0; xb < widthBytes; xb++) {
        var packed = 0;
        for (var bit = 0; bit < 8; bit++) {
          final x = xb * 8 + bit;
          final mx = x ~/ actualScale - quiet;
          final my = y ~/ actualScale - quiet;
          if (x < size &&
              mx >= 0 &&
              my >= 0 &&
              mx < image.moduleCount &&
              my < image.moduleCount &&
              image.isDark(my, mx)) {
            packed |= 0x80 >> bit;
          }
        }
        bytes.add(packed);
      }
    }
    bytes.add(0x0A);
    return bytes;
  }

  /// Encodes a grayscale raster image (Monochrome 1-bit GS v 0 format)
  static List<int> encodeRasterImage(Uint8List pixels, int width, int height) {
    final List<int> bytes = [];
    final int widthBytes = (width + 7) ~/ 8;

    // GS v 0 0 widthBytesL widthBytesH heightL heightH
    bytes.addAll([
      0x1D,
      0x76,
      0x30,
      0x00,
      widthBytes & 0xFF,
      (widthBytes >> 8) & 0xFF,
      height & 0xFF,
      (height >> 8) & 0xFF,
    ]);

    for (int y = 0; y < height; y++) {
      for (int x = 0; x < widthBytes; x++) {
        int byte = 0;
        for (int bit = 0; bit < 8; bit++) {
          final int pixelX = x * 8 + bit;
          if (pixelX < width) {
            final int pixelIndex = (y * width + pixelX) * 4;
            final int r = pixels[pixelIndex];
            final int g = pixels[pixelIndex + 1];
            final int b = pixels[pixelIndex + 2];
            final int alpha = pixels[pixelIndex + 3];
            final double luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            if (alpha > 128 && luminance < 128) {
              byte |= (0x80 >> bit);
            }
          }
        }
        bytes.add(byte);
      }
    }
    return bytes;
  }
}
