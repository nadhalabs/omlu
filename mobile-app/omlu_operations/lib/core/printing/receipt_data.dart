class ReceiptItemData {
  final String name;
  final int quantity;
  final String unitPrice;
  final String lineTotal;
  final List<String> options;

  ReceiptItemData({
    required this.name,
    required this.quantity,
    required this.unitPrice,
    required this.lineTotal,
    this.options = const [],
  });

  factory ReceiptItemData.fromJson(Map<String, dynamic> json) {
    return ReceiptItemData(
      name: json['name'] as String? ?? '',
      quantity: json['quantity'] as int? ?? 1,
      unitPrice: json['unit_price'] as String? ?? '0.00',
      lineTotal: json['line_total'] as String? ?? '0.00',
      options:
          (json['options'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
    );
  }

  Map<String, dynamic> toJson() => {
    'name': name,
    'quantity': quantity,
    'unit_price': unitPrice,
    'line_total': lineTotal,
    'options': options,
  };
}

class ReceiptData {
  final String billNumber;
  final String? invoiceNumber;
  final String receiptTitle;
  final String restaurantName;
  final String? legalBusinessName;
  final String? address;
  final String? gstin;
  final String? stateName;
  final String? stateCode;
  final String? tableNumber;
  final String? staffName;
  final String createdAt;
  final String? paidAt;
  final List<ReceiptItemData> items;
  final String subtotal;
  final String discountAmount;
  final String taxableAmount;
  final String cgstAmount;
  final String sgstAmount;
  final String igstAmount;
  final String taxAmount;
  final String grandTotal;
  final String currency;
  final String? paymentMethod;
  final String paymentStatus;
  final bool isOfficialInvoice;
  final String digitalBillUrl;

  ReceiptData({
    required this.billNumber,
    this.invoiceNumber,
    required this.receiptTitle,
    required this.restaurantName,
    this.legalBusinessName,
    this.address,
    this.gstin,
    this.stateName,
    this.stateCode,
    this.tableNumber,
    this.staffName,
    required this.createdAt,
    this.paidAt,
    required this.items,
    required this.subtotal,
    required this.discountAmount,
    required this.taxableAmount,
    required this.cgstAmount,
    required this.sgstAmount,
    required this.igstAmount,
    required this.taxAmount,
    required this.grandTotal,
    required this.currency,
    this.paymentMethod,
    required this.paymentStatus,
    required this.isOfficialInvoice,
    this.digitalBillUrl = '',
  });

  factory ReceiptData.fromJson(Map<String, dynamic> json) {
    return ReceiptData(
      billNumber: json['bill_number'] as String? ?? '',
      invoiceNumber: json['invoice_number'] as String?,
      receiptTitle: json['receipt_title'] as String? ?? 'RECEIPT',
      restaurantName: json['restaurant_name'] as String? ?? '',
      legalBusinessName: json['legal_business_name'] as String?,
      address: json['address'] as String?,
      gstin: json['gstin'] as String?,
      stateName: json['state_name'] as String?,
      stateCode: json['state_code'] as String?,
      tableNumber: json['table_number'] as String?,
      staffName: json['staff_name'] as String?,
      createdAt: json['created_at'] as String? ?? '',
      paidAt: json['paid_at'] as String?,
      items:
          (json['items'] as List<dynamic>?)
              ?.map((e) => ReceiptItemData.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      subtotal: json['subtotal'] as String? ?? '0.00',
      discountAmount: json['discount_amount'] as String? ?? '0.00',
      taxableAmount: json['taxable_amount'] as String? ?? '0.00',
      cgstAmount: json['cgst_amount'] as String? ?? '0.00',
      sgstAmount: json['sgst_amount'] as String? ?? '0.00',
      igstAmount: json['igst_amount'] as String? ?? '0.00',
      taxAmount: json['tax_amount'] as String? ?? '0.00',
      grandTotal: json['grand_total'] as String? ?? '0.00',
      currency: json['currency'] as String? ?? 'INR',
      paymentMethod: json['payment_method'] as String?,
      paymentStatus: json['payment_status'] as String? ?? 'unpaid',
      isOfficialInvoice: json['is_official_invoice'] as bool? ?? false,
      digitalBillUrl: json['digital_bill_url'] as String? ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
    'bill_number': billNumber,
    'invoice_number': invoiceNumber,
    'receipt_title': receiptTitle,
    'restaurant_name': restaurantName,
    'legal_business_name': legalBusinessName,
    'address': address,
    'gstin': gstin,
    'state_name': stateName,
    'state_code': stateCode,
    'table_number': tableNumber,
    'staff_name': staffName,
    'created_at': createdAt,
    'paid_at': paidAt,
    'items': items.map((i) => i.toJson()).toList(),
    'subtotal': subtotal,
    'discount_amount': discountAmount,
    'taxable_amount': taxableAmount,
    'cgst_amount': cgstAmount,
    'sgst_amount': sgstAmount,
    'igst_amount': igstAmount,
    'tax_amount': taxAmount,
    'grand_total': grandTotal,
    'currency': currency,
    'payment_method': paymentMethod,
    'payment_status': paymentStatus,
    'is_official_invoice': isOfficialInvoice,
    'digital_bill_url': digitalBillUrl,
  };
}
