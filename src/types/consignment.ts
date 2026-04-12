export interface Address {
  companyName: string;
  address1: string;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
}

export interface DeliverAddress extends Address {
  contactName: string;
  instructions: string;
}

export interface ConsignmentItem {
  description: string;
  code?: string;
  quantity: number;
  weight: number;
  length: number;
  width: number;
  height: number;
  pallets: number;
  spaces: number;
}

export interface ConsignmentPayload {
  collectAddress: Address;
  deliverAddress: DeliverAddress;
  items: ConsignmentItem[];
  references: { customer: string };
  type: string;
  fromEmail: string;
  requiredDate?: string;
  customFields?: Record<string, string>;
  pdfBase64?: string;
  pdfFilename?: string;
}

export interface SaleOrderItem {
  code: string;
  description: string;
  quantity: number;
  unitOfMeasure: string;
}

export interface SaleOrderPayload {
  references: { customer: string };
  deliverAddress: DeliverAddress;
  items: SaleOrderItem[];
  deliverRequiredDate?: string;
  collectRequiredDate?: string;
  instructions: string;
  warehouse?: string;
  customFields?: Record<string, string>;
}

export interface PurchaseOrderItem {
  code: string;
  description: string;
  quantity: number;
  unitOfMeasure: string;
  batch?: string;
  expiryDate?: string;
}

export interface PurchaseOrderPayload {
  references: { customer: string };
  items: PurchaseOrderItem[];
  arrivalDate?: string;
  instructions: string;
  warehouse?: string;
  customFields?: Record<string, string>;
}

export type EntityType = "consignment" | "sale_order" | "purchase_order";
