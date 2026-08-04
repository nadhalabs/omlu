import 'dart:convert';
import 'dart:typed_data';
import 'receipt_data.dart';

enum PaperWidth { mm58, mm80 }

class EscPosEncoder {
  final PaperWidth paperWidth;

  EscPosEncoder({this.paperWidth = PaperWidth.mm58});

  int get maxColumns => paperWidth == PaperWidth.mm58 ? 32 : 48;

  List<int> encodeReceipt(ReceiptData receipt) {
    final List<int> bytes = [];

    // Initialize printer
    bytes.addAll([0x1B, 0x40]);

    // Header: Restaurant Name & Title
    bytes.addAll(_alignCenter());
    bytes.addAll(_boldOn());
    bytes.addAll(_setTextSize(doubleWidth: true, doubleHeight: true));
    bytes.addAll(utf8.encode('${receipt.restaurantName}\n'));
    bytes.addAll(_setTextSize(doubleWidth: false, doubleHeight: false));
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
    bytes.addAll(utf8.encode('\n'));

    // Receipt Title Banner
    bytes.addAll(_boldOn());
    bytes.addAll(utf8.encode('*** ${receipt.receiptTitle} ***\n'));
    bytes.addAll(_boldOff());
    bytes.addAll(_alignLeft());

    bytes.addAll(utf8.encode(_divider()));

    // Metadata
    if (receipt.invoiceNumber != null && receipt.invoiceNumber!.isNotEmpty) {
      bytes.addAll(
        utf8.encode(_wrappedText('Invoice #: ${receipt.invoiceNumber}')),
      );
    }
    bytes.addAll(utf8.encode(_wrappedText('Bill #:    ${receipt.billNumber}')));
    if (receipt.tableNumber != null && receipt.tableNumber!.isNotEmpty) {
      bytes.addAll(
        utf8.encode(_wrappedText('Table #:   ${receipt.tableNumber}')),
      );
    }
    if (receipt.staffName != null && receipt.staffName!.isNotEmpty) {
      bytes.addAll(
        utf8.encode(_wrappedText('Served by: ${receipt.staffName}')),
      );
    }
    bytes.addAll(utf8.encode(_wrappedText('Date:      ${receipt.createdAt}')));

    bytes.addAll(utf8.encode(_divider()));

    // Column Headers
    bytes.addAll(_boldOn());
    bytes.addAll(utf8.encode(_row2Cols('Item', 'Amount')));
    bytes.addAll(_boldOff());
    bytes.addAll(utf8.encode(_divider()));

    // Line Items
    for (final item in receipt.items) {
      final String itemHeader = '${item.quantity}x ${item.name}';
      for (final row in _wrappedAmountRows(itemHeader, item.lineTotal)) {
        bytes.addAll(utf8.encode(row));
      }
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
      bytes.addAll(
        utf8.encode(_row2Cols('Taxable Value:', receipt.taxableAmount)),
      );
      bytes.addAll(utf8.encode(_row2Cols('CGST:', receipt.cgstAmount)));
      bytes.addAll(utf8.encode(_row2Cols('SGST:', receipt.sgstAmount)));
    }

    bytes.addAll(utf8.encode(_divider()));

    // Grand Total
    bytes.addAll(_boldOn());
    bytes.addAll(_setTextSize(doubleWidth: true, doubleHeight: false));
    bytes.addAll(
      utf8.encode(
        _row2Cols('TOTAL:', '${receipt.currency} ${receipt.grandTotal}'),
      ),
    );
    bytes.addAll(_setTextSize(doubleWidth: false, doubleHeight: false));
    bytes.addAll(_boldOff());

    bytes.addAll(utf8.encode(_divider()));

    // Footer & Status
    bytes.addAll(_alignCenter());
    bytes.addAll(
      utf8.encode('Status: ${receipt.paymentStatus.toUpperCase()}\n\n'),
    );
    bytes.addAll(utf8.encode('Thank you for dining with us!\n'));
    bytes.addAll(utf8.encode('Powered by OMLU\n\n\n\n'));

    // Cut paper command GS V A 0
    bytes.addAll([0x1D, 0x56, 0x41, 0x00]);

    return bytes;
  }

  List<int> encodeTestPage() => <int>[
    0x1B,
    0x40,
    ..._alignCenter(),
    ..._boldOn(),
    ...utf8.encode('OMLU PRINTER TEST\n'),
    ..._boldOff(),
    ...utf8.encode(
      '${paperWidth == PaperWidth.mm58 ? '58 mm' : '80 mm'} TCP/LAN printer\n\n\n',
    ),
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

  List<String> _wrappedAmountRows(String left, String right) {
    final available = maxColumns - right.length - 1;
    final firstParts = _wrap(left, available > 0 ? available : 1);
    final rows = <String>[_row2Cols(firstParts.first, right)];
    if (firstParts.length > 1) {
      rows.addAll(
        firstParts
            .skip(1)
            .expand((part) => _wrap(part, maxColumns))
            .map((part) => '$part\n'),
      );
    }
    return rows;
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

  List<int> _setTextSize({
    required bool doubleWidth,
    required bool doubleHeight,
  }) {
    int size = 0;
    if (doubleWidth) size |= 0x10;
    if (doubleHeight) size |= 0x01;
    return [0x1D, 0x21, size];
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
