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
  customFields?: Record<string, string>;
  pdfBase64?: string;
  pdfFilename?: string;
}
